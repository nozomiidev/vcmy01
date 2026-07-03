import { runReferenceQualitySuite } from "../src/audio/dsp-core.js";
import { runStudioPolishQualitySuite } from "../src/audio/studio-polish.js";
import { applyCharacterSafety, characterSafetySummary } from "../src/audio/character-safety.js";
import { paramsForPreset } from "../src/audio/presets.js";

const suite = runReferenceQualitySuite({ duration: 0.52 });
const polishSuite = runStudioPolishQualitySuite({ duration: 0.52 });
const directorSuite = runStudioPolishQualitySuite({ duration: 0.36, target: "kawaii", optimize: true });
const safetySuite = runCharacterSafetyAudit();

const rows = suite.results.map((item) => ({
  status: item.status,
  source: item.sourceProfile?.name || "Reference",
  preset: item.name,
  rtx: item.realtimeFactor.toFixed(2),
  rms: `${item.analysis.rmsDb.toFixed(1)} dB`,
  peak: `${item.analysis.peakDb.toFixed(1)} dB`,
  lufs: `${item.analysis.integratedLufs.toFixed(1)} LUFS`,
  tp: `${item.analysis.truePeakDb.toFixed(1)} dBTP`,
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
  lufs: `${item.after.integratedLufs.toFixed(1)} LUFS`,
  tp: `${item.after.truePeakDb.toFixed(1)} dBTP`,
  polish: item.plan.intensity,
  micro: `${item.plan.microRepair?.eventCount || 0} ev`,
  fft: `${Math.round(item.after.spectral?.centroidHz || 0)}/${Math.round(item.after.spectral?.rolloff85Hz || 0)}Hz`,
  tone: item.plan.toneSurgery?.summary || "none",
  repair: item.plan.repairMap?.topIssue?.label || "none",
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
  lufs: `${item.after.integratedLufs.toFixed(1)} LUFS`,
  tp: `${item.after.truePeakDb.toFixed(1)} dBTP`,
  micro: `${item.plan.microRepair?.eventCount || 0} ev`,
  fft: `${Math.round(item.after.spectral?.centroidHz || 0)}/${Math.round(item.after.spectral?.rolloff85Hz || 0)}Hz`,
  tone: item.plan.toneSurgery?.summary || "none",
  repair: item.plan.repairMap?.topIssue?.label || "none",
  notes: item.issues.map((issue) => issue.text).join(", ") || "stable"
})));
console.table(safetySuite.results.map((item) => ({
  status: item.status,
  case: item.id,
  score: item.score,
  moves: item.moveCount,
  summary: item.summary
})));
console.log(JSON.stringify({
  ok: suite.ok && polishSuite.ok && directorSuite.ok && safetySuite.ok,
  counts: suite.counts,
  studioPolish: polishSuite.counts,
  directorPolish: directorSuite.counts,
  characterSafety: safetySuite.counts,
  elapsedMs: Number(suite.elapsedMs.toFixed(1)),
  realtimeFactor: Number(suite.realtimeFactor.toFixed(3)),
  studioPolishRealtimeFactor: Number(polishSuite.realtimeFactor.toFixed(3)),
  directorPolishRealtimeFactor: Number(directorSuite.realtimeFactor.toFixed(3))
}, null, 2));

if (!suite.ok || !polishSuite.ok || !directorSuite.ok || !safetySuite.ok) process.exitCode = 1;

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function runCharacterSafetyAudit() {
  const cases = [
    {
      id: "low-to-kawaii",
      params: paramsForPreset("kawaii", { pitch: 10, formant: -8, air: 82, breath: 94, whisper: 62 }),
      sourceProfile: { range: "low", breathyOrNoisy: true },
      source: { studioAnalysis: { problemScores: { sibilance: 70, harsh: 58, mouthClick: 66 } } }
    },
    {
      id: "high-to-ikemen",
      params: paramsForPreset("ikemen", { pitch: -9, formant: 5, presence: 64, saturation: 46 }),
      sourceProfile: { range: "high", breathyOrNoisy: false },
      source: { studioAnalysis: { problemScores: { sibilance: 22, harsh: 62, mouthClick: 18 } } }
    },
    {
      id: "creative-creature",
      params: paramsForPreset("creature", { pitch: -8.5, formant: -8.75, creature: 74 }),
      sourceProfile: { range: "medium", breathyOrNoisy: false },
      source: { studioAnalysis: { problemScores: { sibilance: 18, harsh: 28, mouthClick: 10 } } }
    }
  ];
  const results = cases.map((item) => {
    const plan = applyCharacterSafety(item.params, item);
    return {
      id: item.id,
      status: plan.status,
      score: plan.score,
      moveCount: plan.moves.length,
      summary: characterSafetySummary(plan),
      ok: item.id === "creative-creature" ? plan.score >= 70 : plan.status === "guarded" && plan.moves.length > 0
    };
  });
  const counts = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, { clear: 0, guarded: 0 });
  return {
    ok: results.every((item) => item.ok),
    counts,
    results
  };
}
