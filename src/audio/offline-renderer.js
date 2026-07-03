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
import { analyzeStudioVoice, buildStudioPolishPlan, processStudioPolish } from "./studio-polish.js";
import { applyCharacterSafety } from "./character-safety.js";

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
    const samples = stage === "polish"
      ? characterInput
      : automation
      ? automation.samples
      : processVoiceBuffer(characterInput, this.source.sampleRate, characterParams, { normalizedParams: true });
    const blob = encodeWavMono(samples, this.source.sampleRate);
    const mode = options.mode || (region.isFull ? "full" : "preview");
    this.rendered = {
      name: `${this.source.name} - VoiceForge ${mode}.wav`,
      sampleRate: this.source.sampleRate,
      samples,
      blob,
      analysis: analyzeBuffer(samples, this.source.sampleRate),
      studioAnalysis: analyzeStudioVoice(samples, this.source.sampleRate),
      region,
      mode,
      stage,
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
    }
  ];
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
