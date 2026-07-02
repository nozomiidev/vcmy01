export const DEFAULT_PARAMS = Object.freeze({
  pitch: 0,
  formant: 0,
  mouth: 0,
  cuteness: 0,
  anime: 0,
  intimacy: 18,
  prosody: 0,
  breath: 0,
  whisper: 0,
  body: 0,
  brightness: 8,
  consonantSoftness: 0,
  deEss: 35,
  lowCut: 70,
  highCut: 18500,
  presence: 0,
  air: 4,
  saturation: 0,
  compression: 40,
  ambience: 0,
  delay: 0,
  robot: 0,
  creature: 0,
  dryWet: 100,
  inputGain: 0,
  outputGain: 0,
  monitorGain: 55,
  limiter: -1
});

export const PARAM_DEFS = Object.freeze([
  { key: "pitch", label: "Pitch", min: -12, max: 12, step: 0.25, unit: " st", group: "Voice Core" },
  { key: "formant", label: "Mouth / Formant-like", min: -12, max: 12, step: 0.25, unit: " st", group: "Voice Core" },
  { key: "mouth", label: "Mouth Size", min: -100, max: 100, step: 1, unit: "%", group: "Voice Core" },
  { key: "body", label: "Chest Body", min: -100, max: 100, step: 1, unit: "%", group: "Voice Core" },
  { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1, unit: "%", group: "Tone" },
  { key: "presence", label: "Presence", min: -100, max: 100, step: 1, unit: "%", group: "Tone" },
  { key: "air", label: "Air Gloss", min: -100, max: 100, step: 1, unit: "%", group: "Tone" },
  { key: "breath", label: "Breath", min: 0, max: 100, step: 1, unit: "%", group: "Texture" },
  { key: "whisper", label: "Whisper Blend", min: 0, max: 100, step: 1, unit: "%", group: "Texture" },
  { key: "consonantSoftness", label: "Consonant Softness", min: 0, max: 100, step: 1, unit: "%", group: "Texture" },
  { key: "deEss", label: "De-esser", min: 0, max: 100, step: 1, unit: "%", group: "Cleanup" },
  { key: "compression", label: "Compression", min: 0, max: 100, step: 1, unit: "%", group: "Cleanup" },
  { key: "saturation", label: "Saturation", min: 0, max: 100, step: 1, unit: "%", group: "Color" },
  { key: "ambience", label: "Ambience", min: 0, max: 100, step: 1, unit: "%", group: "Space" },
  { key: "delay", label: "Delay", min: 0, max: 100, step: 1, unit: "%", group: "Space" },
  { key: "robot", label: "Robot", min: 0, max: 100, step: 1, unit: "%", group: "Special" },
  { key: "creature", label: "Creature", min: 0, max: 100, step: 1, unit: "%", group: "Special" },
  { key: "dryWet", label: "Dry / Wet", min: 0, max: 100, step: 1, unit: "%", group: "Output" },
  { key: "outputGain", label: "Output Gain", min: -18, max: 12, step: 0.5, unit: " dB", group: "Output" },
  { key: "monitorGain", label: "Monitor", min: 0, max: 100, step: 1, unit: "%", group: "Output" }
]);

export const MACRO_DEFS = Object.freeze([
  { key: "cuteness", label: "Cuteness", min: 0, max: 100, step: 1, unit: "%" },
  { key: "anime", label: "Anime Lift", min: 0, max: 100, step: 1, unit: "%" },
  { key: "intimacy", label: "Intimacy", min: 0, max: 100, step: 1, unit: "%" },
  { key: "breath", label: "Breath", min: 0, max: 100, step: 1, unit: "%" },
  { key: "body", label: "Body", min: -100, max: 100, step: 1, unit: "%" },
  { key: "consonantSoftness", label: "Soft Consonants", min: 0, max: 100, step: 1, unit: "%" }
]);

export const FACTORY_PRESETS = Object.freeze([
  {
    id: "clean",
    name: "Clean Studio",
    target: "A stable, polished starting point with light cleanup.",
    params: {}
  },
  {
    id: "kawaii",
    name: "Kawaii Bright",
    target: "Small mouth, lifted pitch, soft consonants, sweet air.",
    params: {
      pitch: 4.25, formant: 4.5, mouth: 42, cuteness: 78, anime: 46,
      brightness: 42, presence: 18, air: 34, body: -38, breath: 18,
      consonantSoftness: 48, deEss: 58, compression: 48, ambience: 9
    }
  },
  {
    id: "anime_heroine",
    name: "Anime Heroine",
    target: "Energetic bright character tone with pronounced upper harmonics.",
    params: {
      pitch: 3.5, formant: 3.25, mouth: 28, cuteness: 54, anime: 82,
      brightness: 58, presence: 36, air: 26, body: -22, breath: 10,
      consonantSoftness: 32, deEss: 50, compression: 56, saturation: 8
    }
  },
  {
    id: "otome",
    name: "Otome Romantic",
    target: "Close, gentle, breath-colored romantic delivery.",
    params: {
      pitch: 1.75, formant: 1.8, mouth: 16, cuteness: 36, anime: 18,
      intimacy: 86, breath: 48, whisper: 12, brightness: 24, air: 48,
      consonantSoftness: 64, deEss: 72, compression: 62, ambience: 18
    }
  },
  {
    id: "ikemen",
    name: "Sultry Ikemen",
    target: "Low presence, restrained pitch shift, body, breath gloss.",
    params: {
      pitch: -2.25, formant: -3.25, mouth: -34, body: 72, intimacy: 68,
      breath: 24, brightness: 8, presence: 42, air: 28, consonantSoftness: 22,
      deEss: 44, compression: 60, saturation: 16, ambience: 10
    }
  },
  {
    id: "asmr",
    name: "Breathy Close",
    target: "Near-mic whisper texture, softened consonants, controlled highs.",
    params: {
      pitch: 0.25, formant: 0.75, intimacy: 96, breath: 72, whisper: 42,
      brightness: 12, presence: -8, air: 56, body: -8, consonantSoftness: 82,
      deEss: 82, compression: 72, ambience: 6
    }
  },
  {
    id: "streamer",
    name: "Streamer Polish",
    target: "Punchy, clear creator voice with safe loudness.",
    params: {
      pitch: 0, formant: 0, body: 18, brightness: 28, presence: 30,
      air: 18, deEss: 52, compression: 66, saturation: 10, ambience: 4
    }
  },
  {
    id: "narrator",
    name: "Deep Narrator",
    target: "Warm narration with authority and controlled space.",
    params: {
      pitch: -3.2, formant: -2.5, mouth: -18, body: 58, brightness: 4,
      presence: 20, air: 12, compression: 62, saturation: 12, ambience: 14
    }
  },
  {
    id: "radio",
    name: "Radio Presence",
    target: "Band-limited, saturated broadcast voice.",
    params: {
      pitch: -0.75, formant: -0.5, body: 34, brightness: -22,
      presence: 68, air: -50, compression: 78, saturation: 42,
      lowCut: 180, highCut: 5600, ambience: 0
    }
  },
  {
    id: "robot",
    name: "Robot Actor",
    target: "Metallic machine character with intelligible speech.",
    params: {
      pitch: -1.5, formant: -1, robot: 78, brightness: 18,
      presence: 24, compression: 58, saturation: 18, ambience: 4
    }
  },
  {
    id: "creature",
    name: "Creature Growl",
    target: "Large mouth, dark body, non-human growl texture.",
    params: {
      pitch: -6, formant: -7, mouth: -72, body: 88, creature: 70,
      brightness: -34, presence: 20, saturation: 38, compression: 72,
      ambience: 24, delay: 8
    }
  }
]);

export function mergeParams(base = {}, patch = {}) {
  return { ...DEFAULT_PARAMS, ...base, ...patch };
}

export function presetById(id) {
  return FACTORY_PRESETS.find((preset) => preset.id === id) || FACTORY_PRESETS[0];
}

export function paramsForPreset(id, override = {}) {
  return mergeParams(presetById(id).params, override);
}
