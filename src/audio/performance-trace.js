import { clamp, linToDb } from "./dsp-core.js";

export const PERFORMANCE_TRACE_DEFAULTS = Object.freeze({
  frameMs: 46,
  hopMs: 23,
  maxFrames: 260,
  minHz: 65,
  maxHz: 520
});

export function analyzePerformanceTrace(samples = new Float32Array(0), sampleRate = 48000, options = {}) {
  const input = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
  const opts = { ...PERFORMANCE_TRACE_DEFAULTS, ...options };
  const frameSize = Math.max(512, Math.round(sampleRate * opts.frameMs / 1000));
  let hop = Math.max(128, Math.round(sampleRate * opts.hopMs / 1000));
  const estimatedFrames = Math.ceil(Math.max(1, input.length - frameSize) / hop);
  if (estimatedFrames > opts.maxFrames) hop = Math.ceil(Math.max(1, input.length - frameSize) / opts.maxFrames);

  const frames = [];
  for (let start = 0; start < input.length; start += hop) {
    const end = Math.min(input.length, start + frameSize);
    const length = end - start;
    if (length < Math.max(256, frameSize * 0.35)) break;
    const frame = analyzeFrame(input, start, length, sampleRate, opts);
    frame.time = (start + length / 2) / sampleRate;
    frame.index = frames.length;
    frames.push(frame);
  }

  const maxRms = Math.max(1e-9, ...frames.map((frame) => frame.rms));
  for (const frame of frames) frame.energy = clamp(frame.rms / maxRms, 0, 1);
  const summary = summarizeTrace(frames, input.length / Math.max(1, sampleRate));
  return {
    sampleRate,
    duration: input.length / Math.max(1, sampleRate),
    frameSize,
    hop,
    frames,
    summary
  };
}

export function comparePerformanceTraces(sourceTrace = null, renderedTrace = null) {
  if (!sourceTrace?.summary || !renderedTrace?.summary) return null;
  const source = sourceTrace.summary;
  const rendered = renderedTrace.summary;
  const deltas = {
    phraseLiftCents: rendered.phraseLiftCents - source.phraseLiftCents,
    endingDropCents: rendered.endingDropCents - source.endingDropCents,
    tailTexture: rendered.tailTexture - source.tailTexture,
    energyRangeDb: rendered.energyRangeDb - source.energyRangeDb,
    activeRatio: rendered.activeRatio - source.activeRatio
  };
  const score = traceScore(rendered, deltas);
  return {
    score,
    status: score >= 86 ? "ready" : score >= 70 ? "check" : "risk",
    deltas,
    items: [
      {
        id: "lift",
        label: "Phrase Lift",
        value: signedCents(deltas.phraseLiftCents),
        detail: deltas.phraseLiftCents >= 0 ? "More upward phrase motion." : "Flatter phrase motion."
      },
      {
        id: "ending",
        label: "Ending",
        value: signedCents(deltas.endingDropCents),
        detail: deltas.endingDropCents < 0 ? "More falling tail release." : "Tail stays higher."
      },
      {
        id: "tail-air",
        label: "Tail Air",
        value: signedNumber(deltas.tailTexture, "/s"),
        detail: deltas.tailTexture >= 0 ? "More breath/frication on phrase tails." : "Cleaner phrase tails."
      },
      {
        id: "motion",
        label: "Motion",
        value: signedDb(deltas.energyRangeDb),
        detail: deltas.energyRangeDb >= 0 ? "Wider delivery dynamics." : "More leveled delivery."
      },
      {
        id: "coverage",
        label: "Coverage",
        value: signedPercent(deltas.activeRatio),
        detail: deltas.activeRatio >= 0 ? "More active voiced material." : "More space or gating."
      }
    ]
  };
}

function analyzeFrame(input, start, length, sampleRate, opts) {
  let sum = 0;
  let peak = 0;
  let crossings = 0;
  let lp = 0;
  let low = 0;
  let high = 0;
  const lpCoeff = Math.exp(-2 * Math.PI * 1800 / sampleRate);
  for (let i = 0; i < length; i++) {
    const value = input[start + i] || 0;
    const prev = i > 0 ? input[start + i - 1] || 0 : value;
    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
    if ((prev < 0 && value >= 0) || (prev >= 0 && value < 0)) crossings++;
    lp = (1 - lpCoeff) * value + lpCoeff * lp;
    const hp = value - lp;
    low += lp * lp;
    high += hp * hp;
  }
  const rms = Math.sqrt(sum / Math.max(1, length));
  const totalTone = low + high;
  const pitch = estimateFramePitch(input, start, length, sampleRate, opts, rms);
  return {
    time: 0,
    index: 0,
    rms,
    rmsDb: linToDb(rms),
    peak,
    zcr: crossings / Math.max(1e-9, length / sampleRate),
    brightness: totalTone > 0 ? high / totalTone : 0,
    pitchHz: pitch.hz,
    pitchConfidence: pitch.confidence,
    energy: 0
  };
}

function estimateFramePitch(input, start, length, sampleRate, opts, frameRms) {
  if (frameRms < 0.006) return { hz: 0, confidence: 0 };
  const minLag = Math.max(2, Math.floor(sampleRate / opts.maxHz));
  const maxLag = Math.min(length - 4, Math.floor(sampleRate / opts.minHz));
  let bestLag = 0;
  let bestScore = 0;
  const lagStep = sampleRate >= 32000 ? 2 : 1;
  const sampleStep = Math.max(2, Math.floor(sampleRate / 16000));
  for (let lag = minLag; lag <= maxLag; lag += lagStep) {
    let corr = 0;
    let e0 = 0;
    let e1 = 0;
    for (let i = 0; i < length - lag; i += sampleStep) {
      const a = input[start + i] || 0;
      const b = input[start + i + lag] || 0;
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
  if (!bestLag || bestScore < 0.32) return { hz: 0, confidence: Math.max(0, bestScore) };
  return { hz: sampleRate / bestLag, confidence: bestScore };
}

function summarizeTrace(frames, duration) {
  const activeThreshold = Math.max(0.01, percentile(frames.map((frame) => frame.rms), 0.82) * 0.18);
  const active = frames.filter((frame) => frame.rms >= activeThreshold);
  const voiced = active.filter((frame) => frame.pitchHz > 0);
  const body = active.filter((frame) => frame.time >= duration * 0.25 && frame.time <= duration * 0.72);
  const head = active.filter((frame) => frame.time <= duration * 0.34);
  const tail = active.filter((frame) => frame.time >= duration * 0.68);
  const pitchMedianHz = median(voiced.map((frame) => frame.pitchHz));
  const headPitch = median(head.filter((frame) => frame.pitchHz > 0).map((frame) => frame.pitchHz)) || pitchMedianHz;
  const bodyPitch = median(body.filter((frame) => frame.pitchHz > 0).map((frame) => frame.pitchHz)) || pitchMedianHz;
  const tailPitch = median(tail.filter((frame) => frame.pitchHz > 0).map((frame) => frame.pitchHz)) || pitchMedianHz;
  const pitchPeak = percentile(voiced.map((frame) => frame.pitchHz), 0.9) || pitchMedianHz;
  const energyValues = active.map((frame) => frame.rmsDb);
  return {
    frameCount: frames.length,
    activeFrameCount: active.length,
    duration,
    activeRatio: frames.length ? active.length / frames.length : 0,
    voicedRatio: active.length ? voiced.length / active.length : 0,
    pitchMedianHz,
    phraseLiftCents: centsBetween(pitchPeak, headPitch),
    endingDropCents: centsBetween(tailPitch, bodyPitch),
    energyRangeDb: percentile(energyValues, 0.9) - percentile(energyValues, 0.1),
    tailReleaseDb: average(tail.map((frame) => frame.rmsDb)) - average(body.map((frame) => frame.rmsDb)),
    tailTexture: average(tail.map((frame) => frame.zcr)) - average(body.map((frame) => frame.zcr)),
    tailBrightness: average(tail.map((frame) => frame.brightness)) - average(body.map((frame) => frame.brightness)),
    onsetDensity: onsetDensity(active)
  };
}

function traceScore(summary, deltas) {
  let score = 78;
  if (summary.voicedRatio >= 0.55) score += 7;
  if (summary.activeRatio >= 0.45) score += 5;
  if (Math.abs(deltas.phraseLiftCents) >= 15) score += 4;
  if (Math.abs(deltas.endingDropCents) >= 12) score += 3;
  if (Math.abs(deltas.tailTexture) >= 250) score += 3;
  if (summary.energyRangeDb > 18) score -= 8;
  if (summary.activeRatio < 0.18) score -= 16;
  return Math.round(clamp(score, 0, 100));
}

function onsetDensity(frames) {
  if (frames.length < 2) return 0;
  let count = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].energy - frames[i - 1].energy > 0.18) count++;
  }
  const seconds = Math.max(0.001, frames[frames.length - 1].time - frames[0].time);
  return count / seconds;
}

function centsBetween(after, before) {
  if (!after || !before || after <= 0 || before <= 0) return 0;
  return 1200 * Math.log2(after / before);
}

function percentile(values, ratio) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return 0;
  const index = Math.min(finite.length - 1, Math.max(0, Math.round((finite.length - 1) * ratio)));
  return finite[index];
}

function median(values) {
  return percentile(values, 0.5);
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function signedCents(value) {
  if (!Number.isFinite(value)) return "0 ct";
  return `${value > 0 ? "+" : ""}${Math.round(value)} ct`;
}

function signedDb(value) {
  if (!Number.isFinite(value)) return "0.0 dB";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

function signedPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
}

function signedNumber(value, unit = "") {
  if (!Number.isFinite(value)) return `0${unit}`;
  return `${value > 0 ? "+" : ""}${Math.round(value)}${unit}`;
}
