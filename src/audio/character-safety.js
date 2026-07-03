import { clamp, normalizeParams } from "./dsp-core.js";

export function applyCharacterSafety(rawParams = {}, {
  sourceProfile = {},
  source = null,
  target = null
} = {}) {
  const params = normalizeParams(rawParams);
  const original = { ...params };
  const sourceStudio = source?.studioAnalysis || null;
  const scores = characterToneEvidence(sourceStudio);
  const creative = params.robot > 35 || params.creature > 35;
  const limits = characterLimits(sourceProfile, params, creative);
  const moves = [];
  const brightCharacter = params.pitch > 1 || params.formant > 1 || params.cuteness > 35 || params.anime > 35;
  const bodyCharacter = params.pitch < -0.5 || params.formant < -0.5 || params.body > 35;

  clampParam(params, moves, "pitch", limits.pitchMin, limits.pitchMax, "Keep pitch shift inside a natural voice range.");
  clampParam(params, moves, "formant", limits.formantMin, limits.formantMax, "Keep formant-like mouth shift inside a natural voice range.");
  const identityRisk = guardIdentityCoupling(params, moves, { creative, target });
  limitPitchFormantSpread(params, moves, creative ? 7.5 : 5.2);

  if (!creative && (scores.sibilance || 0) > 42) {
    clampParam(params, moves, "air", -100, 34, "Sibilant sources need less added air before character color.");
    raiseParam(params, moves, "deEss", 64, "Sibilant sources need stronger de-ess after character color.");
  }
  if (!creative && (scores.harsh || 0) > 42) {
    clampParam(params, moves, "presence", -100, 24, "Harsh sources need restrained presence boost.");
    clampParam(params, moves, "saturation", 0, 12, "Harsh sources break quickly when saturation is stacked.");
  }
  if (!creative && brightCharacter && (scores.nasal || 0) > 46) {
    clampParam(params, moves, "formant", limits.formantMin, Math.min(limits.formantMax, 4.45), "Nasal LPC/ERB crowding should not be pushed into a smaller, pinched mouth.");
    raiseParam(params, moves, "consonantSoftness", 46, "Nasal bright targets need softer consonants to avoid pinched anime artifacts.");
  }
  if (!creative && brightCharacter && (scores.sibilance || 0) > 38) {
    clampParam(params, moves, "air", -100, 30, "Bright ERB/sibilance evidence needs less added air before character color.");
    raiseParam(params, moves, "deEss", 68, "Bright character targets need stronger de-ess when the source is already sharp.");
  }
  if (!creative && bodyCharacter && (scores.mud || 0) > 52) {
    clampParam(params, moves, "body", -100, 54, "Muddy sources should not receive unlimited chest/body reinforcement.");
  }
  if (!creative && (scores.mouthClick || 0) > 54) {
    raiseParam(params, moves, "consonantSoftness", 42, "Mouth-click-heavy sources need softer consonant edges.");
  }
  if (!creative && sourceProfile.breathyOrNoisy) {
    clampParam(params, moves, "breath", 0, 66, "Noisy or breathy sources should not receive unlimited added breath.");
    clampParam(params, moves, "whisper", 0, 34, "Whisper blend can expose source noise and mouth artifacts.");
  }

  const score = safetyScore(original, params, sourceProfile, scores, creative, identityRisk);
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
    evidence: {
      mud: Math.round(scores.mud || 0),
      nasal: Math.round(scores.nasal || 0),
      harsh: Math.round(scores.harsh || 0),
      sibilance: Math.round(scores.sibilance || 0),
      perceptualRisk: scores.perceptualRisk || "",
      identityRisk
    },
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

function guardIdentityCoupling(params, moves, {
  creative = false,
  target = null
} = {}) {
  if (creative) return "";
  const targetKey = `${target?.id || ""} ${target?.name || target?.label || ""}`.toLowerCase();
  if (/robot|creature|monster|vocoder|anonymous|witness|suspect/.test(targetKey)) return "";

  let risk = "";
  const pitch = Number(params.pitch || 0);
  const formant = Number(params.formant || 0);
  const pitchAbs = Math.abs(pitch);
  const formantAbs = Math.abs(formant);
  const split = Math.abs(pitch - formant);
  const opposedStrongly = pitch * formant < 0 && Math.min(pitchAbs, formantAbs) >= 2.2 && split > 4.4;

  if (opposedStrongly) {
    const before = formant;
    const after = clamp(pitch * 0.38, -4.2, 4.2);
    params.formant = after;
    moves.push({
      key: "formant",
      label: paramLabel("formant"),
      before,
      after,
      reason: "Avoid witness-anonymizer pitch/formant split; keep vocal-tract cues coupled to the human pitch move."
    });
    risk = "opposed-pitch-formant";
  }

  const lowHumanTarget = /ikemen|deep|bass|baritone|narrator|intimate/.test(targetKey);
  if (!lowHumanTarget && Number(params.pitch || 0) < -4.8 && Number(params.formant || 0) < -4.8 && Number(params.body || 0) > 62) {
    clampParam(params, moves, "body", -100, 58, "Deep pitch/formant shifts need restrained body to avoid masked-anonymous coloration.");
    risk = risk ? `${risk},deep-mask` : "deep-mask";
  }

  return risk;
}

function safetyScore(original, params, profile, scores, creative, identityRisk = "") {
  const spread = Math.abs(Number(params.pitch || 0) - Number(params.formant || 0));
  let penalty = spread * 3;
  if (!creative && Math.abs(params.pitch) > 5.5) penalty += (Math.abs(params.pitch) - 5.5) * 7;
  if (!creative && Math.abs(params.formant) > 5.5) penalty += (Math.abs(params.formant) - 5.5) * 7;
  if (!creative && identityRisk) penalty += identityRisk.includes("deep-mask") ? 14 : 10;
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

function characterToneEvidence(sourceStudio = null) {
  const base = { ...(sourceStudio?.problemScores || {}) };
  const spectral = sourceStudio?.spectral || {};
  const risks = spectral.risks || {};
  const envelope = spectral.envelope || {};
  const perceptual = spectral.perceptual || {};
  const crowding = perceptual.crowding || null;
  const out = {
    ...base,
    mud: Math.max(base.mud || 0, risks.mud || 0),
    nasal: Math.max(base.nasal || 0, risks.nasal || 0, envelopePeakRisk(envelope, 650, 1300)),
    harsh: Math.max(base.harsh || 0, risks.harsh || 0, envelopePeakRisk(envelope, 2500, 4500)),
    sibilance: Math.max(base.sibilance || 0, risks.sibilance || 0)
  };
  if (crowding?.risk && crowding.score > 44) {
    const key = crowding.risk === "presence" ? "harsh" : crowding.risk;
    out[key] = Math.max(out[key] || 0, crowding.score);
    out.perceptualRisk = `${crowding.risk}:${Math.round(crowding.band?.centerHz || 0)}Hz`;
  }
  return out;
}

function envelopePeakRisk(envelope, lowHz, highHz) {
  const peaks = Array.isArray(envelope?.peaks) ? envelope.peaks : [];
  const peak = peaks
    .filter((item) => item.hz >= lowHz && item.hz <= highHz)
    .sort((a, b) => (b.prominenceDb || 0) - (a.prominenceDb || 0))[0];
  return peak ? clamp((peak.prominenceDb || 0) * 16, 0, 100) : 0;
}

function paramLabel(key) {
  return ({
    pitch: "Pitch",
    formant: "Formant",
    body: "Body",
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
