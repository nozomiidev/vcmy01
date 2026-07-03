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
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const samples = mixAudioBufferToMono(audioBuffer);
    await ctx.close?.();
    this.profile = buildCalibrationProfile(samples, audioBuffer.sampleRate);
    this.source = {
      name: file.name,
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
    const studioPolish = renderStudioPolish(sourceSamples, this.source.sampleRate, options.studioPolish);
    const characterInput = studioPolish ? studioPolish.samples : sourceSamples;
    const stage = options.stage || "character";
    const automation = stage !== "polish" && options.automatePerformance && options.performanceScript
      ? renderScriptAutomation(characterInput, this.source.sampleRate, appliedParams, options.performanceScript, options.automationOptions)
      : null;
    const samples = stage === "polish"
      ? characterInput
      : automation
      ? automation.samples
      : processVoiceBuffer(characterInput, this.source.sampleRate, appliedParams);
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
      appliedParams,
      calibrationDelta: paramDeltas(baseParams, appliedParams)
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
  if (option === false || option === "off") return null;
  const intensity = typeof option === "string" ? option : option?.intensity || "standard";
  const inputAnalysis = analyzeStudioVoice(sourceSamples, sampleRate);
  const plan = buildStudioPolishPlan(inputAnalysis, intensity);
  return processStudioPolish(sourceSamples, sampleRate, plan);
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
