import { dbToLin, encodeWavMono, linToDb, normalizeParams } from "./dsp-core.js";

export class LiveAudioEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.stream = null;
    this.nodes = {};
    this.ready = false;
    this.params = {};
    this.rawParams = {};
    this.recording = false;
    this.recordChunks = [];
    this.recordFrames = 0;
    this.startedAt = 0;
  }

  async start(params, deviceId = "") {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio is unavailable.");
      this.ctx = new AC({ latencyHint: "interactive" });
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1
      }
    });
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = stream;

    if (!this.ready) await this.buildGraph();
    if (this.nodes.source) this.nodes.source.disconnect();
    this.nodes.source = this.ctx.createMediaStreamSource(stream);
    this.nodes.source.connect(this.nodes.inGain);
    this.setParams(params);
    this.dispatchEvent(new CustomEvent("status", { detail: { mic: "granted" } }));
  }

  async buildGraph() {
    const ctx = this.ctx;
    await ctx.audioWorklet.addModule(new URL("./worklet.js", import.meta.url));
    const n = this.nodes;
    n.inGain = ctx.createGain();
    n.inAnalyser = ctx.createAnalyser();
    n.inAnalyser.fftSize = 2048;
    n.proc = new AudioWorkletNode(ctx, "voiceforge-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    n.lowCut = ctx.createBiquadFilter();
    n.lowCut.type = "highpass";
    n.lowCut.Q.value = 0.72;
    n.highCut = ctx.createBiquadFilter();
    n.highCut.type = "lowpass";
    n.highCut.Q.value = 0.72;
    n.body = ctx.createBiquadFilter();
    n.body.type = "lowshelf";
    n.body.frequency.value = 170;
    n.presence = ctx.createBiquadFilter();
    n.presence.type = "peaking";
    n.presence.frequency.value = 2400;
    n.presence.Q.value = 1;
    n.air = ctx.createBiquadFilter();
    n.air.type = "highshelf";
    n.air.frequency.value = 6200;
    n.comp = ctx.createDynamicsCompressor();
    n.comp.knee.value = 8;
    n.comp.attack.value = 0.004;
    n.comp.release.value = 0.16;
    n.delay = ctx.createDelay(0.8);
    n.delayWet = ctx.createGain();
    n.delayFb = ctx.createGain();
    n.delay.connect(n.delayFb).connect(n.delay);
    n.delaySum = ctx.createGain();
    n.convolver = ctx.createConvolver();
    n.convolver.buffer = this.makeImpulse(1.2, 2.8);
    n.reverbWet = ctx.createGain();
    n.spaceSum = ctx.createGain();
    n.dryMix = ctx.createGain();
    n.wetMix = ctx.createGain();
    n.mixBus = ctx.createGain();
    n.limiter = ctx.createDynamicsCompressor();
    n.limiter.threshold.value = -1;
    n.limiter.ratio.value = 20;
    n.limiter.attack.value = 0.002;
    n.limiter.release.value = 0.12;
    n.outGain = ctx.createGain();
    n.recorder = new AudioWorkletNode(ctx, "voiceforge-recorder", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    n.outAnalyser = ctx.createAnalyser();
    n.outAnalyser.fftSize = 2048;
    n.monitorGain = ctx.createGain();
    n.monitorGain.gain.value = 0;

    n.recorder.port.onmessage = (event) => this.onRecordChunk(event.data && event.data.chunk);

    n.inGain.connect(n.inAnalyser);
    n.inGain.connect(n.proc);
    n.proc.connect(n.lowCut).connect(n.highCut).connect(n.body).connect(n.presence).connect(n.air).connect(n.comp);
    n.comp.connect(n.delaySum);
    n.comp.connect(n.delay);
    n.delay.connect(n.delayWet).connect(n.delaySum);
    n.delaySum.connect(n.spaceSum);
    n.delaySum.connect(n.convolver).connect(n.reverbWet).connect(n.spaceSum);
    n.spaceSum.connect(n.wetMix).connect(n.mixBus);
    n.inGain.connect(n.dryMix).connect(n.mixBus);
    n.mixBus.connect(n.limiter).connect(n.outGain).connect(n.recorder).connect(n.outAnalyser).connect(n.monitorGain).connect(ctx.destination);
    this.ready = true;
  }

  makeImpulse(seconds, decay) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      const noise = Math.random() * 2 - 1;
      lp += (noise - lp) * 0.18;
      data[i] = lp * env;
    }
    return buffer;
  }

  setParams(rawParams) {
    this.rawParams = { ...rawParams };
    this.params = normalizeParams(rawParams);
    if (!this.ready) return;
    const p = this.params;
    const n = this.nodes;
    const t = this.ctx.currentTime;
    const set = (param, value) => param.setTargetAtTime(value, t, 0.025);
    set(n.inGain.gain, dbToLin(p.inputGain));
    n.proc.port.postMessage({
      pitch: Math.pow(2, p.pitch / 12),
      formant: Math.pow(2, p.formant / 12),
      breath: p.breath / 100,
      whisper: p.whisper / 100,
      robot: p.robot / 100,
      creature: p.creature / 100,
      prosody: p.prosody / 100,
      anime: p.anime / 100,
      cuteness: p.cuteness / 100,
      intimacy: p.intimacy / 100,
      saturation: p.saturation / 100,
      outputGain: dbToLin(p.outputGain)
    });
    set(n.lowCut.frequency, p.lowCut);
    set(n.highCut.frequency, p.highCut);
    set(n.body.gain, p.body * 0.075);
    set(n.presence.gain, p.presence * 0.06);
    set(n.air.gain, p.brightness * 0.055 + p.air * 0.04);
    n.comp.threshold.setTargetAtTime(-34 + p.compression * 0.18, t, 0.025);
    n.comp.ratio.setTargetAtTime(1 + p.compression * 0.07, t, 0.025);
    set(n.delay.delayTime, 0.12 + p.delay * 0.004);
    set(n.delayWet.gain, p.delay / 100 * 0.32);
    set(n.delayFb.gain, p.delay / 100 * 0.42);
    set(n.reverbWet.gain, p.ambience / 100 * 0.55);
    const wet = p.dryWet / 100;
    set(n.wetMix.gain, Math.sin(wet * Math.PI / 2));
    set(n.dryMix.gain, Math.cos(wet * Math.PI / 2));
    n.limiter.threshold.setTargetAtTime(p.limiter, t, 0.025);
  }

  setMonitor(on) {
    if (!this.ready) return;
    const gain = on ? Math.pow(this.params.monitorGain / 100, 1.7) : 0;
    this.nodes.monitorGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.06);
  }

  setBypass(on) {
    if (!this.ready) return;
    if (on) {
      this.nodes.wetMix.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      this.nodes.dryMix.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02);
    } else {
      this.setParams(this.rawParams);
    }
  }

  startRecording() {
    if (!this.ready || this.recording) return;
    this.recordChunks = [];
    this.recordFrames = 0;
    this.startedAt = performance.now();
    this.recording = true;
    this.nodes.recorder.port.postMessage({ recording: true });
  }

  async stopRecording() {
    if (!this.recording) return null;
    this.recording = false;
    this.nodes.recorder.port.postMessage({ recording: false });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const sampleRate = this.ctx.sampleRate;
    const samples = new Float32Array(this.recordFrames);
    let offset = 0;
    for (const chunk of this.recordChunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    const blob = encodeWavMono(samples, sampleRate);
    return {
      id: `take-${Date.now()}`,
      name: `VoiceForge Take ${new Date().toLocaleTimeString()}`,
      date: Date.now(),
      sampleRate,
      duration: samples.length / sampleRate,
      blob,
      samples
    };
  }

  onRecordChunk(chunk) {
    if (!this.recording || !chunk) return;
    this.recordChunks.push(chunk);
    this.recordFrames += chunk.length;
  }

  readMeters() {
    if (!this.ready) return null;
    const inData = new Float32Array(this.nodes.inAnalyser.fftSize);
    const outData = new Float32Array(this.nodes.outAnalyser.fftSize);
    const freqData = new Uint8Array(this.nodes.outAnalyser.frequencyBinCount);
    this.nodes.inAnalyser.getFloatTimeDomainData(inData);
    this.nodes.outAnalyser.getFloatTimeDomainData(outData);
    this.nodes.outAnalyser.getByteFrequencyData(freqData);
    return {
      inData,
      outData,
      freqData,
      inRms: meterRms(inData),
      outRms: meterRms(outData),
      inPeak: meterPeak(inData),
      outPeak: meterPeak(outData)
    };
  }

  recordingSeconds() {
    if (!this.recording || !this.ctx) return 0;
    return this.recordFrames / this.ctx.sampleRate || (performance.now() - this.startedAt) / 1000;
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

function meterRms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

function meterPeak(buffer) {
  let p = 0;
  for (let i = 0; i < buffer.length; i++) p = Math.max(p, Math.abs(buffer[i]));
  return p;
}

export function meterPercent(value) {
  return Math.max(0, Math.min(100, ((linToDb(value) + 60) / 60) * 100));
}
