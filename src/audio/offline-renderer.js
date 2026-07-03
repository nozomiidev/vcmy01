import {
  analyzeBuffer,
  buildCalibrationProfile,
  calibrateParamsForVoice,
  encodeWavMono,
  generateReferenceVoice,
  processVoiceBuffer,
  referenceVoiceProfileById
} from "./dsp-core.js";
import { automationSummary, renderScriptAutomation } from "./performance-script.js";
import { analyzeStudioVoice, buildStudioPolishPlan, processStudioPolish, studioProductionTargetById } from "./studio-polish.js";
import { applyCharacterSafety } from "./character-safety.js";
import { normalizeLoudness } from "./loudness-meter.js";

export class OfflineRenderer {
  constructor() {
    this.source = null;
    this.rendered = null;
    this.profile = null;
  }

  generateSample(sampleRate = 48000, profileId = "neutral_medium") {
    const reference = generateReferenceVoice(profileId, { sampleRate, duration: 2.8 });
    const samples = reference.samples;
    const blob = encodeWavMono(samples, sampleRate);
    this.profile = buildCalibrationProfile(samples, sampleRate);
    this.source = {
      name: `Generated ${reference.profile.name}`,
      sourceProfileId: reference.profile.id,
      sourceKind: "generated",
      sourceUrl: "",
      sourceType: "audio/wav",
      sampleRate,
      samples,
      blob,
      analysis: this.profile,
      studioAnalysis: analyzeStudioVoice(samples, sampleRate)
    };
    this.rendered = null;
    return this.source;
  }

  async loadFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return this.loadArrayBuffer(arrayBuffer, {
      name: file.name,
      sourceKind: "file",
      sourceType: file.type || ""
    });
  }

  async loadUrl(rawUrl) {
    const url = normalizeAudioUrl(rawUrl);
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`Audio URL returned ${response.status}.`);
    const arrayBuffer = await response.arrayBuffer();
    const resolved = response.url || url;
    return this.loadArrayBuffer(arrayBuffer, {
      name: audioNameFromUrl(resolved),
      sourceKind: "url",
      sourceUrl: resolved,
      sourceType: response.headers.get("content-type") || ""
    });
  }

  async loadArrayBuffer(arrayBuffer, metadata = {}) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio decode is unavailable in this browser.");
    const ctx = new AC();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const samples = mixAudioBufferToMono(audioBuffer);
    await ctx.close?.();
    this.profile = buildCalibrationProfile(samples, audioBuffer.sampleRate);
    this.source = {
      name: metadata.name || "Imported Audio",
      sourceKind: metadata.sourceKind || "file",
      sourceUrl: metadata.sourceUrl || "",
      sourceType: metadata.sourceType || "",
      sampleRate: audioBuffer.sampleRate,
      samples,
      blob: encodeWavMono(samples, audioBuffer.sampleRate),
      analysis: this.profile,
      studioAnalysis: analyzeStudioVoice(samples, audioBuffer.sampleRate)
    };
    this.rendered = null;
    return this.source;
  }

  analyze() {
    if (!this.source) throw new Error("No source audio loaded.");
    this.profile = buildCalibrationProfile(this.source.samples, this.source.sampleRate);
    this.source.analysis = this.profile;
    this.source.studioAnalysis = analyzeStudioVoice(this.source.samples, this.source.sampleRate);
    return this.profile;
  }

  calibratedParams(params) {
    if (!this.profile) this.analyze();
    return calibrateParamsForVoice(params, this.profile);
  }

  render(params, options = {}) {
    if (!this.source) throw new Error("No source audio loaded.");
    const started = nowMs();
    const baseParams = { ...params };
    const appliedParams = options.autoCalibrate ? this.calibratedParams(baseParams) : baseParams;
    const region = normalizeRenderRegion(this.source.samples.length, this.source.sampleRate, options.region);
    const sourceSamples = region.isFull
      ? this.source.samples
      : this.source.samples.slice(region.startSample, region.endSample);
    const studioPolish = renderStudioPolish(sourceSamples, this.source.sampleRate, {
      intensity: options.studioPolish,
      target: options.studioTarget,
      optimize: options.directorOptimize
    });
    const characterInput = studioPolish ? studioPolish.samples : sourceSamples;
    const stage = options.stage || "character";
    const characterSafety = stage === "polish" ? null : applyCharacterSafety(appliedParams, {
      sourceProfile: this.profile,
      source: this.source,
      target: options.performanceScript?.target || null
    });
    const characterParams = characterSafety?.params || appliedParams;
    const automation = stage !== "polish" && options.automatePerformance && options.performanceScript
      ? renderScriptAutomation(characterInput, this.source.sampleRate, characterParams, options.performanceScript, {
        ...(options.automationOptions || {}),
        normalizedParams: true
      })
      : null;
    const rawSamples = stage === "polish"
      ? characterInput
      : automation
      ? automation.samples
      : processVoiceBuffer(characterInput, this.source.sampleRate, characterParams, { normalizedParams: true });
    const masteringTarget = studioProductionTargetById(options.studioTarget);
    const mastering = normalizeLoudness(rawSamples, this.source.sampleRate, {
      targetLufs: masteringTarget.targetRmsDb,
      truePeakCeilingDb: masteringTarget.ceilingDb,
      maxGainDb: 9,
      minGainDb: -9
    });
    const samples = mastering.samples;
    const blob = encodeWavMono(samples, this.source.sampleRate);
    const mode = options.mode || (region.isFull ? "full" : "preview");
    const analysis = analyzeBuffer(samples, this.source.sampleRate);
    const studioAnalysis = analyzeStudioVoice(samples, this.source.sampleRate);
    const audition = buildAuditionSummary({
      sourceAnalysis: analyzeBuffer(sourceSamples, this.source.sampleRate),
      polishAnalysis: studioPolish ? analyzeBuffer(studioPolish.samples, this.source.sampleRate) : null,
      renderAnalysis: analysis,
      mastering
    });
    const elapsedMs = nowMs() - started;
    const renderedSeconds = samples.length / Math.max(1, this.source.sampleRate);
    const performance = {
      elapsedMs: Number(elapsedMs.toFixed(2)),
      renderedSeconds: Number(renderedSeconds.toFixed(3)),
      realtimeFactor: Number((elapsedMs / Math.max(1, renderedSeconds * 1000)).toFixed(4)),
      sampleRate: this.source.sampleRate,
      mode,
      stage
    };
    this.rendered = {
      name: `${this.source.name} - VoiceForge ${mode}.wav`,
      sampleRate: this.source.sampleRate,
      samples,
      blob,
      analysis,
      studioAnalysis,
      mastering: {
        enabled: mastering.enabled,
        target: { id: masteringTarget.id, label: masteringTarget.label },
        targetLufs: mastering.targetLufs,
        truePeakCeilingDb: mastering.truePeakCeilingDb,
        gainDb: mastering.gainDb,
        limitedByTruePeak: mastering.limitedByTruePeak,
        before: mastering.before,
        after: mastering.after
      },
      region,
      mode,
      stage,
      performance,
      studioPolish: studioPolish ? {
        enabled: true,
        intensity: studioPolish.plan.intensity,
        target: studioPolish.plan.target || null,
        optimized: !!studioPolish.plan.optimization?.enabled,
        label: studioPolish.plan.label,
        plan: studioPolish.plan,
        inputAnalysis: studioPolish.inputAnalysis,
        outputAnalysis: studioPolish.outputAnalysis
      } : {
        enabled: false,
        intensity: "off",
        label: "Studio Polish Off",
        plan: null,
        inputAnalysis: analyzeStudioVoice(sourceSamples, this.source.sampleRate),
        outputAnalysis: null
      },
      autoCalibrated: !!options.autoCalibrate,
      audition,
      characterSafety,
      scriptAutomated: !!automation,
      performanceScript: options.performanceScript ? {
        targetId: options.performanceScript.targetId,
        targetName: options.performanceScript.targetName,
        status: options.performanceScript.status,
        score: options.performanceScript.score
      } : null,
      performanceScriptPlan: options.performanceScript || null,
      scriptAutomation: automation?.plan || null,
      scriptAutomationSummary: automationSummary(automation?.plan),
      baseParams,
      appliedParams: characterParams,
      calibrationDelta: paramDeltas(baseParams, appliedParams),
      safetyDelta: characterSafety ? paramDeltas(appliedParams, characterParams) : []
    };
    return this.rendered;
  }

  sourceFitReport(params, target = null) {
    if (!this.source) return null;
    if (!this.profile) this.analyze();
    return sourceFitReport(params, this.profile, target, this.source);
  }
}

function buildAuditionSummary({ sourceAnalysis = null, polishAnalysis = null, renderAnalysis = null, mastering = null } = {}) {
  const referenceLufs = Number.isFinite(renderAnalysis?.integratedLufs)
    ? renderAnalysis.integratedLufs
    : Number.isFinite(mastering?.targetLufs)
    ? mastering.targetLufs
    : -19;
  const stages = [
    auditionStageSummary("source", "Source", sourceAnalysis, referenceLufs, mastering),
    polishAnalysis ? auditionStageSummary("studio-polish", "Studio Polish", polishAnalysis, referenceLufs, mastering) : null,
    auditionStageSummary("character-render", "Character Render", renderAnalysis, referenceLufs, mastering)
  ].filter(Boolean);
  const warnings = stages.filter((stage) => stage.status !== "ready").map((stage) => `${stage.label}: ${stage.reason}`);
  return {
    status: warnings.length ? "check" : "ready",
    reference: {
      integratedLufs: Number(referenceLufs.toFixed(2)),
      truePeakCeilingDb: Number((mastering?.truePeakCeilingDb ?? -1).toFixed(2))
    },
    stageCount: stages.length,
    stages,
    warnings
  };
}

function auditionStageSummary(id, label, analysis, referenceLufs, mastering) {
  if (!analysis) return null;
  const truePeakCeilingDb = Number.isFinite(mastering?.truePeakCeilingDb) ? mastering.truePeakCeilingDb : -1;
  const loudnessGainDb = referenceLufs - (Number.isFinite(analysis.integratedLufs) ? analysis.integratedLufs : referenceLufs);
  const peakSafeGainDb = truePeakCeilingDb - (Number.isFinite(analysis.truePeakDb) ? analysis.truePeakDb : -120);
  const gainDb = Math.max(-18, Math.min(18, Math.min(loudnessGainDb, peakSafeGainDb)));
  const limitedByPeak = loudnessGainDb > peakSafeGainDb;
  const projectedLufs = (Number.isFinite(analysis.integratedLufs) ? analysis.integratedLufs : referenceLufs) + gainDb;
  const deltaLu = projectedLufs - referenceLufs;
  const status = Math.abs(deltaLu) <= 1.2 || limitedByPeak ? "ready" : "check";
  return {
    id,
    label,
    gainDb: Number(gainDb.toFixed(2)),
    projectedLufs: Number(projectedLufs.toFixed(2)),
    deltaLu: Number(deltaLu.toFixed(2)),
    limitedByPeak,
    status,
    reason: status === "ready"
      ? limitedByPeak ? "true-peak ceiling constrained exact loudness match" : "within loudness-match tolerance"
      : "outside loudness-match tolerance"
  };
}

function renderStudioPolish(sourceSamples, sampleRate, option = "standard") {
  const requested = typeof option === "object" && option ? option.intensity : option;
  if (requested === false || requested === "off") return null;
  const intensity = typeof requested === "string" ? requested : "standard";
  const target = typeof option === "object" && option ? option.target || "podcast" : "podcast";
  const optimize = typeof option === "object" && option ? !!option.optimize : false;
  const inputAnalysis = analyzeStudioVoice(sourceSamples, sampleRate);
  const plan = buildStudioPolishPlan(inputAnalysis, intensity, target);
  return processStudioPolish(sourceSamples, sampleRate, optimize ? {
    intensity,
    target,
    optimize: true,
    iterations: option.iterations || 22
  } : plan);
}

export function sourceFitReport(params = {}, profile = {}, target = null, source = {}) {
  const expected = target?.sourceProfileId ? referenceVoiceProfileById(target.sourceProfileId) : null;
  const expectedRange = expected ? rangeForF0(expected.f0) : "any";
  const rangeMatch = expected
    ? source.sourceProfileId === expected.id || profile.range === expectedRange || (expected.id === "breathy_close" && profile.breathyOrNoisy)
    : true;
  const calibrated = calibrateParamsForVoice(params, profile);
  const patches = paramDeltas(params, calibrated);
  const spectralItem = spectralFitItem(source?.studioAnalysis, params, target);
  const items = [
    {
      id: "range",
      label: "Range",
      status: rangeMatch ? "ready" : profile.range === "unknown" ? "tune" : "risk",
      value: `${profile.range || "unknown"} -> ${expected?.name || "Any"}`,
      detail: rangeMatch ? "Source range supports this target." : "Target may need range compensation."
    },
    {
      id: "level",
      label: "Level",
      status: profile.tooQuiet || profile.tooHot ? "tune" : "ready",
      value: `${formatDb(profile.rmsDb)} RMS / ${formatDb(profile.peakDb)} peak`,
      detail: profile.tooQuiet ? "Input needs lift before character shaping." : profile.tooHot ? "Input needs headroom before rendering." : "Level has usable headroom."
    },
    {
      id: "tone",
      label: "Tone",
      status: profile.bright || profile.dark ? "tune" : "ready",
      value: profile.bright ? "bright" : profile.dark ? "dark" : "balanced",
      detail: profile.bright ? "De-essing and darker balance are recommended." : profile.dark ? "Air and brightness compensation are recommended." : "Tone is balanced enough for this chain."
    },
    {
      id: "texture",
      label: "Texture",
      status: textureStatus(profile, expected),
      value: profile.breathyOrNoisy ? "breathy/noisy" : "controlled",
      detail: textureDetail(profile, expected)
    },
    spectralItem
  ].filter(Boolean);
  const patchPenalty = patches.reduce((sum, item) => sum + Math.min(10, Math.abs(item.delta)), 0);
  const statusPenalty = items.reduce((sum, item) => sum + (item.status === "risk" ? 18 : item.status === "tune" ? 8 : 0), 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - statusPenalty - Math.min(24, patchPenalty))));
  return {
    score,
    status: score >= 86 ? "ready" : score >= 68 ? "tune" : "risk",
    expectedSource: expected ? expected.name : "Any",
    sourceRange: profile.range || "unknown",
    items,
    patches
  };
}

function spectralFitItem(studioAnalysis = null, params = {}, target = null) {
  const spectral = studioAnalysis?.spectral || null;
  if (!spectral) return null;
  const risks = spectral.risks || {};
  const brightTarget = (params.pitch || 0) > 0.5 || (params.formant || 0) > 0.5 || (params.cuteness || 0) > 35 || (params.anime || 0) > 35 || /kawaii|anime|otome/i.test(target?.id || target?.presetId || "");
  const bodyTarget = (params.pitch || 0) < -0.5 || (params.formant || 0) < -0.5 || (params.body || 0) > 35 || /ikemen|narrator|deep/i.test(target?.id || target?.presetId || "");
  const problemMap = {
    nasal: risks.nasal || 0,
    harsh: risks.harsh || 0,
    sibilance: risks.sibilance || 0,
    mud: risks.mud || 0,
    dark: risks.dark || 0,
    thin: risks.thin || 0
  };
  const weighted = {
    nasal: problemMap.nasal + (brightTarget ? 8 : 0),
    harsh: problemMap.harsh + (brightTarget ? 6 : 0),
    sibilance: problemMap.sibilance + (brightTarget ? 8 : 0),
    mud: problemMap.mud + (bodyTarget ? 8 : 0),
    dark: problemMap.dark + (bodyTarget ? 5 : 0),
    thin: problemMap.thin + (brightTarget ? 5 : 0)
  };
  const top = Object.entries(weighted).sort((a, b) => b[1] - a[1])[0] || ["balanced", 0];
  const score = Math.max(0, top[1]);
  const crowded = spectral.perceptual?.crowding;
  const evidence = crowded?.band?.centerHz ? ` / ERB ${Math.round(crowded.band.centerHz)}Hz` : "";
  return {
    id: "spectral",
    label: "Spectral Fit",
    status: score > 58 ? "risk" : score > 32 ? "tune" : "ready",
    value: `${top[0]} ${Math.round(score)}${evidence}`,
    detail: score > 58
      ? "Guard character formant, air, and presence before rendering."
      : score > 32
      ? "Use Studio Polish and guarded character macros before final export."
      : "Spectral balance is safe enough for this target."
  };
}

export function normalizeRenderRegion(sampleCount, sampleRate, region = null) {
  const totalSamples = Math.max(0, Math.floor(sampleCount || 0));
  const totalSec = totalSamples / Math.max(1, sampleRate || 1);
  if (!region || !Number.isFinite(region.durationSec)) {
    return {
      startSample: 0,
      endSample: totalSamples,
      startSec: 0,
      endSec: totalSec,
      durationSec: totalSec,
      isFull: true
    };
  }

  const minSec = Math.min(totalSec, Math.max(0.08, region.minDurationSec || 0.35));
  const requestedDuration = clampNumber(region.durationSec, minSec, Math.max(minSec, totalSec));
  const maxStart = Math.max(0, totalSec - requestedDuration);
  const startSec = clampNumber(Number(region.startSec || 0), 0, maxStart);
  const startSample = Math.min(totalSamples, Math.round(startSec * sampleRate));
  const endSample = Math.min(totalSamples, Math.max(startSample + 1, startSample + Math.round(requestedDuration * sampleRate)));
  const endSec = endSample / sampleRate;
  return {
    startSample,
    endSample,
    startSec: startSample / sampleRate,
    endSec,
    durationSec: Math.max(0, endSec - startSample / sampleRate),
    isFull: startSample === 0 && endSample === totalSamples
  };
}

function rangeForF0(f0) {
  if (!Number.isFinite(f0) || f0 <= 0) return "unknown";
  if (f0 < 120) return "low";
  if (f0 < 185) return "medium";
  return "high";
}

function textureStatus(profile, expected) {
  if (expected?.id === "breathy_close") return profile.breathyOrNoisy ? "ready" : "tune";
  return profile.breathyOrNoisy ? "tune" : "ready";
}

function textureDetail(profile, expected) {
  if (expected?.id === "breathy_close") {
    return profile.breathyOrNoisy ? "Breathy source texture supports this target." : "Close breath targets may need added whisper texture.";
  }
  return profile.breathyOrNoisy ? "Noise cleanup is recommended before character shaping." : "Texture is controlled enough for this target.";
}

function formatDb(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dB` : "-inf dB";
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function paramDeltas(before = {}, after = {}, keys = [
  "inputGain",
  "pitch",
  "formant",
  "body",
  "brightness",
  "air",
  "deEss",
  "breath",
  "whisper"
]) {
  return keys
    .map((key) => ({
      key,
      before: Number(before[key] || 0),
      after: Number(after[key] || 0),
      delta: Number(after[key] || 0) - Number(before[key] || 0)
    }))
    .filter((item) => Math.abs(item.delta) >= 0.1);
}

export function mixAudioBufferToMono(audioBuffer) {
  const out = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / audioBuffer.numberOfChannels;
  }
  return out;
}

function nowMs() {
  return globalThis.performance && typeof globalThis.performance.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function normalizeAudioUrl(rawUrl) {
  const text = String(rawUrl || "").trim();
  if (!text) throw new Error("Paste an audio URL first.");
  const url = new URL(text, window.location.href);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Audio URL must use http or https.");
  return url.href;
}

function audioNameFromUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    const last = parsed.pathname.split("/").filter(Boolean).pop() || "URL Audio";
    return decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, "") || "URL Audio";
  } catch {
    return "URL Audio";
  }
}
