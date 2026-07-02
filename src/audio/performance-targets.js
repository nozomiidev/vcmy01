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
  const target = typeof targetOrId === "string" ? lineReadById(targetOrId) : targetOrId;
  const keys = PERFORMANCE_TARGET_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(target.params, key));
  if (!keys.length) return 100;
  const miss = keys.reduce((sum, key) => {
    const range = SCORE_RANGES[key] || SCORE_RANGES.default;
    return sum + Math.min(1, Math.abs(Number(params[key] ?? 0) - Number(target.params[key])) / range);
  }, 0) / keys.length;
  return Math.max(0, Math.round((1 - miss) * 100));
}
