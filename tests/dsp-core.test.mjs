import assert from "node:assert/strict";
import { FACTORY_PRESETS, paramsForPreset } from "../src/audio/presets.js";
import {
  analyzeBuffer,
  buildCalibrationProfile,
  calibrateParamsForVoice,
  encodeWavMono,
  generateReferenceVoice,
  generateTestVoice,
  granularShift,
  processVoiceBuffer,
  REFERENCE_VOICE_PROFILES,
  runPresetQualitySuite,
  runReferenceQualitySuite,
  selfTestDspCore
} from "../src/audio/dsp-core.js";

const sampleRate = 48000;
const source = generateTestVoice({ sampleRate, duration: 1.25, f0: 150 });

assert.ok(FACTORY_PRESETS.length >= 10, "factory preset count should cover multiple character targets");
assert.ok(REFERENCE_VOICE_PROFILES.length >= 4, "reference profiles should cover varied source voices");
assert.equal(source.length, Math.round(sampleRate * 1.25), "generated sample length");
const sourceAnalysis = analyzeBuffer(source, sampleRate);
assert.ok(sourceAnalysis.rms > 0.02, "generated sample should contain audible energy");
assert.ok(sourceAnalysis.pitchMedianHz > 90 && sourceAnalysis.pitchMedianHz < 240, "generated sample exposes a plausible F0");
assert.ok(Number.isFinite(sourceAnalysis.brightnessRatio), "generated sample exposes brightness analysis");

for (const preset of FACTORY_PRESETS) {
  const processed = processVoiceBuffer(source, sampleRate, paramsForPreset(preset.id));
  const analysis = analyzeBuffer(processed, sampleRate);
  assert.equal(processed.length, source.length, `${preset.id} preserves length`);
  assert.ok(Number.isFinite(analysis.rms), `${preset.id} has finite rms`);
  assert.ok(analysis.peak <= 1, `${preset.id} is limited`);
  assert.ok(!analysis.clipped, `${preset.id} should not clip`);
}

const shifted = granularShift(source, sampleRate, Math.pow(2, 4 / 12), 0.085);
assert.equal(shifted.length, source.length, "granular shifter preserves length");
assert.notEqual(analyzeBuffer(shifted, sampleRate).zeroCrossingsPerSecond, analyzeBuffer(source, sampleRate).zeroCrossingsPerSecond);

const lowSource = generateTestVoice({ sampleRate, duration: 1.0, f0: 95 });
const lowProfile = buildCalibrationProfile(lowSource, sampleRate);
const kawaii = paramsForPreset("kawaii");
const tunedKawaii = calibrateParamsForVoice(kawaii, lowProfile);
assert.equal(lowProfile.range, "low", "low reference voice should calibrate as low range");
assert.ok(tunedKawaii.pitch > kawaii.pitch, "low voice kawaii calibration should lift pitch");
assert.ok(tunedKawaii.formant > kawaii.formant, "low voice kawaii calibration should lift formant-like shift");

for (const profile of REFERENCE_VOICE_PROFILES) {
  const reference = generateReferenceVoice(profile.id, { sampleRate, duration: 0.65 });
  const profileAnalysis = buildCalibrationProfile(reference.samples, sampleRate);
  assert.equal(reference.samples.length, Math.round(sampleRate * 0.65), `${profile.id} reference length`);
  assert.ok(profileAnalysis.rms > 0.01, `${profile.id} reference should have energy`);
  assert.ok(profileAnalysis.pitchMedianHz > 60, `${profile.id} reference should expose pitch`);
}

const wav = encodeWavMono(source, sampleRate);
assert.equal(wav.type, "audio/wav");
assert.ok(wav.size > 44, "wav has payload");

const self = selfTestDspCore();
assert.equal(self.ok, true, "core self test");
assert.ok(self.profile && self.calibratedParams, "self test should include calibration data");
assert.ok(self.quality && self.quality.ok, "self test should include a passing quality suite");

const quality = runPresetQualitySuite({ sampleRate, duration: 0.65 });
assert.equal(quality.ok, true, "preset quality suite should pass");
assert.equal(quality.results.length, FACTORY_PRESETS.length, "quality suite should cover every preset");
assert.equal(quality.counts.fail, 0, "quality suite should not fail any preset");
assert.equal(quality.renderedSeconds, quality.duration * quality.results.length, "quality suite should track rendered seconds");
assert.ok(quality.results.some((item) => item.id === "kawaii" && item.deltas.brightness > 0.03), "kawaii should brighten the source");
assert.ok(quality.results.some((item) => item.id === "kawaii" && item.deltas.pitchHz > 20), "kawaii should lift the apparent F0");
assert.ok(quality.results.some((item) => item.id === "ikemen" && item.deltas.pitchHz < -10), "ikemen should lower the apparent F0");
assert.ok(quality.results.some((item) => item.id === "asmr" && item.deltas.zcr > 1000), "asmr should add measurable breath/frication texture");
assert.ok(quality.results.some((item) => item.id === "otome" && item.deltas.zcr > 600), "otome should add close breath texture");

const referenceQuality = runReferenceQualitySuite({ sampleRate, duration: 0.42 });
assert.equal(referenceQuality.ok, true, "multi-source quality suite should pass");
assert.equal(referenceQuality.suites.length, REFERENCE_VOICE_PROFILES.length, "multi-source suite should cover all reference profiles");
assert.equal(referenceQuality.results.length, FACTORY_PRESETS.length * REFERENCE_VOICE_PROFILES.length, "multi-source suite should cover every preset/profile pair");
assert.equal(referenceQuality.renderedSeconds, referenceQuality.duration * referenceQuality.results.length, "multi-source suite should track all rendered seconds");
assert.ok(referenceQuality.realtimeFactor < 0.8, "multi-source aggregate render speed should be measured against every rendered preset/profile pair");

console.log("dsp-core.test.mjs passed");
