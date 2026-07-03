import { DEFAULT_PARAMS, paramsForPreset } from "./presets.js";
import { lineReadById } from "./performance-targets.js";

export const EFFECT_STACK_STAGE_IDS = Object.freeze([
  "input",
  "core",
  "tract",
  "tone",
  "texture",
  "performance",
  "dynamics",
  "space",
  "guard"
]);

const STAGE_DEFS = Object.freeze([
  {
    id: "input",
    label: "Input Prep",
    role: "Gain, source compensation, first cleanup",
    keys: ["inputGain", "lowCut", "deEss"],
    weight: 1.1,
    mode: "Live + Offline"
  },
  {
    id: "core",
    label: "Core Shift",
    role: "F0 range, character size, body weight",
    keys: ["pitch", "body", "cuteness", "anime"],
    weight: 1.2,
    mode: "Live + Offline"
  },
  {
    id: "tract",
    label: "Voice Tract",
    role: "Mouth size and formant-like placement",
    keys: ["formant", "mouth", "body"],
    weight: 1.15,
    mode: "Live + Offline"
  },
  {
    id: "tone",
    label: "Tone Polish",
    role: "Brightness, presence, air, sibilance",
    keys: ["brightness", "presence", "air", "deEss"],
    weight: 1,
    mode: "Live + Offline"
  },
  {
    id: "texture",
    label: "Texture",
    role: "Breath, whisper, consonant softness",
    keys: ["breath", "whisper", "consonantSoftness", "romanticBreath"],
    weight: 1.1,
    mode: "Live + Offline"
  },
  {
    id: "performance",
    label: "Performance Motion",
    role: "Phrase lift, endings, distance, intent",
    keys: ["phraseLift", "endingSoftness", "deliveryEnergy", "closeMic", "confidence"],
    weight: 1.25,
    mode: "Offline automation"
  },
  {
    id: "dynamics",
    label: "Dynamics",
    role: "Compression, saturation, level, limiter",
    keys: ["compression", "saturation", "outputGain", "limiter"],
    weight: 1,
    mode: "Live + Offline"
  },
  {
    id: "space",
    label: "Space",
    role: "Near-mic distance, ambience, delay",
    keys: ["intimacy", "closeMic", "ambience", "delay"],
    weight: 0.9,
    mode: "Live + Offline"
  },
  {
    id: "guard",
    label: "Guardrail",
    role: "Headroom, overload, stack balance",
    keys: ["dryWet", "outputGain", "compression", "deEss", "limiter"],
    weight: 1.15,
    mode: "Always-on"
  }
]);

const KEY_RANGES = Object.freeze({
  pitch: 12,
  formant: 12,
  mouth: 100,
  body: 100,
  brightness: 100,
  presence: 100,
  air: 100,
  inputGain: 18,
  outputGain: 18,
  limiter: 18,
  lowCut: 360,
  highCut: 20000,
  deliveryEnergy: 50,
  confidence: 50,
  dryWet: 100,
  default: 100
});

const STEP_LIMITS = Object.freeze({
  pitch: 1.1,
  formant: 1.1,
  mouth: 12,
  body: 14,
  brightness: 12,
  presence: 10,
  air: 10,
  breath: 10,
  whisper: 8,
  consonantSoftness: 10,
  romanticBreath: 10,
  phraseLift: 10,
  endingSoftness: 10,
  deliveryEnergy: 8,
  closeMic: 10,
  confidence: 8,
  compression: 8,
  saturation: 6,
  ambience: 8,
  delay: 6,
  inputGain: 3,
  outputGain: 2,
  deEss: 10,
  limiter: 1,
  default: 10
});

const ABSOLUTE_BOUNDS = Object.freeze({
  pitch: [-12, 12],
  formant: [-12, 12],
  mouth: [-100, 100],
  body: [-100, 100],
  brightness: [-100, 100],
  presence: [-100, 100],
  air: [-100, 100],
  inputGain: [-18, 18],
  outputGain: [-18, 12],
  limiter: [-18, 0],
  lowCut: [45, 400],
  highCut: [3000, 20000],
  dryWet: [0, 100],
  default: [0, 100]
});

export function buildEffectStack(params = {}, options = {}) {
  const current = { ...DEFAULT_PARAMS, ...params };
  const target = resolveTarget(options.target || options.targetId);
  const targetParams = target?.presetId
    ? paramsForPreset(target.presetId, target.params)
    : { ...DEFAULT_PARAMS };
  const context = {
    sourceFit: options.sourceFit || null,
    renderReview: options.renderReview || null,
    rendered: options.rendered || null,
    performanceScript: options.performanceScript || null,
    scriptMatch: options.scriptMatch || null,
    keeperRefinement: options.keeperRefinement || null,
    target
  };

  const stages = STAGE_DEFS.map((def, index) => buildStage(def, index, current, targetParams, context));
  const scoreTotal = stages.reduce((sum, stage) => sum + stage.score * stage.weight, 0);
  const weightTotal = stages.reduce((sum, stage) => sum + stage.weight, 0);
  const score = Math.round(scoreTotal / Math.max(1, weightTotal));
  const activeCount = stages.filter((stage) => stage.intensity >= 12).length;
  const nextStage = [...stages]
    .filter((stage) => stage.patch.length)
    .sort((a, b) => stagePriority(b) - stagePriority(a))[0] || null;
  return {
    score,
    status: stackStatus(score, stages),
    targetName: target?.name || "Current Target",
    activeCount,
    totalIntensity: Math.round(stages.reduce((sum, stage) => sum + stage.intensity, 0) / stages.length),
    stages,
    nextStageId: nextStage?.id || null,
    nextPatch: nextStage ? patchObject(nextStage.patch) : {},
    summary: nextStage ? `${nextStage.patch.length} ${nextStage.label} moves` : "Stack locked"
  };
}

export function bestEffectStackPatch(stack, stageId = null) {
  const stage = stageId
    ? stack?.stages?.find((candidate) => candidate.id === stageId)
    : stack?.stages?.find((candidate) => candidate.id === stack.nextStageId);
  return stage ? patchObject(stage.patch) : {};
}

function buildStage(def, index, current, targetParams, context) {
  const targetPatch = targetPatchesForStage(def, current, targetParams);
  const contextPatch = contextPatchesForStage(def, current, context);
  const patch = dedupePatches([...contextPatch, ...targetPatch]).slice(0, def.id === "guard" ? 5 : 4);
  const intensity = stageIntensity(def, current);
  const meters = def.keys.slice(0, 5).map((key) => ({
    key,
    label: keyLabel(key),
    value: Math.round(activityForKey(key, current[key] ?? DEFAULT_PARAMS[key] ?? 0) * 100)
  }));
  const notes = stageNotes(def, current, context, patch);
  const evidencePenalty = evidencePenaltyForStage(def, context);
  const targetPenalty = Math.min(22, targetPatch.reduce((sum, item) => sum + Math.min(8, Math.abs(item.normalizedGap || 0) * 26), 0));
  const overloadPenalty = overloadPenaltyForStage(def, current, intensity);
  const score = clamp(Math.round(100 - evidencePenalty - targetPenalty - overloadPenalty), 0, 100);
  return {
    id: def.id,
    label: def.label,
    role: def.role,
    mode: def.mode,
    index,
    weight: def.weight,
    keys: [...def.keys],
    intensity,
    score,
    status: patch.length && score >= 88 ? "check" : stageStatus(score),
    patch,
    notes,
    meters
  };
}

function targetPatchesForStage(def, current, targetParams) {
  if (def.id === "input" || def.id === "guard") return [];
  if (def.id === "dynamics") return [];
  const threshold = def.id === "performance" ? 0.09 : 0.11;
  return def.keys
    .map((key) => boundedPatch(key, current[key], targetParams[key], `${def.label} target`))
    .filter((item) => item && item.normalizedGap >= threshold)
    .sort((a, b) => b.normalizedGap - a.normalizedGap);
}

function contextPatchesForStage(def, current, context) {
  if (def.id === "input") return inputPatches(current, context);
  if (def.id === "tone") return tonePatches(current, context);
  if (def.id === "texture") return texturePatches(current, context);
  if (def.id === "performance") return performancePatches(current, context);
  if (def.id === "dynamics") return dynamicsPatches(current, context);
  if (def.id === "space") return spacePatches(current, context);
  if (def.id === "guard") return guardPatches(current, context);
  return [];
}

function inputPatches(current, context) {
  const sourcePatches = context.sourceFit?.status !== "ready"
    ? (context.sourceFit?.patches || []).map((patch) => boundedPatch(patch.key, current[patch.key], patch.after, "Source compensation")).filter(Boolean)
    : [];
  const patches = sourcePatches.filter((patch) => ["inputGain", "lowCut", "deEss", "pitch", "formant", "body", "brightness", "air", "breath", "whisper"].includes(patch.key));
  if (comfortHas(context, "mud")) patches.push(boundedPatch("lowCut", current.lowCut, Number(current.lowCut || 80) + 14, "Comfort mud cleanup"));
  if (comfortHas(context, "quiet")) patches.push(boundedPatch("inputGain", current.inputGain, Number(current.inputGain || 0) + 1.5, "Comfort intelligibility"));
  return patches.filter(Boolean);
}

function tonePatches(current, context) {
  const patches = [];
  const toneItem = context.sourceFit?.items?.find((item) => item.id === "tone");
  if (toneItem?.status === "tune" || toneItem?.status === "risk") {
    if (/bright/i.test(toneItem.value || "")) {
      patches.push(boundedPatch("brightness", current.brightness, Number(current.brightness || 0) - 10, "Tame bright source"));
      patches.push(boundedPatch("deEss", current.deEss, Number(current.deEss || 0) + 8, "Tame bright source"));
    }
    if (/dark/i.test(toneItem.value || "")) {
      patches.push(boundedPatch("brightness", current.brightness, Number(current.brightness || 0) + 10, "Open dark source"));
      patches.push(boundedPatch("air", current.air, Number(current.air || 0) + 8, "Open dark source"));
    }
  }
  const reviewTone = context.renderReview?.items?.find((item) => item.id === "tone");
  if (context.renderReview?.status === "risk" && reviewTone) {
    if (/^\+/.test(reviewTone.value || "")) patches.push(boundedPatch("deEss", current.deEss, Number(current.deEss || 0) + 7, "Render tone guard"));
    if (/^-/.test(reviewTone.value || "")) patches.push(boundedPatch("air", current.air, Number(current.air || 0) + 6, "Render tone guard"));
  }
  if (comfortHas(context, "sibilance")) {
    patches.push(boundedPatch("deEss", current.deEss, Number(current.deEss || 0) + 8, "Comfort sibilance"));
    patches.push(boundedPatch("air", current.air, Number(current.air || 0) - 5, "Comfort sibilance"));
  }
  if (comfortHas(context, "harshness")) {
    patches.push(boundedPatch("presence", current.presence, Number(current.presence || 0) - 6, "Comfort harshness"));
    patches.push(boundedPatch("brightness", current.brightness, Number(current.brightness || 0) - 5, "Comfort harshness"));
  }
  if (comfortHas(context, "nasal")) {
    patches.push(boundedPatch("presence", current.presence, Number(current.presence || 0) - 4, "Comfort nasal focus"));
  }
  return patches.filter(Boolean);
}

function texturePatches(current, context) {
  const patches = [];
  const textureItem = context.sourceFit?.items?.find((item) => item.id === "texture");
  const breathLoad = Number(current.breath || 0) + Number(current.whisper || 0) + Number(current.romanticBreath || 0) * 0.45;
  if (breathLoad > 120 && Number(current.deEss || 0) < 72) {
    patches.push(boundedPatch("deEss", current.deEss, Number(current.deEss || 0) + 8, "Breath stack guard"));
  }
  if (textureItem?.status === "tune" && /noise/i.test(textureItem.detail || "")) {
    patches.push(boundedPatch("breath", current.breath, Number(current.breath || 0) - 8, "Noise cleanup"));
    patches.push(boundedPatch("whisper", current.whisper, Number(current.whisper || 0) - 6, "Noise cleanup"));
  }
  const reviewTexture = context.renderReview?.items?.find((item) => item.id === "texture");
  if (context.renderReview?.status === "risk" && reviewTexture && /^\+/.test(reviewTexture.value || "")) {
    patches.push(boundedPatch("consonantSoftness", current.consonantSoftness, Number(current.consonantSoftness || 0) + 6, "Texture smoothing"));
  }
  if (comfortHas(context, "micro")) {
    patches.push(boundedPatch("consonantSoftness", current.consonantSoftness, Number(current.consonantSoftness || 0) + 8, "Comfort micro smoothing"));
    patches.push(boundedPatch("breath", current.breath, Number(current.breath || 0) - 6, "Comfort micro smoothing"));
    patches.push(boundedPatch("whisper", current.whisper, Number(current.whisper || 0) - 5, "Comfort micro smoothing"));
  }
  return patches.filter(Boolean);
}

function performancePatches(current, context) {
  const patches = [];
  const match = context.scriptMatch;
  if (match && !match.plannedOnly && match.status !== "ready") {
    for (const item of match.items || []) {
      patches.push(...scriptItemPatches(current, item));
    }
  }
  if (context.keeperRefinement?.patch?.length && context.keeperRefinement.winnerLabel) {
    for (const patch of context.keeperRefinement.patch.slice(0, 2)) {
      if (["phraseLift", "endingSoftness", "deliveryEnergy", "closeMic", "confidence", "breath", "romanticBreath"].includes(patch.key)) {
        patches.push(boundedPatch(patch.key, current[patch.key], patch.after, "Keeper feedback"));
      }
    }
  }
  return patches.filter(Boolean);
}

function scriptItemPatches(current, item) {
  const amount = scriptMissAmount(item);
  if (amount <= 0) return [];
  if (item.id === "lift") {
    return [
      boundedPatch("phraseLift", current.phraseLift, Number(current.phraseLift || 0) + amount * 10, "Match script lift"),
      boundedPatch("prosody", current.prosody, Number(current.prosody || 0) + amount * 8, "Match script lift")
    ].filter(Boolean);
  }
  if (item.id === "release") {
    return [
      boundedPatch("endingSoftness", current.endingSoftness, Number(current.endingSoftness || 0) + amount * 10, "Match script release"),
      boundedPatch("consonantSoftness", current.consonantSoftness, Number(current.consonantSoftness || 0) + amount * 6, "Match script release")
    ].filter(Boolean);
  }
  if (item.id === "breath") {
    return [
      boundedPatch("romanticBreath", current.romanticBreath, Number(current.romanticBreath || 0) + amount * 10, "Match breath lane"),
      boundedPatch("breath", current.breath, Number(current.breath || 0) + amount * 8, "Match breath lane")
    ].filter(Boolean);
  }
  if (item.id === "energy") {
    return [
      boundedPatch("deliveryEnergy", current.deliveryEnergy, Number(current.deliveryEnergy || 0) + amount * 8, "Match energy lane"),
      boundedPatch("compression", current.compression, Number(current.compression || 0) + amount * 5, "Match energy lane")
    ].filter(Boolean);
  }
  return [];
}

function dynamicsPatches(current, context) {
  const patches = [];
  const analysis = context.rendered?.analysis || null;
  if (analysis?.clipped || analysis?.peakDb > -0.7) {
    patches.push(boundedPatch("outputGain", current.outputGain, Number(current.outputGain || 0) - 1.5, "Restore headroom"));
    patches.push(boundedPatch("limiter", current.limiter, Number(current.limiter ?? -1) - 0.5, "Restore headroom"));
    patches.push(boundedPatch("compression", current.compression, Number(current.compression || 0) + 5, "Restore headroom"));
  } else if (analysis?.rmsDb > -8) {
    patches.push(boundedPatch("outputGain", current.outputGain, Number(current.outputGain || 0) - 1, "Lower hot render"));
  } else if (analysis?.rmsDb < -34) {
    patches.push(boundedPatch("outputGain", current.outputGain, Number(current.outputGain || 0) + 2, "Lift quiet render"));
    patches.push(boundedPatch("compression", current.compression, Number(current.compression || 0) + 4, "Lift quiet render"));
  }
  if (Number(current.saturation || 0) > 55 && Number(current.compression || 0) > 75) {
    patches.push(boundedPatch("saturation", current.saturation, Number(current.saturation || 0) - 6, "Drive/dynamics balance"));
  }
  if (comfortHas(context, "flat")) {
    patches.push(boundedPatch("compression", current.compression, Number(current.compression || 0) - 5, "Comfort dynamics"));
  }
  if (comfortHas(context, "jumpy")) {
    patches.push(boundedPatch("compression", current.compression, Number(current.compression || 0) + 6, "Comfort dynamics"));
  }
  if (comfortHas(context, "loudness")) {
    patches.push(boundedPatch("outputGain", current.outputGain, Number(current.outputGain || 0) - 1.2, "Comfort loudness"));
  }
  return patches.filter(Boolean);
}

function spacePatches(current, context) {
  const patches = [];
  const close = Number(current.closeMic || 0);
  const intimate = Number(current.intimacy || 0);
  if ((close > 74 || intimate > 84) && Number(current.ambience || 0) > 24) {
    patches.push(boundedPatch("ambience", current.ambience, Number(current.ambience || 0) - 8, "Keep close voice intimate"));
  }
  if ((close > 74 || intimate > 84) && Number(current.delay || 0) > 10) {
    patches.push(boundedPatch("delay", current.delay, Number(current.delay || 0) - 6, "Keep close voice intimate"));
  }
  if (context.target?.tags?.includes("broadcast") && Number(current.ambience || 0) > 4) {
    patches.push(boundedPatch("ambience", current.ambience, 0, "Broadcast space cleanup"));
  }
  return patches.filter(Boolean);
}

function guardPatches(current, context) {
  const patches = [];
  const activeTexture = Number(current.breath || 0) + Number(current.whisper || 0);
  const activeTone = Math.abs(Number(current.brightness || 0)) + Math.abs(Number(current.air || 0)) + Math.abs(Number(current.presence || 0));
  const analysis = context.rendered?.analysis || null;
  if ((activeTexture > 120 || activeTone > 170) && Number(current.dryWet ?? 100) > 92) {
    patches.push(boundedPatch("dryWet", current.dryWet, Number(current.dryWet ?? 100) - 5, "Blend overloaded stack"));
  }
  if (analysis?.peakDb > -1.2 && Number(current.outputGain || 0) >= 0) {
    patches.push(boundedPatch("outputGain", current.outputGain, Number(current.outputGain || 0) - 1, "Final headroom"));
  }
  if (context.renderReview?.status === "risk" && Number(current.compression || 0) < 72) {
    patches.push(boundedPatch("compression", current.compression, Number(current.compression || 0) + 6, "Final stability"));
  }
  if ((context.renderReview?.comfort?.score ?? 100) < 45) {
    patches.push(boundedPatch("dryWet", current.dryWet, Number(current.dryWet ?? 100) - 4, "Comfort blend guard"));
  }
  if (comfortHas(context, "true-peak")) {
    patches.push(boundedPatch("limiter", current.limiter, Number(current.limiter ?? -1) - 0.5, "Comfort peak guard"));
  }
  return patches.filter(Boolean);
}

function comfortHas(context, id) {
  const comfort = context.renderReview?.comfort || null;
  return !!comfort && comfort.score < 84 && Array.isArray(comfort.reasons) && comfort.reasons.includes(id);
}

function stageNotes(def, current, context, patch) {
  const notes = [];
  if (def.id === "input" && context.sourceFit) notes.push(`Source ${context.sourceFit.score}%`);
  if (def.id === "performance" && context.scriptMatch && !context.scriptMatch.plannedOnly) notes.push(`Script ${context.scriptMatch.score}%`);
  if (def.id === "dynamics" && context.renderReview) notes.push(`Render ${context.renderReview.score}%`);
  if ((def.id === "tone" || def.id === "texture") && context.renderReview?.comfort?.score < 84) notes.push(`Comfort ${context.renderReview.comfort.score}%`);
  if (def.id === "guard" && context.renderReview) notes.push(`Safety ${context.renderReview.status}`);
  if (patch.length) notes.push(`${patch.length} next moves`);
  if (!notes.length) {
    const top = def.keys
      .map((key) => ({ key, value: activityForKey(key, current[key] ?? DEFAULT_PARAMS[key] ?? 0) }))
      .sort((a, b) => b.value - a.value)[0];
    if (top && top.value >= 0.12) notes.push(`${keyLabel(top.key)} active`);
  }
  return notes;
}

function evidencePenaltyForStage(def, context) {
  if (def.id === "input" && context.sourceFit) return statusPenalty(context.sourceFit.status, 24);
  if (def.id === "performance" && context.scriptMatch && !context.scriptMatch.plannedOnly) return statusPenalty(context.scriptMatch.status, 26);
  if ((def.id === "tone" || def.id === "texture") && context.renderReview?.comfort?.score < 68) {
    return Math.min(18, Math.round((68 - context.renderReview.comfort.score) * 0.32));
  }
  if ((def.id === "dynamics" || def.id === "guard") && context.renderReview) return statusPenalty(context.renderReview.status, 28);
  return 0;
}

function overloadPenaltyForStage(def, current, intensity) {
  if (def.id === "texture") {
    const load = Number(current.breath || 0) + Number(current.whisper || 0) + Number(current.romanticBreath || 0) * 0.35;
    return load > 150 ? 16 : load > 125 ? 8 : 0;
  }
  if (def.id === "dynamics") {
    const drive = Number(current.saturation || 0) + Number(current.compression || 0);
    return drive > 145 ? 12 : 0;
  }
  if (def.id === "guard") return intensity > 88 ? 10 : 0;
  return 0;
}

function statusPenalty(status, amount) {
  if (status === "risk") return amount;
  if (status === "check" || status === "tune" || status === "shape") return Math.round(amount * 0.48);
  return 0;
}

function stageIntensity(def, current) {
  const values = def.keys.map((key) => activityForKey(key, current[key] ?? DEFAULT_PARAMS[key] ?? 0));
  const max = Math.max(0, ...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return Math.round((max * 0.62 + avg * 0.38) * 100);
}

function activityForKey(key, rawValue) {
  const value = Number(rawValue ?? DEFAULT_PARAMS[key] ?? 0);
  const base = Number(DEFAULT_PARAMS[key] ?? 0);
  if (key === "dryWet") return clamp(value / 100, 0, 1);
  if (key === "deliveryEnergy" || key === "confidence") return clamp(Math.abs(value - base) / KEY_RANGES[key], 0, 1);
  if (key === "limiter") return clamp(Math.abs(value - base) / KEY_RANGES.limiter, 0, 1);
  if (key === "lowCut") return clamp(Math.abs(value - base) / KEY_RANGES.lowCut, 0, 1);
  if (key === "highCut") return clamp(Math.abs(value - base) / KEY_RANGES.highCut, 0, 1);
  const range = KEY_RANGES[key] || KEY_RANGES.default;
  return clamp(Math.abs(value) / range, 0, 1);
}

function boundedPatch(key, beforeRaw, targetRaw, reason) {
  const before = Number(beforeRaw ?? DEFAULT_PARAMS[key] ?? 0);
  const target = Number(targetRaw ?? DEFAULT_PARAMS[key] ?? 0);
  const delta = target - before;
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return null;
  const limit = STEP_LIMITS[key] || STEP_LIMITS.default;
  const step = clamp(delta, -limit, limit);
  const after = clampToKey(key, before + step);
  const normalizedGap = Math.min(1, Math.abs(delta) / normalizedRangeForKey(key));
  if (Math.abs(after - before) < 0.05) return null;
  return {
    key,
    before,
    after,
    delta: after - before,
    target,
    normalizedGap,
    reason
  };
}

function dedupePatches(patches) {
  const byKey = new Map();
  for (const patch of patches.filter(Boolean)) {
    const existing = byKey.get(patch.key);
    if (!existing || Math.abs(patch.delta) > Math.abs(existing.delta)) byKey.set(patch.key, patch);
  }
  return [...byKey.values()].sort((a, b) => b.normalizedGap - a.normalizedGap);
}

function patchObject(patches) {
  return Object.fromEntries((patches || []).map((patch) => [patch.key, patch.after]));
}

function scriptMissAmount(item) {
  if (!item) return 0;
  const expected = Number(item.expected ?? item.target ?? 0);
  const actual = Number(item.actual ?? 0);
  if (Number.isFinite(expected) && Number.isFinite(actual)) {
    return clamp(Math.abs(expected - actual), 0, 1);
  }
  const match = String(item.value || "").match(/([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)/);
  if (!match) return item.status === "risk" ? 0.9 : item.status === "check" ? 0.55 : 0;
  const a = Number(match[1]);
  const b = Number(match[2]);
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return clamp(Math.abs(a - b) / scale, 0, 1);
}

function normalizedRangeForKey(key) {
  if (key === "pitch" || key === "formant") return 24;
  if (key === "mouth" || key === "body" || key === "brightness" || key === "presence" || key === "air") return 200;
  if (key === "inputGain" || key === "outputGain") return 36;
  if (key === "limiter") return 18;
  if (key === "lowCut") return 400;
  if (key === "highCut") return 20000;
  return 100;
}

function clampToKey(key, value) {
  const [min, max] = ABSOLUTE_BOUNDS[key] || ABSOLUTE_BOUNDS.default;
  return clamp(roundForKey(key, value), min, max);
}

function roundForKey(key, value) {
  if (key === "pitch" || key === "formant" || key === "inputGain" || key === "outputGain" || key === "limiter") {
    return Math.round(value * 4) / 4;
  }
  return Math.round(value);
}

function stageStatus(score) {
  if (score >= 88) return "ready";
  if (score >= 70) return "check";
  return "risk";
}

function stackStatus(score, stages) {
  if (stages.some((stage) => stage.status === "risk")) return score >= 78 ? "check" : "risk";
  if (stages.some((stage) => stage.patch.length)) return "check";
  if (stages.some((stage) => stage.status === "check")) return "check";
  return score >= 88 ? "ready" : "check";
}

function stagePriority(stage) {
  const status = stage.status === "risk" ? 280 : stage.status === "check" ? 160 : 70;
  const patchLoad = Math.min(70, stage.patch.reduce((sum, patch) => sum + Math.abs(patch.delta), 0));
  const comfortBoost = stage.patch.some((patch) => /^Comfort\b/i.test(patch.reason || "")) ? 180 : 0;
  return status + (100 - stage.score) + patchLoad + stage.weight * 8 + comfortBoost;
}

function resolveTarget(targetOrId) {
  if (!targetOrId) return lineReadById("studio_check");
  return typeof targetOrId === "string" ? lineReadById(targetOrId) : targetOrId;
}

function keyLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
