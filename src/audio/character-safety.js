import { clamp, normalizeParams } from "./dsp-core.js";

export function applyCharacterSafety(rawParams = {}, {
  sourceProfile = {},
  source = null,
  target = null
} = {}) {
  const params = normalizeParams(rawParams);
  const original = { ...params };
  const sourceStudio = source?.studioAnalysis || null;
  const scores = sourceStudio?.problemScores || {};
  const creative = params.robot > 35 || params.creature > 35;
  const limits = characterLimits(sourceProfile, params, creative);
  const moves = [];

  clampParam(params, moves, "pitch", limits.pitchMin, limits.pitchMax, "Keep pitch shift inside a natural voice range.");
  clampParam(params, moves, "formant", limits.formantMin, limits.formantMax, "Keep formant-like mouth shift inside a natural voice range.");
  limitPitchFormantSpread(params, moves, creative ? 7.5 : 5.2);

  if (!creative && (scores.sibilance || 0) > 42) {
    clampParam(params, moves, "air", -100, 34, "Sibilant sources need less added air before character color.");
    raiseParam(params, moves, "deEss", 64, "Sibilant sources need stronger de-ess after character color.");
  }
  if (!creative && (scores.harsh || 0) > 42) {
    clampParam(params, moves, "presence", -100, 24, "Harsh sources need restrained presence boost.");
    clampParam(params, moves, "saturation", 0, 12, "Harsh sources break quickly when saturation is stacked.");
  }
  if (!creative && (scores.mouthClick || 0) > 54) {
    raiseParam(params, moves, "consonantSoftness", 42, "Mouth-click-heavy sources need softer consonant edges.");
  }
  if (!creative && sourceProfile.breathyOrNoisy) {
    clampParam(params, moves, "breath", 0, 66, "Noisy or breathy sources should not receive unlimited added breath.");
    clampParam(params, moves, "whisper", 0, 34, "Whisper blend can expose source noise and mouth artifacts.");
  }

  const score = safetyScore(original, params, sourceProfile, scores, creative);
  return {
    enabled: true,
    status: moves.length ? "guarded" : "clear",
    score,
    creative,
    target: target ? {
      id: target.id || "",
      name: target.name || target.label || ""
    } : null,
    limits,
    params,
    moves
  };
}

export function characterSafetySummary(plan = null) {
  if (!plan?.enabled) return "Character safety off";
  if (!plan.moves?.length) return "Character safety clear";
  return plan.moves.slice(0, 3).map((move) => `${move.label} ${formatDelta(move.before, move.after)}`).join(" / ");
}

function characterLimits(profile = {}, params = {}, creative = false) {
  const range = profile.range || "unknown";
  const brightTarget = params.pitch > 0.5 || params.formant > 0.5 || params.cuteness > 35 || params.anime > 35;
  const lowTarget = params.pitch < -0.5 || params.formant < -0.5 || params.body > 35;
  let pitchMin = creative ? -9.5 : -6.5;
  let pitchMax = creative ? 9.5 : 6.5;
  let formantMin = creative ? -9 : -6.25;
  let formantMax = creative ? 9 : 6.25;

  if (!creative && range === "low" && brightTarget) {
    pitchMax = 5.75;
    formantMax = 5.5;
  }
  if (!creative && range === "high" && lowTarget) {
    pitchMin = -5.25;
    formantMin = -5.4;
  }
  if (!creative && profile.breathyOrNoisy) {
    pitchMax = Math.min(pitchMax, 5.8);
    pitchMin = Math.max(pitchMin, -5.8);
    formantMax = Math.min(formantMax, 5.6);
    formantMin = Math.max(formantMin, -5.6);
  }

  return { pitchMin, pitchMax, formantMin, formantMax };
}

function clampParam(params, moves, key, min, max, reason) {
  const before = Number(params[key] || 0);
  const after = clamp(before, min, max);
  if (Math.abs(after - before) < 0.001) return;
  params[key] = after;
  moves.push({ key, label: paramLabel(key), before, after, reason });
}

function raiseParam(params, moves, key, min, reason) {
  const before = Number(params[key] || 0);
  const after = Math.max(before, min);
  if (Math.abs(after - before) < 0.001) return;
  params[key] = after;
  moves.push({ key, label: paramLabel(key), before, after, reason });
}

function limitPitchFormantSpread(params, moves, maxSpread) {
  const pitch = Number(params.pitch || 0);
  const formant = Number(params.formant || 0);
  const spread = Math.abs(pitch - formant);
  if (spread <= maxSpread) return;
  const direction = Math.sign(formant - pitch) || 1;
  const before = formant;
  const after = pitch + direction * maxSpread;
  params.formant = after;
  moves.push({
    key: "formant",
    label: paramLabel("formant"),
    before,
    after,
    reason: "Pitch and formant-like shift should not diverge too far for speech."
  });
}

function safetyScore(original, params, profile, scores, creative) {
  const spread = Math.abs(Number(params.pitch || 0) - Number(params.formant || 0));
  let penalty = spread * 3;
  if (!creative && Math.abs(params.pitch) > 5.5) penalty += (Math.abs(params.pitch) - 5.5) * 7;
  if (!creative && Math.abs(params.formant) > 5.5) penalty += (Math.abs(params.formant) - 5.5) * 7;
  if ((scores.sibilance || 0) > 42 && params.air > 42) penalty += (params.air - 42) * 0.6;
  if (profile.breathyOrNoisy && params.breath > 66) penalty += (params.breath - 66) * 0.45;
  const intervention = Object.keys(params).reduce((sum, key) => {
    const after = Number(params[key]);
    const before = Number(original[key]);
    if (!Number.isFinite(after) || !Number.isFinite(before)) return sum;
    return sum + Math.min(8, Math.abs(after - before) * 0.5);
  }, 0);
  return Math.round(clamp(100 - penalty + intervention * 0.2, 0, 100));
}

function paramLabel(key) {
  return ({
    pitch: "Pitch",
    formant: "Formant",
    air: "Air",
    deEss: "De-ess",
    presence: "Presence",
    saturation: "Saturation",
    consonantSoftness: "Consonants",
    breath: "Breath",
    whisper: "Whisper"
  })[key] || key;
}

function formatDelta(before, after) {
  const b = Number(before || 0).toFixed(Math.abs(before) < 10 ? 1 : 0);
  const a = Number(after || 0).toFixed(Math.abs(after) < 10 ? 1 : 0);
  return `${b}->${a}`;
}
