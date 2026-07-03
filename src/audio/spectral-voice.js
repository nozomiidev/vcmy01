import { clamp, linToDb } from "./dsp-core.js";

const DEFAULT_FRAME_SIZE = 1024;

export function analyzeSpectralVoice(input, sampleRate, options = {}) {
  const samples = input instanceof Float32Array ? input : new Float32Array(input || []);
  const frameSize = powerOfTwo(options.frameSize || DEFAULT_FRAME_SIZE);
  if (!samples.length || sampleRate <= 0) return emptySpectral(frameSize);
  const frames = spectralFrames(samples, frameSize, options.maxFrames || 6);
  const bins = frameSize / 2;
  const averagePower = new Float64Array(bins);
  for (const frame of frames) {
    const mags = fftMagnitudes(frame);
    for (let i = 1; i < bins; i++) averagePower[i] += mags[i] * mags[i];
  }
  const frameCount = Math.max(1, frames.length);
  for (let i = 0; i < bins; i++) averagePower[i] /= frameCount;
  const total = sumRange(averagePower, 1, bins);
  if (total <= 1e-16) return emptySpectral(frameSize);

  const centroidHz = spectralCentroid(averagePower, sampleRate);
  const rolloff85Hz = spectralRolloff(averagePower, sampleRate, 0.85);
  const rolloff95Hz = spectralRolloff(averagePower, sampleRate, 0.95);
  const flatness = spectralFlatness(averagePower, 1, bins);
  const tiltDbPerOctave = spectralTilt(averagePower, sampleRate, 120, Math.min(12000, sampleRate * 0.45));
  const bands = spectralBands(averagePower, sampleRate);
  const peaks = spectralPeaks(averagePower, sampleRate);
  const risks = spectralRisks({ centroidHz, rolloff85Hz, tiltDbPerOctave, bands, peaks });

  return {
    frameSize,
    frameCount,
    centroidHz: round(centroidHz, 1),
    rolloff85Hz: round(rolloff85Hz, 1),
    rolloff95Hz: round(rolloff95Hz, 1),
    flatness: round(flatness, 4),
    tiltDbPerOctave: round(tiltDbPerOctave, 2),
    bands,
    peaks,
    risks,
    summary: spectralVoiceSummary({ centroidHz, rolloff85Hz, tiltDbPerOctave, risks })
  };
}

export function spectralVoiceSummary(spectral = null) {
  if (!spectral) return "No spectral analysis";
  const risks = spectral.risks || {};
  const tags = [];
  if ((risks.mud || 0) > 28) tags.push("mud");
  if ((risks.nasal || 0) > 28) tags.push("nasal");
  if ((risks.harsh || 0) > 28) tags.push("harsh");
  if ((risks.sibilance || 0) > 28) tags.push("sibilance");
  if ((risks.dark || 0) > 28) tags.push("dark");
  if ((risks.thin || 0) > 28) tags.push("thin");
  const core = `${Math.round(spectral.centroidHz || 0)} Hz centroid / ${Math.round(spectral.rolloff85Hz || 0)} Hz rolloff`;
  return tags.length ? `${core} / ${tags.slice(0, 3).join(", ")}` : core;
}

function spectralFrames(samples, frameSize, maxFrames) {
  const frameCount = Math.max(1, Math.min(maxFrames, Math.ceil(samples.length / frameSize)));
  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    const center = frameCount === 1
      ? Math.floor(samples.length / 2)
      : Math.round((samples.length - 1) * (f + 0.5) / frameCount);
    const start = Math.max(0, Math.min(samples.length - frameSize, center - Math.floor(frameSize / 2)));
    const frame = new Float64Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      const sample = samples[start + i] || 0;
      frame[i] = sample * hann(i, frameSize);
    }
    frames.push(frame);
  }
  return frames;
}

function fftMagnitudes(frame) {
  const n = frame.length;
  const re = new Float64Array(frame);
  const im = new Float64Array(n);
  bitReverse(re, im);
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = -Math.PI * 2 / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < half; j++) {
        const angle = step * j;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const even = start + j;
        const odd = even + half;
        const tr = wr * re[odd] - wi * im[odd];
        const ti = wr * im[odd] + wi * re[odd];
        re[odd] = re[even] - tr;
        im[odd] = im[even] - ti;
        re[even] += tr;
        im[even] += ti;
      }
    }
  }
  const bins = n / 2;
  const mags = new Float64Array(bins);
  for (let i = 0; i < bins; i++) mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / n;
  return mags;
}

function bitReverse(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n - 1; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
}

function spectralCentroid(power, sampleRate) {
  let weighted = 0;
  let total = 0;
  for (let i = 1; i < power.length; i++) {
    const f = binHz(i, power.length * 2, sampleRate);
    weighted += f * power[i];
    total += power[i];
  }
  return weighted / Math.max(1e-16, total);
}

function spectralRolloff(power, sampleRate, pct) {
  const target = sumRange(power, 1, power.length) * clamp(pct, 0, 1);
  let sum = 0;
  for (let i = 1; i < power.length; i++) {
    sum += power[i];
    if (sum >= target) return binHz(i, power.length * 2, sampleRate);
  }
  return sampleRate * 0.5;
}

function spectralFlatness(power, start, end) {
  let logSum = 0;
  let linSum = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    const p = Math.max(1e-18, power[i]);
    logSum += Math.log(p);
    linSum += p;
    count++;
  }
  return Math.exp(logSum / Math.max(1, count)) / Math.max(1e-18, linSum / Math.max(1, count));
}

function spectralTilt(power, sampleRate, lowHz, highHz) {
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let i = 1; i < power.length; i++) {
    const hz = binHz(i, power.length * 2, sampleRate);
    if (hz < lowHz || hz > highHz) continue;
    const x = Math.log2(hz / 1000);
    const y = linToDb(Math.sqrt(power[i]));
    sx += x; sy += y; sxx += x * x; sxy += x * y; n++;
  }
  const denom = n * sxx - sx * sx;
  return Math.abs(denom) < 1e-12 ? 0 : (n * sxy - sx * sy) / denom;
}

function spectralBands(power, sampleRate) {
  const bands = {
    low: bandDb(power, sampleRate, 80, 180),
    warmth: bandDb(power, sampleRate, 180, 420),
    mud: bandDb(power, sampleRate, 220, 520),
    nasal: bandDb(power, sampleRate, 650, 1300),
    presence: bandDb(power, sampleRate, 2500, 4500),
    sibilance: bandDb(power, sampleRate, 5200, 9000),
    air: bandDb(power, sampleRate, 9000, Math.min(16000, sampleRate * 0.46))
  };
  const speech = bandDb(power, sampleRate, 120, Math.min(11000, sampleRate * 0.46));
  return Object.fromEntries(Object.entries(bands).map(([key, value]) => [key, round(value - speech, 2)]));
}

function spectralPeaks(power, sampleRate) {
  const peaks = [];
  for (let i = 2; i < power.length - 2; i++) {
    const hz = binHz(i, power.length * 2, sampleRate);
    if (hz < 180 || hz > Math.min(9000, sampleRate * 0.45)) continue;
    const db = linToDb(Math.sqrt(power[i]));
    const local = (linToDb(Math.sqrt(power[i - 2])) + linToDb(Math.sqrt(power[i + 2]))) * 0.5;
    const prominenceDb = db - local;
    if (prominenceDb > 2.2 && power[i] > power[i - 1] && power[i] > power[i + 1]) {
      peaks.push({ hz: round(hz, 1), db: round(db, 2), prominenceDb: round(prominenceDb, 2) });
    }
  }
  return peaks.sort((a, b) => b.prominenceDb - a.prominenceDb).slice(0, 6);
}

function spectralRisks({ centroidHz, rolloff85Hz, tiltDbPerOctave, bands, peaks }) {
  const topNasal = maxPeak(peaks, 650, 1300);
  const topHarsh = maxPeak(peaks, 2500, 4500);
  return {
    dark: Math.round(clamp((1450 - centroidHz) * 0.045 + (-7.5 - tiltDbPerOctave) * 7, 0, 100)),
    thin: Math.round(clamp((centroidHz - 3100) * 0.035 + Math.max(0, rolloff85Hz - 8200) * 0.011, 0, 100)),
    mud: Math.round(clamp((bands.mud + 10) * 4.2, 0, 100)),
    nasal: Math.round(clamp((bands.nasal + 11) * 4.5 + topNasal * 8, 0, 100)),
    harsh: Math.round(clamp((bands.presence + 13) * 4.1 + topHarsh * 7, 0, 100)),
    sibilance: Math.round(clamp((bands.sibilance + 18) * 3.8, 0, 100)),
    air: Math.round(clamp((bands.air + 26) * 2.2, 0, 100))
  };
}

function maxPeak(peaks, lowHz, highHz) {
  return peaks
    .filter((peak) => peak.hz >= lowHz && peak.hz <= highHz)
    .reduce((max, peak) => Math.max(max, peak.prominenceDb || 0), 0);
}

function bandDb(power, sampleRate, lowHz, highHz) {
  const n = power.length * 2;
  const start = Math.max(1, Math.floor(lowHz / sampleRate * n));
  const end = Math.min(power.length, Math.ceil(highHz / sampleRate * n));
  return linToDb(Math.sqrt(sumRange(power, start, end) / Math.max(1, end - start)));
}

function sumRange(values, start, end) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += values[i] || 0;
  return sum;
}

function binHz(index, fftSize, sampleRate) {
  return index * sampleRate / fftSize;
}

function hann(i, n) {
  return 0.5 - 0.5 * Math.cos(Math.PI * 2 * i / Math.max(1, n - 1));
}

function powerOfTwo(value) {
  const n = Math.max(256, Math.min(4096, Math.round(value || DEFAULT_FRAME_SIZE)));
  return 1 << Math.round(Math.log2(n));
}

function emptySpectral(frameSize) {
  return {
    frameSize,
    frameCount: 0,
    centroidHz: 0,
    rolloff85Hz: 0,
    rolloff95Hz: 0,
    flatness: 0,
    tiltDbPerOctave: 0,
    bands: {},
    peaks: [],
    risks: { dark: 0, thin: 0, mud: 0, nasal: 0, harsh: 0, sibilance: 0, air: 0 },
    summary: "No spectral analysis"
  };
}

function round(value, digits) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}
