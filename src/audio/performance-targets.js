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

export const SCENE_KITS = Object.freeze([
  {
    id: "otome_close_scene",
    presetId: "otome",
    name: "Otome Close Scene",
    description: "A three-beat romantic distance read: hold, confess, then release.",
    tags: ["otome", "romance", "near"],
    beats: [
      {
        id: "hold",
        name: "Hold The Moment",
        lineReadId: "otome_promise",
        line: "Stay with me a little longer. I am not ready to let this moment end.",
        direction: "Gentle close distance, restrained lift, soft falling tail.",
        params: { intimacy: 94, phraseLift: 34, endingSoftness: 94, deliveryEnergy: 34, closeMic: 88, romanticBreath: 92, confidence: 32, breath: 64, whisper: 18 }
      },
      {
        id: "confess",
        name: "Fragile Confession",
        lineReadId: "otome_promise",
        line: "I tried to say it lightly, but my heart keeps giving me away.",
        direction: "More vulnerable breath placement with a warmer, lower-energy finish.",
        params: { intimacy: 96, phraseLift: 40, endingSoftness: 96, deliveryEnergy: 30, closeMic: 90, romanticBreath: 98, confidence: 26, breath: 70, whisper: 22, consonantSoftness: 76 }
      },
      {
        id: "release",
        name: "Whisper Promise",
        lineReadId: "otome_promise",
        line: "If this is a dream, then let me be selfish for one more breath.",
        direction: "Very close whisper color, longer tail air, soft consonants.",
        params: { intimacy: 98, phraseLift: 26, endingSoftness: 98, deliveryEnergy: 24, closeMic: 96, romanticBreath: 100, confidence: 22, breath: 76, whisper: 30, consonantSoftness: 82 }
      }
    ]
  },
  {
    id: "ikemen_midnight_scene",
    presetId: "ikemen",
    name: "Ikemen Midnight Scene",
    description: "Low invitation, amused tease, then protective close finish.",
    tags: ["ikemen", "low", "sultry"],
    beats: [
      {
        id: "invite",
        name: "Low Invite",
        lineReadId: "ikemen_low",
        line: "Come closer. I will keep my voice low enough for only you.",
        direction: "Near-mic low body, relaxed confidence, restrained motion.",
        params: { body: 86, intimacy: 82, phraseLift: 12, endingSoftness: 66, deliveryEnergy: 36, closeMic: 88, romanticBreath: 70, confidence: 78, breath: 34, air: 40, saturation: 20 }
      },
      {
        id: "tease",
        name: "Amused Tease",
        lineReadId: "ikemen_low",
        line: "You noticed? Good. I was hoping you would.",
        direction: "Slight smile, more presence, controlled upward phrase gesture.",
        params: { body: 78, intimacy: 74, phraseLift: 28, endingSoftness: 54, deliveryEnergy: 50, closeMic: 78, romanticBreath: 56, confidence: 86, presence: 48, air: 36, saturation: 22 }
      },
      {
        id: "protect",
        name: "Protective Vow",
        lineReadId: "ikemen_low",
        line: "Do not be afraid. I am already standing between you and the dark.",
        direction: "Warmer authority, lower lift, firm but soft landing.",
        params: { body: 90, intimacy: 72, phraseLift: 8, endingSoftness: 58, deliveryEnergy: 52, closeMic: 70, romanticBreath: 44, confidence: 92, compression: 66, saturation: 18 }
      }
    ]
  },
  {
    id: "kawaii_spark_scene",
    presetId: "kawaii",
    name: "Kawaii Spark Scene",
    description: "Playful lift, flustered breath, then tiny brave finish.",
    tags: ["kawaii", "anime", "bright"],
    beats: [
      {
        id: "spark",
        name: "Spark",
        lineReadId: "kawaii_spark",
        line: "Ehehe, did I sound a little cooler just now?",
        direction: "Small bright mouth, playful lift, soft consonants.",
        params: { cuteness: 90, anime: 58, phraseLift: 86, endingSoftness: 46, deliveryEnergy: 66, closeMic: 30, romanticBreath: 30, confidence: 54, breath: 24, consonantSoftness: 62 }
      },
      {
        id: "fluster",
        name: "Fluster Pop",
        lineReadId: "kawaii_spark",
        line: "W-wait, do not smile like that. I will forget what I practiced.",
        direction: "Higher animated lift, softer consonants, lighter confidence.",
        params: { cuteness: 96, anime: 72, phraseLift: 94, endingSoftness: 58, deliveryEnergy: 58, closeMic: 34, romanticBreath: 42, confidence: 34, breath: 34, consonantSoftness: 78 }
      },
      {
        id: "brave",
        name: "Tiny Brave",
        lineReadId: "anime_charge",
        line: "Okay. I am small, but I can still shine brighter than anyone.",
        direction: "Cute but confident, clearer attack, stronger phrase arc.",
        params: { cuteness: 88, anime: 84, phraseLift: 92, endingSoftness: 28, deliveryEnergy: 78, closeMic: 26, romanticBreath: 18, confidence: 74, breath: 18, consonantSoftness: 42 }
      }
    ]
  },
  {
    id: "asmr_secret_scene",
    presetId: "asmr",
    name: "ASMR Secret Scene",
    description: "Soft entry, breath-tail secret, and clean close reassurance.",
    tags: ["asmr", "whisper", "close"],
    beats: [
      {
        id: "still",
        name: "Stay Still",
        lineReadId: "asmr_secret",
        line: "Stay still for a second. I have a tiny secret for you.",
        direction: "Very close, low energy, soft consonants, breath on tails.",
        params: { intimacy: 100, phraseLift: 10, endingSoftness: 98, deliveryEnergy: 18, closeMic: 98, romanticBreath: 100, confidence: 16, breath: 82, whisper: 58, consonantSoftness: 90 }
      },
      {
        id: "trace",
        name: "Breath Trace",
        lineReadId: "asmr_secret",
        line: "There. Hear that little pause? That part is just for you.",
        direction: "Placed pauses, tail air, less pitch lift, intimate distance.",
        params: { intimacy: 100, phraseLift: 6, endingSoftness: 100, deliveryEnergy: 16, closeMic: 100, romanticBreath: 100, confidence: 12, breath: 88, whisper: 66, consonantSoftness: 92 }
      },
      {
        id: "safe",
        name: "Soft Safe",
        lineReadId: "asmr_secret",
        line: "You can relax now. I will keep everything quiet.",
        direction: "Softer reassurance with cleaner consonants and controlled breath.",
        params: { intimacy: 96, phraseLift: 8, endingSoftness: 96, deliveryEnergy: 20, closeMic: 94, romanticBreath: 88, confidence: 30, breath: 70, whisper: 46, consonantSoftness: 84, deEss: 86 }
      }
    ]
  }
]);

export const ALL_LINE_READ_TARGETS = Object.freeze([
  ...LINE_READ_TARGETS,
  ...sceneBeatTargets()
]);

export function sceneKitById(id) {
  return SCENE_KITS.find((kit) => kit.id === id) || SCENE_KITS[0];
}

export function sceneKitForTargetId(targetId) {
  return SCENE_KITS.find((kit) => kit.beats.some((beat) => sceneBeatTargetId(kit, beat) === targetId)) || null;
}

export function sceneBeatByTargetId(targetId) {
  for (const kit of SCENE_KITS) {
    const beat = kit.beats.find((candidate) => sceneBeatTargetId(kit, candidate) === targetId);
    if (beat) return { kit, beat, target: sceneBeatTarget(kit, beat) };
  }
  return null;
}

export function sceneBeatTargetsForKit(kitId) {
  const kit = sceneKitById(kitId);
  return kit.beats.map((beat) => sceneBeatTarget(kit, beat));
}

export function lineReadById(id) {
  return ALL_LINE_READ_TARGETS.find((target) => target.id === id) || LINE_READ_TARGETS[0];
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
  return ALL_LINE_READ_TARGETS.map((target) => ({
    id: target.id,
    ok: presetIds.has(target.presetId) && Boolean(target.line) && Boolean(target.direction),
    presetId: target.presetId
  }));
}

function sceneBeatTargets() {
  return SCENE_KITS.flatMap((kit) => kit.beats.map((beat) => sceneBeatTarget(kit, beat)));
}

function sceneBeatTarget(kit, beat) {
  const base = lineReadBaseById(beat.lineReadId) || firstLineReadForPreset(kit.presetId);
  return {
    id: sceneBeatTargetId(kit, beat),
    presetId: beat.presetId || kit.presetId,
    name: beat.name,
    line: beat.line,
    direction: beat.direction,
    tags: [...kit.tags, beat.id],
    sourceProfileId: beat.sourceProfileId || base.sourceProfileId,
    params: { ...base.params, ...beat.params },
    sceneKitId: kit.id,
    sceneBeatId: beat.id,
    sceneName: kit.name
  };
}

function sceneBeatTargetId(kit, beat) {
  return `scene_${kit.id}_${beat.id}`;
}

function lineReadBaseById(id) {
  return LINE_READ_TARGETS.find((target) => target.id === id) || null;
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
