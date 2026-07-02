import {
  analyzeBuffer,
  buildCalibrationProfile,
  calibrateParamsForVoice,
  encodeWavMono,
  generateReferenceVoice,
  processVoiceBuffer
} from "./dsp-core.js";

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
      analysis: this.profile
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
      analysis: this.profile
    };
    this.rendered = null;
    return this.source;
  }

  analyze() {
    if (!this.source) throw new Error("No source audio loaded.");
    this.profile = buildCalibrationProfile(this.source.samples, this.source.sampleRate);
    this.source.analysis = this.profile;
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
    const samples = processVoiceBuffer(sourceSamples, this.source.sampleRate, appliedParams);
    const blob = encodeWavMono(samples, this.source.sampleRate);
    const mode = options.mode || (region.isFull ? "full" : "preview");
    this.rendered = {
      name: `${this.source.name} - VoiceForge ${mode}.wav`,
      sampleRate: this.source.sampleRate,
      samples,
      blob,
      analysis: analyzeBuffer(samples, this.source.sampleRate),
      region,
      mode,
      autoCalibrated: !!options.autoCalibrate,
      baseParams,
      appliedParams,
      calibrationDelta: paramDeltas(baseParams, appliedParams)
    };
    return this.rendered;
  }
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
