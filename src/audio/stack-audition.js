import { clamp } from "./dsp-core.js";
import { DEFAULT_PARAMS, DIRECTOR_DEFS, MACRO_DEFS, PARAM_DEFS } from "./presets.js";

export const STACK_AUDITION_LIMITS = Object.freeze({
  maxItems: 7,
  maxPatchItems: 6
});

const PARAM_LIMITS = new Map(
  [...MACRO_DEFS, ...DIRECTOR_DEFS, ...PARAM_DEFS].map((def) => [def.key, def])
);

const STAGE_TUNING = Object.freeze({
  input: {
    bypassDepth: 0.72,
    automationIntensity: 0.68,
    focus: "Hear the source without heavy input compensation or cleanup."
  },
  core: {
    bypassDepth: 0.62,
    automationIntensity: 0.82,
    focus: "Check whether the identity shift is helping or over-driving the voice."
  },
  tract: {
    bypassDepth: 0.66,
    automationIntensity: 0.78,
    focus: "Check mouth and formant-like placement without losing the whole chain."
  },
  tone: {
    bypassDepth: 0.68,
    automationIntensity: 0.72,
    focus: "Compare brightness, air, presence, and sibilance color."
  },
  texture: {
    bypassDepth: 0.7,
    automationIntensity: 0.82,
    focus: "Compare breath, whisper, and consonant softness as a separate layer."
  },
  performance: {
    bypassDepth: 0.58,
    automationIntensity: 0.96,
    focus: "Check whether acting motion is carrying the read or flattening it."
  },
  dynamics: {
    bypassDepth: 0.64,
    automationIntensity: 0.66,
    focus: "Compare compression, drive, and output headroom."
  },
  space: {
    bypassDepth: 0.76,
    automationIntensity: 0.7,
    focus: "Compare close-mic distance, ambience, and delay without masking tone."
  },
  guard: {
    bypassDepth: 0.5,
    automationIntensity: 0.62,
    focus: "Check final safety moves without hiding an overloaded stack."
  }
});

const PATCH_THRESHOLDS = Object.freeze({
  pitch: 0.1,
  formant: 0.1,
  inputGain: 0.2,
  outputGain: 0.2,
  limiter: 0.1,
  lowCut: 3,
  highCut: 160,
  default: 1
});

export function buildStackAuditions(baseParams = {}, stack = null, options = {}) {
  if (!stack?.stages?.length) return [];
  const limit = Math.max(1, Number(options.limit || STACK_AUDITION_LIMITS.maxItems));
  const base = { ...DEFAULT_PARAMS, ...baseParams };
  const candidates = [];
  for (const stage of stack.stages) {
    const fix = buildFixCandidate(base, stage, stack);
    if (fix) candidates.push(fix);
    const bypass = buildBypassCandidate(base, stage, stack);
    if (bypass) candidates.push(bypass);
  }
  return candidates
    .sort((a, b) => b.score - a.score || a.stageIndex - b.stageIndex || typeOrder(a.type) - typeOrder(b.type))
    .slice(0, limit);
}

export function stackAuditionSummary(candidates = []) {
  const safe = Array.isArray(candidates) ? candidates : [];
  return {
    count: safe.length,
    ready: safe.filter((item) => item.status === "ready").length,
    bypass: safe.filter((item) => item.type === "bypass").length,
    fix: safe.filter((item) => item.type === "fix").length,
    patchCount: safe.reduce((sum, item) => sum + item.patch.length, 0),
    top: safe[0] || null
  };
}

function buildFixCandidate(base, stage, stack) {
  const sourcePatch = (stage.patch || []).slice(0, STACK_AUDITION_LIMITS.maxPatchItems);
  const applied = applyPatch(base, sourcePatch);
  if (!applied.patch.length) return null;
  const score = candidateScore("fix", stage, applied.patch, stack);
  return {
    id: `stack-fix-${stage.id}`,
    type: "fix",
    stageId: stage.id,
    stageIndex: Number(stage.index || 0),
    label: `Fix ${stage.label}`,
    intent: `Render the next ${stage.label} moves as an audition take.`,
    focus: tuning(stage).focus,
    score,
    status: statusForScore(score),
    mode: stage.mode,
    stageScore: stage.score,
    stageIntensity: stage.intensity,
    automationIntensity: tuning(stage).automationIntensity,
    params: applied.params,
    patch: applied.patch,
    axes: candidateAxes(stage, applied.patch)
  };
}

function buildBypassCandidate(base, stage, stack) {
  const patch = neutralizeStage(base, stage);
  const applied = applyPatch(base, patch);
  const stageIsAudible = Number(stage.intensity || 0) >= 14 || Number(stage.score || 100) < 84 || (stage.patch || []).length > 0;
  if (!stageIsAudible || !applied.patch.length) return null;
  const score = candidateScore("bypass", stage, applied.patch, stack);
  return {
    id: `stack-bypass-${stage.id}`,
    type: "bypass",
    stageId: stage.id,
    stageIndex: Number(stage.index || 0),
    label: `Bypass ${stage.label}`,
    intent: `Pull ${stage.label} toward neutral so the layer can be judged by ear.`,
    focus: tuning(stage).focus,
    score,
    status: statusForScore(score),
    mode: stage.mode,
    stageScore: stage.score,
    stageIntensity: stage.intensity,
    automationIntensity: Math.max(0.52, tuning(stage).automationIntensity - 0.1),
    params: applied.params,
    patch: applied.patch,
    axes: candidateAxes(stage, applied.patch)
  };
}

function applyPatch(base, patches) {
  const params = { ...base };
  const patch = [];
  for (const item of patches || []) {
    if (!item?.key) continue;
    const before = Number(params[item.key] ?? DEFAULT_PARAMS[item.key] ?? 0);
    const after = limitParam(item.key, Number(item.after ?? item.target ?? before));
    if (!Number.isFinite(after) || Math.abs(after - before) < thresholdFor(item.key)) continue;
    params[item.key] = after;
    patch.push({
      key: item.key,
      before,
      after,
      delta: after - before,
      reason: item.reason || `${item.key} audition`
    });
  }
  return { params, patch };
}

function neutralizeStage(base, stage) {
  const depth = tuning(stage).bypassDepth;
  return (stage.keys || [])
    .map((key) => {
      const before = Number(base[key] ?? DEFAULT_PARAMS[key] ?? 0);
      const neutral = neutralValueFor(key);
      const after = limitParam(key, before + (neutral - before) * depth);
      return {
        key,
        before,
        after,
        delta: after - before,
        reason: "Layer bypass audition"
      };
    })
    .filter((item) => Math.abs(item.delta) >= thresholdFor(item.key))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, STACK_AUDITION_LIMITS.maxPatchItems);
}

function candidateScore(type, stage, patch, stack) {
  const riskBonus = stage.status === "risk" ? 16 : stage.status === "check" ? 9 : 0;
  const weakBonus = clamp((100 - Number(stage.score || 100)) * 0.38, 0, 18);
  const intensityBonus = clamp(Number(stage.intensity || 0) * (type === "bypass" ? 0.22 : 0.12), 0, 20);
  const patchBonus = clamp(patch.length * (type === "fix" ? 4.5 : 3.2), 0, 18);
  const nextBonus = stage.id === stack?.nextStageId ? 10 : 0;
  const base = type === "fix" ? 58 : 54;
  return Math.round(clamp(base + riskBonus + weakBonus + intensityBonus + patchBonus + nextBonus, 0, 100));
}

function candidateAxes(stage, patch) {
  return [
    { id: "stage", label: "Layer", value: clamp(Number(stage.intensity || 0), 0, 100) },
    { id: "score", label: "Score", value: clamp(Number(stage.score || 0), 0, 100) },
    { id: "moves", label: "Moves", value: clamp(patch.length * 18, 0, 100) }
  ];
}

function tuning(stage) {
  return STAGE_TUNING[stage?.id] || STAGE_TUNING.guard;
}

function neutralValueFor(key) {
  if (key === "dryWet") return 100;
  return DEFAULT_PARAMS[key] ?? 0;
}

function limitParam(key, value) {
  const def = PARAM_LIMITS.get(key);
  const rounded = roundParam(key, Number.isFinite(value) ? value : neutralValueFor(key));
  if (!def) return rounded;
  return clamp(rounded, def.min, def.max);
}

function thresholdFor(key) {
  return PATCH_THRESHOLDS[key] || PATCH_THRESHOLDS.default;
}

function roundParam(key, value) {
  if (key === "pitch" || key === "formant" || key === "inputGain" || key === "outputGain" || key === "limiter") {
    return Math.round(value * 4) / 4;
  }
  return Math.round(value);
}

function statusForScore(score) {
  if (score >= 86) return "ready";
  if (score >= 70) return "check";
  return "risk";
}

function typeOrder(type) {
  return type === "fix" ? 0 : 1;
}
