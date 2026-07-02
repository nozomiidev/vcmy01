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
    const samples = processVoiceBuffer(this.source.samples, this.source.sampleRate, appliedParams);
    const blob = encodeWavMono(samples, this.source.sampleRate);
    this.rendered = {
      name: `${this.source.name} - VoiceForge render.wav`,
      sampleRate: this.source.sampleRate,
      samples,
      blob,
      analysis: analyzeBuffer(samples, this.source.sampleRate),
      autoCalibrated: !!options.autoCalibrate,
      baseParams,
      appliedParams,
      calibrationDelta: paramDeltas(baseParams, appliedParams)
    };
    return this.rendered;
  }
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
