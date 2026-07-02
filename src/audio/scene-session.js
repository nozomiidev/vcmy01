import {
  SCENE_KITS,
  lineReadById,
  sceneBeatTargetsForKit,
  sceneKitById,
  sceneKitForTargetId,
  scoreLineReadTarget
} from "./performance-targets.js";
import { buildVoiceMemoryBoard } from "./voice-memory.js";

export const SCENE_SESSION_LIMITS = Object.freeze({
  readyTakeCount: 2,
  readyDesignScore: 82,
  readyTakeScore: 82
});

export function buildSceneSession(options = {}) {
  const activeTarget = lineReadById(options.activeLineReadId);
  const kit = resolveSceneKit(activeTarget, options.sceneKitId);
  const targets = sceneBeatTargetsForKit(kit.id);
  const snapshots = Array.isArray(options.snapshots) ? options.snapshots : [];
  const renderDeck = Array.isArray(options.renderDeck) ? options.renderDeck : [];
  const params = options.params || {};
  const takeDecision = options.takeDecision || null;
  const sourceReady = !!options.hasSource;
  const items = targets.map((target, index) => beatItem(target, index, {
    params,
    snapshots,
    renderDeck,
    activeTargetId: activeTarget.id,
    takeDecision
  }));
  const activeBeat = items.find((item) => item.active) || items[0] || null;
  const readyCount = items.filter((item) => item.status === "ready").length;
  const score = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
    : 0;
  const nextAction = sessionAction(items, activeBeat, sourceReady);
  return {
    kitId: kit.id,
    kitName: kit.name,
    description: kit.description,
    presetId: kit.presetId,
    activeTargetId: activeTarget.id,
    activeIndex: Math.max(0, items.findIndex((item) => item.active)),
    count: items.length,
    readyCount,
    score,
    status: sessionStatus(score, readyCount, items.length),
    items,
    activeBeat,
    nextAction,
    summary: `${readyCount}/${items.length} beats production-ready`
  };
}

export function sceneSessionSummary(session = null) {
  if (!session) {
    return {
      count: 0,
      readyCount: 0,
      score: 0,
      status: "waiting",
      summary: "No scene session"
    };
  }
  return {
    count: session.count,
    readyCount: session.readyCount,
    score: session.score,
    status: session.status,
    summary: session.summary,
    active: session.activeBeat?.label || null,
    nextAction: session.nextAction || null
  };
}

function beatItem(target, index, context) {
  const active = target.id === context.activeTargetId;
  const targetScore = scoreLineReadTarget(context.params, target);
  const memory = buildVoiceMemoryBoard(context.snapshots, context.params, target, { allowManualCapture: false });
  const takes = context.renderDeck.filter((item) => itemTargetsBeat(item, target));
  const bestTake = takes
    .map((item) => ({ item, score: takeScore(item, context.takeDecision, active) }))
    .sort((a, b) => b.score - a.score)[0] || null;
  const designScore = Math.max(active ? targetScore : 0, memory.best?.targetScore || 0);
  const takeEvidence = bestTake?.score || 0;
  const memoryReady = memory.items.some((item) =>
    item.sameTarget && item.targetScore >= SCENE_SESSION_LIMITS.readyDesignScore
  );
  const takeReady = takes.length >= SCENE_SESSION_LIMITS.readyTakeCount &&
    takeEvidence >= SCENE_SESSION_LIMITS.readyTakeScore;
  const score = Math.round(
    designScore * 0.4 +
    (memoryReady ? Math.max(memory.score, designScore) : memory.score * 0.65) * 0.24 +
    takeEvidence * 0.36
  );
  return {
    id: target.id,
    targetId: target.id,
    sceneKitId: target.sceneKitId || null,
    sceneBeatId: target.sceneBeatId || target.id,
    index,
    active,
    label: target.name,
    line: target.line,
    direction: target.direction,
    tags: target.tags || [],
    targetScore,
    memoryScore: memory.score,
    memoryCount: memory.items.filter((item) => item.sameTarget).length,
    bestMemoryId: memory.best?.sameTarget ? memory.best.id : null,
    bestMemoryTitle: memory.best?.sameTarget ? memory.best.title : "",
    takeCount: takes.length,
    bestTakeId: bestTake?.item?.id || null,
    bestTakeScore: bestTake?.score || 0,
    score: clampScore(score),
    status: beatStatus(memoryReady, takeReady, active, targetScore, takes.length),
    nextNeed: beatNeed(memoryReady, takeReady, active, targetScore, takes.length)
  };
}

function sessionAction(items, activeBeat, sourceReady) {
  if (!sourceReady) {
    return {
      id: "load-source",
      label: "Generate Scene Source",
      detail: "Load a source before building the scene session."
    };
  }
  if (!activeBeat) return null;
  if (activeBeat.targetScore < 92) {
    return {
      id: "apply-scene-target",
      label: "Apply Beat Target",
      targetId: activeBeat.targetId,
      detail: `${activeBeat.label} is not matched to its Line Read controls yet.`
    };
  }
  if (!activeBeat.memoryCount && activeBeat.takeCount > 0) {
    return {
      id: "capture-scene-design",
      label: "Capture Beat Design",
      targetId: activeBeat.targetId,
      detail: `${activeBeat.label} has audio evidence but no recoverable design.`
    };
  }
  if (!activeBeat.takeCount) {
    return {
      id: "preview-region",
      label: "Render Beat",
      targetId: activeBeat.targetId,
      detail: `${activeBeat.label} needs its first audition take.`
    };
  }
  if (activeBeat.takeCount < SCENE_SESSION_LIMITS.readyTakeCount) {
    return {
      id: "render-variants",
      label: "Render Beat Set",
      targetId: activeBeat.targetId,
      detail: `${activeBeat.label} needs another take before keeper judgment.`
    };
  }
  if (activeBeat.status === "ready") {
    const next = nextIncompleteBeat(items, activeBeat.index);
    if (next && next.id !== activeBeat.id) {
      return {
        id: "apply-scene-beat",
        label: `Next Beat: ${next.label}`,
        targetId: next.targetId,
        detail: `${activeBeat.label} is covered; continue the scene arc with ${next.label}.`
      };
    }
  }
  return null;
}

function nextIncompleteBeat(items, activeIndex) {
  if (!items.length) return null;
  for (let offset = 1; offset <= items.length; offset += 1) {
    const item = items[(activeIndex + offset) % items.length];
    if (item.status !== "ready") return item;
  }
  return null;
}

function itemTargetsBeat(item, target) {
  return item?.targetId === target.id ||
    item?.rendered?.lineReadId === target.id ||
    item?.stackAudition?.targetId === target.id ||
    item?.variant?.targetId === target.id ||
    item?.target === target.name;
}

function takeScore(item, takeDecision, active) {
  if (active && takeDecision?.winnerId === item.id && Number.isFinite(takeDecision.score)) {
    return clampScore(takeDecision.score);
  }
  const reviewScore = Number(item?.review?.score || 0);
  const auditionScore = Number(item?.variant?.score || item?.stackAudition?.score || 0);
  return clampScore(Math.round(reviewScore * 0.72 + auditionScore * 0.28));
}

function beatStatus(memoryReady, takeReady, active, targetScore, takeCount) {
  if (memoryReady && takeReady) return "ready";
  if (active && targetScore < 72) return "risk";
  if (active || takeCount) return "check";
  return "waiting";
}

function beatNeed(memoryReady, takeReady, active, targetScore, takeCount) {
  if (memoryReady && takeReady) return "Covered";
  if (active && targetScore < 92) return "Target";
  if (!memoryReady && takeCount > 0) return "Memory";
  if (!takeCount) return "Render";
  if (!takeReady) return "Take";
  return "Review";
}

function sessionStatus(score, readyCount, count) {
  if (!count) return "waiting";
  if (readyCount >= count) return "ready";
  if (score >= 72) return "check";
  return "risk";
}

function resolveSceneKit(activeTarget, sceneKitId) {
  if (sceneKitId) return sceneKitById(sceneKitId);
  return sceneKitForTargetId(activeTarget.id) ||
    SCENE_KITS.find((kit) => kit.presetId === activeTarget.presetId) ||
    SCENE_KITS[0];
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}
