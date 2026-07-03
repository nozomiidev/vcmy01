import { clamp } from "./dsp-core.js";
import { DIRECTOR_DEFS, MACRO_DEFS, PARAM_DEFS } from "./presets.js";
import { lineReadById, targetMatchBreakdown } from "./performance-targets.js";

const PARAM_LIMITS = new Map(
  [...MACRO_DEFS, ...DIRECTOR_DEFS, ...PARAM_DEFS].map((def) => [def.key, def])
);

export function buildKeeperRefinement(decision = null, currentParams = {}, targetOrId = null) {
  const winner = decision?.winner || decision?.candidate || null;
  if (!winner) {
    return {
      status: "waiting",
      score: 0,
      winnerId: null,
      winnerLabel: "No keeper",
      params: { ...(currentParams || {}) },
      patch: [],
      cards: [],
      summary: "No keeper"
    };
  }
  const qcHold = !decision?.winner && !!decision?.candidate;

  const target = resolveTarget(targetOrId);
  const baseParams = { ...(winner.baseParams || winner.params || currentParams || {}) };
  const targetCard = targetRefinement(baseParams, target, evidenceScore(winner, "target"));
  const scriptCard = scriptRefinement(winner.scriptMatch, evidenceScore(winner, "script"));
  const safetyCard = safetyRefinement(winner.review, evidenceScore(winner, "safety"));
  const cards = qcHold
    ? [safetyCard, scriptCard, targetCard]
    : [targetCard, scriptCard, safetyCard];
  const moves = mergeMoves(cards.flatMap((card) => card.moves));
  const applied = applyMoves(baseParams, moves);
  const patch = paramsMatch(currentParams, applied.params, applied.patch)
    ? []
    : applied.patch;
  const status = patch.length
    ? decisionStatus(Math.min(decision?.score || 0, ...cards.map((card) => card.score)))
    : qcHold
      ? "risk"
    : "ready";

  return {
    status,
    score: decision?.score || 0,
    winnerId: winner.id,
    winnerLabel: qcHold ? `${winner.label || "Take"} QC candidate` : winner.label || "Keeper",
    params: applied.params,
    patch,
    cards: cards.map((card) => ({
      id: card.id,
      label: card.label,
      status: card.status,
      score: card.score,
      summary: card.summary,
      patchCount: card.moves.length
    })),
    summary: patch.length
      ? `${patch.length} ${qcHold ? "QC repair moves" : "keeper moves"}`
      : qcHold
        ? "QC hold"
        : "Keeper locked"
  };
}

function targetRefinement(baseParams, target, score) {
  const gaps = targetMatchBreakdown(baseParams, target)
    .filter((axis) => axis.targeted && axis.action !== "hold" && Math.abs(axis.delta) >= 2)
    .sort((a, b) => b.normalizedGap - a.normalizedGap)
    .slice(0, 3);
  const moves = gaps.map((axis) => ({
    key: axis.key,
    delta: axis.delta * 0.45,
    group: "Target",
    reason: `${axis.fullLabel} toward ${target.name}`
  }));
  return card({
    id: "target",
    label: "Target",
    score,
    summary: moves.length ? `${moves.length} axis corrections` : "Target axes locked",
    moves
  });
}

function scriptRefinement(scriptMatch, score) {
  const moves = [];
  if (!scriptMatch?.items?.length) {
    if (score < 84) {
      moves.push(
        move("prosody", 8, "Script", "Restore planned motion"),
        move("phraseLift", 6, "Script", "Restore planned motion"),
        move("compression", 4, "Script", "Hold automation shape")
      );
    }
  } else if (scriptMatch.plannedOnly) {
    moves.push(
      move("prosody", 6, "Script", "Render against the planned script"),
      move("phraseLift", 4, "Script", "Render against the planned script")
    );
  } else {
    for (const item of scriptMatch.items) {
      if (item.status === "ready" || !Number.isFinite(item.expected) || !Number.isFinite(item.actual)) continue;
      addScriptMoves(moves, item);
    }
  }
  return card({
    id: "script",
    label: "Script",
    score,
    summary: moves.length ? `${moves.length} performance moves` : "Script motion locked",
    moves: moves.slice(0, 8)
  });
}

function safetyRefinement(review, score) {
  const moves = [];
  if (score < 86 || review?.status === "check" || review?.status === "risk") {
    const intensity = score < 70 ? 1.25 : 1;
    moves.push(
      move("outputGain", -1.1 * intensity, "Safety", "Restore peak headroom"),
      move("compression", 6 * intensity, "Safety", "Control level movement"),
      move("deEss", 7 * intensity, "Safety", "Tame harsh tails"),
      move("lowCut", 10 * intensity, "Safety", "Clean low rumble")
    );
    if (score < 76) {
      moves.push(
        move("air", -4, "Safety", "Reduce noisy sheen"),
        move("saturation", -3, "Safety", "Reduce edge buildup")
      );
    }
    addComfortMoves(moves, review, intensity);
  }
  return card({
    id: "safety",
    label: "Safety",
    score,
    summary: moves.length ? `${moves.length} mix guard moves` : "Mix guard locked",
    moves
  });
}

function addComfortMoves(moves, review, intensity = 1) {
  const issues = comfortIssueIds(review);
  if (!issues.size) return;
  if (issues.has("micro")) {
    moves.push(
      move("consonantSoftness", 8 * intensity, "Comfort", "Smooth mouth/transient QC"),
      move("deEss", 4 * intensity, "Comfort", "Catch clicky high edges"),
      move("air", -3 * intensity, "Comfort", "Reduce distracting mouth sheen"),
      move("saturation", -2 * intensity, "Comfort", "Reduce transient edge buildup")
    );
  }
  if (issues.has("sibilance") || issues.has("harshness")) {
    moves.push(
      move("deEss", 8 * intensity, "Comfort", "Reduce sibilance and harshness"),
      move("presence", -5 * intensity, "Comfort", "Ease painful presence focus"),
      move("air", -4 * intensity, "Comfort", "Avoid high-band fatigue"),
      move("brightness", -3 * intensity, "Comfort", "Soften bright balance")
    );
  }
  if (issues.has("nasal")) {
    moves.push(
      move("mouth", -4 * intensity, "Comfort", "Reduce boxed nasal focus"),
      move("presence", -3 * intensity, "Comfort", "Move nasal bite out of the foreground"),
      move("body", 3 * intensity, "Comfort", "Restore body under nasal concentration")
    );
  }
  if (issues.has("mud")) {
    moves.push(
      move("lowCut", 12 * intensity, "Comfort", "Clear low-mid buildup"),
      move("body", -5 * intensity, "Comfort", "Reduce muddy chest buildup"),
      move("compression", -3 * intensity, "Comfort", "Stop low-mid density from stacking")
    );
  }
  if (issues.has("loudness") || issues.has("true-peak")) {
    moves.push(
      move("outputGain", -1.5 * intensity, "Comfort", "Restore delivery headroom"),
      move("compression", 4 * intensity, "Comfort", "Hold loud peaks before export")
    );
  }
  if (issues.has("quiet")) {
    moves.push(
      move("outputGain", 1.2 * intensity, "Comfort", "Lift quiet speech after cleanup"),
      move("compression", 3 * intensity, "Comfort", "Keep quiet words intelligible")
    );
  }
  if (issues.has("flat")) {
    moves.push(
      move("compression", -7 * intensity, "Comfort", "Undo over-flattened dynamics"),
      move("deliveryEnergy", 4 * intensity, "Comfort", "Restore speech motion")
    );
  }
  if (issues.has("jumpy")) {
    moves.push(
      move("compression", 7 * intensity, "Comfort", "Control jumpy dynamics"),
      move("closeMic", -3 * intensity, "Comfort", "Reduce proximity jumps")
    );
  }
}

function comfortIssueIds(review) {
  const fromReasons = Array.isArray(review?.comfort?.reasons) ? review.comfort.reasons : [];
  const fromIssues = Array.isArray(review?.comfort?.issues)
    ? review.comfort.issues.map((item) => item.id)
    : [];
  return new Set([...fromReasons, ...fromIssues].map((id) => String(id || "").trim()).filter(Boolean));
}

function addScriptMoves(moves, item) {
  const miss = item.expected - item.actual;
  if (item.id === "lift") {
    const amount = clamp(miss / 150, -1, 1);
    moves.push(
      move("phraseLift", amount * 11, "Script", "Match phrase lift"),
      move("prosody", amount * 8, "Script", "Match phrase lift"),
      move("pitch", amount * 0.35, "Script", "Match phrase lift")
    );
  } else if (item.id === "release") {
    const amount = clamp(-miss / 130, -1, 1);
    moves.push(
      move("endingSoftness", amount * 12, "Script", "Match tail release"),
      move("romanticBreath", amount * 7, "Script", "Match tail release"),
      move("consonantSoftness", amount * 5, "Script", "Match tail release")
    );
  } else if (item.id === "breath") {
    const amount = clamp(miss / 1100, -1, 1);
    moves.push(
      move("romanticBreath", amount * 12, "Script", "Match tail air"),
      move("breath", amount * 8, "Script", "Match tail air"),
      move("whisper", amount * 5, "Script", "Match tail air"),
      move("deEss", Math.max(0, -amount) * 8, "Script", "Clean excess tail air")
    );
  } else if (item.id === "energy") {
    const amount = clamp(miss / 7, -1, 1);
    moves.push(
      move("deliveryEnergy", amount * 10, "Script", "Match delivery motion"),
      move("presence", amount * 6, "Script", "Match delivery motion"),
      move("compression", Math.abs(amount) * 4, "Script", "Hold delivery motion")
    );
  } else if (item.id === "coverage") {
    const amount = clamp(miss / 0.08, -1, 1);
    moves.push(
      move("deliveryEnergy", amount * 6, "Script", "Match phrase coverage"),
      move("compression", Math.abs(amount) * 4, "Script", "Hold phrase coverage")
    );
  }
}

function move(key, delta, group, reason) {
  return { key, delta, group, reason };
}

function card({ id, label, score, summary, moves }) {
  return {
    id,
    label,
    score,
    status: decisionStatus(score),
    summary,
    moves: moves.filter((item) => Math.abs(item.delta) >= 0.05)
  };
}

function mergeMoves(moves) {
  const merged = new Map();
  for (const item of moves) {
    if (!PARAM_LIMITS.has(item.key)) continue;
    const current = merged.get(item.key) || { key: item.key, delta: 0, groups: new Set(), reasons: [] };
    current.delta += item.delta;
    current.groups.add(item.group);
    if (!current.reasons.includes(item.reason)) current.reasons.push(item.reason);
    merged.set(item.key, current);
  }
  return [...merged.values()].map((item) => ({
    key: item.key,
    delta: item.delta,
    group: [...item.groups].join(" + "),
    reason: item.reasons.slice(0, 2).join(" / ")
  }));
}

function applyMoves(baseParams, moves) {
  const params = { ...baseParams };
  const patch = [];
  for (const item of moves) {
    const before = Number(params[item.key] ?? 0);
    const after = limitParam(item.key, before + item.delta);
    if (Math.abs(after - before) < 0.05) continue;
    params[item.key] = after;
    patch.push({
      key: item.key,
      before,
      after,
      delta: after - before,
      group: item.group,
      reason: item.reason
    });
  }
  return { params, patch };
}

function paramsMatch(currentParams = {}, nextParams = {}, patch = []) {
  if (!patch.length) return false;
  return patch.every((item) => Math.abs(Number(currentParams[item.key] ?? 0) - Number(nextParams[item.key] ?? 0)) < 0.05);
}

function evidenceScore(winner, id) {
  const item = winner.items?.find((candidate) => candidate.id === id);
  return Number.isFinite(item?.score) ? item.score : 0;
}

function resolveTarget(targetOrId) {
  if (!targetOrId) return lineReadById("studio_check");
  return typeof targetOrId === "string" ? lineReadById(targetOrId) : targetOrId;
}

function limitParam(key, value) {
  const def = PARAM_LIMITS.get(key);
  if (!def) return Number.isFinite(value) ? value : 0;
  return clamp(value, def.min, def.max);
}

function decisionStatus(score) {
  if (score >= 86) return "ready";
  if (score >= 70) return "check";
  return "risk";
}
