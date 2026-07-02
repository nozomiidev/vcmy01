import { FACTORY_PRESETS, paramsForPreset } from "./presets.js";

export const PERFORMANCE_TARGET_KEYS = Object.freeze([
  "cuteness",
  "anime",
  "intimacy",
  "body",
  "breath",
  "consonantSoftness",
  "phraseLift",
  "endingSoftness",
  "deliveryEnergy",
  "closeMic",
  "romanticBreath",
  "confidence"
]);

export const PERFORMANCE_AXES = Object.freeze([
  { key: "phraseLift", label: "Lift", fullLabel: "Phrase Lift", range: 100 },
  { key: "endingSoftness", label: "Soft", fullLabel: "Ending Softness", range: 100 },
  { key: "deliveryEnergy", label: "Energy", fullLabel: "Delivery Energy", range: 100 },
  { key: "closeMic", label: "Near", fullLabel: "Close Mic", range: 100 },
  { key: "romanticBreath", label: "Breath", fullLabel: "Breath Placement", range: 100 },
  { key: "confidence", label: "Conf", fullLabel: "Confidence", range: 100 },
  { key: "cuteness", label: "Cute", fullLabel: "Cuteness", range: 100 },
  { key: "anime", label: "Anime", fullLabel: "Anime Lift", range: 100 },
  { key: "intimacy", label: "Intimacy", fullLabel: "Intimacy", range: 100 },
  { key: "body", label: "Body", fullLabel: "Body", range: 200 },
  { key: "breath", label: "Air", fullLabel: "Breath", range: 100 },
  { key: "consonantSoftness", label: "Consonants", fullLabel: "Soft Consonants", range: 100 }
]);

const RECIPE_GROUPS = Object.freeze([
  {
    id: "character",
    label: "Character",
    keys: ["cuteness", "anime", "body", "consonantSoftness"]
  },
  {
    id: "performance",
    label: "Performance",
    keys: ["phraseLift", "endingSoftness", "deliveryEnergy", "confidence"]
  },
  {
    id: "distance",
    label: "Distance",
    keys: ["closeMic", "romanticBreath", "intimacy", "breath"]
  }
]);

const AXIS_CUES = Object.freeze({
  phraseLift: {
    raise: "Lift the phrase contour and keep the motion brighter.",
    lower: "Flatten the phrase arc so the read feels more controlled."
  },
  endingSoftness: {
    raise: "Soften the tail and let the ending release more gently.",
    lower: "Tighten the ending so it lands with less softness."
  },
  deliveryEnergy: {
    raise: "Push the read forward with more attack and level stability.",
    lower: "Pull the delivery back and leave more room between phrases."
  },
  closeMic: {
    raise: "Move the voice closer and make the proximity feel more intimate.",
    lower: "Step the voice back so the character feels less near-mic."
  },
  romanticBreath: {
    raise: "Place more breath after phrases without washing out consonants.",
    lower: "Clean up breath placement so the read stays clearer."
  },
  confidence: {
    raise: "Add firmer intent and a steadier finish.",
    lower: "Relax the finish so the character feels less assertive."
  },
  cuteness: {
    raise: "Narrow the character brighter and sweeter.",
    lower: "Reduce sweetness so the voice feels less cute."
  },
  anime: {
    raise: "Bring the upper lift forward for a more animated read.",
    lower: "Reduce animated lift for a more grounded read."
  },
  intimacy: {
    raise: "Bring the delivery closer and more confidential.",
    lower: "Open the distance so the read feels less private."
  },
  body: {
    raise: "Add body and chest weight without over-darkening the vowels.",
    lower: "Lighten the body so the mouth feels smaller and brighter."
  },
  breath: {
    raise: "Add controlled air texture for softness and presence.",
    lower: "Reduce air texture so the voice stays cleaner."
  },
  consonantSoftness: {
    raise: "Round consonants so the read feels softer.",
    lower: "Restore consonant edge for clearer articulation."
  }
});

const SCORE_RANGES = Object.freeze({
  body: 200,
  default: 100
});

export const LINE_READ_TARGETS = Object.freeze([
  {
    id: "studio_check",
    presetId: "clean",
    name: "Studio Check",
    line: "One clean phrase, steady breath, no surprises.",
    direction: "Neutral delivery with stable level and controlled endings.",
    tags: ["calibration", "neutral", "steady"],
    sourceProfileId: "neutral_medium",
    params: {
      phraseLift: 12,
      endingSoftness: 24,
      deliveryEnergy: 50,
      closeMic: 22,
      romanticBreath: 4,
      confidence: 64,
      prosody: 18
    }
  },
  {
    id: "kawaii_spark",
    presetId: "kawaii",
    name: "Kawaii Spark",
    line: "Ehehe, did I sound a little cooler just now?",
    direction: "Small bright mouth, lifted phrase, soft consonants, playful tail.",
    tags: ["kawaii", "bright", "playful"],
    sourceProfileId: "high_bright",
    params: {
      cuteness: 86,
      anime: 54,
      phraseLift: 82,
      endingSoftness: 44,
      deliveryEnergy: 66,
      closeMic: 30,
      romanticBreath: 28,
      confidence: 54,
      breath: 24,
      consonantSoftness: 58
    }
  },
  {
    id: "anime_charge",
    presetId: "anime_heroine",
    name: "Anime Charge",
    line: "Leave it to me. I will cut straight through the noise.",
    direction: "Clear attack, high energy, confident lift, crisp consonants.",
    tags: ["anime", "heroine", "energetic"],
    sourceProfileId: "neutral_medium",
    params: {
      anime: 90,
      phraseLift: 92,
      endingSoftness: 16,
      deliveryEnergy: 88,
      closeMic: 18,
      romanticBreath: 10,
      confidence: 82,
      consonantSoftness: 24,
      compression: 62
    }
  },
  {
    id: "otome_promise",
    presetId: "otome",
    name: "Otome Promise",
    line: "Do not look away yet. I want this moment to stay between us.",
    direction: "Close distance, gentle falling endings, romantic breath after phrases.",
    tags: ["otome", "close", "romantic"],
    sourceProfileId: "low_warm",
    params: {
      intimacy: 92,
      phraseLift: 42,
      endingSoftness: 90,
      deliveryEnergy: 38,
      closeMic: 84,
      romanticBreath: 94,
      confidence: 38,
      breath: 58,
      whisper: 16,
      ambience: 16
    }
  },
  {
    id: "ikemen_low",
    presetId: "ikemen",
    name: "Ikemen Low",
    line: "Come closer. I will keep my voice low enough for only you.",
    direction: "Low body, near mic, restrained lift, breath gloss, assured finish.",
    tags: ["ikemen", "low", "near"],
    sourceProfileId: "low_warm",
    params: {
      body: 82,
      intimacy: 76,
      phraseLift: 16,
      endingSoftness: 64,
      deliveryEnergy: 42,
      closeMic: 82,
      romanticBreath: 62,
      confidence: 74,
      breath: 30,
      air: 34,
      saturation: 18
    }
  },
  {
    id: "asmr_secret",
    presetId: "asmr",
    name: "ASMR Secret",
    line: "Stay still for a second. I have a tiny secret for you.",
    direction: "Very close, low energy, soft consonants, breath placed on tails.",
    tags: ["asmr", "whisper", "soft"],
    sourceProfileId: "breathy_close",
    params: {
      intimacy: 98,
      phraseLift: 12,
      endingSoftness: 96,
      deliveryEnergy: 22,
      closeMic: 96,
      romanticBreath: 98,
      confidence: 18,
      breath: 78,
      whisper: 52,
      consonantSoftness: 88
    }
  },
  {
    id: "streamer_hook",
    presetId: "streamer",
    name: "Streamer Hook",
    line: "Here is the move: fast setup, clean payoff, zero dead air.",
    direction: "Punchy delivery, tight dynamics, bright presence, confident timing.",
    tags: ["streamer", "punchy", "clear"],
    sourceProfileId: "neutral_medium",
    params: {
      phraseLift: 34,
      endingSoftness: 18,
      deliveryEnergy: 88,
      closeMic: 36,
      romanticBreath: 6,
      confidence: 92,
      compression: 72,
      presence: 38,
      air: 20
    }
  },
  {
    id: "narrator_rain",
    presetId: "narrator",
    name: "Narrator Rain",
    line: "Tonight's story begins in a city that learned to breathe in rain.",
    direction: "Warm authority, slower phrase lift, controlled space, clean ends.",
    tags: ["narrator", "warm", "controlled"],
    sourceProfileId: "low_warm",
    params: {
      body: 64,
      phraseLift: 8,
      endingSoftness: 44,
      deliveryEnergy: 38,
      closeMic: 46,
      romanticBreath: 12,
      confidence: 78,
      ambience: 16,
      compression: 64
    }
  },
  {
    id: "radio_tag",
    presetId: "radio",
    name: "Radio Tag",
    line: "You are tuned to the signal that cuts through the whole night.",
    direction: "Compressed broadcast push, narrow space, clear tag ending.",
    tags: ["radio", "broadcast", "compressed"],
    sourceProfileId: "neutral_medium",
    params: {
      body: 36,
      phraseLift: 6,
      endingSoftness: 10,
      deliveryEnergy: 90,
      closeMic: 18,
      romanticBreath: 0,
      confidence: 92,
      compression: 82,
      presence: 72
    }
  },
  {
    id: "robot_protocol",
    presetId: "robot",
    name: "Robot Protocol",
    line: "Protocol accepted. Emotional variance remains within useful limits.",
    direction: "Mechanical timing, dry confidence, intelligible metallic tone.",
    tags: ["robot", "machine", "dry"],
    sourceProfileId: "neutral_medium",
    params: {
      phraseLift: 4,
      endingSoftness: 0,
      deliveryEnergy: 72,
      closeMic: 0,
      romanticBreath: 0,
      confidence: 70,
      consonantSoftness: 8,
      robot: 84,
      compression: 62
    }
  },
  {
    id: "creature_warning",
    presetId: "creature",
    name: "Creature Warning",
    line: "Step back while the room still remembers your shape.",
    direction: "Large dark mouth, forward threat, minimal lift, rough body.",
    tags: ["creature", "monster", "dark"],
    sourceProfileId: "low_warm",
    params: {
      body: 92,
      phraseLift: 0,
      endingSoftness: 24,
      deliveryEnergy: 82,
      closeMic: 58,
      romanticBreath: 0,
      confidence: 62,
      breath: 20,
      consonantSoftness: 8,
      creature: 78
    }
  }
]);

export function lineReadById(id) {
  return LINE_READ_TARGETS.find((target) => target.id === id) || LINE_READ_TARGETS[0];
}

export function firstLineReadForPreset(presetId) {
  return LINE_READ_TARGETS.find((target) => target.presetId === presetId) || LINE_READ_TARGETS[0];
}

export function paramsForLineReadTarget(id) {
  const target = lineReadById(id);
  return paramsForPreset(target.presetId, target.params);
}

export function validateLineReadTargets() {
  const presetIds = new Set(FACTORY_PRESETS.map((preset) => preset.id));
  return LINE_READ_TARGETS.map((target) => ({
    id: target.id,
    ok: presetIds.has(target.presetId) && Boolean(target.line) && Boolean(target.direction),
    presetId: target.presetId
  }));
}

export function scoreLineReadTarget(params, targetOrId) {
  const breakdown = targetMatchBreakdown(params, targetOrId).filter((axis) => axis.targeted);
  if (!breakdown.length) return 100;
  const miss = breakdown.reduce((sum, axis) => sum + Math.min(1, axis.normalizedGap), 0) / breakdown.length;
  return Math.max(0, Math.round((1 - miss) * 100));
}

export function targetMatchBreakdown(params, targetOrId) {
  const target = typeof targetOrId === "string" ? lineReadById(targetOrId) : targetOrId;
  return PERFORMANCE_AXES.map((axis) => {
    const targeted = Object.prototype.hasOwnProperty.call(target.params, axis.key);
    const fallbackTarget = paramsForPreset(target.presetId)[axis.key] ?? 0;
    const targetValue = Number(targeted ? target.params[axis.key] : fallbackTarget);
    const currentValue = Number(params[axis.key] ?? 0);
    const range = SCORE_RANGES[axis.key] || axis.range || SCORE_RANGES.default;
    const delta = targetValue - currentValue;
    const normalizedGap = Math.min(1, Math.abs(delta) / range);
    return {
      key: axis.key,
      label: axis.label,
      fullLabel: axis.fullLabel,
      current: currentValue,
      target: targetValue,
      delta,
      targeted,
      normalizedGap,
      score: Math.max(0, Math.round((1 - normalizedGap) * 100)),
      action: Math.abs(delta) < 0.5 ? "hold" : delta > 0 ? "raise" : "lower"
    };
  });
}

export function topTargetGaps(params, targetOrId, limit = 3) {
  return targetMatchBreakdown(params, targetOrId)
    .filter((axis) => axis.targeted && axis.action !== "hold")
    .sort((a, b) => b.normalizedGap - a.normalizedGap)
    .slice(0, limit);
}

export function lineReadRecipe(params, targetOrId) {
  const axes = targetMatchBreakdown(params, targetOrId).filter((axis) => axis.targeted);
  return RECIPE_GROUPS.map((group) => {
    const groupAxes = axes.filter((axis) => group.keys.includes(axis.key));
    const score = groupAxes.length
      ? Math.round(groupAxes.reduce((sum, axis) => sum + axis.score, 0) / groupAxes.length)
      : 100;
    const largestGap = [...groupAxes]
      .filter((axis) => axis.action !== "hold")
      .sort((a, b) => b.normalizedGap - a.normalizedGap)[0] || null;
    return {
      id: group.id,
      label: group.label,
      score,
      status: score >= 98 ? "locked" : score >= 90 ? "polish" : "shape",
      gap: largestGap ? coachCueForAxis(largestGap) : null
    };
  });
}

export function coachLineReadTarget(params, targetOrId, limit = 3) {
  const score = scoreLineReadTarget(params, targetOrId);
  const gaps = topTargetGaps(params, targetOrId, limit).map(coachCueForAxis);
  const next = gaps[0] || null;
  return {
    score,
    status: score >= 98 ? "locked" : score >= 90 ? "polish" : "shape",
    groups: lineReadRecipe(params, targetOrId),
    cues: gaps,
    nextPatch: next ? { [next.key]: next.target } : {}
  };
}

function coachCueForAxis(axis) {
  const cue = AXIS_CUES[axis.key]?.[axis.action] || "Move this axis toward the target.";
  return {
    key: axis.key,
    label: axis.fullLabel,
    action: axis.action,
    current: axis.current,
    target: axis.target,
    delta: axis.delta,
    score: axis.score,
    cue
  };
}
