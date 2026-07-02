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
    this.env = 0;
    this.gateGain = 1;
    this.rphase = 0;
    this.seed = 999;
    this.params = {
      pitch: 1,
      formant: 1,
      breath: 0,
      whisper: 0,
      robot: 0,
      creature: 0,
      prosody: 0,
      anime: 0,
      cuteness: 0,
      intimacy: 0,
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

    for (let i = 0; i < out.length; i++) {
      let s = input ? input[i] : 0;
      const abs = Math.abs(s);
      this.env = abs > this.env ? this.env + (abs - this.env) * 0.2 : this.env * 0.996;
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
      const phrase = 0.5 + 0.5 * Math.sin(2 * Math.PI * (0.44 + p.anime * 0.16 + p.cuteness * 0.08) * t - Math.PI / 2);
      const vibrato = Math.sin(2 * Math.PI * (4.7 + p.anime * 0.8) * t) * p.prosody * (0.002 + p.anime * 0.0035 + p.cuteness * 0.002);
      const lift = p.prosody * (p.anime * 0.045 + p.cuteness * 0.028) * phrase;
      const step = 1 - p.pitch * (1 + lift + vibrato);
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

      if (p.robot > 0 || p.creature > 0) {
        const ring = Math.sin(this.rphase);
        this.rphase += ringInc;
        if (this.rphase > Math.PI * 2) this.rphase -= Math.PI * 2;
        const growl = Math.sin(2 * Math.PI * 27 * (currentFrame + i) / sampleRate + y * 5);
        y = y * (1 - p.robot * 0.45) + y * ring * p.robot * 0.72 + y * growl * p.creature * 0.34;
      }

      const breath = Math.min(1, p.breath + p.whisper * 1.4);
      if (breath > 0) {
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
        const noise = (this.seed / 0xffffffff) * 2 - 1;
        y = y * (1 - p.whisper * 0.32) + noise * breath * Math.min(1, this.env * 8) * 0.08;
      }

      if (p.saturation > 0) {
        const drive = 1 + p.saturation * 8;
        y = Math.tanh(y * drive) / Math.tanh(drive);
      }

      if (p.prosody > 0) {
        const delivery = 1 + p.prosody * (p.anime * phrase * 0.028 + p.cuteness * Math.min(1, this.env * 12) * 0.02 + p.intimacy * 0.012);
        y *= delivery;
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
