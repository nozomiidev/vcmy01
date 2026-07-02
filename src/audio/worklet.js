class VoiceForgeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1 << 16;
    this.mask = this.size - 1;
    this.buf = new Float32Array(this.size);
    this.fbuf = new Float32Array(this.size);
    this.w = 0;
    this.fw = 0;
    this.phase = 0;
    this.fphase = 0;
    this.ratioState = 1;
    this.env = 0;
    this.fast = 0;
    this.slow = 0;
    this.dryLp = 0;
    this.highEnv = 0;
    this.gateGain = 1;
    this.rphase = 0;
    this.seed = 999;
    this.noiseHp = 0;
    this.lastNoise = 0;
    this.params = {
      pitch: 1,
      formant: 1,
      breath: 0,
      whisper: 0,
      robot: 0,
      creature: 0,
      prosody: 0,
      phraseLift: 0,
      endingSoftness: 0,
      deliveryEnergy: 0.5,
      closeMic: 0,
      romanticBreath: 0,
      confidence: 0.5,
      anime: 0,
      cuteness: 0,
      intimacy: 0,
      brightness: 0.08,
      presence: 0,
      air: 0.04,
      consonantSoftness: 0,
      gate: 1,
      deEss: 0.35,
      saturation: 0,
      outputGain: 1
    };
    this.port.onmessage = (event) => Object.assign(this.params, event.data || {});
  }

  read(buf, write, delay) {
    const index = write - 4 - delay;
    const i0 = Math.floor(index);
    const frac = index - i0;
    const a = buf[i0 & this.mask] || 0;
    const b = buf[(i0 + 1) & this.mask] || 0;
    return a + (b - a) * frac;
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const p = this.params;
    const win = Math.max(192, Math.round(sampleRate * 0.085));
    const fwin = Math.max(96, Math.round(sampleRate * 0.024));
    const fstep = 1 - p.formant;
    const ringInc = 2 * Math.PI * (42 + p.robot * 110 + p.creature * 22) / sampleRate;
    const lpCoeff = Math.exp(-2 * Math.PI * 2600 / sampleRate);

    for (let i = 0; i < out.length; i++) {
      let s = input ? input[i] : 0;
      const dry = s;
      const abs = Math.abs(s);
      this.env = abs > this.env ? this.env + (abs - this.env) * 0.2 : this.env * 0.996;
      this.fast += (abs - this.fast) * (abs > this.fast ? 0.08 : 0.014);
      this.slow += (abs - this.slow) * 0.0012;
      this.dryLp = (1 - lpCoeff) * dry + lpCoeff * this.dryLp;
      const dryHigh = dry - this.dryLp;
      const highAbs = Math.abs(dryHigh);
      this.highEnv = highAbs > this.highEnv ? this.highEnv + (highAbs - this.highEnv) * 0.2 : this.highEnv * 0.984;
      let gateTarget = 1;
      if (p.gate && this.env < 0.0025) {
        const r = this.env / 0.0025;
        gateTarget = r * r;
      }
      this.gateGain += (gateTarget - this.gateGain) * (gateTarget > this.gateGain ? 0.05 : 0.01);
      s *= this.gateGain;

      this.buf[this.w & this.mask] = s;
      this.w++;
      const t = (currentFrame + i) / sampleRate;
      const phraseRate = 0.44 + p.anime * 0.16 + p.cuteness * 0.08 + p.deliveryEnergy * 0.08;
      const cycle = (t * phraseRate) % 1;
      const phrase = 0.5 + 0.5 * Math.sin(2 * Math.PI * phraseRate * t - Math.PI / 2);
      const rise = smoothstep(0.18, 0.62, cycle) * (1 - smoothstep(0.62, 0.96, cycle));
      const ending = smoothstep(0.62, 1, cycle);
      const vibrato = Math.sin(2 * Math.PI * (4.7 + p.anime * 0.8 + p.confidence * 0.3) * t) * p.prosody * (0.002 + p.anime * 0.0035 + p.cuteness * 0.002 + p.phraseLift * 0.0015);
      const lift = p.prosody * (p.anime * 0.045 + p.cuteness * 0.028) * phrase +
        p.prosody * (p.phraseLift * (rise * 0.038 + ending * 0.014) - p.endingSoftness * ending * 0.018);
      const rawRatio = p.pitch * (1 + lift + vibrato);
      const voiceGate = Math.max(0, Math.min(1, (this.env - 0.0025) * 42));
      const targetRatio = 1 + (rawRatio - 1) * (0.3 + voiceGate * 0.7);
      this.ratioState += (targetRatio - this.ratioState) * (targetRatio > this.ratioState ? 0.018 : 0.012);
      const step = 1 - this.ratioState;
      this.phase += step;
      if (this.phase >= win) this.phase -= win;
      if (this.phase < 0) this.phase += win;
      const d1 = this.phase;
      const d2 = (d1 + win / 2) % win;
      let y = this.read(this.buf, this.w, d1) * Math.sin(Math.PI * d1 / win) +
        this.read(this.buf, this.w, d2) * Math.sin(Math.PI * d2 / win);

      this.fbuf[this.fw & this.mask] = y;
      this.fw++;
      this.fphase += fstep;
      if (this.fphase >= fwin) this.fphase -= fwin;
      if (this.fphase < 0) this.fphase += fwin;
      const e1 = this.fphase;
      const e2 = (e1 + fwin / 2) % fwin;
      y = this.read(this.fbuf, this.fw, e1) * Math.sin(Math.PI * e1 / fwin) +
        this.read(this.fbuf, this.fw, e2) * Math.sin(Math.PI * e2 / fwin);

      const clarity = Math.max(0, Math.min(0.38,
        p.presence * 0.35 +
        Math.max(0, p.brightness - 0.08) * 0.16 +
        Math.max(0, p.air - 0.04) * 0.12 +
        Math.max(0, 0.28 - p.consonantSoftness) * 0.04 -
        p.whisper * 0.22
      ));
      if (clarity > 0.018) {
        const consonant = Math.max(0, Math.min(1, this.highEnv * 24 + Math.max(0, this.highEnv - this.env * 0.42) * 60));
        y += dryHigh * clarity * consonant;
      }

      if (p.robot > 0 || p.creature > 0) {
        const ring = Math.sin(this.rphase);
        this.rphase += ringInc;
        if (this.rphase > Math.PI * 2) this.rphase -= Math.PI * 2;
        const growl = Math.sin(2 * Math.PI * 27 * (currentFrame + i) / sampleRate + y * 5);
        y = y * (1 - p.robot * 0.45) + y * ring * p.robot * 0.72 + y * growl * p.creature * 0.34;
      }

      const breath = Math.min(1, p.breath + p.whisper * 1.4 + p.romanticBreath * 0.7);
      if (breath > 0) {
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
        const noise = (this.seed / 0xffffffff) * 2 - 1;
        this.noiseHp = noise - this.lastNoise + this.noiseHp * 0.985;
        this.lastNoise = noise;
        const onset = Math.max(0, Math.min(1, (this.fast - this.slow * 1.05) * 22));
        const tail = Math.max(0, Math.min(1, (this.slow - this.fast) * 30));
        const consonant = Math.max(0, Math.min(1, this.highEnv * 24 + onset * 0.42));
        const breathBed = Math.max(0, Math.min(1, this.slow * 10)) * (0.52 + p.intimacy * 0.48);
        const whisperFocus = Math.max(0, Math.min(1, consonant * (1 - p.consonantSoftness * 0.55) + tail * p.intimacy * 0.75));
        const shaped = this.noiseHp * (0.65 + Math.max(0, p.air) * 0.35);
        const romanticTail = tail * (0.45 + p.intimacy * 0.55);
        const textureGain = p.breath * 0.085 * breathBed +
          p.whisper * 0.13 * whisperFocus +
          p.romanticBreath * 0.09 * romanticTail +
          p.endingSoftness * 0.028 * tail;
        const duck = 1 - p.whisper * 0.22 * Math.max(0, Math.min(1, this.slow * 8));
        y = y * duck + shaped * textureGain;
      }

      if (p.saturation > 0) {
        const drive = 1 + p.saturation * 8;
        y = Math.tanh(y * drive) / Math.tanh(drive);
      }

      if (p.prosody > 0) {
        const cycle2 = (t * (0.5 + p.anime * 0.12 + p.deliveryEnergy * 0.08)) % 1;
        const ending2 = smoothstep(0.62, 1, cycle2);
        const syllable = Math.min(1, this.env * 12);
        const delivery = 1 +
          p.prosody * (p.anime * phrase * 0.028 + p.cuteness * syllable * 0.02 + p.intimacy * 0.012) +
          p.prosody * p.phraseLift * phrase * 0.018 +
          p.deliveryEnergy * syllable * 0.052 +
          p.confidence * syllable * 0.026 +
          p.closeMic * (1 - syllable) * 0.012 -
          p.endingSoftness * ending2 * 0.045;
        y *= Math.max(0.72, delivery);
      }

      out[i] = Math.max(-0.98, Math.min(0.98, y * p.outputGain));
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

class VoiceForgeRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.port.onmessage = (event) => {
      this.recording = !!(event.data && event.data.recording);
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (input && input[0] && output && output[0]) {
      for (let c = 0; c < output.length; c++) output[c].set(input[Math.min(c, input.length - 1)]);
      if (this.recording) {
        const chunk = input[0].slice();
        this.port.postMessage({ chunk }, [chunk.buffer]);
      }
    }
    return true;
  }
}

registerProcessor("voiceforge-processor", VoiceForgeProcessor);
registerProcessor("voiceforge-recorder", VoiceForgeRecorder);

function smoothstep(edge0, edge1, value) {
  const x = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-9, edge1 - edge0)));
  return x * x * (3 - 2 * x);
}
