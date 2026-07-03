import {
  analyzeBuffer,
  applyBiquad,
  clamp,
  dbToLin,
  generateReferenceVoice,
  linToDb,
  peak,
  REFERENCE_VOICE_PROFILES,
  rms
} from "./dsp-core.js";
import { analyzeSpectralVoice } from "./spectral-voice.js";

export const STUDIO_POLISH_INTENSITIES = Object.freeze([
  { id: "light", label: "Light", factor: 0.45, targetRmsDb: -21.5 },
  { id: "standard", label: "Standard", factor: 0.72, targetRmsDb: -20 },
  { id: "strong", label: "Strong", factor: 0.95, targetRmsDb: -18.5 }
]);

const DEFAULT_INTENSITY = STUDIO_POLISH_INTENSITIES[1];

export const STUDIO_PRODUCTION_TARGETS = Object.freeze([
  {
    id: "podcast",
    label: "Podcast Studio",
    targetRmsDb: -18.5,
    ceilingDb: -1,
    brightnessRange: [0.18, 0.34],
    bandLimits: { mudRatio: 0.25, nasalRatio: 0.21, harshRatio: 0.14, sibilanceRatio: 0.052 },
    highPassBias: 2,
    compressionBias: 6,
    presenceBias: 0.45,
    airBias: 0.25,
    saturationBias: 0.8
  },
  {
    id: "radio",
    label: "Talk Radio",
    targetRmsDb: -16.8,
    ceilingDb: -1,
    brightnessRange: [0.15, 0.3],
    bandLimits: { mudRatio: 0.28, nasalRatio: 0.22, harshRatio: 0.135, sibilanceRatio: 0.048 },
    highPassBias: 8,
    compressionBias: 12,
    presenceBias: 0.75,
    airBias: -0.15,
    saturationBias: 2.6
  },
  {
    id: "ikemen",
    label: "Ikemen Body",
    targetRmsDb: -18.2,
    ceilingDb: -1,
    brightnessRange: [0.16, 0.31],
    bandLimits: { mudRatio: 0.3, nasalRatio: 0.19, harshRatio: 0.13, sibilanceRatio: 0.047 },
    highPassBias: -8,
    compressionBias: 7,
    presenceBias: 0.55,
    airBias: 0.3,
    saturationBias: 1.8
  },
  {
    id: "kawaii",
    label: "Kawaii / Anime",
    targetRmsDb: -19.2,
    ceilingDb: -1.2,
    brightnessRange: [0.25, 0.43],
    bandLimits: { mudRatio: 0.2, nasalRatio: 0.18, harshRatio: 0.145, sibilanceRatio: 0.058 },
    highPassBias: 10,
    compressionBias: 4,
    presenceBias: 0.85,
    airBias: 1.15,
    saturationBias: 0.5
  }
]);

const DEFAULT_TARGET = STUDIO_PRODUCTION_TARGETS[0];

const REPAIR_STAGE_COPY = Object.freeze({
  input: {
    label: "Input Gain",
    why: "Set speech level and headroom before compression or character gain.",
    action: "Trim or lift before repair",
    overuseRisk: "Too much input gain makes every later detector overreact."
  },
  deplosive: {
    label: "De-plosive",
    why: "Reduce low-frequency air bursts before high-pass filtering hides their detector cue.",
    action: "Catch P/B/T/K thumps first",
    overuseRisk: "Heavy reduction can thin chest tone and weaken consonant impact."
  },
  mouth: {
    label: "Mouth De-click",
    why: "Smooth short lip-smack and saliva transients before compression raises them.",
    action: "Prefer two light passes",
    overuseRisk: "Too much click repair can shave consonants and make speech lisp-like."
  },
  noise: {
    label: "Room Noise",
    why: "Lower steady noise before leveler/compressor brings it forward.",
    action: "Gentle floor-aware gating",
    overuseRisk: "Aggressive noise work causes pumping, gating, or watery tails."
  },
  tone: {
    label: "Tone Surgery",
    why: "Separate mud, nasal congestion, harsh presence, and brightness from the character macro.",
    action: "Small dynamic-EQ style cuts",
    overuseRisk: "Broad cuts can remove body, vowel clarity, or air."
  },
  deess: {
    label: "De-ess",
    why: "Catch sibilance after tone shaping but before final compression and air.",
    action: "Lookahead high-band control",
    overuseRisk: "Too much de-ess makes speech dull or wet-lisped."
  },
  level: {
    label: "Level / Dynamics",
    why: "Even out delivery for podcast/radio comfort before export limiting.",
    action: "Leveler then compressor",
    overuseRisk: "Over-compression makes the voice flat, loud, and fatiguing."
  },
  target: {
    label: "Production Target",
    why: "Match the intended podcast, radio, ikemen, or kawaii target without breaking source identity.",
    action: "Bounded director optimization",
    overuseRisk: "Target chasing can over-brighten, over-darken, or force the wrong body size."
  }
});

export function studioPolishIntensityById(id) {
  return STUDIO_POLISH_INTENSITIES.find((item) => item.id === id) || DEFAULT_INTENSITY;
}

export function studioProductionTargetById(id) {
  return STUDIO_PRODUCTION_TARGETS.find((item) => item.id === id) || DEFAULT_TARGET;
}

export function analyzeStudioVoice(input, sampleRate) {
  const samples = toFloat32(input);
  const base = analyzeBuffer(samples, sampleRate);
  const frames = frameRms(samples, sampleRate);
  const frameValues = frames.map((frame) => frame.rms).sort((a, b) => a - b);
  const noiseFloor = percentile(frameValues, 0.14);
  const speechFloor = Math.max(0.0045, noiseFloor * 2.8);
  const activeFrames = frames.filter((frame) => frame.rms >= speechFloor);
  const activeRatio = frames.length ? activeFrames.length / frames.length : 0;
  const p15 = percentile(frameValues, 0.15);
  const p85 = percentile(frameValues, 0.85);
  const dynamicRangeDb = linToDb(p85) - linToDb(p15);
  const loudnessProxyDb = Number.isFinite(base.integratedLufs)
    ? base.integratedLufs
    : base.rmsDb + clamp(activeRatio - 0.55, -0.18, 0.18) * 4;
  const band = bandProfile(samples, sampleRate);
  const microRepair = buildMicroRepairTimeline(samples, sampleRate, { band });
  const spectral = analyzeSpectralVoice(samples, sampleRate);
  const mouthClick = Math.max(mouthClickScore(samples, sampleRate, band), microRepair.problemScores.mouthClick);
  const plosive = Math.max(plosiveScore(samples, sampleRate), microRepair.problemScores.plosive);
  const levelScore = levelProblemScore(base);
  const noiseScore = noiseProblemScore(base, noiseFloor, activeRatio);
  const sibilance = Math.max(
    clamp((band.sibilanceRatio - 0.045) * 1050 + Math.max(0, base.zeroCrossingsPerSecond - 3200) * 0.018, 0, 100),
    microRepair.problemScores.sibilance
  );
  const mud = Math.max(clamp((band.mudRatio - 0.22) * 360, 0, 100), spectral.risks.mud);
  const nasal = Math.max(clamp((band.nasalRatio - 0.2) * 410, 0, 100), spectral.risks.nasal);
  const harsh = Math.max(clamp((band.harshRatio - 0.13) * 620, 0, 100), spectral.risks.harsh);
  const brightnessProblem = Math.max(base.brightnessRatio < 0.16
    ? clamp((0.16 - base.brightnessRatio) * 420, 0, 100)
    : base.brightnessRatio > 0.42
      ? clamp((base.brightnessRatio - 0.42) * 380, 0, 100)
      : 0, spectral.risks.dark, spectral.risks.thin * 0.7);
  const score = studioScore({
    levelScore,
    noiseScore,
    mouthClick,
    plosive,
    sibilance,
    mud,
    nasal,
    harsh,
    brightnessProblem
  });
  const problemScores = {
    level: levelScore,
    noise: noiseScore,
    mouthClick,
    plosive,
    sibilance,
    mud,
    nasal,
    harsh,
    brightness: brightnessProblem
  };
  const items = studioAnalysisItems({
    base,
    noiseFloorDb: linToDb(noiseFloor),
    activeRatio,
    dynamicRangeDb,
    band,
    microRepair,
    spectral,
    levelScore,
    noiseScore,
    mouthClick,
    plosive,
    sibilance,
    mud,
    nasal,
    harsh,
    brightnessProblem
  });
  const repairMap = buildStudioRepairMap({
    status: score >= 86 ? "ready" : score >= 68 ? "polish" : "repair",
    score,
    rmsDb: base.rmsDb,
    peakDb: base.peakDb,
    noiseFloorDb: linToDb(noiseFloor),
    loudnessProxyDb,
    brightnessRatio: base.brightnessRatio,
    dynamicRangeDb,
    band,
    microRepair,
    spectral,
    problemScores,
    items
  });
  return {
    ...base,
    status: score >= 86 ? "ready" : score >= 68 ? "polish" : "repair",
    score,
    activeRatio,
    noiseFloor,
    noiseFloorDb: linToDb(noiseFloor),
    headroomDb: Number.isFinite(base.truePeakDb) ? -base.truePeakDb : Number.isFinite(base.peakDb) ? -base.peakDb : 0,
    loudnessProxyDb,
    dynamicRangeDb,
    band,
    microRepair,
    spectral,
    problemScores,
    items,
    repairMap
  };
}

export function buildStudioRepairMap(analysis, targetId = "podcast") {
  const target = studioProductionTargetById(targetId);
  const scores = analysis?.problemScores || {};
  const band = analysis?.band || {};
  const toneRisk = Math.max(scores.mud || 0, scores.nasal || 0, scores.harsh || 0, scores.brightness || 0);
  const targetRisk = productionTargetRisk(analysis, target);
  const steps = [
    repairStep(1, "input", scores.level || 0, levelRepairValue(analysis), REPAIR_STAGE_COPY.input),
    repairStep(2, "deplosive", scores.plosive || 0, `${Math.round(scores.plosive || 0)} risk`, REPAIR_STAGE_COPY.deplosive),
    repairStep(3, "mouth", scores.mouthClick || 0, `${Math.round(scores.mouthClick || 0)} risk`, REPAIR_STAGE_COPY.mouth),
    repairStep(4, "noise", scores.noise || 0, noiseRepairValue(analysis), REPAIR_STAGE_COPY.noise),
    repairStep(5, "tone", toneRisk, toneRepairValue(scores, band), REPAIR_STAGE_COPY.tone),
    repairStep(6, "deess", scores.sibilance || 0, `${Math.round((band.sibilanceRatio || 0) * 100)}% high`, REPAIR_STAGE_COPY.deess),
    repairStep(7, "level", clamp((Number(analysis?.dynamicRangeDb || 0) - 14) * 5, 0, 100), `${Number(analysis?.dynamicRangeDb || 0).toFixed(1)} dB`, REPAIR_STAGE_COPY.level),
    repairStep(8, "target", targetRisk, target.label, REPAIR_STAGE_COPY.target)
  ];
  const active = steps.filter((step) => step.status !== "ready");
  const top = active.slice().sort((a, b) => b.risk - a.risk || a.order - b.order)[0] || steps[0];
  const score = steps.length
    ? Math.round(steps.reduce((sum, step) => sum + step.score, 0) / steps.length)
    : 0;
  return {
    target: { id: target.id, label: target.label },
    status: score >= 86 ? "ready" : score >= 68 ? "polish" : "repair",
    score,
    topIssue: top ? { id: top.id, label: top.label, status: top.status, risk: top.risk } : null,
    nextAction: active[0] ? { id: active[0].id, label: active[0].label, action: active[0].action } : null,
    steps,
    overprocessRisks: active.slice(0, 4).map((step) => ({
      id: step.id,
      label: step.label,
      risk: step.overuseRisk
    }))
  };
}

export function buildStudioPolishPlan(analysis, intensityId = "standard", targetId = "podcast") {
  const intensity = studioPolishIntensityById(intensityId);
  const target = studioProductionTargetById(targetId);
  const repairMap = buildStudioRepairMap(analysis, target.id);
  const f = intensity.factor;
  const scores = analysis.problemScores || {};
  const lowPitch = Number(analysis.pitchMedianHz || 0) > 0 && analysis.pitchMedianHz < 125;
  const highPassHz = clamp(
    (lowPitch ? 62 : 78) +
      Math.max(0, scores.plosive || 0) * 0.28 * f +
      Math.max(0, scores.mud || 0) * 0.18 * f +
      target.highPassBias,
    lowPitch ? 54 : 68,
    135
  );
  const targetRmsDb = target.targetRmsDb || intensity.targetRmsDb;
  const gainToTarget = targetRmsDb - Number(analysis.loudnessProxyDb ?? analysis.rmsDb ?? targetRmsDb);
  const headroomLimit = Math.max(-8, Number(analysis.headroomDb || 0) - 2.2);
  const outputGainDb = clamp(Math.min(gainToTarget, headroomLimit), -9, 8);
  const lowerEssRisk = clamp(((analysis.band?.harshRatio || 0) - 0.065) * 900 + (scores.harsh || 0) * 0.35, 0, 100);
  const deEssHigh = clamp((scores.sibilance || 0) * 0.9 * f + (scores.harsh || 0) * 0.22 * f, 0, 82);
  const deEssLow = clamp(lowerEssRisk * 0.46 * f + (scores.sibilance || 0) * 0.14 * f, 0, 58);
  const stages = {
    inputGainDb: clamp((analysis.loudnessProxyDb < -34 ? 4 : 0) - ((analysis.truePeakDb ?? analysis.peakDb) > -2 ? 3 : 0), -6, 6),
    deplosive: clamp(((scores.plosive || 0) - 8) * 1.15 * f, 0, 100),
    mouthClick: clamp(((scores.mouthClick || 0) - 7) * 1.18 * f, 0, 100),
    mouthClickPasses: (scores.mouthClick || 0) > 48 ? 2 : 1,
    noiseReduction: clamp(((scores.noise || 0) - 6) * 0.92 * f, 0, 72),
    highPassHz,
    mudDb: -clamp(((scores.mud || 0) - 8) * 0.072 * f, 0, 5.5),
    nasalDb: -clamp(((scores.nasal || 0) - 8) * 0.068 * f, 0, 4.8),
    harshDb: -clamp(((scores.harsh || 0) - 8) * 0.058 * f, 0, 4.8),
    deEss: deEssHigh,
    deEssLow,
    deEssHigh,
    deEssLookaheadMs: (scores.sibilance || 0) > 16 ? 8 : 0,
    leveler: clamp(22 + Math.max(0, analysis.dynamicRangeDb - 13) * 2.4 + f * 24 + target.compressionBias * 0.45, 12, 78),
    compression: clamp(20 + Math.max(0, analysis.dynamicRangeDb - 12) * 1.5 + f * 20 + target.compressionBias, 12, 78),
    presenceDb: clamp((analysis.brightnessRatio < 0.18 ? 1.2 : analysis.brightnessRatio > 0.36 ? -0.65 : 0.4) * f - Math.max(0, scores.harsh || 0) * 0.01 - lowerEssRisk * 0.05 + target.presenceBias, -1.8, 3.2),
    airDb: clamp((analysis.brightnessRatio < 0.2 ? 1.4 : analysis.brightnessRatio > 0.36 ? -0.9 : 0.5) * f - Math.max(0, scores.sibilance || 0) * 0.018 - lowerEssRisk * 0.012 + target.airBias, -2.1, 3.1),
    saturation: clamp(4 + f * 8 - Math.max(0, scores.harsh || 0) * 0.04 + target.saturationBias, 0, 16),
    outputGainDb,
    limiterDb: target.ceilingDb
  };
  return {
    id: `studio-polish-${intensity.id}`,
    intensity: intensity.id,
    label: `Studio Polish ${intensity.label}`,
    target: { id: target.id, label: target.label },
    repairMap,
    microRepair: analysis.microRepair || null,
    toneSurgery: buildToneSurgery(analysis, target, f, stages),
    roomShaper: buildRoomShaper(analysis, target, f, stages),
    reactivePlan: buildSourceReactivePlan(analysis, target, f, stages),
    targetRmsDb,
    stages,
    notes: planNotes(analysis, intensity.id, target)
  };
}

function buildToneSurgery(analysis, target, factor, stages) {
  const scores = analysis?.problemScores || {};
  const spectral = analysis?.spectral || {};
  const targetId = target?.id || DEFAULT_TARGET.id;
  const bands = [
    toneSurgeryBand("mud", "Low-Mid Mud", "mudDb", analysis, {
      range: [180, 520],
      fallbackHz: targetId === "ikemen" ? 285 : 255,
      q: targetId === "ikemen" ? 0.72 : 0.88,
      risk: scores.mud || 0,
      stageDb: stages.mudDb,
      maxDynamicDb: -2.4,
      reason: "Control boxy low-mid buildup without removing all body."
    }),
    toneSurgeryBand("nasal", "Nasal Ring", "nasalDb", analysis, {
      range: [650, 1300],
      fallbackHz: targetId === "kawaii" ? 1050 : 930,
      q: 1.12,
      risk: scores.nasal || 0,
      stageDb: stages.nasalDb,
      maxDynamicDb: -2.8,
      reason: "Reduce honky vowel resonance only when it protrudes."
    }),
    toneSurgeryBand("harsh", "Presence Harshness", "harshDb", analysis, {
      range: [2500, 4500],
      fallbackHz: targetId === "radio" ? 3000 : 3400,
      q: 1.18,
      risk: scores.harsh || 0,
      stageDb: stages.harshDb,
      maxDynamicDb: -2.7,
      reason: "Tame stabbing presence while keeping intelligibility alive."
    })
  ];
  const active = bands.filter((band) => band.risk >= 12 || Math.abs(band.stageDb) > 0.08);
  return {
    mode: "spectral-dynamic-eq",
    source: spectral.summary || "No spectral evidence",
    target: { id: target?.id || DEFAULT_TARGET.id, label: target?.label || DEFAULT_TARGET.label },
    bands,
    activeCount: active.length,
    summary: active.length
      ? active.map((band) => `${band.label} ${Math.round(band.frequencyHz)}Hz`).join(" / ")
      : "No dynamic tone cuts needed"
  };
}

function toneSurgeryBand(id, label, stageKey, analysis, options) {
  const spectral = analysis?.spectral || {};
  const fftPeak = pickSpectralPeak(spectral, options.range[0], options.range[1]);
  const lpcPeak = pickEnvelopePeak(spectral.envelope, options.range[0], options.range[1]);
  const earBand = pickPerceptualBand(spectral.perceptual, id, options.range[0], options.range[1]);
  const earBoost = earBand ? Math.max(0, (earBand.salience || 0) * 100 - 42) * 0.16 : 0;
  const risk = clamp((options.risk || 0) + earBoost, 0, 100);
  const stageDb = clamp(Number(options.stageDb || 0), -7, 0.8);
  const dynamicDepthDb = -clamp(Math.max(0, risk - 18) * 0.018 * (options.maxDynamicDb ? Math.abs(options.maxDynamicDb) / 2.4 : 1), 0, Math.abs(options.maxDynamicDb || -2.4));
  const frequencyHz = earBand?.centerHz || lpcPeak?.hz || fftPeak?.hz || options.fallbackHz;
  const q = earBand
    ? clamp((earBand.centerHz || options.fallbackHz) / Math.max(60, (earBand.highHz || 0) - (earBand.lowHz || 0)), 0.55, 2.8)
    : options.q;
  return {
    id,
    label,
    stageKey,
    frequencyHz: Math.round(frequencyHz),
    q: Number(q.toFixed(2)),
    risk: Math.round(risk),
    stageDb: Number(stageDb.toFixed(2)),
    dynamicDepthDb: Number(dynamicDepthDb.toFixed(2)),
    trigger: earBand ? "ERB band-limited envelope" : "band-limited envelope",
    evidence: toneSurgeryEvidence({ earBand, lpcPeak, fftPeak, spectral }),
    perceptual: earBand ? {
      centerHz: Math.round(earBand.centerHz || 0),
      bark: Number((earBand.bark || 0).toFixed(2)),
      erbRate: Number((earBand.erbRate || 0).toFixed(2)),
      salience: Number((earBand.salience || 0).toFixed(4)),
      weight: Number((earBand.weight || 0).toFixed(5))
    } : null,
    reason: options.reason
  };
}

function pickSpectralPeak(spectral, lowHz, highHz) {
  const peaks = Array.isArray(spectral?.peaks) ? spectral.peaks : [];
  return peaks
    .filter((peak) => peak.hz >= lowHz && peak.hz <= highHz)
    .sort((a, b) => (b.prominenceDb || 0) - (a.prominenceDb || 0))[0] || null;
}

function pickEnvelopePeak(envelope, lowHz, highHz) {
  const peaks = Array.isArray(envelope?.peaks) ? envelope.peaks : [];
  return peaks
    .filter((peak) => peak.hz >= lowHz && peak.hz <= highHz)
    .sort((a, b) => (b.prominenceDb || 0) - (a.prominenceDb || 0))[0] || null;
}

function pickPerceptualBand(perceptual, id, lowHz, highHz) {
  const riskId = id === "harsh" ? "presence" : id;
  const crowded = perceptual?.crowding?.band && perceptual.crowding.risk === riskId
    ? perceptual.crowding.band
    : null;
  if (crowded?.centerHz >= lowHz && crowded.centerHz <= highHz) return crowded;
  const bands = Array.isArray(perceptual?.bands) ? perceptual.bands : [];
  const candidate = bands
    .filter((band) => band.centerHz >= lowHz && band.centerHz <= highHz)
    .sort((a, b) => (b.salience || 0) - (a.salience || 0))[0] || null;
  return (candidate?.salience || 0) >= 0.08 ? candidate : null;
}

function toneSurgeryEvidence({ earBand, lpcPeak, fftPeak, spectral }) {
  if (earBand) {
    return `ERB band ${Math.round(earBand.centerHz)} Hz / Bark ${Number(earBand.bark || 0).toFixed(1)} / ${Math.round((earBand.salience || 0) * 100)}% salience`;
  }
  if (lpcPeak) return `LPC envelope ${Math.round(lpcPeak.hz)} Hz / ${Number(lpcPeak.prominenceDb || 0).toFixed(1)} dB prominence`;
  if (fftPeak) return `FFT peak ${Math.round(fftPeak.hz)} Hz / ${Number(fftPeak.prominenceDb || 0).toFixed(1)} dB prominence`;
  return spectral?.summary || "IIR band ratio";
}

function buildRoomShaper(analysis, target, factor, stages) {
  const noiseScore = clamp(analysis?.problemScores?.noise || 0, 0, 100);
  const noiseFloorDb = Number.isFinite(analysis?.noiseFloorDb) ? analysis.noiseFloorDb : -72;
  const thresholdDb = noiseFloorDb < -90
    ? -58
    : clamp(noiseFloorDb + (Number(analysis?.activeRatio || 0) < 0.25 ? -28 : 14), -62, -46);
  const rangeDb = -clamp(3 + noiseScore * 0.075 * factor + (stages.noiseReduction || 0) * 0.05, 2.5, target?.id === "radio" ? 14 : 10);
  const releaseMs = target?.id === "radio" ? 180 : 260;
  return {
    mode: "downward-expander-room-floor",
    thresholdDb: Number(thresholdDb.toFixed(1)),
    rangeDb: Number(rangeDb.toFixed(1)),
    attackMs: 8,
    holdMs: 85,
    releaseMs,
    minGainDb: Number(rangeDb.toFixed(1)),
    roomTonePolicy: "attenuate, never hard-mute",
    active: (stages.noiseReduction || 0) > 1,
    reason: "Smooth the room floor between words without dead-silence pumping."
  };
}

export function buildSourceReactivePlan(analysis, target = DEFAULT_TARGET, factor = 1, stages = {}) {
  const scores = analysis?.problemScores || {};
  const micro = analysis?.microRepair || {};
  const loudnessDb = Number.isFinite(analysis?.loudnessProxyDb)
    ? analysis.loudnessProxyDb
    : Number.isFinite(analysis?.rmsDb)
      ? analysis.rmsDb
      : -28;
  const targetRmsDb = Number.isFinite(target?.targetRmsDb) ? target.targetRmsDb : -20;
  const phraseTargetDb = clamp(targetRmsDb - 2.3, -24.5, -18.8);
  const rangeDb = clamp(
    2.2 +
      Math.max(0, Number(analysis?.dynamicRangeDb || 0) - 10) * 0.2 +
      factor * 1.05 +
      Math.max(0, Number(scores.level || 0) - 18) * 0.026,
    1.6,
    7.4
  );
  const boostDb = clamp(rangeDb * (loudnessDb < targetRmsDb ? 0.78 : 0.48), 0.8, 5.6);
  const cutDb = clamp(
    rangeDb * 0.74 + Math.max(0, Number(analysis?.truePeakDb ?? analysis?.peakDb ?? -9) + 3) * 0.55,
    1.0,
    7.2
  );
  const eventsPerMinute = Number(micro.eventsPerMinute || 0);
  const microDensity = clamp(eventsPerMinute / 90, 0, 1);
  const sibilanceBias = clamp(Number(scores.sibilance || 0) / 100, 0, 1);
  const plosiveBias = clamp(Number(scores.plosive || 0) / 100, 0, 1);
  const targetId = target?.id || DEFAULT_TARGET.id;
  const speedMs = targetId === "radio" ? 130 : targetId === "kawaii" || targetId === "anime" ? 155 : 210;
  const noiseFloorDb = Number.isFinite(analysis?.noiseFloorDb) ? analysis.noiseFloorDb : -72;
  const noiseGateDb = clamp(noiseFloorDb + 13, -58, -42);
  const active = (stages.leveler || 0) > 8 || rangeDb > 2.4 || micro.eventCount > 0;
  const notes = [
    "phrase-aware gain riding before compression",
    micro.eventCount ? "event density feeds transient safety" : "no dense local repairs",
    sibilanceBias > 0.24 ? "sibilance lane biases de-ess" : "",
    plosiveBias > 0.24 ? "plosive lane biases low-burst ducking" : ""
  ].filter(Boolean);
  return {
    mode: "source-reactive-control",
    active,
    levelRide: {
      mode: "phrase-aware-fader-ride",
      targetDb: Number(phraseTargetDb.toFixed(1)),
      rangeDb: Number(rangeDb.toFixed(1)),
      boostDb: Number(boostDb.toFixed(1)),
      cutDb: Number(cutDb.toFixed(1)),
      speedMs,
      attackMs: 34,
      releaseMs: speedMs,
      holdMs: 72,
      noiseGateDb: Number(noiseGateDb.toFixed(1)),
      amount: Math.round(clamp(stages.leveler || 0, 0, 100)),
      naturalMode: true
    },
    eventLanes: {
      eventsPerMinute,
      microDensity: Number(microDensity.toFixed(3)),
      mouth: clamp((micro.counts?.mouth || 0) * 8 + Number(scores.mouthClick || 0) * 0.3, 0, 100),
      plosive: clamp((micro.counts?.plosive || 0) * 16 + Number(scores.plosive || 0) * 0.5, 0, 100),
      sibilance: clamp((micro.counts?.sibilance || 0) * 9 + Number(scores.sibilance || 0) * 0.48, 0, 100),
      adaptiveDeEss: clamp((stages.deEss || 0) + sibilanceBias * 12 + microDensity * 8, 0, 92)
    },
    notes
  };
}

export function processStudioPolish(input, sampleRate, planOrOptions = "standard") {
  const samples = toFloat32(input);
  const options = normalizePolishOptions(planOrOptions);
  const analysis = options.inputAnalysis || (options.plan ? null : analyzeStudioVoice(samples, sampleRate));
  const basePlan = options.plan || buildStudioPolishPlan(analysis, options.intensity, options.target);
  const plan = options.optimize
    ? optimizeStudioPolishPlan(samples, sampleRate, basePlan, { inputAnalysis: analysis, target: options.target, iterations: options.iterations })
    : basePlan;
  const work = applyStudioPolishPlan(samples, sampleRate, plan);
  return {
    samples: work,
    plan,
    inputAnalysis: analysis || analyzeStudioVoice(samples, sampleRate),
    outputAnalysis: analyzeStudioVoice(work, sampleRate)
  };
}

export function optimizeStudioPolishPlan(input, sampleRate, basePlan, {
  inputAnalysis = null,
  target = null,
  iterations = 22,
  seed = 49157
} = {}) {
  const samples = toFloat32(input);
  const targetDef = studioProductionTargetById(target || basePlan?.target?.id);
  const maxIterations = Math.max(4, Math.min(40, Math.round(iterations)));
  const rng = seededRandom(seed + Math.round(samples.length / Math.max(1, sampleRate)));
  let current = clonePlan(basePlan);
  let currentScore = scoreStudioPolishPlan(samples, sampleRate, current, targetDef, basePlan);
  let best = clonePlan(current);
  let bestScore = currentScore;
  let accepted = 0;

  for (let i = 0; i < maxIterations; i++) {
    const temp = 1 - i / Math.max(1, maxIterations - 1);
    const candidate = mutatePlan(current, targetDef, temp, rng);
    const candidateScore = scoreStudioPolishPlan(samples, sampleRate, candidate, targetDef, basePlan);
    const delta = candidateScore.score - currentScore.score;
    const accept = delta >= 0 || Math.exp(delta / Math.max(0.08, temp * 16)) > rng();
    if (accept) {
      current = candidate;
      currentScore = candidateScore;
      accepted++;
    }
    if (candidateScore.score > bestScore.score) {
      best = clonePlan(candidate);
      bestScore = candidateScore;
    }
  }

  const optimized = clonePlan(best);
  const before = scoreStudioPolishPlan(samples, sampleRate, basePlan, targetDef, basePlan);
  optimized.id = `${basePlan.id}-director`;
  optimized.label = `${basePlan.label} + Director`;
  optimized.target = { id: targetDef.id, label: targetDef.label };
  optimized.optimization = {
    enabled: true,
    algorithm: "deterministic simulated annealing",
    target: { id: targetDef.id, label: targetDef.label },
    iterations: maxIterations,
    accepted,
    scoreBefore: Math.round(before.score),
    scoreAfter: Math.round(bestScore.score),
    objective: bestScore.objective,
    inputScore: inputAnalysis?.score ?? null
  };
  optimized.notes = [
    `director target: ${targetDef.label}`,
    `optimizer ${Math.round(bestScore.score - before.score)} pt`,
    ...(basePlan.notes || [])
  ].slice(0, 5);
  return optimized;
}

export function runStudioPolishQualitySuite({
  sampleRate = 48000,
  duration = 0.52,
  profiles = REFERENCE_VOICE_PROFILES,
  intensity = "standard",
  target = "podcast",
  optimize = false
} = {}) {
  const started = nowMs();
  const results = profiles.map((profile) => {
    const source = generateReferenceVoice(profile.id, { sampleRate, duration });
    const before = analyzeStudioVoice(source.samples, sampleRate);
    const processed = processStudioPolish(source.samples, sampleRate, optimize ? {
      intensity,
      target,
      optimize: true,
      iterations: 10
    } : { intensity, target });
    const after = processed.outputAnalysis;
    const issues = studioPolishIssues(before, after, processed.samples.length, source.samples.length);
    const status = issues.some((issue) => issue.level === "fail") ? "fail" :
      issues.some((issue) => issue.level === "warn") ? "warn" : "pass";
    return {
      id: profile.id,
      sourceProfile: profile,
      status,
      before,
      after,
      plan: processed.plan,
      issues
    };
  });
  const counts = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, { pass: 0, warn: 0, fail: 0 });
  const elapsedMs = nowMs() - started;
  const renderedSeconds = duration * results.length;
  return {
    ok: counts.fail === 0,
    counts,
    results,
    sampleRate,
    duration,
    target,
    optimized: !!optimize,
    renderedSeconds,
    elapsedMs,
    realtimeFactor: elapsedMs / Math.max(1, renderedSeconds * 1000)
  };
}

function studioAnalysisItems(metrics) {
  return [
    item("level", "Level", metrics.levelScore, levelMeterValue(metrics.base), "K-weighted loudness, gain staging, and true-peak headroom."),
    item("noise", "Noise Floor", metrics.noiseScore, `${formatDb(metrics.noiseFloorDb)} floor`, "Low-level room or device noise that can be amplified by compression."),
    item("plosive", "Plosives", metrics.plosive, `${Math.round(metrics.plosive)} risk`, "Low-frequency bursts should be reduced before high-pass filtering."),
    item("mouth", "Mouth Clicks", metrics.mouthClick, `${Math.round(metrics.mouthClick)} risk`, "Short mouth transients and lip-smack-like events."),
    item("sibilance", "Sibilance", metrics.sibilance, `${Math.round(metrics.band.sibilanceRatio * 100)}% high`, "Sharp S and fricative energy needing dynamic control."),
    item("tone", "Tone Balance", Math.max(metrics.mud, metrics.nasal, metrics.harsh, metrics.brightnessProblem), toneValue(metrics), "Mud, nasal resonance, harshness, and brightness balance."),
    item("spectral", "FFT Tone Map", Math.max(metrics.spectral?.risks?.dark || 0, metrics.spectral?.risks?.thin || 0, metrics.spectral?.risks?.nasal || 0, metrics.spectral?.risks?.harsh || 0), metrics.spectral?.summary || "No spectral analysis", "FFT centroid, rolloff, LPC envelope, and ERB ear-band evidence."),
    item("dynamics", "Dynamics", clamp((metrics.dynamicRangeDb - 14) * 5, 0, 100), `${metrics.dynamicRangeDb.toFixed(1)} dB`, "Speech leveling before limiter and export.")
  ];
}

function item(id, label, score, value, detail) {
  const bounded = clamp(score, 0, 100);
  return {
    id,
    label,
    status: bounded < 18 ? "ready" : bounded < 48 ? "polish" : "repair",
    score: Math.round(100 - bounded),
    value,
    detail
  };
}

function repairStep(order, id, risk, value, copy) {
  const bounded = clamp(risk, 0, 100);
  return {
    order,
    id,
    label: copy.label,
    status: bounded < 18 ? "ready" : bounded < 48 ? "polish" : "repair",
    risk: Math.round(bounded),
    score: Math.round(100 - bounded),
    value,
    why: copy.why,
    action: copy.action,
    overuseRisk: copy.overuseRisk
  };
}

function levelRepairValue(analysis = {}) {
  return levelMeterValue(analysis);
}

function levelMeterValue(analysis = {}) {
  const loudness = Number.isFinite(analysis.integratedLufs) ? `${analysis.integratedLufs.toFixed(1)} LUFS` : `${formatDb(analysis.rmsDb)} RMS`;
  const truePeak = Number.isFinite(analysis.truePeakDb) ? `${analysis.truePeakDb.toFixed(1)} dBTP` : `${formatDb(analysis.peakDb)} peak`;
  return `${loudness} / ${truePeak}`;
}

function noiseRepairValue(analysis = {}) {
  return `${formatDb(analysis.noiseFloorDb)} floor`;
}

function toneRepairValue(scores = {}, band = {}) {
  const labels = [];
  if ((scores.mud || 0) > 16) labels.push(`mud ${Math.round((band.mudRatio || 0) * 100)}%`);
  if ((scores.nasal || 0) > 16) labels.push(`nasal ${Math.round((band.nasalRatio || 0) * 100)}%`);
  if ((scores.harsh || 0) > 16) labels.push(`harsh ${Math.round((band.harshRatio || 0) * 100)}%`);
  if ((scores.brightness || 0) > 16) labels.push("brightness");
  return labels.length ? labels.join(" / ") : "balanced";
}

function productionTargetRisk(analysis = {}, target = DEFAULT_TARGET) {
  const [minBright, maxBright] = target.brightnessRange || DEFAULT_TARGET.brightnessRange;
  const loudness = Number(analysis.loudnessProxyDb ?? analysis.rmsDb ?? target.targetRmsDb);
  const bright = Number(analysis.brightnessRatio || 0);
  const band = analysis.band || {};
  const loudnessRisk = Math.abs(loudness - target.targetRmsDb) * 7.5;
  const brightnessRisk = bright < minBright
    ? (minBright - bright) * 170
    : bright > maxBright
      ? (bright - maxBright) * 155
      : 0;
  const bandRisk = Object.entries(target.bandLimits || {}).reduce((sum, [key, limit]) => {
    return sum + Math.max(0, Number(band[key] || 0) - limit) * 180;
  }, 0);
  return clamp(loudnessRisk + brightnessRisk + bandRisk, 0, 100);
}

function toneValue(metrics) {
  const parts = [];
  if (metrics.mud > 16) parts.push("mud");
  if (metrics.nasal > 16) parts.push("nasal");
  if (metrics.harsh > 16) parts.push("harsh");
  if (metrics.brightnessProblem > 16) parts.push(metrics.base.brightnessRatio < 0.16 ? "dark" : "bright");
  return parts.length ? parts.join(" / ") : "balanced";
}

function studioScore(scores) {
  const penalty = Object.values(scores).reduce((sum, value) => sum + clamp(value, 0, 100), 0) / 8;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function planNotes(analysis, intensity, target) {
  const notes = [`${target.label}`, `${intensity} polish`];
  const scores = analysis.problemScores || {};
  if (scores.plosive > 18) notes.push("de-plosive before high-pass");
  if (scores.mouthClick > 18) notes.push("mouth click smoothing");
  if (scores.noise > 18) notes.push("gentle noise reduction");
  if (scores.sibilance > 18) notes.push("dynamic de-ess");
  if (Math.max(scores.mud || 0, scores.nasal || 0, scores.harsh || 0) > 18) notes.push("source-adaptive tone cleanup");
  return notes;
}

function normalizePolishOptions(planOrOptions) {
  if (planOrOptions?.stages) return { plan: planOrOptions, optimize: false };
  if (planOrOptions?.plan?.stages) {
    return {
      plan: planOrOptions.plan,
      inputAnalysis: planOrOptions.inputAnalysis || null,
      intensity: planOrOptions.intensity || planOrOptions.plan.intensity || DEFAULT_INTENSITY.id,
      target: planOrOptions.target || planOrOptions.plan.target?.id || DEFAULT_TARGET.id,
      optimize: !!planOrOptions.optimize,
      iterations: planOrOptions.iterations || 22
    };
  }
  if (typeof planOrOptions === "string") {
    return { intensity: planOrOptions, target: DEFAULT_TARGET.id, optimize: false, iterations: 0 };
  }
  return {
    inputAnalysis: planOrOptions?.inputAnalysis || null,
    intensity: planOrOptions?.intensity || DEFAULT_INTENSITY.id,
    target: planOrOptions?.target || DEFAULT_TARGET.id,
    optimize: !!planOrOptions?.optimize,
    iterations: planOrOptions?.iterations || 22
  };
}

function applyStudioPolishPlan(samples, sampleRate, plan) {
  const p = plan.stages;
  let work = new Float32Array(samples);
  work = applyGain(work, p.inputGainDb);
  work = applyMicroRepairEvents(work, sampleRate, plan.microRepair, p);
  work = reducePlosives(work, sampleRate, p.deplosive);
  work = reduceMouthClicks(work, sampleRate, p.mouthClick, p.mouthClickPasses);
  work = reduceRoomNoise(work, sampleRate, p.noiseReduction, plan.roomShaper);
  work = applyBiquad(work, sampleRate, "highpass", p.highPassHz, 0.72, 0);
  work = applyToneSurgery(work, sampleRate, plan.toneSurgery, p);
  work = dualBandDeEss(work, sampleRate, p);
  work = phraseAwareLeveler(work, sampleRate, plan.reactivePlan?.levelRide, p.leveler);
  work = speechCompressor(work, p.compression);
  work = applyBiquad(work, sampleRate, "peaking", 2300, 0.8, p.presenceDb);
  work = applyBiquad(work, sampleRate, "highshelf", 7200, 0.72, p.airDb);
  work = dualBandDeEss(work, sampleRate, {
    ...p,
    deEssLow: (p.deEssLow || 0) * 0.55,
    deEssHigh: (p.deEssHigh || p.deEss || 0) * 0.42,
    deEssLookaheadMs: 0
  });
  work = lightSaturation(work, p.saturation);
  work = applyGain(work, p.outputGainDb);
  work = limiter(work, p.limiterDb);
  return work;
}

function applyToneSurgery(input, sampleRate, surgery, stages = {}) {
  const bands = Array.isArray(surgery?.bands) ? surgery.bands : null;
  if (!bands?.length) {
    let work = applyBiquad(input, sampleRate, "peaking", 245, 0.9, stages.mudDb);
    work = applyBiquad(work, sampleRate, "peaking", 930, 1.05, stages.nasalDb);
    return applyBiquad(work, sampleRate, "peaking", 3300, 1.1, stages.harshDb);
  }
  let work = input;
  for (const band of bands) work = applyDynamicToneBand(work, sampleRate, band, stages);
  return work;
}

function applyDynamicToneBand(input, sampleRate, band, stages = {}) {
  const stageDb = clamp(Number(stages[band.stageKey] ?? band.stageDb ?? 0), -7, 0.8);
  if (Math.abs(stageDb) < 0.02) return input;
  const freq = clamp(Number(band.frequencyHz || 1000), 80, sampleRate * 0.43);
  const q = clamp(Number(band.q || 1), 0.45, 3.2);
  const risk = clamp(Number(band.risk || 0), 0, 100);
  const staticDb = clamp(stageDb * 0.46, -3.5, 0.4);
  const dynamicDepthDb = clamp(stageDb - staticDb + Number(band.dynamicDepthDb || 0) * 0.28, -4.4, 0);
  const base = applyBiquad(input, sampleRate, "peaking", freq, q, staticDb);
  if (dynamicDepthDb > -0.05 || risk < 14) return base;

  const deep = applyBiquad(input, sampleRate, "peaking", freq, q, staticDb + dynamicDepthDb);
  const boosted = applyBiquad(input, sampleRate, "peaking", freq, q, 9);
  const probe = new Float32Array(input.length);
  let mean = 0;
  for (let i = 0; i < input.length; i++) {
    const value = Math.abs(boosted[i] - input[i]);
    probe[i] = value;
    mean += value;
  }
  mean /= Math.max(1, input.length);
  const threshold = Math.max(0.0008, mean * (1.35 + (1 - risk / 100) * 0.7));
  const out = new Float32Array(input.length);
  let env = 0;
  const attack = 1 - Math.exp(-1 / Math.max(1, sampleRate * 0.006));
  const release = Math.exp(-1 / Math.max(1, sampleRate * 0.09));
  const riskScale = clamp((risk - 10) / 70, 0.1, 1);
  for (let i = 0; i < input.length; i++) {
    const value = probe[i];
    env = value > env ? env + (value - env) * attack : env * release + value * (1 - release);
    const amount = smoothstep(threshold, threshold * 2.4, env) * riskScale;
    out[i] = base[i] * (1 - amount) + deep[i] * amount;
  }
  return out;
}

function scoreStudioPolishPlan(samples, sampleRate, plan, target, basePlan) {
  const out = applyStudioPolishPlan(samples, sampleRate, plan);
  const analysis = analyzeStudioVoice(out, sampleRate);
  const scores = analysis.problemScores || {};
  const band = analysis.band || {};
  const [minBright, maxBright] = target.brightnessRange;
  const bandLimits = target.bandLimits || {};
  const residual =
    scores.level * 0.85 +
    scores.noise * 0.55 +
    scores.mouthClick * 0.35 +
    scores.plosive * 0.58 +
    scores.sibilance * 0.75 +
    scores.mud * 0.55 +
    scores.nasal * 0.9 +
    scores.harsh * 0.95 +
    scores.brightness * 0.5;
  const loudness = Math.abs((analysis.loudnessProxyDb || analysis.rmsDb) - target.targetRmsDb) * 3.5;
  const peakDb = Number.isFinite(analysis.truePeakDb) ? analysis.truePeakDb : analysis.peakDb;
  const peakRisk = peakDb > target.ceilingDb
    ? Math.pow((peakDb - target.ceilingDb) * 4, 2)
    : Math.max(0, -9 - peakDb) * 0.6;
  const brightnessRisk = analysis.brightnessRatio < minBright
    ? (minBright - analysis.brightnessRatio) * 170
    : analysis.brightnessRatio > maxBright
      ? (analysis.brightnessRatio - maxBright) * 155
      : 0;
  const bandRisk = Object.entries(bandLimits).reduce((sum, [key, limit]) => {
    const value = Number(band[key] || 0);
    return sum + Math.max(0, value - limit) * 220;
  }, 0);
  const deviation = planDistance(plan, basePlan) * 7.5;
  const invalid = out.length !== samples.length || !Number.isFinite(analysis.rms) || analysis.rms <= 0 || analysis.peak > 1 ? 999 : 0;
  const targetPenalty = residual * 0.04 +
    loudness * 0.55 +
    peakRisk +
    brightnessRisk * 0.2 +
    bandRisk * 0.08 +
    deviation +
    invalid;
  return {
    score: clamp(analysis.score - targetPenalty, 0, 100),
    analysis,
    objective: {
      residual: Number(residual.toFixed(2)),
      loudness: Number(loudness.toFixed(2)),
      peakRisk: Number(peakRisk.toFixed(2)),
      brightnessRisk: Number(brightnessRisk.toFixed(2)),
      bandRisk: Number(bandRisk.toFixed(2)),
      deviation: Number(deviation.toFixed(2)),
      targetPenalty: Number(targetPenalty.toFixed(2))
    }
  };
}

function mutatePlan(plan, target, temperature, rng) {
  const out = clonePlan(plan);
  const p = out.stages;
  const scale = 0.35 + temperature * 0.9;
  const moves = [
    ["highPassHz", 16 + Math.abs(target.highPassBias || 0) * 0.4, 45, 150],
    ["mudDb", 1.2, -7, 0.6],
    ["nasalDb", 1.1, -6.5, 0.4],
    ["harshDb", 1, -6.5, 0.4],
    ["deEss", 13, 0, 88],
    ["leveler", 12, 8, 84],
    ["compression", 12, 8, 84],
    ["presenceDb", 0.9, -2.4, 3.8],
    ["airDb", 0.9, -2.6, 3.4],
    ["saturation", 3, 0, 18],
    ["outputGainDb", 1.5, -9, 9]
  ];
  const [key, step, min, max] = moves[Math.floor(rng() * moves.length)];
  p[key] = clamp(p[key] + (rng() * 2 - 1) * step * scale, min, max);
  if (target.id === "ikemen") p.highPassHz = Math.min(p.highPassHz, 112);
  if (target.id === "kawaii") p.highPassHz = Math.max(p.highPassHz, 78);
  p.mouthClickPasses = p.mouthClick > 48 ? 2 : 1;
  p.deEssLookaheadMs = p.deEss > 12 ? 8 : 0;
  return out;
}

function planDistance(plan, basePlan) {
  const p = plan.stages || {};
  const b = basePlan.stages || {};
  const weights = {
    highPassHz: 35,
    mudDb: 4,
    nasalDb: 4,
    harshDb: 4,
    deEss: 45,
    leveler: 45,
    compression: 45,
    presenceDb: 4,
    airDb: 4,
    saturation: 12,
    outputGainDb: 6
  };
  return Object.entries(weights).reduce((sum, [key, range]) => {
    return sum + Math.abs((p[key] || 0) - (b[key] || 0)) / range;
  }, 0);
}

function clonePlan(plan) {
  return {
    ...plan,
    target: plan.target ? { ...plan.target } : null,
    repairMap: plan.repairMap ? cloneRepairMap(plan.repairMap) : null,
    microRepair: plan.microRepair ? cloneMicroRepair(plan.microRepair) : null,
    toneSurgery: plan.toneSurgery ? cloneToneSurgery(plan.toneSurgery) : null,
    roomShaper: plan.roomShaper ? { ...plan.roomShaper } : null,
    reactivePlan: plan.reactivePlan ? cloneReactivePlan(plan.reactivePlan) : null,
    stages: { ...(plan.stages || {}) },
    notes: [...(plan.notes || [])],
    optimization: plan.optimization ? { ...plan.optimization } : undefined
  };
}

function cloneReactivePlan(plan) {
  return {
    ...plan,
    levelRide: plan.levelRide ? { ...plan.levelRide } : null,
    eventLanes: plan.eventLanes ? { ...plan.eventLanes } : null,
    notes: [...(plan.notes || [])]
  };
}

function cloneToneSurgery(surgery) {
  return {
    ...surgery,
    target: surgery.target ? { ...surgery.target } : null,
    bands: (surgery.bands || []).map((band) => ({ ...band }))
  };
}

function cloneRepairMap(map) {
  return {
    ...map,
    target: map.target ? { ...map.target } : null,
    topIssue: map.topIssue ? { ...map.topIssue } : null,
    nextAction: map.nextAction ? { ...map.nextAction } : null,
    steps: (map.steps || []).map((step) => ({ ...step })),
    overprocessRisks: (map.overprocessRisks || []).map((risk) => ({ ...risk }))
  };
}

export function buildMicroRepairTimeline(input, sampleRate, options = {}) {
  const samples = toFloat32(input);
  const events = enrichMicroRepairEvents(samples, sampleRate, [
    ...detectMouthClickEvents(samples, sampleRate),
    ...detectPlosiveEvents(samples, sampleRate),
    ...detectSibilanceEvents(samples, sampleRate)
  ]).sort((a, b) => b.risk - a.risk || a.startSample - b.startSample);
  const maxEvents = Math.max(8, Math.min(96, Number(options.maxEvents || 72)));
  const counts = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, { mouth: 0, plosive: 0, sibilance: 0 });
  const seconds = samples.length / Math.max(1, sampleRate || 1);
  const risk = clamp(
    counts.mouth * 7 +
      counts.plosive * 18 +
      counts.sibilance * 8 +
      (events[0]?.risk || 0) * 0.32,
    0,
    100
  );
  return {
    status: risk < 18 ? "ready" : risk < 48 ? "polish" : "repair",
    score: Math.round(100 - risk),
    eventCount: events.length,
    counts,
    eventsPerMinute: seconds > 0 ? Math.round(events.length / seconds * 60) : 0,
    topEvent: compactMicroEvent(events[0]),
    problemScores: {
      mouthClick: clamp(counts.mouth * 9 + Math.max(0, maxRisk(events, "mouth") - 42) * 0.55, 0, 100),
      plosive: clamp(counts.plosive * 22 + Math.max(0, maxRisk(events, "plosive") - 35) * 0.7, 0, 100),
      sibilance: clamp(counts.sibilance * 8 + Math.max(0, maxRisk(events, "sibilance") - 38) * 0.48, 0, 100)
    },
    events: events.slice(0, maxEvents).map(compactMicroEvent)
  };
}

function detectMouthClickEvents(samples, sampleRate) {
  const high = applyBiquad(samples, sampleRate, "highpass", 1800, 0.72, 0);
  const events = [];
  let fast = 0;
  let slow = 0;
  const minGap = Math.round(sampleRate * 0.012);
  let last = -minGap;
  for (let i = 1; i < high.length - 1; i++) {
    const h = Math.abs(high[i]);
    fast += (h - fast) * 0.48;
    slow += (h - slow) * 0.014;
    const risk = clamp((fast - slow * 4.3) * 1300, 0, 100);
    if (risk >= 22 && i - last >= minGap) {
      events.push(microEvent("mouth", i, i, risk, sampleRate));
      last = i;
    }
  }
  return events;
}

function detectPlosiveEvents(samples, sampleRate) {
  const low = applyBiquad(samples, sampleRate, "lowpass", 180, 0.72, 0);
  const frame = Math.max(256, Math.round(sampleRate * 0.026));
  const hop = Math.max(128, Math.round(frame / 2));
  const events = [];
  let last = -Math.round(sampleRate * 0.08);
  for (let start = 0; start + frame <= samples.length; start += hop) {
    let fullEnergy = 0;
    let lowEnergy = 0;
    for (let i = 0; i < frame; i++) {
      const full = samples[start + i];
      const lo = low[start + i];
      fullEnergy += full * full;
      lowEnergy += lo * lo;
    }
    const fullRms = Math.sqrt(fullEnergy / frame);
    const lowRms = Math.sqrt(lowEnergy / frame);
    const ratio = lowRms / Math.max(1e-8, fullRms);
    const risk = clamp((ratio - 0.5) * 165 + (lowRms - 0.012) * 1500, 0, 100);
    if (fullRms > 0.006 && risk >= 24 && start - last >= sampleRate * 0.075) {
      events.push(microEvent("plosive", start, start + frame, risk, sampleRate));
      last = start;
    }
  }
  return events;
}

function detectSibilanceEvents(samples, sampleRate) {
  const high = applyBiquad(samples, sampleRate, "highpass", 5200, 0.72, 0);
  const events = [];
  let fast = 0;
  let slow = 0;
  const minGap = Math.round(sampleRate * 0.045);
  let last = -minGap;
  for (let i = 0; i < high.length; i++) {
    const h = Math.abs(high[i]);
    fast += (h - fast) * 0.12;
    slow += (h - slow) * 0.004;
    const risk = clamp((fast - slow * 1.55) * 980 + Math.max(0, fast - 0.012) * 720, 0, 100);
    if (risk >= 28 && i - last >= minGap) {
      const start = Math.max(0, i - Math.round(sampleRate * 0.018));
      const end = Math.min(samples.length, i + Math.round(sampleRate * 0.055));
      events.push(microEvent("sibilance", start, end, risk, sampleRate));
      last = i;
    }
  }
  return events;
}

function enrichMicroRepairEvents(samples, sampleRate, events) {
  if (!events.length) return events;
  const low = applyBiquad(samples, sampleRate, "lowpass", 190, 0.72, 0);
  const mouthBand = applyBiquad(samples, sampleRate, "highpass", 1800, 0.72, 0);
  const essBand = applyBiquad(samples, sampleRate, "highpass", 5200, 0.72, 0);
  return events.map((event) => {
    const shape = microRepairPulseShape(samples, sampleRate, event, { low, mouthBand, essBand });
    const decision = microRepairDecision(event, shape);
    return {
      ...event,
      action: decision.action,
      decision,
      shape
    };
  });
}

function microRepairPulseShape(samples, sampleRate, event, bands) {
  const type = event.type || "mouth";
  const center = Math.round(((event.startSample || 0) + (event.endSample || event.startSample || 0)) / 2);
  const radiusMs = type === "plosive" ? 34 : type === "sibilance" ? 38 : 4.2;
  const radius = Math.max(8, Math.round(sampleRate * radiusMs / 1000));
  const start = Math.max(0, Math.min(samples.length - 1, center - radius));
  const end = Math.max(start + 1, Math.min(samples.length, center + radius));
  const pre = Math.max(0, start - radius);
  const post = Math.min(samples.length, end + radius);
  const full = rangeRms(samples, start, end);
  const before = rangeRms(samples, pre, start);
  const after = rangeRms(samples, end, post);
  const low = rangeRms(bands.low, start, end);
  const mouth = rangeRms(bands.mouthBand, start, end);
  const ess = rangeRms(bands.essBand, start, end);
  const total = Math.max(1e-8, full);
  const focus = type === "plosive" ? low / total : type === "sibilance" ? ess / total : mouth / total;
  const riseDb = linToDb(full) - linToDb(Math.max(1e-8, before));
  const decayDb = linToDb(Math.max(1e-8, after)) - linToDb(full);
  const widthMs = Number(((end - start) / Math.max(1, sampleRate) * 1000).toFixed(2));
  const confidence = clamp((event.risk || 0) * 0.58 + Math.max(0, riseDb) * 3.2 + focus * 18, 0, 100);
  return {
    method: "multiscale-pulse-envelope",
    widthMs,
    riseDb: Number(riseDb.toFixed(1)),
    decayDb: Number(decayDb.toFixed(1)),
    lowFocus: Number(clamp(low / total, 0, 4).toFixed(3)),
    mouthFocus: Number(clamp(mouth / total, 0, 4).toFixed(3)),
    sibilanceFocus: Number(clamp(ess / total, 0, 4).toFixed(3)),
    focus: Number(clamp(focus, 0, 4).toFixed(3)),
    confidence: Math.round(confidence)
  };
}

function microRepairDecision(event, shape) {
  const type = event.type || "mouth";
  if (type === "plosive") {
    const windowMs = clamp(shape.widthMs * 0.72 + shape.lowFocus * 12, 22, 82);
    return {
      id: "duck-low-burst",
      action: "Duck shaped low-frequency burst",
      windowMs: Number(windowMs.toFixed(1)),
      band: "low",
      preserve: "fundamental and harmonics"
    };
  }
  if (type === "sibilance") {
    const windowMs = clamp(shape.widthMs * 0.56 + shape.sibilanceFocus * 8, 18, 74);
    return {
      id: "split-high-duck",
      action: "Duck split-band sibilance edge",
      windowMs: Number(windowMs.toFixed(1)),
      band: "high",
      preserve: "vowel body"
    };
  }
  const narrowClick = shape.widthMs <= 9 && shape.mouthFocus >= 0.24;
  const windowMs = narrowClick
    ? clamp(shape.widthMs * 0.52 + 1.2, 1.1, 6.5)
    : clamp(shape.widthMs * 0.48 + 4.8, 3.8, 16);
  return {
    id: narrowClick ? "interpolate-impulse" : "attenuate-lip-smack",
    action: narrowClick ? "Interpolate narrow mouth impulse" : "Attenuate wider lip-smack decay",
    windowMs: Number(windowMs.toFixed(1)),
    band: "mouth",
    preserve: "surrounding consonant"
  };
}

function rangeRms(samples, start, end) {
  const safeStart = Math.max(0, Math.min(samples.length, Math.round(start)));
  const safeEnd = Math.max(safeStart, Math.min(samples.length, Math.round(end)));
  const length = Math.max(1, safeEnd - safeStart);
  let sum = 0;
  for (let i = safeStart; i < safeEnd; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / length);
}

function microEvent(type, startSample, endSample, risk, sampleRate) {
  const label = ({
    mouth: "Mouth click",
    plosive: "Plosive burst",
    sibilance: "Sibilance edge"
  })[type] || "Repair event";
  const action = ({
    mouth: "Interpolate short high-band spike",
    plosive: "Duck local low-frequency burst",
    sibilance: "Duck local high-band edge"
  })[type] || "Repair locally";
  const safeStart = Math.max(0, Math.round(startSample));
  const safeEnd = Math.max(safeStart + 1, Math.round(endSample));
  return {
    id: `${type}-${safeStart}`,
    type,
    label,
    action,
    startSample: safeStart,
    endSample: safeEnd,
    startSec: safeStart / sampleRate,
    endSec: safeEnd / sampleRate,
    risk: Math.round(clamp(risk, 0, 100))
  };
}

function compactMicroEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    type: event.type,
    label: event.label,
    action: event.action,
    decision: event.decision ? { ...event.decision } : null,
    shape: event.shape ? { ...event.shape } : null,
    startSample: event.startSample,
    endSample: event.endSample,
    startSec: Number(event.startSec.toFixed(3)),
    endSec: Number(event.endSec.toFixed(3)),
    risk: Math.round(event.risk)
  };
}

function maxRisk(events, type) {
  return events
    .filter((event) => event.type === type)
    .reduce((max, event) => Math.max(max, event.risk || 0), 0);
}

function applyMicroRepairEvents(input, sampleRate, timeline, stages = {}) {
  if (!timeline?.events?.length) return input;
  const out = new Float32Array(input);
  const low = applyBiquad(input, sampleRate, "lowpass", 180, 0.72, 0);
  const highClick = applyBiquad(input, sampleRate, "highpass", 1800, 0.72, 0);
  const highEss = applyBiquad(input, sampleRate, "highpass", 5200, 0.72, 0);
  const maxEvents = Math.min(96, timeline.events.length);
  for (let n = 0; n < maxEvents; n++) {
    const event = timeline.events[n];
    const strength = clamp((event.risk || 0) / 100, 0, 1);
    if (event.type === "mouth") {
      const windowMs = clamp(Number(event.decision?.windowMs || 3.6), 1, 18);
      const radius = Math.max(2, Math.round(sampleRate * windowMs / 2000));
      const center = clamp(Math.round(event.startSample || 0), radius, out.length - radius - 1);
      const amount = clamp((stages.mouthClick || 0) / 100, 0, 1) * strength * 0.82;
      for (let i = center - radius; i <= center + radius; i++) {
        const local = (out[Math.max(0, i - radius)] + out[Math.min(out.length - 1, i + radius)]) * 0.5;
        const win = 1 - Math.abs(i - center) / Math.max(1, radius + 1);
        const highBias = clamp(Math.abs(highClick[i]) * 32, 0.25, 1);
        out[i] = out[i] * (1 - amount * win * highBias) + local * amount * win * highBias;
      }
    } else if (event.type === "plosive") {
      const amount = clamp((stages.deplosive || 0) / 100, 0, 1) * strength * 0.9;
      const windowSec = clamp(Number(event.decision?.windowMs || 55) / 1000, 0.022, 0.09);
      applyWindowedSubtraction(out, low, event, sampleRate, windowSec * 0.34, windowSec * 0.72, amount);
    } else if (event.type === "sibilance") {
      const amount = clamp((stages.deEss || 0) / 100, 0, 1) * strength * 0.72;
      const windowSec = clamp(Number(event.decision?.windowMs || 42) / 1000, 0.018, 0.078);
      applyWindowedSubtraction(out, highEss, event, sampleRate, windowSec * 0.28, windowSec * 0.72, amount);
    }
  }
  return out;
}

function applyWindowedSubtraction(out, band, event, sampleRate, preSec, postSec, amount) {
  if (amount <= 0.001) return;
  const start = Math.max(0, Math.round((event.startSample || 0) - sampleRate * preSec));
  const end = Math.min(out.length, Math.round((event.endSample || event.startSample || 0) + sampleRate * postSec));
  const len = Math.max(1, end - start);
  for (let i = start; i < end; i++) {
    const x = (i - start) / len;
    const win = Math.sin(Math.PI * x);
    out[i] -= band[i] * amount * win;
  }
}

function cloneMicroRepair(timeline) {
  return {
    ...timeline,
    counts: { ...(timeline.counts || {}) },
    problemScores: { ...(timeline.problemScores || {}) },
    topEvent: timeline.topEvent ? { ...timeline.topEvent } : null,
    events: (timeline.events || []).map((event) => ({ ...event }))
  };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function bandProfile(samples, sampleRate) {
  const total = Math.max(1e-12, rms(samples));
  const mud = bandRms(samples, sampleRate, 150, 420);
  const nasal = bandRms(samples, sampleRate, 650, 1350);
  const harsh = bandRms(samples, sampleRate, 2500, 4500);
  const sibilance = bandRms(samples, sampleRate, 5200, Math.min(11000, sampleRate * 0.46));
  const air = bandRms(samples, sampleRate, 9000, Math.min(16000, sampleRate * 0.46));
  return {
    mudRatio: mud / total,
    nasalRatio: nasal / total,
    harshRatio: harsh / total,
    sibilanceRatio: sibilance / total,
    airRatio: air / total
  };
}

function bandRms(samples, sampleRate, lowHz, highHz) {
  let work = samples;
  if (lowHz > 0) work = applyBiquad(work, sampleRate, "highpass", lowHz, 0.72, 0);
  if (highHz < sampleRate * 0.48) work = applyBiquad(work, sampleRate, "lowpass", highHz, 0.72, 0);
  return rms(work);
}

function mouthClickScore(samples, sampleRate, band) {
  const high = applyBiquad(samples, sampleRate, "highpass", 1800, 0.72, 0);
  let fast = 0;
  let slow = 0;
  let count = 0;
  const minGap = Math.round(sampleRate * 0.012);
  let last = -minGap;
  for (let i = 0; i < high.length; i++) {
    const value = Math.abs(high[i]);
    fast += (value - fast) * 0.42;
    slow += (value - slow) * 0.012;
    if (i - last > minGap && fast > 0.012 && fast > slow * 5.5) {
      count++;
      last = i;
    }
  }
  const density = count / Math.max(0.1, samples.length / sampleRate);
  return clamp(density * 10 + Math.max(0, band.harshRatio - 0.16) * 180, 0, 100);
}

function plosiveScore(samples, sampleRate) {
  const low = applyBiquad(samples, sampleRate, "lowpass", 170, 0.72, 0);
  const frame = Math.max(128, Math.round(sampleRate * 0.024));
  const hop = Math.max(64, Math.round(frame / 2));
  let count = 0;
  let total = 0;
  for (let start = 0; start + frame < samples.length; start += hop) {
    let fullEnergy = 0;
    let lowEnergy = 0;
    for (let i = 0; i < frame; i++) {
      const a = samples[start + i];
      const l = low[start + i];
      fullEnergy += a * a;
      lowEnergy += l * l;
    }
    const fullRms = Math.sqrt(fullEnergy / frame);
    const lowRms = Math.sqrt(lowEnergy / frame);
    if (fullRms > 0.006) {
      total++;
      if (lowRms > fullRms * 0.58 && lowRms > 0.012) count++;
    }
  }
  return clamp((count / Math.max(1, total)) * 180, 0, 100);
}

function levelProblemScore(analysis) {
  let score = 0;
  const loudness = Number.isFinite(analysis.integratedLufs) ? analysis.integratedLufs : analysis.rmsDb;
  const peakDb = Number.isFinite(analysis.truePeakDb) ? analysis.truePeakDb : analysis.peakDb;
  if (loudness < -31) score += (-31 - loudness) * 3.2;
  if (loudness > -13.5) score += (loudness + 13.5) * 5;
  if (analysis.rmsDb < -36) score += (-36 - analysis.rmsDb) * 1.2;
  if (peakDb > -1.2) score += (peakDb + 1.2) * 22;
  if (peakDb < -18) score += (-18 - peakDb) * 1.2;
  return clamp(score, 0, 100);
}

function noiseProblemScore(analysis, noiseFloor, activeRatio) {
  const noiseGap = analysis.rmsDb - linToDb(noiseFloor);
  return clamp((18 - noiseGap) * 3 + Math.max(0, 0.42 - activeRatio) * 40, 0, 100);
}

function frameRms(samples, sampleRate) {
  const size = Math.max(256, Math.round(sampleRate * 0.03));
  const hop = Math.max(128, Math.round(size / 2));
  const frames = [];
  for (let start = 0; start < samples.length; start += hop) {
    const end = Math.min(samples.length, start + size);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    frames.push({ start, rms: Math.sqrt(sum / Math.max(1, end - start)) });
    if (end === samples.length) break;
  }
  return frames;
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const index = clamp(Math.round((values.length - 1) * pct), 0, values.length - 1);
  return values[index] || 0;
}

function applyGain(input, db) {
  if (!Number.isFinite(db) || Math.abs(db) < 0.01) return input;
  const gain = dbToLin(db);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * gain;
  return out;
}

function reducePlosives(input, sampleRate, amountPct) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  const low = applyBiquad(input, sampleRate, "lowpass", 180, 0.72, 0);
  const out = new Float32Array(input.length);
  let lowEnv = 0;
  let fullEnv = 0;
  for (let i = 0; i < input.length; i++) {
    const la = Math.abs(low[i]);
    const fa = Math.abs(input[i]);
    lowEnv += (la - lowEnv) * (la > lowEnv ? 0.08 : 0.004);
    fullEnv += (fa - fullEnv) * (fa > fullEnv ? 0.04 : 0.002);
    const burst = clamp((lowEnv - fullEnv * 0.62) * 30, 0, 1);
    out[i] = input[i] - low[i] * burst * amount * 0.78;
  }
  return out;
}

function reduceMouthClicks(input, sampleRate, amountPct, passCount = 1) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  const passes = passCount >= 2 && amount > 0.32
    ? [amount * 0.68, amount * 0.32]
    : [amount];
  let work = input;
  for (const passAmount of passes) work = reduceMouthClickPass(work, sampleRate, passAmount);
  return work;
}

function reduceMouthClickPass(input, sampleRate, amount) {
  const high = applyBiquad(input, sampleRate, "highpass", 1800, 0.72, 0);
  const out = new Float32Array(input);
  let fast = 0;
  let slow = 0;
  for (let i = 1; i < input.length - 1; i++) {
    const h = Math.abs(high[i]);
    fast += (h - fast) * 0.5;
    slow += (h - slow) * 0.018;
    const spike = clamp((fast - slow * 4.8) * 46, 0, 1);
    if (spike > 0) {
      const interp = (out[i - 1] + input[i + 1]) * 0.5;
      out[i] = out[i] * (1 - spike * amount * 0.72) + interp * spike * amount * 0.72;
    }
  }
  return out;
}

function reduceRoomNoise(input, sampleRate, amountPct, shaper = null) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  const out = new Float32Array(input.length);
  let env = 0;
  let gateGain = 1;
  let hold = 0;
  const threshold = dbToLin(shaper?.thresholdDb ?? -52);
  const minGain = dbToLin(shaper?.minGainDb ?? -10);
  const attack = 1 - Math.exp(-1 / Math.max(1, sampleRate * (Number(shaper?.attackMs || 8) / 1000)));
  const release = 1 - Math.exp(-1 / Math.max(1, sampleRate * (Number(shaper?.releaseMs || 240) / 1000)));
  const holdSamples = Math.max(0, Math.round(sampleRate * Number(shaper?.holdMs || 80) / 1000));
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    env += (a - env) * (a > env ? 0.05 : 0.0022);
    const open = env >= threshold;
    if (open) hold = holdSamples;
    else if (hold > 0) hold--;
    const quiet = clamp((threshold - env) / Math.max(1e-6, threshold), 0, 1);
    const targetGain = open || hold > 0 ? 1 : 1 - (1 - minGain) * quiet * amount;
    const coeff = targetGain > gateGain ? attack : release;
    gateGain += (targetGain - gateGain) * coeff;
    out[i] = input[i] * gateGain;
  }
  return out;
}

function dualBandDeEss(input, sampleRate, stages = {}) {
  const highAmount = Number.isFinite(stages.deEssHigh) ? stages.deEssHigh : stages.deEss;
  const lowAmount = Number.isFinite(stages.deEssLow) ? stages.deEssLow : (stages.deEss || 0) * 0.42;
  const lookaheadMs = stages.deEssLookaheadMs || 0;
  let work = dynamicDeEss(input, sampleRate, lowAmount, Math.min(lookaheadMs, 5), 3200, 5200);
  work = dynamicDeEss(work, sampleRate, highAmount, lookaheadMs, 5200, Math.min(11000, sampleRate * 0.46));
  return work;
}

function dynamicDeEss(input, sampleRate, amountPct, lookaheadMs = 0, lowHz = 5200, highHz = 0) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  let band = applyBiquad(input, sampleRate, "highpass", lowHz, 0.72, 0);
  if (highHz && highHz < sampleRate * 0.47) band = applyBiquad(band, sampleRate, "lowpass", highHz, 0.72, 0);
  const out = new Float32Array(input.length);
  let env = 0;
  const lookahead = Math.max(0, Math.min(Math.round(sampleRate * 0.015), Math.round(sampleRate * (lookaheadMs || 0) / 1000)));
  const threshold = lowHz < 5000 ? 0.014 : 0.018;
  const sensitivity = lowHz < 5000 ? 12 : 16;
  const maxReduction = lowHz < 5000 ? 0.52 : 0.72;
  for (let i = 0; i < input.length; i++) {
    const h = Math.abs(band[Math.min(band.length - 1, i + lookahead)]);
    env += (h - env) * (h > env ? 0.16 : 0.006);
    const reduction = clamp((env - threshold) * sensitivity, 0, maxReduction * amount);
    out[i] = input[i] - band[i] * reduction;
  }
  return out;
}

function phraseAwareLeveler(input, sampleRate, ride = null, fallbackAmountPct = 0) {
  const amountPct = Number.isFinite(ride?.amount) ? ride.amount : fallbackAmountPct;
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  const target = dbToLin(Number.isFinite(ride?.targetDb) ? ride.targetDb : -22);
  const maxBoost = dbToLin(clamp(Number(ride?.boostDb || 3.2), 0.5, 8));
  const maxCut = dbToLin(-clamp(Number(ride?.cutDb || 3.2), 0.5, 9));
  const noiseGate = dbToLin(Number.isFinite(ride?.noiseGateDb) ? ride.noiseGateDb : -54);
  const attack = 1 - Math.exp(-1 / Math.max(1, sampleRate * clamp(Number(ride?.attackMs || 34), 8, 120) / 1000));
  const release = 1 - Math.exp(-1 / Math.max(1, sampleRate * clamp(Number(ride?.releaseMs || 180), 60, 520) / 1000));
  const phraseRelease = 1 - Math.exp(-1 / Math.max(1, sampleRate * 0.48));
  const out = new Float32Array(input.length);
  let fastEnv = 0;
  let phraseEnv = 0;
  let gain = 1;
  let hold = 0;
  const holdSamples = Math.round(sampleRate * clamp(Number(ride?.holdMs || 72), 0, 180) / 1000);
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    fastEnv += (a - fastEnv) * (a > fastEnv ? 0.04 : 0.004);
    phraseEnv += (a - phraseEnv) * (a > phraseEnv ? attack * 0.42 : phraseRelease);
    if (phraseEnv > noiseGate) hold = holdSamples;
    else if (hold > 0) hold--;

    let desired = 1;
    if (phraseEnv > noiseGate || hold > 0) {
      desired = clamp(target / Math.max(target * 0.42, phraseEnv), maxCut, maxBoost);
      const emphasized = fastEnv > phraseEnv * 1.72 && fastEnv > target * 0.82;
      if (ride?.naturalMode && emphasized) {
        desired = desired < 1 ? 1 - (1 - desired) * 0.62 : 1 + (desired - 1) * 0.66;
      }
    }
    const blended = 1 + (desired - 1) * amount * 0.62;
    gain += (blended - gain) * (blended < gain ? attack * 1.35 : release);
    out[i] = input[i] * gain;
  }
  const baseline = speechLeveler(input, amountPct);
  const blend = clamp(amount * 0.46, 0, 0.5);
  for (let i = 0; i < out.length; i++) out[i] = baseline[i] * (1 - blend) + out[i] * blend;
  return out;
}

function speechLeveler(input, amountPct) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  const out = new Float32Array(input.length);
  let env = 0;
  const target = dbToLin(-22);
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    env += (a - env) * (a > env ? 0.012 : 0.0008);
    const lift = clamp(target / Math.max(target * 0.42, env), 0.82, 1.42);
    const gain = 1 + (lift - 1) * amount * 0.48;
    out[i] = input[i] * gain;
  }
  return out;
}

function speechCompressor(input, amountPct) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  const out = new Float32Array(input.length);
  const threshold = dbToLin(-25 + amount * 7);
  const ratio = 1 + amount * 4.2;
  let env = 0;
  let gain = 1;
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    env += (a - env) * (a > env ? 0.025 : 0.003);
    let target = 1;
    if (env > threshold) {
      const over = env / threshold;
      target = Math.pow(over, (1 / ratio) - 1);
    }
    gain += (target - gain) * 0.018;
    out[i] = input[i] * gain * (1 + amount * 0.08);
  }
  return out;
}

function lightSaturation(input, amountPct) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  const out = new Float32Array(input.length);
  const drive = 1 + amount * 2.2;
  const norm = Math.tanh(drive);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] * (1 - amount * 0.55) + (Math.tanh(input[i] * drive) / norm) * amount * 0.55;
  }
  return out;
}

function limiter(input, ceilingDb) {
  const ceiling = dbToLin(Number.isFinite(ceilingDb) ? ceilingDb : -1);
  const out = new Float32Array(input.length);
  let env = 0;
  let gain = 1;
  for (let i = 0; i < input.length; i++) {
    env = Math.max(Math.abs(input[i]), env * 0.996);
    const target = env > ceiling ? ceiling / env : 1;
    gain += (target - gain) * (target < gain ? 0.16 : 0.004);
    out[i] = clamp(input[i] * gain, -ceiling, ceiling);
  }
  return out;
}

function studioPolishIssues(before, after, outputLength, sourceLength) {
  const issues = [];
  if (outputLength !== sourceLength) issues.push({ level: "fail", text: "length drift" });
  if (!Number.isFinite(after.rms) || after.rms <= 0) issues.push({ level: "fail", text: "invalid rms" });
  if (after.peak > 1 || after.clipped) issues.push({ level: "fail", text: "clips" });
  const loudness = Number.isFinite(after.integratedLufs) ? after.integratedLufs : after.rmsDb;
  const truePeakDb = Number.isFinite(after.truePeakDb) ? after.truePeakDb : after.peakDb;
  if (loudness > -10) issues.push({ level: "warn", text: "too loud" });
  if (loudness < -34) issues.push({ level: "warn", text: "too quiet" });
  if (truePeakDb > -0.7) issues.push({ level: "warn", text: "near true peak ceiling" });
  if (after.problemScores.sibilance > before.problemScores.sibilance + 12 && after.problemScores.sibilance > 38) issues.push({ level: "warn", text: "sibilance increased" });
  if (after.problemScores.harsh > before.problemScores.harsh + 16 && after.problemScores.harsh > 45) issues.push({ level: "warn", text: "harshness increased" });
  return issues;
}

function toFloat32(input) {
  return input instanceof Float32Array ? input : new Float32Array(input || 0);
}

function formatDb(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dB` : "-inf dB";
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function nowMs() {
  return globalThis.performance && typeof globalThis.performance.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
