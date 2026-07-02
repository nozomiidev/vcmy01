import { runPresetQualitySuite } from "../src/audio/dsp-core.js";

const suite = runPresetQualitySuite({ duration: 0.9 });

const rows = suite.results.map((item) => ({
  status: item.status,
  preset: item.name,
  rtx: item.realtimeFactor.toFixed(2),
  rms: `${item.analysis.rmsDb.toFixed(1)} dB`,
  peak: `${item.analysis.peakDb.toFixed(1)} dB`,
  f0: `${Math.round(item.analysis.pitchMedianHz || 0)} Hz`,
  dF0: signed(Math.round(item.deltas.pitchHz || 0)),
  bright: signed(Math.round(item.deltas.brightness * 100)),
  notes: item.issues.map((issue) => issue.text).join(", ") || "stable"
}));

console.table(rows);
console.log(JSON.stringify({
  ok: suite.ok,
  counts: suite.counts,
  elapsedMs: Number(suite.elapsedMs.toFixed(1)),
  realtimeFactor: Number(suite.realtimeFactor.toFixed(3))
}, null, 2));

if (!suite.ok) process.exitCode = 1;

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}
