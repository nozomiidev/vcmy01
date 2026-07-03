import { runReferenceQualitySuite } from "../src/audio/dsp-core.js";
import { runStudioPolishQualitySuite } from "../src/audio/studio-polish.js";

const suite = runReferenceQualitySuite({ duration: 0.52 });
const polishSuite = runStudioPolishQualitySuite({ duration: 0.52 });
const directorSuite = runStudioPolishQualitySuite({ duration: 0.36, target: "kawaii", optimize: true });

const rows = suite.results.map((item) => ({
  status: item.status,
  source: item.sourceProfile?.name || "Reference",
  preset: item.name,
  rtx: item.realtimeFactor.toFixed(2),
  rms: `${item.analysis.rmsDb.toFixed(1)} dB`,
  peak: `${item.analysis.peakDb.toFixed(1)} dB`,
  f0: `${Math.round(item.analysis.pitchMedianHz || 0)} Hz`,
  dF0: signed(Math.round(item.deltas.pitchHz || 0)),
  bright: signed(Math.round(item.deltas.brightness * 100)),
  dZCR: signed(Math.round(item.deltas.zcr || 0)),
  notes: item.issues.map((issue) => issue.text).join(", ") || "stable"
}));

console.table(rows);
console.table(polishSuite.results.map((item) => ({
  status: item.status,
  source: item.sourceProfile.name,
  before: `${item.before.score}% ${item.before.status}`,
  after: `${item.after.score}% ${item.after.status}`,
  rms: `${item.after.rmsDb.toFixed(1)} dB`,
  peak: `${item.after.peakDb.toFixed(1)} dB`,
  polish: item.plan.intensity,
  notes: item.issues.map((issue) => issue.text).join(", ") || "stable"
})));
console.table(directorSuite.results.map((item) => ({
  status: item.status,
  source: item.sourceProfile.name,
  target: directorSuite.target,
  before: `${item.before.score}% ${item.before.status}`,
  after: `${item.after.score}% ${item.after.status}`,
  opt: item.plan.optimization ? `${item.plan.optimization.scoreBefore}->${item.plan.optimization.scoreAfter}` : "off",
  rms: `${item.after.rmsDb.toFixed(1)} dB`,
  peak: `${item.after.peakDb.toFixed(1)} dB`,
  notes: item.issues.map((issue) => issue.text).join(", ") || "stable"
})));
console.log(JSON.stringify({
  ok: suite.ok && polishSuite.ok && directorSuite.ok,
  counts: suite.counts,
  studioPolish: polishSuite.counts,
  directorPolish: directorSuite.counts,
  elapsedMs: Number(suite.elapsedMs.toFixed(1)),
  realtimeFactor: Number(suite.realtimeFactor.toFixed(3)),
  studioPolishRealtimeFactor: Number(polishSuite.realtimeFactor.toFixed(3)),
  directorPolishRealtimeFactor: Number(directorSuite.realtimeFactor.toFixed(3))
}, null, 2));

if (!suite.ok || !polishSuite.ok || !directorSuite.ok) process.exitCode = 1;

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}
