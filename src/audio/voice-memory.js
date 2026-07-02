import { DEFAULT_PARAMS, paramsForPreset } from "./presets.js";
import { lineReadById, scoreLineReadTarget } from "./performance-targets.js";

export const VOICE_MEMORY_LIMITS = Object.freeze({
  maxItems: 8,
  maxPatchItems: 8
});

const MEMORY_KEYS = Object.freeze(Object.keys(DEFAULT_PARAMS).filter((key) => !key.startsWith("_")));
const PATCH_KEYS = Object.freeze([
  "pitch",
  "formant",
  "mouth",
  "cuteness",
  "anime",
  "intimacy",
  "body",
  "brightness",
  "presence",
  "air",
  "breath",
  "whisper",
  "consonantSoftness",
  "phraseLift",
  "endingSoftness",
  "deliveryEnergy",
  "closeMic",
  "romanticBreath",
  "confidence",
  "deEss",
  "compression",
  "saturation",
  "ambience",
  "delay",
  "dryWet",
  "outputGain"
]);

const KEY_RANGES = Object.freeze({
  pitch: 24,
  formant: 24,
  mouth: 200,
  body: 200,
  brightness: 200,
  presence: 200,
  air: 200,
  inputGain: 36,
  outputGain: 36,
  limiter: 18,
  lowCut: 400,
  highCut: 20000,
  default: 100
});

export function createVoiceSnapshot(params = {}, options = {}) {
  const target = resolveTarget(options.target || options.lineReadId);
  const cleanParams = normalizeSnapshotParams(params);
  const evidence = snapshotEvidence(cleanParams, target, options);
  const createdAt = Number(options.createdAt || Date.now());
  const id = options.id || `memory-${createdAt.toString(36)}-${hashFingerprint(snapshotFingerprint(cleanParams, target.id)).slice(0, 6)}`;
  return {
    id,
    title: options.title || snapshotTitle(target, options),
    createdAt,
    presetId: options.presetId || target.presetId || "clean",
    presetName: options.presetName || "",
    lineReadId: target.id,
    targetName: target.name,
    sourceName: options.sourceName || "",
    params: cleanParams,
    evidence,
    fingerprint: snapshotFingerprint(cleanParams, target.id)
  };
}

export function addVoiceSnapshot(snapshots = [], snapshot, limits = VOICE_MEMORY_LIMITS) {
  if (!snapshot?.params) return sanitizeVoiceSnapshots(snapshots, limits);
  const maxItems = Math.max(1, Number(limits.maxItems || VOICE_MEMORY_LIMITS.maxItems));
  const incoming = sanitizeVoiceSnapshot(snapshot);
  const withoutDuplicate = sanitizeVoiceSnapshots(snapshots, { ...limits, maxItems: maxItems + 1 })
    .filter((item) => item.fingerprint !== incoming.fingerprint && item.id !== incoming.id);
  return [incoming, ...withoutDuplicate]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, maxItems);
}

export function buildVoiceMemoryBoard(snapshots = [], currentParams = {}, targetOrId = null, options = {}) {
  const target = resolveTarget(targetOrId || options.target || options.lineReadId);
  const cleanSnapshots = sanitizeVoiceSnapshots(snapshots, options.limits || VOICE_MEMORY_LIMITS);
  const current = normalizeSnapshotParams(currentParams);
  const currentTargetScore = scoreLineReadTarget(current, target);
  const items = cleanSnapshots
    .map((snapshot) => scoreSnapshot(snapshot, current, target))
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
  const best = items[0] || null;
  const savedCurrent = items.some((item) => item.sameTarget && item.distance <= 3);
  const captureReady = shouldCaptureCurrent(currentTargetScore, options, savedCurrent);
  const recallReady = !!best && best.sameTarget && best.patch.length > 0 && best.targetScore >= currentTargetScore + 6;
  const score = items.length
    ? Math.round(Math.max(currentTargetScore, best.score * 0.65 + currentTargetScore * 0.35))
    : currentTargetScore;
  const nextAction = recallReady
    ? { id: "apply-memory", label: "Apply Memory", snapshotId: best.id }
    : captureReady
      ? { id: "capture-memory", label: "Capture Design" }
      : null;
  return {
    score,
    status: memoryStatus(score, items, savedCurrent),
    currentTargetScore,
    savedCurrent,
    count: cleanSnapshots.length,
    items,
    best,
    nextAction,
    summary: cleanSnapshots.length
      ? best
        ? `Best memory: ${best.title}`
        : `${cleanSnapshots.length} designs`
      : "No saved designs"
  };
}

export function snapshotParamPatch(currentParams = {}, snapshotParams = {}, options = {}) {
  const limit = Math.max(1, Number(options.limit || VOICE_MEMORY_LIMITS.maxPatchItems));
  const current = normalizeSnapshotParams(currentParams);
  const target = normalizeSnapshotParams(snapshotParams);
  return PATCH_KEYS
    .map((key) => {
      const before = Number(current[key] ?? DEFAULT_PARAMS[key] ?? 0);
      const after = Number(target[key] ?? DEFAULT_PARAMS[key] ?? 0);
      const delta = after - before;
      const normalizedGap = Math.min(1, Math.abs(delta) / keyRange(key));
      return { key, before, after, delta, normalizedGap };
    })
    .filter((item) => Math.abs(item.delta) >= patchThreshold(item.key))
    .sort((a, b) => b.normalizedGap - a.normalizedGap)
    .slice(0, limit);
}

export function sanitizeVoiceSnapshots(snapshots = [], limits = VOICE_MEMORY_LIMITS) {
  const maxItems = Math.max(1, Number(limits.maxItems || VOICE_MEMORY_LIMITS.maxItems));
  return (Array.isArray(snapshots) ? snapshots : [])
    .map(sanitizeVoiceSnapshot)
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, maxItems);
}

function sanitizeVoiceSnapshot(snapshot) {
  if (!snapshot?.params) return null;
  const target = resolveTarget(snapshot.lineReadId);
  const params = normalizeSnapshotParams(snapshot.params);
  return {
    id: String(snapshot.id || `memory-${Number(snapshot.createdAt || Date.now()).toString(36)}`),
    title: String(snapshot.title || target.name || "Voice Memory"),
    createdAt: Number(snapshot.createdAt || Date.now()),
    presetId: String(snapshot.presetId || target.presetId || "clean"),
    presetName: String(snapshot.presetName || ""),
    lineReadId: target.id,
    targetName: String(snapshot.targetName || target.name),
    sourceName: String(snapshot.sourceName || ""),
    params,
    evidence: sanitizeEvidence(snapshot.evidence, params, target),
    fingerprint: snapshot.fingerprint || snapshotFingerprint(params, target.id)
  };
}

function scoreSnapshot(snapshot, currentParams, target) {
  const sameTarget = snapshot.lineReadId === target.id;
  const samePreset = snapshot.presetId === target.presetId;
  const targetScore = scoreLineReadTarget(snapshot.params, target);
  const patch = snapshotParamPatch(currentParams, snapshot.params);
  const distance = Math.round(paramDistance(currentParams, snapshot.params) * 100);
  const evidenceScore = evidenceAverage(snapshot.evidence);
  const relevance = (sameTarget ? 100 : samePreset ? 82 : 62);
  const novelty = Math.min(100, Math.max(0, distance * 2.2));
  const score = Math.round(
    targetScore * 0.42 +
    evidenceScore * 0.28 +
    relevance * 0.18 +
    novelty * 0.12
  );
  return {
    ...snapshot,
    sameTarget,
    samePreset,
    targetScore,
    evidenceScore,
    relevance,
    distance,
    patch,
    score: clamp(score, 0, 100),
    status: score >= 88 ? "ready" : score >= 70 ? "check" : "risk",
    summary: `${targetScore}% target / ${evidenceScore}% evidence`
  };
}

function snapshotEvidence(params, target, options) {
  const targetScore = scoreLineReadTarget(params, target);
  return sanitizeEvidence({
    target: targetScore,
    chain: options.chainReport?.score,
    stack: options.effectStack?.score,
    source: options.sourceFit?.score,
    render: options.renderReview?.score,
    decision: options.takeDecision?.score
  }, params, target);
}

function sanitizeEvidence(evidence = {}, params, target) {
  const fallbackTarget = scoreLineReadTarget(params, target);
  return {
    target: finiteScore(evidence.target, fallbackTarget),
    chain: finiteScore(evidence.chain, null),
    stack: finiteScore(evidence.stack, null),
    source: finiteScore(evidence.source, null),
    render: finiteScore(evidence.render, null),
    decision: finiteScore(evidence.decision, null)
  };
}

function shouldCaptureCurrent(currentTargetScore, options, savedCurrent) {
  if (savedCurrent) return false;
  const hasAuditionEvidence = !!options.renderReview || !!options.takeDecision?.winner;
  const hasDesignEvidence = Number(options.chainReport?.score || 0) >= 82 || Number(options.effectStack?.score || 0) >= 82;
  return currentTargetScore >= 72 && (hasAuditionEvidence || hasDesignEvidence || !!options.allowManualCapture);
}

function memoryStatus(score, items, savedCurrent) {
  if (!items.length) return "empty";
  if (savedCurrent && score >= 86) return "ready";
  if (score >= 76) return "check";
  return "risk";
}

function evidenceAverage(evidence = {}) {
  const values = Object.values(evidence).filter((value) => Number.isFinite(value));
  if (!values.length) return 70;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function normalizeSnapshotParams(params = {}) {
  const out = {};
  for (const key of MEMORY_KEYS) {
    const value = Number(params[key] ?? DEFAULT_PARAMS[key] ?? 0);
    out[key] = roundParam(key, value);
  }
  if (params._sourceCalibration) out._sourceCalibration = String(params._sourceCalibration);
  return out;
}

function snapshotFingerprint(params, lineReadId) {
  const body = MEMORY_KEYS
    .map((key) => `${key}:${roundParam(key, Number(params[key] ?? DEFAULT_PARAMS[key] ?? 0))}`)
    .join("|");
  return `${lineReadId || "none"}|${body}`;
}

function paramDistance(a = {}, b = {}) {
  const values = PATCH_KEYS.map((key) => Math.min(1, Math.abs(Number(a[key] ?? DEFAULT_PARAMS[key] ?? 0) - Number(b[key] ?? DEFAULT_PARAMS[key] ?? 0)) / keyRange(key)));
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function snapshotTitle(target, options) {
  const prefix = target?.name || "Voice";
  const source = options.sourceName ? ` / ${options.sourceName}` : "";
  return `${prefix}${source}`;
}

function resolveTarget(targetOrId) {
  if (!targetOrId) return lineReadById("studio_check");
  return typeof targetOrId === "string" ? lineReadById(targetOrId) : targetOrId;
}

function finiteScore(value, fallback) {
  if (!Number.isFinite(Number(value))) return fallback;
  return clamp(Math.round(Number(value)), 0, 100);
}

function keyRange(key) {
  return KEY_RANGES[key] || KEY_RANGES.default;
}

function patchThreshold(key) {
  if (key === "pitch" || key === "formant" || key === "outputGain") return 0.2;
  return 1;
}

function roundParam(key, value) {
  if (key === "pitch" || key === "formant" || key === "inputGain" || key === "outputGain" || key === "limiter") {
    return Math.round(value * 4) / 4;
  }
  return Math.round(value);
}

function hashFingerprint(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
