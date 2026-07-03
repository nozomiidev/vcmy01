import { linToDb } from "../audio/dsp-core.js";

export function drawWaveform(canvas, samples, color = "#69e3b5", options = {}) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (samples && options.region && !options.region.isFull) {
    const startX = clamp01(options.region.startSample / samples.length) * width;
    const endX = clamp01(options.region.endSample / samples.length) * width;
    ctx.fillStyle = "rgba(143, 167, 255, 0.16)";
    ctx.fillRect(startX, 0, Math.max(1, endX - startX), height);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const mid = height / 2;
  const n = samples ? samples.length : 0;
  for (let x = 0; x < width; x++) {
    const v = n ? samples[Math.floor((x / width) * n)] : 0;
    const y = mid - v * mid * 0.88;
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawSpectrum(canvas, bins, color = "#8fa7ff") {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  if (!bins) return;
  const bars = 72;
  const bw = width / bars;
  for (let i = 0; i < bars; i++) {
    const lo = Math.floor(Math.pow(i / bars, 2.1) * bins.length * 0.92);
    const hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / bars, 2.1) * bins.length * 0.92));
    let m = 0;
    for (let b = lo; b < hi; b++) m = Math.max(m, bins[b]);
    const h = (m / 255) * height;
    ctx.globalAlpha = 0.35 + (m / 255) * 0.65;
    ctx.fillRect(i * bw + 1, height - h, Math.max(1, bw - 2), h);
  }
  ctx.globalAlpha = 1;
}

export function drawAnalysisCards(host, source, rendered) {
  const entries = [];
  if (source) {
    entries.push(["Source Loudness", formatLoudness(source.analysis)]);
    entries.push(["Source True Peak", formatTruePeak(source.analysis)]);
    entries.push(["Source F0", formatHz(source.analysis.pitchMedianHz)]);
    entries.push(["Voiced", formatPct(source.analysis.voicedRatio)]);
    entries.push(["Brightness", formatPct(source.analysis.brightnessRatio)]);
    if (source.studioAnalysis) {
      entries.push(["Studio Score", `${source.studioAnalysis.score}%`]);
      entries.push(["Noise Floor", `${source.studioAnalysis.noiseFloorDb.toFixed(1)} dB`]);
      if (source.studioAnalysis.spectral) entries.push(["FFT Tone", formatSpectral(source.studioAnalysis.spectral)]);
      if (source.studioAnalysis.microRepair) entries.push(["Micro Repair", formatMicroRepair(source.studioAnalysis.microRepair)]);
    }
  }
  if (rendered) {
    entries.push(["Render Mode", rendered.region?.isFull ? "Full" : "Preview"]);
    entries.push(["Render Stage", rendered.stage === "polish" ? "Polish" : "Character"]);
    if (rendered.studioPolish?.enabled) {
      const target = rendered.studioPolish.target?.label || rendered.studioPolish.plan?.target?.label || rendered.studioPolish.intensity;
      entries.push(["Studio Polish", rendered.studioPolish.optimized ? `${target} + Director` : `${target} / ${rendered.studioPolish.intensity}`]);
      if (rendered.studioPolish.plan?.microRepair) entries.push(["Polish Events", formatMicroRepair(rendered.studioPolish.plan.microRepair)]);
      if (rendered.studioPolish.plan?.roomShaper) entries.push(["Room Floor", formatRoomShaper(rendered.studioPolish.plan.roomShaper)]);
      if (rendered.studioPolish.plan?.toneSurgery) entries.push(["Tone Surgery", rendered.studioPolish.plan.toneSurgery.summary || "No dynamic cuts"]);
    }
    if (rendered.region && !rendered.region.isFull) entries.push(["Region", `${rendered.region.startSec.toFixed(1)}-${rendered.region.endSec.toFixed(1)} s`]);
    if (rendered.mastering?.enabled) entries.push(["Master Gain", `${signedNumber(rendered.mastering.gainDb)} dB -> ${rendered.mastering.targetLufs.toFixed(1)} LUFS`]);
    entries.push(["Render Loudness", formatLoudness(rendered.analysis)]);
    entries.push(["Render True Peak", formatTruePeak(rendered.analysis)]);
    entries.push(["Render F0", formatHz(rendered.analysis.pitchMedianHz)]);
    entries.push(["Render ZCR", `${Math.round(rendered.analysis.zeroCrossingsPerSecond)}/s`]);
    entries.push(["Duration", `${rendered.analysis.duration.toFixed(2)} s`]);
    entries.push(["Auto Tune", rendered.autoCalibrated ? formatTune(rendered.calibrationDelta) : "Off"]);
  }
  host.innerHTML = entries.map(([k, v]) => `<div class="metric"><span>${k}</span><strong>${v}</strong></div>`).join("");
}

function formatHz(value) {
  return value > 0 ? `${Math.round(value)} Hz` : "unvoiced";
}

function formatLoudness(analysis) {
  return Number.isFinite(analysis?.integratedLufs)
    ? `${analysis.integratedLufs.toFixed(1)} LUFS`
    : `${analysis?.rmsDb?.toFixed(1) || "-180.0"} dB RMS`;
}

function formatTruePeak(analysis) {
  return Number.isFinite(analysis?.truePeakDb)
    ? `${analysis.truePeakDb.toFixed(1)} dBTP`
    : `${analysis?.peakDb?.toFixed(1) || "-180.0"} dB peak`;
}

function formatPct(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "0%";
}

function formatTune(delta = []) {
  return delta.length
    ? delta.slice(0, 3).map((item) => `${tuneName(item.key)} ${signed(item.delta)}`).join(" / ")
    : "Fit";
}

function formatMicroRepair(timeline) {
  const count = Number(timeline?.eventCount || 0);
  if (!count) return "0 events";
  const c = timeline.counts || {};
  return `${count} events / M${c.mouth || 0} P${c.plosive || 0} S${c.sibilance || 0}`;
}

function formatSpectral(spectral) {
  if (!spectral) return "No spectral map";
  const tilt = Number(spectral.tiltDbPerOctave || 0).toFixed(1);
  return `${Math.round(spectral.centroidHz || 0)} Hz / ${Math.round(spectral.rolloff85Hz || 0)} Hz / ${tilt} dB/oct`;
}

function formatRoomShaper(room) {
  if (!room) return "Off";
  return `${Number(room.thresholdDb || 0).toFixed(0)} dB / ${Number(room.rangeDb || 0).toFixed(0)} dB`;
}

function signed(value) {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function signedNumber(value) {
  const n = Number(value || 0);
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

function tuneName(key) {
  return ({
    inputGain: "Gain",
    pitch: "Pitch",
    formant: "Mouth",
    body: "Body",
    brightness: "Bright",
    air: "Air",
    deEss: "De-ess",
    breath: "Breath",
    whisper: "Whisper"
  })[key] || key;
}

export function formatDb(value) {
  return value < 1e-5 ? "-inf dB" : `${linToDb(value).toFixed(1)} dB`;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value || 0));
}

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(Number(canvas.getAttribute("height") || 120) * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx;
}
