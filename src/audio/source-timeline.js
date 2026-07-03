import { analyzeBuffer } from "./dsp-core.js";

export const SOURCE_TIMELINE_LIMITS = Object.freeze({
  frameSec: 0.08,
  minCueSec: 0.35,
  maxCueSec: 6,
  cuePaddingSec: 0.12,
  maxCues: 10
});

export function buildSourceTimeline(source = null, options = {}) {
  if (!source?.samples?.length || !source.sampleRate) {
    return emptyTimeline();
  }
  const sampleRate = Math.max(1, Number(source.sampleRate || 48000));
  const samples = source.samples;
  const durationSec = samples.length / sampleRate;
  const limits = { ...SOURCE_TIMELINE_LIMITS, ...(options.limits || {}) };
  const frames = frameMetrics(samples, sampleRate, limits.frameSec);
  const intervals = activeIntervals(frames, durationSec, limits);
  const cues = intervalsToCues(samples, sampleRate, intervals, limits, options)
    .slice(0, Math.max(1, Number(limits.maxCues || SOURCE_TIMELINE_LIMITS.maxCues)));
  const bestCue = cues.slice().sort((a, b) => b.score - a.score || b.durationSec - a.durationSec)[0] || null;
  const activeCue = cues.find((cue) => cue.id === options.activeCueId) || bestCue;
  const longform = durationSec > Number(options.longformSec || 12) || cues.length > 2;
  const score = cues.length
    ? Math.round(cues.reduce((sum, cue) => sum + cue.score, 0) / cues.length)
    : 0;
  return {
    durationSec,
    frameCount: frames.length,
    cueCount: cues.length,
    longform,
    status: timelineStatus(score, cues, longform),
    score,
    summary: cues.length
      ? `${cues.length} cues / ${formatDuration(durationSec)}`
      : `No active cue / ${formatDuration(durationSec)}`,
    cues: cues.map((cue) => ({ ...cue, active: cue.id === activeCue?.id })),
    bestCue,
    activeCue,
    nextAction: nextTimelineAction(cues, activeCue, bestCue, longform)
  };
}

export function sourceTimelineSummary(timeline = null) {
  if (!timeline) {
    return {
      cueCount: 0,
      score: 0,
      status: "waiting",
      summary: "No source timeline"
    };
  }
  return {
    cueCount: timeline.cueCount || 0,
    score: timeline.score || 0,
    status: timeline.status || "waiting",
    summary: timeline.summary || "No source timeline",
    active: timeline.activeCue?.label || null,
    nextAction: timeline.nextAction || null
  };
}

export function cueRegion(cue = null) {
  if (!cue) return null;
  return {
    startSec: cue.startSec,
    durationSec: cue.durationSec,
    minDurationSec: SOURCE_TIMELINE_LIMITS.minCueSec
  };
}

export function nearestCueIdForRegion(timeline = null, region = null) {
  if (!timeline?.cues?.length || !region) return null;
  const regionStart = Number(region.startSec || 0);
  const regionEnd = regionStart + Number(region.durationSec || 0);
  const best = timeline.cues
    .map((cue) => ({
      cue,
      overlap: overlapRatio(regionStart, regionEnd, cue.startSec, cue.endSec)
    }))
    .sort((a, b) => b.overlap - a.overlap)[0] || null;
  return best && best.overlap >= 0.35 ? best.cue.id : null;
}

function frameMetrics(samples, sampleRate, frameSec) {
  const frameSize = Math.max(128, Math.round(sampleRate * frameSec));
  const frames = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(samples.length, start + frameSize);
    let sum = 0;
    let peak = 0;
    let zc = 0;
    let prev = samples[start] || 0;
    for (let i = start; i < end; i += 1) {
      const value = samples[i] || 0;
      sum += value * value;
      peak = Math.max(peak, Math.abs(value));
      if ((value >= 0 && prev < 0) || (value < 0 && prev >= 0)) zc += 1;
      prev = value;
    }
    const length = Math.max(1, end - start);
    const rms = Math.sqrt(sum / length);
    frames.push({
      index: frames.length,
      startSec: start / sampleRate,
      endSec: end / sampleRate,
      durationSec: (end - start) / sampleRate,
      rms,
      rmsDb: amplitudeToDb(rms),
      peak,
      zeroCrossingsPerSecond: zc / Math.max(0.001, (end - start) / sampleRate)
    });
  }
  return frames;
}

function activeIntervals(frames, durationSec, limits) {
  if (!frames.length) return fallbackIntervals(durationSec, limits);
  const rmsValues = frames.map((frame) => frame.rms).sort((a, b) => a - b);
  const median = rmsValues[Math.floor(rmsValues.length * 0.5)] || 0;
  const high = rmsValues[Math.floor(rmsValues.length * 0.85)] || median;
  const threshold = Math.max(dbToAmplitude(-46), median * 1.35, high * 0.28);
  const intervals = [];
  let activeStart = null;
  for (const frame of frames) {
    const active = frame.rms >= threshold || frame.peak >= threshold * 3.5;
    if (active && activeStart == null) activeStart = frame.startSec;
    if (!active && activeStart != null) {
      intervals.push({ startSec: activeStart, endSec: frame.startSec });
      activeStart = null;
    }
  }
  if (activeStart != null) intervals.push({ startSec: activeStart, endSec: durationSec });
  const merged = mergeIntervals(intervals, limits.frameSec * 2.5)
    .map((interval) => ({
      startSec: Math.max(0, interval.startSec - limits.cuePaddingSec),
      endSec: Math.min(durationSec, interval.endSec + limits.cuePaddingSec)
    }))
    .filter((interval) => interval.endSec - interval.startSec >= limits.minCueSec * 0.6);
  const split = splitLongIntervals(merged, limits.maxCueSec);
  return split.length ? split : fallbackIntervals(durationSec, limits);
}

function intervalsToCues(samples, sampleRate, intervals, limits, options) {
  const targetDuration = Number(options.scriptDurationSec || options.targetDurationSec || 0);
  return intervals.map((interval, index) => {
    const startSample = Math.max(0, Math.min(samples.length, Math.round(interval.startSec * sampleRate)));
    const endSample = Math.max(startSample + 1, Math.min(samples.length, Math.round(interval.endSec * sampleRate)));
    const cueSamples = samples.slice(startSample, endSample);
    const analysis = analyzeBuffer(cueSamples, sampleRate);
    const durationSec = (endSample - startSample) / sampleRate;
    const score = cueScore(analysis, durationSec, targetDuration);
    const role = cueRole(index, intervals.length, durationSec, analysis);
    return {
      id: `cue-${String(index + 1).padStart(2, "0")}`,
      index,
      label: `${String(index + 1).padStart(2, "0")} ${role}`,
      role,
      startSec: startSample / sampleRate,
      endSec: endSample / sampleRate,
      durationSec,
      score,
      status: score >= 84 ? "ready" : score >= 66 ? "check" : "risk",
      rmsDb: analysis.rmsDb,
      peakDb: analysis.peakDb,
      pitchMedianHz: analysis.pitchMedianHz,
      zeroCrossingsPerSecond: analysis.zeroCrossingsPerSecond,
      detail: cueDetail(analysis, durationSec, targetDuration)
    };
  });
}

function cueScore(analysis, durationSec, targetDuration) {
  let score = 100;
  if (durationSec < 0.35) score -= 20;
  if (durationSec > 8) score -= 10;
  if (analysis.rmsDb < -42) score -= 22;
  if (analysis.peakDb > -0.5 || analysis.clipped) score -= 20;
  if (!Number.isFinite(analysis.pitchMedianHz) || analysis.pitchMedianHz <= 0) score -= 8;
  if (targetDuration > 0) {
    const ratio = durationSec / Math.max(0.001, targetDuration);
    if (ratio < 0.45 || ratio > 2.2) score -= 10;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function cueRole(index, count, durationSec, analysis) {
  if (count === 1) return "Main cue";
  if (index === 0) return "Lead cue";
  if (index === count - 1) return analysis.zeroCrossingsPerSecond > 3000 ? "Texture tail" : "Release cue";
  if (durationSec < 1) return "Pickup cue";
  return "Body cue";
}

function cueDetail(analysis, durationSec, targetDuration) {
  const parts = [
    `${formatDuration(durationSec)} window`,
    `${Math.round(analysis.pitchMedianHz || 0)} Hz F0`,
    `${Math.round(analysis.zeroCrossingsPerSecond || 0)}/s texture`
  ];
  if (targetDuration > 0) parts.push(`${Math.round(durationSec / targetDuration * 100)}% script length`);
  if (analysis.peakDb > -0.5 || analysis.clipped) parts.push("tight peak headroom");
  return parts.join(" / ");
}

function nextTimelineAction(cues, activeCue, bestCue, longform) {
  if (!cues.length || !bestCue) return null;
  if (!activeCue || activeCue.id !== bestCue.id) {
    return {
      id: "select-source-cue",
      label: "Select Cue",
      cueId: bestCue.id,
      detail: `${bestCue.label} is the strongest preview window.`
    };
  }
  if (longform && activeCue.score < 74) {
    return {
      id: "select-source-cue",
      label: "Find Better Cue",
      cueId: bestCue.id,
      detail: "The active long-form cue has weak render evidence."
    };
  }
  return null;
}

function timelineStatus(score, cues, longform) {
  if (!cues.length) return "risk";
  if (longform && cues.length < 2) return "check";
  if (score >= 84) return "ready";
  if (score >= 66) return "check";
  return "risk";
}

function splitLongIntervals(intervals, maxCueSec) {
  const out = [];
  for (const interval of intervals) {
    const duration = interval.endSec - interval.startSec;
    if (duration <= maxCueSec) {
      out.push(interval);
      continue;
    }
    const count = Math.ceil(duration / maxCueSec);
    const chunk = duration / count;
    for (let i = 0; i < count; i += 1) {
      out.push({
        startSec: interval.startSec + chunk * i,
        endSec: i === count - 1 ? interval.endSec : interval.startSec + chunk * (i + 1)
      });
    }
  }
  return out;
}

function mergeIntervals(intervals, gapSec) {
  const sorted = intervals.slice().sort((a, b) => a.startSec - b.startSec);
  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startSec - last.endSec <= gapSec) {
      last.endSec = Math.max(last.endSec, interval.endSec);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function fallbackIntervals(durationSec, limits) {
  const maxCue = Math.max(limits.minCueSec, Math.min(durationSec, limits.maxCueSec));
  return [{
    startSec: 0,
    endSec: Math.max(limits.minCueSec, Math.min(durationSec, maxCue))
  }];
}

function emptyTimeline() {
  return {
    durationSec: 0,
    frameCount: 0,
    cueCount: 0,
    longform: false,
    status: "waiting",
    score: 0,
    summary: "No source",
    cues: [],
    bestCue: null,
    activeCue: null,
    nextAction: null
  };
}

function overlapRatio(aStart, aEnd, bStart, bEnd) {
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const base = Math.max(0.001, Math.min(aEnd - aStart, bEnd - bStart));
  return overlap / base;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "0.0s";
  if (seconds >= 60) {
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}:${String(sec).padStart(2, "0")}`;
  }
  return `${seconds.toFixed(1)}s`;
}

function amplitudeToDb(value) {
  return value > 0 ? 20 * Math.log10(value) : -120;
}

function dbToAmplitude(db) {
  return Math.pow(10, db / 20);
}
