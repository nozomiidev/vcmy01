import { clamp } from "./dsp-core.js";
import { lineReadById, targetMatchBreakdown } from "./performance-targets.js";

export const SCRIPT_LANES = Object.freeze([
  { id: "lift", label: "Lift", key: "phraseLift", traceKey: "phraseLiftCents", unit: "ct" },
  { id: "energy", label: "Energy", key: "deliveryEnergy", traceKey: "energyRangeDb", unit: "dB" },
  { id: "distance", label: "Distance", key: "closeMic", traceKey: null, unit: "%" },
  { id: "breath", label: "Breath", key: "romanticBreath", traceKey: "tailTexture", unit: "/s" },
  { id: "release", label: "Release", key: "endingSoftness", traceKey: "endingDropCents", unit: "ct" }
]);

export function buildPerformanceScript(targetOrId, params = {}) {
  const target = typeof targetOrId === "string" ? lineReadById(targetOrId) : targetOrId;
  const values = scriptValues(target, params);
  const durationSec = estimateReadDuration(target);
  const phases = scriptPhases(target, values, durationSec);
  const lanes = SCRIPT_LANES.map((lane) => scriptLane(lane, values, durationSec));
  const cues = scriptCues(target, values, lanes);
  const score = scriptScore(target, values, lanes, cues);
  return {
    id: `script-${target.id}`,
    targetId: target.id,
    targetName: target.name,
    presetId: target.presetId,
    sceneKitId: target.sceneKitId || null,
    sceneBeatId: target.sceneBeatId || null,
    durationSec,
    score,
    status: score >= 86 ? "ready" : score >= 70 ? "check" : "risk",
    phases,
    lanes,
    cues,
    values,
    target
  };
}

export function compareScriptToPerformance(script = null, comparison = null) {
  if (!script) return null;
  if (!comparison?.deltas) {
    return {
      score: script.score,
      status: script.status,
      items: plannedScriptItems(script),
      plannedOnly: true
    };
  }

  const items = [
    scoreMove("lift", "Lift", expectedLiftCents(script.values), comparison.deltas.phraseLiftCents, "Phrase lift against the planned arc."),
    scoreMove("release", "Release", -expectedReleaseCents(script.values), comparison.deltas.endingDropCents, "Falling tail against the planned release."),
    scoreMove("breath", "Tail Air", expectedTailAir(script.values), comparison.deltas.tailTexture, "Breath/frication against the planned tail."),
    scoreMove("energy", "Motion", expectedEnergyDb(script.values), comparison.deltas.energyRangeDb, "Delivery motion against the planned intensity."),
    scoreCoverage(script, comparison.deltas.activeRatio)
  ];
  const score = Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
  return {
    score,
    status: score >= 84 ? "ready" : score >= 68 ? "check" : "risk",
    items,
    plannedOnly: false
  };
}

function scriptValues(target, params) {
  const breakdown = targetMatchBreakdown(params, target);
  const valueFor = (key) => {
    const axis = breakdown.find((item) => item.key === key);
    return Number(axis?.target ?? target.params?.[key] ?? params?.[key] ?? 0);
  };
  return {
    phraseLift: valueFor("phraseLift"),
    endingSoftness: valueFor("endingSoftness"),
    deliveryEnergy: valueFor("deliveryEnergy"),
    closeMic: valueFor("closeMic"),
    romanticBreath: valueFor("romanticBreath"),
    confidence: valueFor("confidence"),
    cuteness: valueFor("cuteness"),
    anime: valueFor("anime"),
    intimacy: valueFor("intimacy"),
    body: valueFor("body"),
    breath: valueFor("breath"),
    consonantSoftness: valueFor("consonantSoftness"),
    whisper: Number(target.params?.whisper ?? params?.whisper ?? 0)
  };
}

function estimateReadDuration(target) {
  const text = `${target.line || ""} ${target.direction || ""}`;
  const wordCount = (target.line || "").trim().split(/\s+/).filter(Boolean).length;
  const commaPauses = (target.line || "").split(/[,:;]/).length - 1;
  const sentencePauses = (target.line || "").split(/[.!?]/).length - 1;
  const intimacySlowdown = (Number(target.params?.closeMic || 0) + Number(target.params?.endingSoftness || 0)) / 260;
  const energeticTrim = Number(target.params?.deliveryEnergy || 0) > 72 ? -0.18 : 0;
  const punctuation = commaPauses * 0.12 + sentencePauses * 0.18;
  const base = wordCount * (0.22 + intimacySlowdown * 0.08) + punctuation + energeticTrim;
  return round1(clamp(base || text.length * 0.035, 1.4, 5.8));
}

function scriptPhases(target, values, durationSec) {
  const soft = values.endingSoftness >= 72 || values.romanticBreath >= 72;
  const playful = values.cuteness >= 70 || values.anime >= 70;
  const low = values.body >= 70 && values.deliveryEnergy <= 55;
  return [
    {
      id: "entry",
      label: "Entry",
      range: [0, round1(durationSec * 0.18)],
      intent: low ? "land close and restrained" : playful ? "small bright pickup" : "set the mouth shape"
    },
    {
      id: "rise",
      label: "Rise",
      range: [round1(durationSec * 0.18), round1(durationSec * 0.48)],
      intent: values.phraseLift >= 60 ? "carry the phrase upward" : "keep the arc controlled"
    },
    {
      id: "hold",
      label: "Hold",
      range: [round1(durationSec * 0.48), round1(durationSec * 0.74)],
      intent: values.confidence >= 72 ? "hold intent steady" : "leave emotional room"
    },
    {
      id: "release",
      label: "Release",
      range: [round1(durationSec * 0.74), durationSec],
      intent: soft ? "soft breath-tail release" : "clean final landing"
    }
  ];
}

function scriptLane(lane, values, durationSec) {
  const value = laneValue(lane.id, values);
  const start = laneStart(lane.id, value, values);
  const peak = lanePeak(lane.id, value, values);
  const tail = laneTail(lane.id, value, values);
  const points = [
    { t: 0, value: start },
    { t: round1(durationSec * 0.32), value: peak },
    { t: round1(durationSec * 0.72), value: lane.id === "release" ? peak : Math.max(start, peak * 0.86) },
    { t: durationSec, value: tail }
  ];
  return {
    ...lane,
    value,
    score: Math.round(value * 100),
    points,
    summary: laneSummary(lane.id, values)
  };
}

function laneValue(id, values) {
  if (id === "lift") return clamp(values.phraseLift / 100, 0, 1);
  if (id === "energy") return clamp((values.deliveryEnergy * 0.72 + values.confidence * 0.28) / 100, 0, 1);
  if (id === "distance") return clamp((values.closeMic * 0.68 + values.intimacy * 0.32) / 100, 0, 1);
  if (id === "breath") return clamp((values.romanticBreath * 0.5 + values.breath * 0.32 + values.whisper * 0.18) / 100, 0, 1);
  if (id === "release") return clamp((values.endingSoftness * 0.74 + values.consonantSoftness * 0.26) / 100, 0, 1);
  return 0;
}

function laneStart(id, value, values) {
  if (id === "lift") return clamp(value * 0.38 + values.anime / 420, 0, 1);
  if (id === "energy") return clamp(value * 0.58, 0, 1);
  if (id === "distance") return clamp(value * 0.78, 0, 1);
  if (id === "breath") return clamp(value * 0.24, 0, 1);
  if (id === "release") return clamp(value * 0.34, 0, 1);
  return value;
}

function lanePeak(id, value, values) {
  if (id === "lift") return clamp(value + values.cuteness / 520, 0, 1);
  if (id === "energy") return clamp(value + values.confidence / 500, 0, 1);
  if (id === "distance") return clamp(value + values.closeMic / 620, 0, 1);
  if (id === "breath") return clamp(value * 0.74 + values.romanticBreath / 360, 0, 1);
  if (id === "release") return clamp(value * 0.84, 0, 1);
  return value;
}

function laneTail(id, value, values) {
  if (id === "lift") return clamp(value * (values.endingSoftness >= 70 ? 0.34 : 0.58), 0, 1);
  if (id === "energy") return clamp(value * (values.endingSoftness >= 70 ? 0.36 : 0.62), 0, 1);
  if (id === "distance") return clamp(value * 0.94, 0, 1);
  if (id === "breath") return clamp(value + values.endingSoftness / 360, 0, 1);
  if (id === "release") return clamp(value + values.romanticBreath / 420, 0, 1);
  return value;
}

function laneSummary(id, values) {
  if (id === "lift") return values.phraseLift >= 70 ? "clear upward phrase arc" : "controlled phrase contour";
  if (id === "energy") return values.deliveryEnergy >= 70 ? "forward delivery motion" : "restrained dynamics";
  if (id === "distance") return values.closeMic >= 72 ? "near-mic intimacy" : "open vocal distance";
  if (id === "breath") return values.romanticBreath >= 70 || values.whisper >= 30 ? "tail breath placement" : "clean low air";
  if (id === "release") return values.endingSoftness >= 72 ? "soft falling tail" : "firm landing";
  return "planned";
}

function scriptCues(target, values, lanes) {
  const cues = [];
  if (values.closeMic >= 76) cues.push("Keep the voice close and private.");
  if (values.body >= 70) cues.push("Carry body in the phrase center, not only a lower pitch.");
  if (values.phraseLift >= 72) cues.push("Shape an audible upward phrase gesture before the landing.");
  if (values.endingSoftness >= 74) cues.push("Let the ending fall and soften instead of cutting off.");
  if (values.romanticBreath >= 72 || values.whisper >= 30) cues.push("Place breath after the phrase tail, with consonants still readable.");
  if (values.consonantSoftness >= 70) cues.push("Round consonants so the read feels gentle.");
  if (values.deliveryEnergy >= 74) cues.push("Keep attack and level stable through the body.");
  if (values.confidence <= 35) cues.push("Leave vulnerability in the pause before the release.");
  if (target.sceneKitId) cues.push(`Treat this as the ${target.sceneBeatId} beat inside ${target.sceneName}.`);
  if (!cues.length) cues.push(lanes[0]?.summary || "Hold the target performance shape.");
  return cues.slice(0, 5);
}

function scriptScore(target, values, lanes, cues) {
  let score = 58;
  score += target.sceneKitId ? 12 : 6;
  score += target.line ? 8 : 0;
  score += target.direction ? 8 : 0;
  score += cues.length >= 4 ? 8 : cues.length * 2;
  score += lanes.filter((lane) => lane.score >= 34).length * 2;
  if (values.closeMic >= 70 && (values.romanticBreath >= 60 || values.body >= 60)) score += 5;
  if (values.phraseLift >= 70 && values.deliveryEnergy >= 55) score += 4;
  if (values.endingSoftness >= 70 && (values.breath >= 45 || values.consonantSoftness >= 60)) score += 5;
  return Math.round(clamp(score, 0, 100));
}

function plannedScriptItems(script) {
  return script.lanes.map((lane) => ({
    id: lane.id,
    label: lane.label,
    value: `${lane.score}%`,
    score: Math.max(60, Math.min(100, script.score - 4)),
    status: script.status,
    detail: lane.summary
  }));
}

function scoreMove(id, label, expected, actual, detail) {
  const tolerance = Math.max(8, Math.abs(expected) * 0.38);
  const target = expected;
  const miss = Math.abs(target - actual);
  const signOk = Math.abs(expected) < 1 || Math.sign(expected) === Math.sign(actual) || Math.abs(actual) < tolerance;
  const score = Math.round(clamp(100 - miss / Math.max(tolerance, Math.abs(expected), 1) * 48 - (signOk ? 0 : 24), 0, 100));
  return {
    id,
    label,
    value: formatExpectedActual(expected, actual),
    expected,
    actual,
    score,
    status: score >= 84 ? "ready" : score >= 66 ? "check" : "risk",
    detail
  };
}

function scoreCoverage(script, activeRatioDelta) {
  const expected = script.values.deliveryEnergy >= 70 ? 0.04 : script.values.endingSoftness >= 70 ? -0.02 : 0;
  const actual = Number(activeRatioDelta || 0);
  const miss = Math.abs(expected - actual);
  const score = Math.round(clamp(96 - miss * 240, 0, 100));
  return {
    id: "coverage",
    label: "Coverage",
    value: `${actual >= 0 ? "+" : ""}${Math.round(actual * 100)}%`,
    expected,
    actual,
    score,
    status: score >= 84 ? "ready" : score >= 66 ? "check" : "risk",
    detail: "Active material against the planned phrase density."
  };
}

function expectedLiftCents(values) {
  if (values.phraseLift < 18) return 0;
  return Math.round((values.phraseLift - 18) * 2.8 + values.anime * 0.55 + values.cuteness * 0.25);
}

function expectedReleaseCents(values) {
  if (values.endingSoftness < 18) return 0;
  return Math.round((values.endingSoftness - 18) * 2.2 + values.romanticBreath * 0.55);
}

function expectedTailAir(values) {
  return Math.round(values.romanticBreath * 16 + values.breath * 9 + values.whisper * 13);
}

function expectedEnergyDb(values) {
  return Number((values.deliveryEnergy * 0.085 + values.confidence * 0.035 - values.endingSoftness * 0.025).toFixed(1));
}

function formatExpectedActual(expected, actual) {
  const sign = (value) => value > 0 ? "+" : "";
  if (Math.abs(expected) > 80 || Math.abs(actual) > 80) return `${sign(actual)}${Math.round(actual)} / ${sign(expected)}${Math.round(expected)}`;
  return `${sign(actual)}${actual.toFixed(1)} / ${sign(expected)}${expected.toFixed(1)}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
