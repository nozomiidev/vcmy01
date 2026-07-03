const LOUDNESS_OFFSET_DB = -0.691;

export function analyzeLoudness(input, sampleRate, options = {}) {
  const samples = input instanceof Float32Array ? input : new Float32Array(input || []);
  if (!samples.length || sampleRate <= 0) return emptyLoudness();
  const weighted = kWeight(samples, sampleRate);
  const blockSec = options.blockSec || 0.4;
  const hopSec = options.hopSec || 0.1;
  const blockSize = Math.max(1, Math.round(blockSec * sampleRate));
  const hopSize = Math.max(1, Math.round(hopSec * sampleRate));
  const blocks = loudnessBlocks(weighted, blockSize, hopSize);
  const integratedLufs = integratedLoudness(blocks);
  const momentaryMaxLufs = blocks.length ? Math.max(...blocks.map((block) => block.lufs)) : integratedLufs;
  const shortTermLufs = shortTermLoudness(weighted, sampleRate);
  const gated = gatedBlocks(blocks);
  const lra = loudnessRange(gated.length ? gated : blocks);
  const truePeak = truePeak4x(samples);
  return {
    integratedLufs: round(integratedLufs, 2),
    momentaryMaxLufs: round(momentaryMaxLufs, 2),
    shortTermLufs: round(shortTermLufs, 2),
    loudnessRangeLu: round(lra, 2),
    truePeak,
    truePeakDb: linToDb(truePeak),
    samplePeak: samplePeak(samples),
    samplePeakDb: linToDb(samplePeak(samples)),
    gatedBlockCount: gated.length,
    blockCount: blocks.length,
    standard: "BS.1770-style mono proxy"
  };
}

export function loudnessTargetReview(loudness, targetLufs = -16, truePeakCeilingDb = -1) {
  if (!loudness) return { status: "unknown", gainToTargetDb: 0, truePeakMarginDb: 0, issues: [] };
  const gainToTargetDb = targetLufs - Number(loudness.integratedLufs || targetLufs);
  const truePeakMarginDb = truePeakCeilingDb - Number(loudness.truePeakDb || -120);
  const issues = [];
  if (Math.abs(gainToTargetDb) > 1.5) issues.push(gainToTargetDb > 0 ? "under target loudness" : "over target loudness");
  if (truePeakMarginDb < 0) issues.push("true peak over ceiling");
  if (Number(loudness.loudnessRangeLu || 0) > 14) issues.push("wide loudness range");
  return {
    status: issues.length ? "check" : "ready",
    gainToTargetDb: round(gainToTargetDb, 2),
    truePeakMarginDb: round(truePeakMarginDb, 2),
    issues
  };
}

export function normalizeLoudness(input, sampleRate, options = {}) {
  const samples = input instanceof Float32Array ? input : new Float32Array(input || []);
  const targetLufs = Number.isFinite(options.targetLufs) ? options.targetLufs : -16;
  const truePeakCeilingDb = Number.isFinite(options.truePeakCeilingDb) ? options.truePeakCeilingDb : -1;
  const minGainDb = Number.isFinite(options.minGainDb) ? options.minGainDb : -9;
  const maxGainDb = Number.isFinite(options.maxGainDb) ? options.maxGainDb : 9;
  const before = analyzeLoudness(samples, sampleRate);
  const loudnessGain = targetLufs - before.integratedLufs;
  const peakSafeGain = truePeakCeilingDb - before.truePeakDb;
  const gainDb = clamp(Math.min(loudnessGain, peakSafeGain), minGainDb, maxGainDb);
  const gain = Math.pow(10, gainDb / 20);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = clamp(samples[i] * gain, -1, 1);
  const after = analyzeLoudness(out, sampleRate);
  return {
    samples: out,
    enabled: true,
    targetLufs: round(targetLufs, 2),
    truePeakCeilingDb: round(truePeakCeilingDb, 2),
    gainDb: round(gainDb, 2),
    limitedByTruePeak: loudnessGain > peakSafeGain,
    before,
    after
  };
}

function kWeight(samples, sampleRate) {
  let out = biquad(samples, sampleRate, "highshelf", 2000, 0.707, 4);
  out = biquad(out, sampleRate, "highpass", 80, 0.707, 0);
  return out;
}

function loudnessBlocks(samples, blockSize, hopSize) {
  if (samples.length < blockSize) return [{ energy: meanSquare(samples, 0, samples.length), lufs: loudnessFromEnergy(meanSquare(samples, 0, samples.length)) }];
  const blocks = [];
  for (let start = 0; start + blockSize <= samples.length; start += hopSize) {
    const energy = meanSquare(samples, start, start + blockSize);
    blocks.push({ energy, lufs: loudnessFromEnergy(energy) });
  }
  return blocks;
}

function integratedLoudness(blocks) {
  const gated = gatedBlocks(blocks);
  const usable = gated.length ? gated : blocks;
  const energy = usable.reduce((sum, block) => sum + block.energy, 0) / Math.max(1, usable.length);
  return loudnessFromEnergy(energy);
}

function gatedBlocks(blocks) {
  const absolute = blocks.filter((block) => block.lufs >= -70);
  if (!absolute.length) return [];
  const absoluteEnergy = absolute.reduce((sum, block) => sum + block.energy, 0) / absolute.length;
  const relativeGate = loudnessFromEnergy(absoluteEnergy) - 10;
  return absolute.filter((block) => block.lufs >= relativeGate);
}

function shortTermLoudness(samples, sampleRate) {
  const size = Math.round(3 * sampleRate);
  if (samples.length <= size) return loudnessFromEnergy(meanSquare(samples, 0, samples.length));
  let best = -Infinity;
  const hop = Math.max(1, Math.round(0.5 * sampleRate));
  for (let start = 0; start + size <= samples.length; start += hop) {
    best = Math.max(best, loudnessFromEnergy(meanSquare(samples, start, start + size)));
  }
  return Number.isFinite(best) ? best : loudnessFromEnergy(meanSquare(samples, 0, samples.length));
}

function loudnessRange(blocks) {
  const values = blocks.map((block) => block.lufs).filter(Number.isFinite).sort((a, b) => a - b);
  if (values.length < 2) return 0;
  return percentile(values, 0.95) - percentile(values, 0.1);
}

function meanSquare(samples, start, end) {
  let sum = 0;
  const safeEnd = Math.min(samples.length, Math.max(start + 1, end));
  for (let i = start; i < safeEnd; i++) sum += samples[i] * samples[i];
  return sum / Math.max(1, safeEnd - start);
}

function truePeak4x(samples) {
  let max = samplePeak(samples);
  for (let i = 0; i < samples.length - 1; i++) {
    const y0 = samples[Math.max(0, i - 1)];
    const y1 = samples[i];
    const y2 = samples[i + 1];
    const y3 = samples[Math.min(samples.length - 1, i + 2)];
    for (let step = 1; step < 4; step++) {
      const t = step / 4;
      const value = cubicHermite(y0, y1, y2, y3, t);
      max = Math.max(max, Math.abs(value));
    }
  }
  return Math.min(4, max);
}

function cubicHermite(y0, y1, y2, y3, t) {
  const c0 = y1;
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + c0;
}

function samplePeak(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return peak;
}

function biquad(input, sampleRate, type, freq, q, gainDb) {
  const out = new Float32Array(input.length);
  const c = biquadCoefficients(sampleRate, type, clamp(freq, 10, sampleRate * 0.46), q, gainDb);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

function biquadCoefficients(sampleRate, type, freq, q, gainDb) {
  const w0 = Math.PI * 2 * freq / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const a = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "highpass") {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else {
    const s = Math.sqrt(a) / q;
    b0 = a * ((a + 1) + (a - 1) * cos + s * sin);
    b1 = -2 * a * ((a - 1) + (a + 1) * cos);
    b2 = a * ((a + 1) + (a - 1) * cos - s * sin);
    a0 = (a + 1) - (a - 1) * cos + s * sin;
    a1 = 2 * ((a - 1) - (a + 1) * cos);
    a2 = (a + 1) - (a - 1) * cos - s * sin;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function loudnessFromEnergy(energy) {
  return LOUDNESS_OFFSET_DB + 10 * Math.log10(Math.max(1e-18, energy));
}

function linToDb(value) {
  return 20 * Math.log10(Math.max(1e-9, value));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * clamp(p, 0, 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function emptyLoudness() {
  return {
    integratedLufs: -180,
    momentaryMaxLufs: -180,
    shortTermLufs: -180,
    loudnessRangeLu: 0,
    truePeak: 0,
    truePeakDb: -180,
    samplePeak: 0,
    samplePeakDb: -180,
    gatedBlockCount: 0,
    blockCount: 0,
    standard: "BS.1770-style mono proxy"
  };
}
