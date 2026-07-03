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

export const STUDIO_POLISH_INTENSITIES = Object.freeze([
  { id: "light", label: "Light", factor: 0.45, targetRmsDb: -21.5 },
  { id: "standard", label: "Standard", factor: 0.72, targetRmsDb: -20 },
  { id: "strong", label: "Strong", factor: 0.95, targetRmsDb: -18.5 }
]);

const DEFAULT_INTENSITY = STUDIO_POLISH_INTENSITIES[1];

export function studioPolishIntensityById(id) {
  return STUDIO_POLISH_INTENSITIES.find((item) => item.id === id) || DEFAULT_INTENSITY;
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
  const band = bandProfile(samples, sampleRate);
  const mouthClick = mouthClickScore(samples, sampleRate, band);
  const plosive = plosiveScore(samples, sampleRate);
  const levelScore = levelProblemScore(base);
  const noiseScore = noiseProblemScore(base, noiseFloor, activeRatio);
  const sibilance = clamp((band.sibilanceRatio - 0.045) * 1050 + Math.max(0, base.zeroCrossingsPerSecond - 3200) * 0.018, 0, 100);
  const mud = clamp((band.mudRatio - 0.22) * 360, 0, 100);
  const nasal = clamp((band.nasalRatio - 0.2) * 410, 0, 100);
  const harsh = clamp((band.harshRatio - 0.13) * 620, 0, 100);
  const brightnessProblem = base.brightnessRatio < 0.16
    ? clamp((0.16 - base.brightnessRatio) * 420, 0, 100)
    : base.brightnessRatio > 0.42
      ? clamp((base.brightnessRatio - 0.42) * 380, 0, 100)
      : 0;
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
  return {
    ...base,
    status: score >= 86 ? "ready" : score >= 68 ? "polish" : "repair",
    score,
    activeRatio,
    noiseFloor,
    noiseFloorDb: linToDb(noiseFloor),
    headroomDb: Number.isFinite(base.peakDb) ? -base.peakDb : 0,
    loudnessProxyDb: base.rmsDb + clamp(activeRatio - 0.55, -0.18, 0.18) * 4,
    dynamicRangeDb,
    band,
    problemScores: {
      level: levelScore,
      noise: noiseScore,
      mouthClick,
      plosive,
      sibilance,
      mud,
      nasal,
      harsh,
      brightness: brightnessProblem
    },
    items: studioAnalysisItems({
      base,
      noiseFloorDb: linToDb(noiseFloor),
      activeRatio,
      dynamicRangeDb,
      band,
      levelScore,
      noiseScore,
      mouthClick,
      plosive,
      sibilance,
      mud,
      nasal,
      harsh,
      brightnessProblem
    })
  };
}

export function buildStudioPolishPlan(analysis, intensityId = "standard") {
  const intensity = studioPolishIntensityById(intensityId);
  const f = intensity.factor;
  const scores = analysis.problemScores || {};
  const lowPitch = Number(analysis.pitchMedianHz || 0) > 0 && analysis.pitchMedianHz < 125;
  const highPassHz = clamp(
    (lowPitch ? 62 : 78) +
      Math.max(0, scores.plosive || 0) * 0.28 * f +
      Math.max(0, scores.mud || 0) * 0.18 * f,
    lowPitch ? 54 : 68,
    135
  );
  const targetRmsDb = intensity.targetRmsDb;
  const gainToTarget = targetRmsDb - Number(analysis.rmsDb || targetRmsDb);
  const headroomLimit = Math.max(-8, Number(analysis.headroomDb || 0) - 2.2);
  const outputGainDb = clamp(Math.min(gainToTarget, headroomLimit), -9, 8);
  return {
    id: `studio-polish-${intensity.id}`,
    intensity: intensity.id,
    label: `Studio Polish ${intensity.label}`,
    targetRmsDb,
    stages: {
      inputGainDb: clamp((analysis.rmsDb < -34 ? 4 : 0) - (analysis.peakDb > -2 ? 3 : 0), -6, 6),
      deplosive: clamp(((scores.plosive || 0) - 8) * 1.15 * f, 0, 100),
      mouthClick: clamp(((scores.mouthClick || 0) - 7) * 1.18 * f, 0, 100),
      noiseReduction: clamp(((scores.noise || 0) - 6) * 0.92 * f, 0, 72),
      highPassHz,
      mudDb: -clamp(((scores.mud || 0) - 8) * 0.072 * f, 0, 5.5),
      nasalDb: -clamp(((scores.nasal || 0) - 8) * 0.068 * f, 0, 4.8),
      harshDb: -clamp(((scores.harsh || 0) - 8) * 0.058 * f, 0, 4.8),
      deEss: clamp((scores.sibilance || 0) * 0.9 * f + (scores.harsh || 0) * 0.22 * f, 0, 82),
      leveler: clamp(22 + Math.max(0, analysis.dynamicRangeDb - 13) * 2.4 + f * 24, 12, 74),
      compression: clamp(20 + Math.max(0, analysis.dynamicRangeDb - 12) * 1.5 + f * 20, 12, 70),
      presenceDb: clamp((analysis.brightnessRatio < 0.18 ? 1.2 : analysis.brightnessRatio > 0.36 ? -0.65 : 0.4) * f - Math.max(0, scores.harsh || 0) * 0.01, -1.4, 2.8),
      airDb: clamp((analysis.brightnessRatio < 0.2 ? 1.4 : analysis.brightnessRatio > 0.36 ? -0.9 : 0.5) * f - Math.max(0, scores.sibilance || 0) * 0.018, -1.8, 2.4),
      saturation: clamp(4 + f * 8 - Math.max(0, scores.harsh || 0) * 0.04, 0, 12),
      outputGainDb,
      limiterDb: -1
    },
    notes: planNotes(analysis, intensity.id)
  };
}

export function processStudioPolish(input, sampleRate, planOrOptions = "standard") {
  const samples = toFloat32(input);
  const analysis = planOrOptions?.stages ? null : analyzeStudioVoice(samples, sampleRate);
  const plan = planOrOptions?.stages
    ? planOrOptions
    : buildStudioPolishPlan(analysis, typeof planOrOptions === "string" ? planOrOptions : planOrOptions?.intensity || "standard");
  const p = plan.stages;
  let work = new Float32Array(samples);
  work = applyGain(work, p.inputGainDb);
  work = reducePlosives(work, sampleRate, p.deplosive);
  work = reduceMouthClicks(work, sampleRate, p.mouthClick);
  work = reduceRoomNoise(work, p.noiseReduction);
  work = applyBiquad(work, sampleRate, "highpass", p.highPassHz, 0.72, 0);
  work = applyBiquad(work, sampleRate, "peaking", 245, 0.9, p.mudDb);
  work = applyBiquad(work, sampleRate, "peaking", 930, 1.05, p.nasalDb);
  work = applyBiquad(work, sampleRate, "peaking", 3300, 1.1, p.harshDb);
  work = dynamicDeEss(work, sampleRate, p.deEss);
  work = speechLeveler(work, p.leveler);
  work = speechCompressor(work, p.compression);
  work = applyBiquad(work, sampleRate, "peaking", 2300, 0.8, p.presenceDb);
  work = applyBiquad(work, sampleRate, "highshelf", 7200, 0.72, p.airDb);
  work = lightSaturation(work, p.saturation);
  work = applyGain(work, p.outputGainDb);
  work = limiter(work, p.limiterDb);
  return {
    samples: work,
    plan,
    inputAnalysis: analysis || analyzeStudioVoice(samples, sampleRate),
    outputAnalysis: analyzeStudioVoice(work, sampleRate)
  };
}

export function runStudioPolishQualitySuite({
  sampleRate = 48000,
  duration = 0.52,
  profiles = REFERENCE_VOICE_PROFILES,
  intensity = "standard"
} = {}) {
  const started = nowMs();
  const results = profiles.map((profile) => {
    const source = generateReferenceVoice(profile.id, { sampleRate, duration });
    const before = analyzeStudioVoice(source.samples, sampleRate);
    const processed = processStudioPolish(source.samples, sampleRate, intensity);
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
    renderedSeconds,
    elapsedMs,
    realtimeFactor: elapsedMs / Math.max(1, renderedSeconds * 1000)
  };
}

function studioAnalysisItems(metrics) {
  return [
    item("level", "Level", metrics.levelScore, `${formatDb(metrics.base.rmsDb)} RMS / ${formatDb(metrics.base.peakDb)} peak`, "Gain staging and headroom before character processing."),
    item("noise", "Noise Floor", metrics.noiseScore, `${formatDb(metrics.noiseFloorDb)} floor`, "Low-level room or device noise that can be amplified by compression."),
    item("plosive", "Plosives", metrics.plosive, `${Math.round(metrics.plosive)} risk`, "Low-frequency bursts should be reduced before high-pass filtering."),
    item("mouth", "Mouth Clicks", metrics.mouthClick, `${Math.round(metrics.mouthClick)} risk`, "Short mouth transients and lip-smack-like events."),
    item("sibilance", "Sibilance", metrics.sibilance, `${Math.round(metrics.band.sibilanceRatio * 100)}% high`, "Sharp S and fricative energy needing dynamic control."),
    item("tone", "Tone Balance", Math.max(metrics.mud, metrics.nasal, metrics.harsh, metrics.brightnessProblem), toneValue(metrics), "Mud, nasal resonance, harshness, and brightness balance."),
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

function planNotes(analysis, intensity) {
  const notes = [`${intensity} polish`];
  const scores = analysis.problemScores || {};
  if (scores.plosive > 18) notes.push("de-plosive before high-pass");
  if (scores.mouthClick > 18) notes.push("mouth click smoothing");
  if (scores.noise > 18) notes.push("gentle noise reduction");
  if (scores.sibilance > 18) notes.push("dynamic de-ess");
  if (Math.max(scores.mud || 0, scores.nasal || 0, scores.harsh || 0) > 18) notes.push("source-adaptive tone cleanup");
  return notes;
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
  if (analysis.rmsDb < -34) score += (-34 - analysis.rmsDb) * 3;
  if (analysis.rmsDb > -11) score += (analysis.rmsDb + 11) * 4;
  if (analysis.peakDb > -1.2) score += (analysis.peakDb + 1.2) * 18;
  if (analysis.peakDb < -18) score += (-18 - analysis.peakDb) * 1.5;
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

function reduceMouthClicks(input, sampleRate, amountPct) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
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

function reduceRoomNoise(input, amountPct) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  const out = new Float32Array(input.length);
  let env = 0;
  let floor = 0.004;
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    env += (a - env) * (a > env ? 0.06 : 0.0018);
    floor += (Math.min(env, floor * 1.08 + 0.00002) - floor) * 0.0009;
    const quiet = clamp((floor * 3.4 - env) / Math.max(1e-6, floor * 3.4), 0, 1);
    const gain = 1 - quiet * amount * 0.58;
    out[i] = input[i] * gain;
  }
  return out;
}

function dynamicDeEss(input, sampleRate, amountPct) {
  const amount = clamp(amountPct / 100, 0, 1);
  if (amount <= 0.001) return input;
  const high = applyBiquad(input, sampleRate, "highpass", 5200, 0.72, 0);
  const out = new Float32Array(input.length);
  let env = 0;
  for (let i = 0; i < input.length; i++) {
    const h = Math.abs(high[i]);
    env += (h - env) * (h > env ? 0.16 : 0.006);
    const reduction = clamp((env - 0.018) * 16, 0, 0.72 * amount);
    out[i] = input[i] - high[i] * reduction;
  }
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
  if (after.rmsDb > -8) issues.push({ level: "warn", text: "too loud" });
  if (after.rmsDb < -34) issues.push({ level: "warn", text: "too quiet" });
  if (after.peakDb > -0.7) issues.push({ level: "warn", text: "near ceiling" });
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

function nowMs() {
  return globalThis.performance && typeof globalThis.performance.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
