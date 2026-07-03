import { DEFAULT_PARAMS, paramsForPreset } from "./presets.js";

export const CHARACTER_CHAIN_STAGES = Object.freeze([
  {
    id: "core",
    label: "Voice Core",
    role: "Range, mouth, size, body",
    keys: ["pitch", "formant", "mouth", "body", "cuteness", "anime"],
    weight: 1.25
  },
  {
    id: "tone",
    label: "Tone Sculpt",
    role: "Brightness, presence, air",
    keys: ["brightness", "presence", "air", "deEss"],
    weight: 1
  },
  {
    id: "texture",
    label: "Texture",
    role: "Breath, whisper, consonants",
    keys: ["breath", "whisper", "consonantSoftness", "romanticBreath"],
    weight: 1.05
  },
  {
    id: "performance",
    label: "Performance",
    role: "Phrase motion and delivery",
    keys: ["phraseLift", "endingSoftness", "deliveryEnergy", "confidence", "prosody"],
    weight: 1.2
  },
  {
    id: "dynamics",
    label: "Dynamics",
    role: "Compression, drive, level",
    keys: ["compression", "saturation", "outputGain", "limiter"],
    weight: 0.9
  },
  {
    id: "space",
    label: "Space",
    role: "Distance and room",
    keys: ["intimacy", "closeMic", "ambience", "delay"],
    weight: 0.85
  },
  {
    id: "guardrail",
    label: "Guardrail",
    role: "Source fit and render safety",
    keys: ["inputGain", "pitch", "formant", "body", "brightness", "air", "deEss", "breath", "whisper"],
    weight: 1.15,
    guardrail: true
  }
]);

const KEY_RANGES = Object.freeze({
  pitch: 24,
  formant: 24,
  mouth: 200,
  body: 200,
  outputGain: 30,
  inputGain: 30,
  lowCut: 400,
  highCut: 20000,
  limiter: 18,
  default: 100
});

const PATCH_THRESHOLD = 0.075;

export function characterChainReport(params = {}, target = null, options = {}) {
  const rawTargetParams = target?.presetId
    ? paramsForPreset(target.presetId, target.params)
    : { ...DEFAULT_PARAMS };
  const targetParams = params._sourceCalibration && options.sourceTunedParams
    ? { ...rawTargetParams, ...options.sourceTunedParams }
    : rawTargetParams;
  const sourceFit = options.sourceFit || null;
  const sourceTunedParams = options.sourceTunedParams || null;
  const renderReview = options.renderReview || null;
  const stages = CHARACTER_CHAIN_STAGES.map((stage) => buildStage(stage, params, targetParams, {
    sourceFit,
    sourceTunedParams,
    renderReview
  }));
  const weightTotal = stages.reduce((sum, stage) => sum + stage.weight, 0);
  const score = Math.round(stages.reduce((sum, stage) => sum + stage.score * stage.weight, 0) / Math.max(1, weightTotal));
  const nextStage = [...stages]
    .filter((stage) => Object.keys(stage.patchObject).some((key) => !key.startsWith("_")))
    .sort((a, b) => stagePriority(b) - stagePriority(a))[0] || null;
  return {
    score,
    status: chainStatus(score, stages),
    targetName: target?.name || "Current Target",
    stages,
    nextStageId: nextStage?.id || null,
    nextPatch: nextStage ? { ...nextStage.patchObject } : {}
  };
}

export function bestCharacterChainPatch(report, stageId = null) {
  const stage = stageId
    ? report?.stages?.find((candidate) => candidate.id === stageId)
    : report?.stages?.find((candidate) => candidate.id === report.nextStageId);
  return stage ? { ...stage.patchObject } : {};
}

function buildStage(stage, params, targetParams, options) {
  const members = stage.keys.map((key) => metricForKey(key, params, targetParams));
  let score = members.length
    ? Math.round(members.reduce((sum, member) => sum + member.score, 0) / members.length)
    : 100;
  let patch = members
    .filter((member) => member.normalizedGap >= PATCH_THRESHOLD)
    .sort((a, b) => b.normalizedGap - a.normalizedGap)
    .slice(0, stage.guardrail ? 7 : 4)
    .map((member) => ({
      key: member.key,
      before: member.current,
      after: member.target,
      delta: member.target - member.current
    }));
  let patchObject = Object.fromEntries(patch.map((item) => [item.key, item.after]));
  const notes = [];

  if (stage.guardrail) {
    const sourceFit = options.sourceFit;
    const renderReview = options.renderReview;
    const sourceTunedParams = options.sourceTunedParams;
    patch = [];
    patchObject = {};
    if (!sourceFit && !renderReview && !sourceTunedParams) {
      score = 100;
    }
    const sourcePatch = sourceTunedParams ? tunedParamPatches(params, sourceTunedParams, stage.keys) : [];
    const riskCount = sourceFit?.items?.filter((item) => item.status === "risk").length || 0;
    const tuneCount = sourceFit?.items?.filter((item) => item.status === "tune").length || 0;
    const reviewPenalty = renderReview?.status === "risk" ? 16 : renderReview?.status === "check" ? 7 : 0;
    const fitPenalty = riskCount * 18 + tuneCount * 8 + (sourceFit?.status === "risk" ? 8 : 0);
    score = Math.max(0, Math.min(score, 100 - fitPenalty - reviewPenalty));
    if (sourceFit) notes.push(`Fit ${sourceFit.score}%`);
    if (renderReview) notes.push(`Render ${renderReview.score}%`);
    if (sourcePatch.length) {
      patch = sourcePatch;
      patchObject = Object.fromEntries(sourcePatch.map((item) => [item.key, item.after]));
      if (sourceTunedParams._sourceCalibration) patchObject._sourceCalibration = sourceTunedParams._sourceCalibration;
    }
  }

  return {
    id: stage.id,
    label: stage.label,
    role: stage.role,
    weight: stage.weight,
    score,
    status: stageStatus(score),
    members,
    patch,
    patchObject,
    notes
  };
}

function metricForKey(key, params, targetParams) {
  const current = Number(params[key] ?? DEFAULT_PARAMS[key] ?? 0);
  const target = Number(targetParams[key] ?? DEFAULT_PARAMS[key] ?? 0);
  const range = KEY_RANGES[key] || KEY_RANGES.default;
  const delta = target - current;
  const normalizedGap = Math.min(1, Math.abs(delta) / range);
  return {
    key,
    current,
    target,
    delta,
    range,
    normalizedGap,
    score: Math.max(0, Math.round((1 - normalizedGap) * 100)),
    currentRatio: keyRatio(key, current),
    targetRatio: keyRatio(key, target)
  };
}

function tunedParamPatches(params, tunedParams, keys) {
  return keys
    .map((key) => {
      const before = Number(params[key] ?? DEFAULT_PARAMS[key] ?? 0);
      const after = Number(tunedParams[key] ?? DEFAULT_PARAMS[key] ?? 0);
      return { key, before, after, delta: after - before };
    })
    .filter((item) => Math.abs(item.delta) >= 0.1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function keyRatio(key, value) {
  if (key === "pitch" || key === "formant") return clamp01((value + 12) / 24);
  if (key === "mouth" || key === "body" || key === "brightness" || key === "presence" || key === "air") {
    return clamp01((value + 100) / 200);
  }
  if (key === "inputGain" || key === "outputGain") return clamp01((value + 18) / 36);
  if (key === "limiter") return clamp01((value + 18) / 18);
  if (key === "lowCut") return clamp01(value / 400);
  if (key === "highCut") return clamp01(value / 20000);
  return clamp01(value / 100);
}

function stageStatus(score) {
  if (score >= 92) return "ready";
  if (score >= 76) return "shape";
  return "risk";
}

function chainStatus(score, stages) {
  if (stages.some((stage) => stage.status === "risk")) return score >= 84 ? "shape" : "risk";
  return score >= 92 ? "ready" : "shape";
}

function stagePriority(stage) {
  const statusWeight = stage.status === "risk" ? 300 : stage.status === "shape" ? 180 : 80;
  const patchWeight = Math.min(60, stage.patch.reduce((sum, item) => sum + Math.abs(item.delta), 0));
  return statusWeight + (100 - stage.score) + patchWeight + stage.weight * 6;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
