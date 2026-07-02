import { calibrateParamsForVoice } from "./dsp-core.js";
import { sourceFitReport } from "./offline-renderer.js";
import { FACTORY_PRESETS, paramsForPreset, presetById } from "./presets.js";
import { LINE_READ_TARGETS, scoreLineReadTarget } from "./performance-targets.js";

const PRESET_SOURCE_HINTS = Object.freeze({
  clean: "neutral_medium",
  kawaii: "high_bright",
  anime_heroine: "neutral_medium",
  otome: "low_warm",
  ikemen: "low_warm",
  asmr: "breathy_close",
  streamer: "neutral_medium",
  narrator: "low_warm",
  radio: "neutral_medium",
  robot: "neutral_medium",
  creature: "low_warm"
});

export function voiceRouteTargets() {
  const lineReadPresetIds = new Set(LINE_READ_TARGETS.map((target) => target.presetId));
  const syntheticTargets = FACTORY_PRESETS
    .filter((preset) => !lineReadPresetIds.has(preset.id))
    .map((preset) => ({
      id: `preset_${preset.id}`,
      presetId: preset.id,
      name: preset.name,
      line: preset.target,
      direction: preset.target,
      tags: [preset.id, "preset"],
      sourceProfileId: PRESET_SOURCE_HINTS[preset.id] || "neutral_medium",
      params: {}
    }));
  return [...LINE_READ_TARGETS, ...syntheticTargets];
}

export function rankVoiceRoutes(profile = {}, source = {}, options = {}) {
  const limit = Math.max(1, Math.floor(options.limit || 6));
  return voiceRouteTargets()
    .map((target) => voiceRouteForTarget(profile, source, target))
    .sort((a, b) => b.score - a.score || b.fitAfterScore - a.fitAfterScore || a.presetName.localeCompare(b.presetName))
    .slice(0, limit);
}

export function voiceRouteForTarget(profile = {}, source = {}, target) {
  const preset = presetById(target.presetId);
  const hasLineRead = LINE_READ_TARGETS.some((lineRead) => lineRead.id === target.id);
  const baseParams = paramsForPreset(target.presetId, target.params);
  const tunedParams = calibrateParamsForVoice(baseParams, profile);
  const fitBefore = sourceFitReport(baseParams, profile, target, source);
  const fitAfter = sourceFitReport(tunedParams, profile, target, source);
  const targetScore = scoreLineReadTarget(tunedParams, target);
  const patchLoad = fitBefore.patches.reduce((sum, patch) => sum + Math.min(12, Math.abs(patch.delta)), 0);
  const riskCount = fitBefore.items.filter((item) => item.status === "risk").length;
  const tuneCount = fitBefore.items.filter((item) => item.status === "tune").length;
  const exactSourceBonus = source.sourceProfileId && source.sourceProfileId === target.sourceProfileId ? 10 : 0;
  const score = Math.max(0, Math.min(100, Math.round(
    fitAfter.score * 0.62 +
    fitBefore.score * 0.18 +
    targetScore * 0.14 +
    Math.max(0, 12 - patchLoad * 0.35) * 0.06 +
    exactSourceBonus
  )));
  return {
    id: target.id,
    presetId: preset.id,
    presetName: preset.name,
    targetId: target.id,
    targetName: target.name,
    hasLineRead,
    line: target.line,
    direction: target.direction,
    tags: [...target.tags],
    score,
    status: routeStatus(score, riskCount, tuneCount),
    targetScore,
    fitBeforeScore: fitBefore.score,
    fitAfterScore: fitAfter.score,
    patchCount: fitBefore.patches.length,
    patches: fitBefore.patches,
    reasons: fitBefore.items
      .filter((item) => item.status !== "ready")
      .map((item) => `${item.label}: ${item.value}`)
      .slice(0, 3),
    baseParams,
    tunedParams
  };
}

function routeStatus(score, riskCount, tuneCount) {
  if (score >= 88 && riskCount === 0 && tuneCount === 0) return "ready";
  if (score >= 72 || (riskCount === 0 && tuneCount > 0)) return "tune";
  return "risk";
}
