import { DEFAULT_PARAMS } from "./presets.js";

export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function dbToLin(db) {
  return Math.pow(10, db / 20);
}

export function linToDb(value) {
  return 20 * Math.log10(Math.max(1e-9, value));
}

export function rms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / Math.max(1, buffer.length));
}

export function peak(buffer) {
  let p = 0;
  for (let i = 0; i < buffer.length; i++) p = Math.max(p, Math.abs(buffer[i]));
  return p;
}

export function analyzeBuffer(buffer, sampleRate) {
  const r = rms(buffer);
  const p = peak(buffer);
  const zcr = zeroCrossingRate(buffer, sampleRate);
  const pitch = estimatePitch(buffer, sampleRate);
  const brightness = estimateBrightness(buffer, sampleRate);
  const crestDb = linToDb(p) - linToDb(r);
  return {
    duration: buffer.length / sampleRate,
    rms: r,
    rmsDb: linToDb(r),
    peak: p,
    peakDb: linToDb(p),
    zeroCrossingsPerSecond: zcr,
    pitchMedianHz: pitch.medianHz,
    voicedRatio: pitch.voicedRatio,
    pitchConfidence: pitch.confidence,
    brightnessRatio: brightness.highRatio,
    crestDb,
    clipped: p >= 0.985
  };
}

export function zeroCrossingRate(buffer, sampleRate) {
  let count = 0;
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i - 1] < 0 && buffer[i] >= 0) || (buffer[i - 1] >= 0 && buffer[i] < 0)) count++;
  }
  return count / Math.max(1e-9, buffer.length / sampleRate);
}

export function estimatePitch(buffer, sampleRate, options = {}) {
  const minHz = options.minHz || 65;
  const maxHz = options.maxHz || 520;
  const frameSize = options.frameSize || 4096;
  const hop = options.hop || 2048;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.floor(sampleRate / minHz);
  const pitches = [];
  let confidenceSum = 0;
  let totalFrames = 0;

  for (let start = 0; start + frameSize < buffer.length; start += hop) {
    totalFrames++;
    let frameRms = 0;
    for (let i = 0; i < frameSize; i++) frameRms += buffer[start + i] * buffer[start + i];
    frameRms = Math.sqrt(frameRms / frameSize);
    if (frameRms < 0.01) continue;

    let bestLag = -1;
    let bestScore = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let e0 = 0;
      let e1 = 0;
      for (let i = 0; i < frameSize - lag; i += 2) {
        const a = buffer[start + i];
        const b = buffer[start + i + lag];
        corr += a * b;
        e0 += a * a;
        e1 += b * b;
      }
      const score = corr / Math.sqrt(Math.max(1e-12, e0 * e1));
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    if (bestLag > 0 && bestScore > 0.38) {
      pitches.push(sampleRate / bestLag);
      confidenceSum += bestScore;
    }
  }

  pitches.sort((a, b) => a - b);
  const medianHz = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 0;
  return {
    medianHz,
    voicedRatio: totalFrames ? pitches.length / totalFrames : 0,
    confidence: pitches.length ? confidenceSum / pitches.length : 0,
    frames: totalFrames,
    voicedFrames: pitches.length
  };
}

export function estimateBrightness(buffer, sampleRate) {
  let low = 0;
  let high = 0;
  let lp = 0;
  const cutoff = 1800;
  const a = Math.exp(-2 * Math.PI * cutoff / sampleRate);
  for (let i = 0; i < buffer.length; i++) {
    lp = (1 - a) * buffer[i] + a * lp;
    const hp = buffer[i] - lp;
    low += lp * lp;
    high += hp * hp;
  }
  const total = low + high;
  return {
    lowEnergy: low,
    highEnergy: high,
    highRatio: total > 0 ? high / total : 0
  };
}

export function buildCalibrationProfile(buffer, sampleRate) {
  const analysis = analyzeBuffer(buffer, sampleRate);
  const pitch = analysis.pitchMedianHz;
  let range = "unknown";
  if (pitch > 0 && pitch < 120) range = "low";
  else if (pitch >= 120 && pitch < 185) range = "medium";
  else if (pitch >= 185) range = "high";
  return {
    ...analysis,
    range,
    tooQuiet: analysis.rmsDb < -34,
    tooHot: analysis.peakDb > -2,
    bright: analysis.brightnessRatio > 0.34,
    dark: analysis.brightnessRatio < 0.18,
    breathyOrNoisy: analysis.zeroCrossingsPerSecond > 1800 && analysis.voicedRatio < 0.45
  };
}

export function calibrateParamsForVoice(rawParams = {}, profile = {}) {
  const p = { ...rawParams };
  if (profile.tooQuiet) p.inputGain = clamp((p.inputGain || 0) + 5, -12, 18);
  if (profile.tooHot) p.inputGain = clamp((p.inputGain || 0) - 4, -18, 12);

  if (profile.range === "low" && (p.cuteness > 35 || p.anime > 35)) {
    p.pitch = clamp((p.pitch || 0) + 1.5, -12, 12);
    p.formant = clamp((p.formant || 0) + 1.25, -12, 12);
    p.body = clamp((p.body || 0) - 18, -100, 100);
  }
  if (profile.range === "high" && (p.body > 30 || (p.pitch || 0) < -1)) {
    p.pitch = clamp((p.pitch || 0) - 0.75, -12, 12);
    p.formant = clamp((p.formant || 0) - 0.75, -12, 12);
    p.body = clamp((p.body || 0) + 12, -100, 100);
  }
  if (profile.bright) {
    p.brightness = clamp((p.brightness || 0) - 12, -100, 100);
    p.deEss = clamp((p.deEss || 35) + 12, 0, 100);
  }
  if (profile.dark) {
    p.brightness = clamp((p.brightness || 0) + 12, -100, 100);
    p.air = clamp((p.air || 0) + 8, -100, 100);
  }
  if (profile.breathyOrNoisy) {
    p.breath = clamp((p.breath || 0) - 10, 0, 100);
    p.deEss = clamp((p.deEss || 35) + 8, 0, 100);
  }
  return p;
}

export function normalizeParams(params = {}) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const cute = p.cuteness / 100;
  const anime = p.anime / 100;
  const intimate = p.intimacy / 100;
  p.pitch += cute * 1.6 + anime * 0.9;
  p.formant += cute * 1.9 + anime * 0.75 + p.mouth * 0.035;
  p.brightness += cute * 18 + anime * 16;
  p.air += cute * 10 + anime * 8 + intimate * 12;
  p.body += cute * -18 + intimate * 6 + p.creature * 0.4;
  p.presence += anime * 12 + intimate * 5;
  p.consonantSoftness += cute * 16 + intimate * 8;
  p.breath += intimate * 8;
  p.whisper += intimate * 4;
  p.compression += intimate * 8;
  p.lowCut = Math.max(45, p.lowCut - intimate * 16);
  p.prosody = clamp(p.prosody + p.cuteness * 0.18 + p.anime * 0.36 + p.intimacy * 0.14, 0, 100);
  p.breath = clamp(p.breath, 0, 100);
  p.whisper = clamp(p.whisper, 0, 100);
  p.air = clamp(p.air, -100, 100);
  p.body = clamp(p.body, -100, 100);
  p.presence = clamp(p.presence, -100, 100);
  p.brightness = clamp(p.brightness, -100, 100);
  p.consonantSoftness = clamp(p.consonantSoftness, 0, 100);
  p.compression = clamp(p.compression, 0, 100);
  return p;
}

export function generateTestVoice({ sampleRate = 48000, duration = 2.4, f0 = 145 } = {}) {
  const n = Math.round(sampleRate * duration);
  const out = new Float32Array(n);
  const vowels = [
    { f: [720, 1180, 2600], a: [1.0, 0.55, 0.22] },
    { f: [390, 2050, 2850], a: [0.8, 0.65, 0.26] },
    { f: [520, 1450, 2500], a: [0.9, 0.58, 0.24] }
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const seg = Math.floor((t / duration) * vowels.length) % vowels.length;
    const vowel = vowels[seg];
    const vibrato = Math.sin(TAU * 5.1 * t) * 0.012;
    const phrase = 1 + 0.1 * Math.sin(TAU * 0.72 * t);
    const base = f0 * phrase * (1 + vibrato);
    let glottal = 0;
    for (let h = 1; h <= 20; h++) {
      glottal += Math.sin(TAU * base * h * t) / (h * (h < 8 ? 1 : h * 0.18));
    }
    let formants = 0;
    for (let k = 0; k < vowel.f.length; k++) {
      formants += vowel.a[k] * Math.sin(TAU * vowel.f[k] * t + Math.sin(TAU * 2.7 * t) * 0.12);
    }
    const syllable = 0.62 + 0.38 * Math.max(0, Math.sin(TAU * 3.1 * t));
    const fadeIn = clamp(t / 0.05, 0, 1);
    const fadeOut = clamp((duration - t) / 0.08, 0, 1);
    out[i] = Math.tanh((glottal * 0.18 + formants * 0.085) * syllable) * fadeIn * fadeOut * 0.78;
  }
  return out;
}

export function encodeWavMono(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = clamp(samples[i], -1, 1);
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

export function processVoiceBuffer(input, sampleRate, rawParams = {}, options = {}) {
  const params = normalizeParams(rawParams);
  const dry = toMono(input);
  const gain = dbToLin(params.inputGain || 0);
  let work = new Float32Array(dry.length);
  for (let i = 0; i < dry.length; i++) work[i] = dry[i] * gain;

  work = noiseGate(work, params);
  work = prosodyPitchShift(work, sampleRate, Math.pow(2, params.pitch / 12), params);
  work = granularShift(work, sampleRate, Math.pow(2, params.formant / 12), 0.024);
  work = applyBiquad(work, sampleRate, "highpass", params.lowCut, 0.72, 0);
  work = applyBiquad(work, sampleRate, "lowpass", params.highCut, 0.72, 0);
  work = characterFilterBank(work, sampleRate, params);
  work = harmonicExciter(work, sampleRate, params);
  work = addBreathAndWhisper(work, dry, sampleRate, params);
  work = performanceShape(work, dry, sampleRate, params);
  work = robotAndCreature(work, sampleRate, params);
  work = deEss(work, sampleRate, params);
  work = compress(work, params);
  work = saturate(work, params.saturation);
  work = ambience(work, sampleRate, params);
  work = limiter(work, params.limiter);

  const wet = clamp(params.dryWet / 100, 0, 1);
  const outGain = dbToLin(params.outputGain || 0);
  const out = new Float32Array(work.length);
  for (let i = 0; i < out.length; i++) out[i] = (dry[i] * (1 - wet) + work[i] * wet) * outGain;
  return options.skipLimiter ? out : limiter(out, params.limiter);
}

export function toMono(input) {
  if (input instanceof Float32Array) return input;
  if (Array.isArray(input)) {
    if (input.length === 1) return input[0];
    const n = input[0].length;
    const out = new Float32Array(n);
    for (let ch = 0; ch < input.length; ch++) {
      for (let i = 0; i < n; i++) out[i] += input[ch][i] / input.length;
    }
    return out;
  }
  return new Float32Array(0);
}

function noiseGate(input, params) {
  const out = new Float32Array(input.length);
  const threshold = 0.0025;
  let env = 0;
  let gain = 1;
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    env = a > env ? env + (a - env) * 0.16 : env * 0.996;
    const target = env < threshold ? Math.pow(env / threshold, 2.2) : 1;
    gain += (target - gain) * (target > gain ? 0.04 : 0.008);
    out[i] = input[i] * gain;
  }
  return out;
}

export function granularShift(input, sampleRate, ratio = 1, seconds = 0.06) {
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.002) return new Float32Array(input);
  const n = input.length;
  const out = new Float32Array(n);
  const windowSize = Math.max(96, Math.round(sampleRate * seconds));
  let phase = 0;
  const step = 1 - ratio;
  for (let i = 0; i < n; i++) {
    phase += step;
    if (phase >= windowSize) phase -= windowSize;
    if (phase < 0) phase += windowSize;
    const d1 = phase;
    const d2 = (phase + windowSize / 2) % windowSize;
    const g1 = Math.sin(Math.PI * d1 / windowSize);
    const g2 = Math.sin(Math.PI * d2 / windowSize);
    out[i] = readDelay(input, i, d1) * g1 + readDelay(input, i, d2) * g2;
  }
  return out;
}

export function prosodyPitchShift(input, sampleRate, baseRatio = 1, params = {}) {
  const amount = clamp((params.prosody || 0) / 100, 0, 1);
  if (amount <= 0.01) return granularShift(input, sampleRate, baseRatio, 0.085);
  const n = input.length;
  const out = new Float32Array(n);
  const windowSize = Math.max(192, Math.round(sampleRate * 0.085));
  let phase = 0;
  const anime = clamp((params.anime || 0) / 100, 0, 1);
  const cute = clamp((params.cuteness || 0) / 100, 0, 1);
  const liftDepth = amount * (anime * 0.045 + cute * 0.028);
  const vibratoDepth = amount * (0.002 + anime * 0.0035 + cute * 0.002);
  const phraseRate = 0.44 + anime * 0.16 + cute * 0.08;
  const vibratoRate = 4.7 + anime * 0.8;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const phrase = 0.5 + 0.5 * Math.sin(TAU * phraseRate * t - Math.PI / 2);
    const vibrato = Math.sin(TAU * vibratoRate * t) * vibratoDepth;
    const ratio = baseRatio * (1 + phrase * liftDepth + vibrato);
    phase += 1 - ratio;
    if (phase >= windowSize) phase -= windowSize;
    if (phase < 0) phase += windowSize;
    const d1 = phase;
    const d2 = (phase + windowSize / 2) % windowSize;
    const g1 = Math.sin(Math.PI * d1 / windowSize);
    const g2 = Math.sin(Math.PI * d2 / windowSize);
    out[i] = readDelay(input, i, d1) * g1 + readDelay(input, i, d2) * g2;
  }
  return out;
}

function readDelay(input, index, delay) {
  const x = index - 4 - delay;
  if (x <= 0) return 0;
  const i0 = Math.floor(x);
  const frac = x - i0;
  const a = input[i0] || 0;
  const b = input[i0 + 1] || 0;
  return a + (b - a) * frac;
}

function characterFilterBank(input, sampleRate, p) {
  let out = input;
  out = applyBiquad(out, sampleRate, "lowshelf", 170, 0.7, p.body * 0.075);
  out = applyBiquad(out, sampleRate, "peaking", 260, 0.9, Math.max(0, p.body) * 0.045);
  out = applyBiquad(out, sampleRate, "peaking", 180, 0.8, p.intimacy * 0.018);
  out = applyBiquad(out, sampleRate, "peaking", 950, 1.1, p.mouth * -0.025);
  out = applyBiquad(out, sampleRate, "peaking", 2400, 1.0, p.presence * 0.06);
  out = applyBiquad(out, sampleRate, "highshelf", 6200, 0.72, p.brightness * 0.055 + p.air * 0.04);
  if (p.consonantSoftness > 0) {
    out = applyBiquad(out, sampleRate, "lowpass", 17000 - p.consonantSoftness * 75, 0.72, 0);
  }
  return out;
}

function harmonicExciter(input, sampleRate, p) {
  const amount = clamp((Math.max(0, p.air) * 0.38 + Math.max(0, p.brightness) * 0.22 + p.anime * 0.18 + p.cuteness * 0.1) / 100, 0, 0.58);
  if (amount <= 0.002) return input;
  const high = applyBiquad(input, sampleRate, "highpass", 2600, 0.72, 0);
  const out = new Float32Array(input.length);
  const drive = 2.2 + amount * 5.5;
  for (let i = 0; i < input.length; i++) {
    const sparkle = Math.tanh(high[i] * drive) * amount * 0.11;
    out[i] = input[i] + sparkle;
  }
  return out;
}

function performanceShape(input, dry, sampleRate, p) {
  const amount = clamp((p.prosody || 0) / 100, 0, 1);
  if (amount <= 0.002) return input;
  const out = new Float32Array(input.length);
  const anime = clamp(p.anime / 100, 0, 1);
  const cute = clamp(p.cuteness / 100, 0, 1);
  const intimate = clamp(p.intimacy / 100, 0, 1);
  let fast = 0;
  let slow = 0;
  const phraseRate = 0.5 + anime * 0.12;
  for (let i = 0; i < input.length; i++) {
    const abs = Math.abs(dry[i]);
    fast += (abs - fast) * (abs > fast ? 0.055 : 0.006);
    slow += (abs - slow) * 0.00075;
    const syllable = clamp((fast - slow * 0.75) * 16, 0, 1);
    const t = i / sampleRate;
    const phrase = 0.5 + 0.5 * Math.sin(TAU * phraseRate * t - Math.PI / 2);
    const delivery = 1 +
      amount * anime * phrase * 0.035 +
      amount * cute * syllable * 0.026 +
      amount * intimate * (1 - syllable) * 0.018;
    out[i] = input[i] * delivery;
  }
  return out;
}

export function applyBiquad(input, sampleRate, type, freq, q = 0.707, gainDb = 0) {
  const out = new Float32Array(input.length);
  const coeffs = biquadCoefficients(sampleRate, type, clamp(freq, 10, sampleRate * 0.46), q, gainDb);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = coeffs.b0 * x + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2;
    out[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

function biquadCoefficients(sampleRate, type, freq, q, gainDb) {
  const w0 = TAU * freq / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const a = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lowpass") {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === "highpass") {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === "lowshelf") {
    const s = Math.sqrt(a) / q;
    b0 = a * ((a + 1) - (a - 1) * cos + s * sin);
    b1 = 2 * a * ((a - 1) - (a + 1) * cos);
    b2 = a * ((a + 1) - (a - 1) * cos - s * sin);
    a0 = (a + 1) + (a - 1) * cos + s * sin;
    a1 = -2 * ((a - 1) + (a + 1) * cos);
    a2 = (a + 1) + (a - 1) * cos - s * sin;
  } else if (type === "highshelf") {
    const s = Math.sqrt(a) / q;
    b0 = a * ((a + 1) + (a - 1) * cos + s * sin);
    b1 = -2 * a * ((a - 1) + (a + 1) * cos);
    b2 = a * ((a + 1) + (a - 1) * cos - s * sin);
    a0 = (a + 1) - (a - 1) * cos + s * sin;
    a1 = 2 * ((a - 1) - (a + 1) * cos);
    a2 = (a + 1) - (a - 1) * cos - s * sin;
  } else {
    b0 = 1 + alpha * a; b1 = -2 * cos; b2 = 1 - alpha * a; a0 = 1 + alpha / a; a1 = -2 * cos; a2 = 1 - alpha / a;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function addBreathAndWhisper(input, dry, sampleRate, p) {
  const amount = clamp((p.breath + p.whisper * 1.4) / 100, 0, 1);
  if (amount <= 0.001) return input;
  const out = new Float32Array(input.length);
  let seed = 22222;
  let hp = 0, lastNoise = 0, env = 0;
  for (let i = 0; i < input.length; i++) {
    env = Math.max(Math.abs(dry[i]), env * 0.995);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    hp = noise - lastNoise + hp * 0.985;
    lastNoise = noise;
    const shaped = hp * clamp(env * 8, 0, 1);
    out[i] = input[i] * (1 - p.whisper / 220) + shaped * amount * 0.12;
  }
  return out;
}

function robotAndCreature(input, sampleRate, p) {
  if (p.robot <= 0 && p.creature <= 0) return input;
  const out = new Float32Array(input.length);
  const robot = p.robot / 100;
  const creature = p.creature / 100;
  let phase = 0;
  const ringFreq = 38 + robot * 88 + creature * 18;
  for (let i = 0; i < input.length; i++) {
    const ring = Math.sin(phase);
    phase += TAU * ringFreq / sampleRate;
    if (phase > TAU) phase -= TAU;
    const growl = Math.sin(TAU * 27 * i / sampleRate + input[i] * 5);
    out[i] = input[i] * (1 - robot * 0.55) + input[i] * ring * robot * 0.75 + input[i] * growl * creature * 0.38;
  }
  return out;
}

function deEss(input, sampleRate, p) {
  const amount = p.deEss / 100;
  if (amount <= 0.001) return input;
  const high = applyBiquad(input, sampleRate, "highpass", 5200, 0.72, 0);
  const out = new Float32Array(input.length);
  let env = 0;
  for (let i = 0; i < input.length; i++) {
    env = Math.max(Math.abs(high[i]), env * 0.992);
    const reduction = clamp((env - 0.045) * 9, 0, 0.65 * amount);
    out[i] = input[i] - high[i] * reduction;
  }
  return out;
}

function compress(input, p) {
  const amount = p.compression / 100;
  if (amount <= 0.001) return input;
  const out = new Float32Array(input.length);
  const threshold = dbToLin(-28 + amount * 10);
  const ratio = 1 + amount * 7;
  let env = 0, gain = 1;
  for (let i = 0; i < input.length; i++) {
    env = Math.max(Math.abs(input[i]), env * 0.996);
    let target = 1;
    if (env > threshold) {
      const over = env / threshold;
      target = Math.pow(over, (1 / ratio) - 1);
    }
    gain += (target - gain) * 0.018;
    out[i] = input[i] * gain * (1 + amount * 0.18);
  }
  return out;
}

function saturate(input, amountPct) {
  const amount = amountPct / 100;
  if (amount <= 0.001) return input;
  const out = new Float32Array(input.length);
  const drive = 1 + amount * 8;
  const norm = Math.tanh(drive);
  for (let i = 0; i < input.length; i++) out[i] = Math.tanh(input[i] * drive) / norm;
  return out;
}

function ambience(input, sampleRate, p) {
  const amb = p.ambience / 100;
  const del = p.delay / 100;
  if (amb <= 0.001 && del <= 0.001) return input;
  const out = new Float32Array(input);
  const taps = [
    [0.037, 0.18 * amb],
    [0.071, 0.12 * amb],
    [0.133, 0.08 * amb],
    [0.245, 0.14 * del]
  ];
  for (const [sec, gain] of taps) {
    const d = Math.round(sec * sampleRate);
    for (let i = d; i < out.length; i++) out[i] += input[i - d] * gain;
  }
  return out;
}

function limiter(input, ceilingDb = -1) {
  const ceiling = dbToLin(ceilingDb);
  const out = new Float32Array(input.length);
  let env = 0, gain = 1;
  for (let i = 0; i < input.length; i++) {
    env = Math.max(Math.abs(input[i]), env * 0.995);
    const target = env > ceiling ? ceiling / env : 1;
    gain += (target - gain) * (target < gain ? 0.15 : 0.004);
    out[i] = clamp(input[i] * gain, -ceiling, ceiling);
  }
  return out;
}

export function selfTestDspCore() {
  const sampleRate = 48000;
  const source = generateTestVoice({ sampleRate, duration: 1.2 });
  const profile = buildCalibrationProfile(source, sampleRate);
  const calibratedParams = calibrateParamsForVoice({
    pitch: 3.5,
    formant: 3,
    cuteness: 65,
    breath: 25,
    deEss: 60,
    compression: 60
  }, profile);
  const processed = processVoiceBuffer(source, sampleRate, {
    ...calibratedParams
  });
  const sourceAnalysis = analyzeBuffer(source, sampleRate);
  const processedAnalysis = analyzeBuffer(processed, sampleRate);
  return {
    ok: processed.length === source.length &&
      Number.isFinite(processedAnalysis.rms) &&
      Number.isFinite(sourceAnalysis.pitchMedianHz) &&
      processedAnalysis.peak <= 1 &&
      Math.abs(processedAnalysis.rms - sourceAnalysis.rms) > 0.001,
    source: sourceAnalysis,
    profile,
    calibratedParams,
    processed: processedAnalysis
  };
}
