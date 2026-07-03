import { clamp } from "./dsp-core.js";
import { DIRECTOR_DEFS, MACRO_DEFS, PARAM_DEFS } from "./presets.js";

export const AUDITION_VARIANT_IDS = Object.freeze([
  "script-focus",
  "sweet-lift",
  "close-breath",
  "body-gloss",
  "broadcast-guard"
]);

const PARAM_LIMITS = new Map(
  [...MACRO_DEFS, ...DIRECTOR_DEFS, ...PARAM_DEFS].map((def) => [def.key, def])
);

export function buildAuditionVariants(baseParams = {}, target = null, options = {}) {
  const sourceFit = options.sourceFit || null;
  const limit = Math.max(1, Number(options.limit || AUDITION_VARIANT_IDS.length));
  const sourceRepair = sourceRepairMoves(sourceFit);
  const blueprints = [
    {
      id: "script-focus",
      label: "Script Focus",
      intent: "Push planned phrase motion, without changing the character identity too far.",
      family: "performance",
      automationIntensity: 0.92,
      moves: {
        prosody: 12,
        phraseLift: 10,
        endingSoftness: 8,
        deliveryEnergy: 6,
        compression: 5
      }
    },
    {
      id: "sweet-lift",
      label: "Sweet Lift",
      intent: "Try a smaller, brighter mouth with more kawaii/anime lift.",
      family: "bright",
      automationIntensity: 0.86,
      moves: {
        pitch: 0.7,
        formant: 0.8,
        mouth: 10,
        cuteness: 12,
        anime: 10,
        brightness: 8,
        phraseLift: 10,
        body: -8,
        consonantSoftness: 5
      }
    },
    {
      id: "close-breath",
      label: "Close Breath",
      intent: "Try a more intimate tail, closer distance, and softer consonants.",
      family: "intimate",
      automationIntensity: 0.98,
      moves: {
        intimacy: 12,
        closeMic: 12,
        romanticBreath: 14,
        breath: 10,
        whisper: 6,
        endingSoftness: 12,
        consonantSoftness: 9,
        deliveryEnergy: -8,
        deEss: 6
      }
    },
    {
      id: "body-gloss",
      label: "Body Gloss",
      intent: "Try more low-mid body and restrained confidence for ikemen/narrator weight.",
      family: "body",
      automationIntensity: 0.76,
      moves: {
        pitch: -0.55,
        formant: -0.75,
        mouth: -8,
        body: 14,
        presence: 8,
        air: 6,
        saturation: 6,
        confidence: 8,
        phraseLift: -6
      }
    },
    {
      id: "broadcast-guard",
      label: "Broadcast Guard",
      intent: "Try a safer, clearer mix with stronger cleanup and fewer harsh tails.",
      family: "mix",
      automationIntensity: 0.72,
      moves: {
        compression: 10,
        deEss: 10,
        presence: 7,
        brightness: 4,
        lowCut: 18,
        air: -5,
        outputGain: -0.8,
        ambience: -4,
        delay: -4
      }
    }
  ];

  const variants = blueprints.map((blueprint) => {
    const repairedMoves = blueprint.id === "broadcast-guard" ? { ...blueprint.moves, ...sourceRepair.moves } : blueprint.moves;
    const applied = applyMoves(baseParams, repairedMoves);
    const score = variantScore(blueprint, target, sourceFit, applied.patch);
    return {
      id: blueprint.id,
      label: blueprint.label,
      intent: blueprint.intent,
      family: blueprint.family,
      score,
      status: score >= 86 ? "ready" : score >= 70 ? "check" : "risk",
      automationIntensity: blueprint.automationIntensity,
      params: applied.params,
      patch: applied.patch,
      axes: variantAxes(applied.params),
      sourceRepair: blueprint.id === "broadcast-guard" ? sourceRepair.patch : []
    };
  });

  return variants
    .sort((a, b) => b.score - a.score || AUDITION_VARIANT_IDS.indexOf(a.id) - AUDITION_VARIANT_IDS.indexOf(b.id))
    .slice(0, limit);
}

export function auditionVariantSummary(variants = []) {
  const safe = Array.isArray(variants) ? variants : [];
  return {
    count: safe.length,
    ready: safe.filter((variant) => variant.status === "ready").length,
    families: safe.map((variant) => variant.family),
    patchCount: safe.reduce((sum, variant) => sum + variant.patch.length, 0)
  };
}

function applyMoves(baseParams, moves) {
  const params = { ...baseParams };
  const patch = [];
  for (const [key, delta] of Object.entries(moves)) {
    const before = Number(params[key] ?? 0);
    const after = limitParam(key, before + Number(delta || 0));
    if (Math.abs(after - before) < 0.05) continue;
    params[key] = after;
    patch.push({
      key,
      before,
      after,
      delta: after - before
    });
  }
  return { params, patch };
}

function sourceRepairMoves(sourceFit) {
  const patch = Array.isArray(sourceFit?.patches) ? sourceFit.patches.slice(0, 5) : [];
  return {
    patch,
    moves: Object.fromEntries(patch.map((item) => [item.key, item.delta]))
  };
}

function limitParam(key, value) {
  const def = PARAM_LIMITS.get(key);
  if (!def) return Number.isFinite(value) ? value : 0;
  return clamp(value, def.min, def.max);
}

function variantScore(blueprint, target, sourceFit, patch) {
  let score = 72;
  const presetId = target?.presetId || "";
  if (blueprint.family === "bright" && /kawaii|anime/i.test(presetId)) score += 18;
  if (blueprint.family === "intimate" && /otome|asmr/i.test(presetId)) score += 18;
  if (blueprint.family === "body" && /ikemen|narrator|radio/i.test(presetId)) score += 18;
  if (blueprint.family === "mix" && sourceFit?.status && sourceFit.status !== "ready") score += 12;
  if (blueprint.family === "performance" && Number(target?.params?.phraseLift || 0) + Number(target?.params?.endingSoftness || 0) >= 100) score += 10;
  score -= Math.min(14, Math.max(0, patch.length - 7) * 2);
  return Math.round(clamp(score, 0, 100));
}

function variantAxes(params) {
  return [
    { id: "lift", label: "Lift", value: Math.round(clamp(Number(params.phraseLift || 0), 0, 100)) },
    { id: "close", label: "Close", value: Math.round(clamp(Number(params.closeMic || 0), 0, 100)) },
    { id: "breath", label: "Breath", value: Math.round(clamp(Number(params.romanticBreath || 0), 0, 100)) },
    { id: "body", label: "Body", value: Math.round(clamp((Number(params.body || 0) + 100) / 2, 0, 100)) }
  ];
}
