import assert from "node:assert/strict";
import { DIRECTOR_DEFS, FACTORY_PRESETS, paramsForPreset } from "../src/audio/presets.js";
import {
  coachLineReadTarget,
  LINE_READ_TARGETS,
  lineReadRecipe,
  paramsForLineReadTarget,
  scoreLineReadTarget,
  targetMatchBreakdown,
  topTargetGaps,
  validateLineReadTargets
} from "../src/audio/performance-targets.js";
import { normalizeRenderRegion, OfflineRenderer } from "../src/audio/offline-renderer.js";
import { addRenderDeckItem, renderReview, totalDeckSeconds } from "../src/audio/render-review.js";
import { rankVoiceRoutes, voiceRouteTargets } from "../src/audio/route-planner.js";
import { bestCharacterChainPatch, characterChainReport, CHARACTER_CHAIN_STAGES } from "../src/audio/character-chain.js";
import {
  analyzeBuffer,
  buildCalibrationProfile,
  calibrateParamsForVoice,
  encodeWavMono,
  generateReferenceVoice,
  generateTestVoice,
  granularShift,
  normalizeParams,
  processVoiceBuffer,
  REFERENCE_VOICE_PROFILES,
  runPresetQualitySuite,
  runReferenceQualitySuite,
  selfTestDspCore
} from "../src/audio/dsp-core.js";

const sampleRate = 48000;
const source = generateTestVoice({ sampleRate, duration: 1.25, f0: 150 });

assert.ok(FACTORY_PRESETS.length >= 10, "factory preset count should cover multiple character targets");
assert.ok(DIRECTOR_DEFS.length >= 6, "director controls should expose performance intent, not only DSP knobs");
assert.ok(CHARACTER_CHAIN_STAGES.length >= 7, "character chain should expose staged voice-design workflow");
assert.ok(LINE_READ_TARGETS.length >= 8, "line-read targets should cover repeatable acting checks");
assert.equal(validateLineReadTargets().every((target) => target.ok), true, "line-read targets should reference real presets and copy");
assert.equal(new Set(voiceRouteTargets().map((target) => target.presetId)).size, FACTORY_PRESETS.length, "route planner should cover every factory voice target");
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

const directedParams = paramsForPreset("clean", {
  phraseLift: 85,
  endingSoftness: 78,
  deliveryEnergy: 82,
  closeMic: 72,
  romanticBreath: 86,
  confidence: 74
});
const directedNormalized = normalizeParams(directedParams);
assert.ok(directedNormalized.prosody > paramsForPreset("clean").prosody, "director controls should feed the prosody layer");
assert.ok(directedNormalized.breath > paramsForPreset("clean").breath, "romantic breath placement should feed breath texture");
assert.ok(directedNormalized.presence > paramsForPreset("clean").presence, "confidence/energy should feed presence");
const directed = processVoiceBuffer(source, sampleRate, directedParams);
const directedAnalysis = analyzeBuffer(directed, sampleRate);
assert.equal(directed.length, source.length, "director processing preserves length");
assert.ok(Math.abs(directedAnalysis.rmsDb - sourceAnalysis.rmsDb) > 0.3, "director layer should measurably change delivery dynamics");
assert.ok(directedAnalysis.zeroCrossingsPerSecond > sourceAnalysis.zeroCrossingsPerSecond + 500, "director breath placement should add measurable tail texture");

const otomeRead = LINE_READ_TARGETS.find((target) => target.id === "otome_promise");
assert.ok(otomeRead, "otome line-read target should exist");
const otomeReadParams = paramsForLineReadTarget(otomeRead.id);
assert.equal(scoreLineReadTarget(otomeReadParams, otomeRead), 100, "applied line-read params should match target controls");
const otomeBreakdown = targetMatchBreakdown(otomeReadParams, otomeRead);
assert.ok(otomeBreakdown.some((axis) => axis.key === "endingSoftness" && axis.score === 100), "line-read breakdown should expose per-axis target scores");
const otomeGaps = topTargetGaps(paramsForPreset("otome"), otomeRead, 3);
assert.ok(otomeGaps.some((axis) => axis.key === "endingSoftness" && axis.action === "raise"), "line-read gaps should identify target drift");
const otomeCoach = coachLineReadTarget(paramsForPreset("otome"), otomeRead, 3);
assert.equal(otomeCoach.status, "polish", "near-target line read should be in polish status");
assert.equal(otomeCoach.cues[0].key, "breath", "coach should prioritize the largest target gap");
assert.deepEqual(otomeCoach.nextPatch, { breath: 58 }, "coach should expose a one-step patch for the next fix");
const otomeRecipe = lineReadRecipe(paramsForPreset("otome"), otomeRead);
assert.ok(otomeRecipe.some((group) => group.id === "distance" && group.gap.key === "breath"), "recipe should map target drift into workflow groups");
const otomeChain = characterChainReport(paramsForPreset("otome"), otomeRead);
const otomeChainPatch = bestCharacterChainPatch(otomeChain);
const improvedOtomeChain = characterChainReport({ ...paramsForPreset("otome"), ...otomeChainPatch }, otomeRead);
assert.ok(otomeChain.stages.some((stage) => stage.id === "texture" && stage.patch.some((patch) => patch.key === "breath")), "character chain should expose texture-stage drift");
assert.ok(Object.keys(otomeChainPatch).length > 0, "character chain should expose a next-stage patch");
assert.ok(improvedOtomeChain.score >= otomeChain.score, "applying the chain patch should not reduce the chain score");
assert.ok(otomeReadParams.endingSoftness > paramsForPreset("otome").endingSoftness, "otome line read should push soft endings beyond the base preset");
assert.ok(otomeReadParams.romanticBreath > paramsForPreset("otome").romanticBreath, "otome line read should push breath placement beyond the base preset");
const otomeReadRendered = processVoiceBuffer(source, sampleRate, otomeReadParams);
const otomeReadAnalysis = analyzeBuffer(otomeReadRendered, sampleRate);
assert.equal(otomeReadRendered.length, source.length, "line-read target processing preserves source length");
assert.ok(otomeReadAnalysis.zeroCrossingsPerSecond > sourceAnalysis.zeroCrossingsPerSecond + 600, "otome line read should add measurable close breath texture");

const lowSource = generateTestVoice({ sampleRate, duration: 1.0, f0: 95 });
const lowProfile = buildCalibrationProfile(lowSource, sampleRate);
const kawaii = paramsForPreset("kawaii");
const tunedKawaii = calibrateParamsForVoice(kawaii, lowProfile);
const tunedKawaiiAgain = calibrateParamsForVoice(tunedKawaii, lowProfile);
assert.equal(lowProfile.range, "low", "low reference voice should calibrate as low range");
assert.ok(tunedKawaii.pitch > kawaii.pitch, "low voice kawaii calibration should lift pitch");
assert.ok(tunedKawaii.formant > kawaii.formant, "low voice kawaii calibration should lift formant-like shift");
assert.equal(tunedKawaiiAgain.pitch, tunedKawaii.pitch, "calibration should not stack repeatedly for the same source profile");

const offline = new OfflineRenderer();
offline.generateSample(sampleRate, "low_warm");
const lowRoutes = rankVoiceRoutes(offline.profile, offline.source, { limit: 12 });
const lowIkemenRoute = lowRoutes.find((route) => route.presetId === "ikemen");
const lowKawaiiRoute = lowRoutes.find((route) => route.presetId === "kawaii");
assert.ok(lowRoutes.length >= FACTORY_PRESETS.length, "route planner should rank line-read and synthetic preset routes");
assert.ok(lowIkemenRoute.score > lowKawaiiRoute.score, "low warm sources should rank low/close character routes above kawaii stretch routes");
assert.ok(lowIkemenRoute.tunedParams._sourceCalibration, "applied route params should carry source calibration idempotency");
const kawaiiSpark = LINE_READ_TARGETS.find((target) => target.id === "kawaii_spark");
const lowToKawaiiFit = offline.sourceFitReport(kawaii, kawaiiSpark);
const lowKawaiiChain = characterChainReport(kawaii, kawaiiSpark, {
  sourceFit: lowToKawaiiFit,
  sourceTunedParams: offline.calibratedParams(kawaii)
});
assert.equal(lowToKawaiiFit.status, "risk", "low source should be risky for a bright kawaii target before tuning");
assert.ok(lowToKawaiiFit.score < 70, "source fit should score mismatched source and target conservatively");
assert.ok(lowToKawaiiFit.items.some((item) => item.id === "range" && item.status === "risk"), "source fit should flag range mismatch");
assert.ok(lowToKawaiiFit.patches.some((item) => item.key === "pitch" && item.delta > 0), "source fit should expose calibration patches");
assert.equal(lowKawaiiChain.nextStageId, "guardrail", "source mismatch should prioritize the guardrail chain stage");
assert.ok(bestCharacterChainPatch(lowKawaiiChain)._sourceCalibration, "guardrail chain patch should carry calibration idempotency");
const autoRendered = offline.render(kawaii, { autoCalibrate: true });
assert.equal(autoRendered.autoCalibrated, true, "offline render should preserve auto calibration metadata");
assert.equal(autoRendered.region.isFull, true, "default offline render should cover the full source");
assert.ok(autoRendered.calibrationDelta.some((item) => item.key === "pitch" && item.delta > 0), "auto render should lift low-source pitch for kawaii");
assert.ok(autoRendered.calibrationDelta.some((item) => item.key === "formant" && item.delta > 0), "auto render should lift low-source formant for kawaii");
assert.ok(autoRendered.calibrationDelta.some((item) => item.key === "body" && item.delta < 0), "auto render should reduce low-source body for kawaii");
const tunedLowToKawaiiFit = offline.sourceFitReport(autoRendered.appliedParams, kawaiiSpark);
assert.equal(tunedLowToKawaiiFit.patches.length, 0, "source fit should not keep suggesting the same source patch after tuning");
assert.ok(tunedLowToKawaiiFit.score > lowToKawaiiFit.score, "source fit should improve after tuning even when range remains risky");
const autoReview = renderReview(offline.source, autoRendered);
assert.ok(autoReview.score >= 70, "render review should score usable offline renders");
assert.ok(autoReview.items.some((item) => item.id === "f0" && item.value.includes("+")), "render review should expose apparent F0 movement");
const previewRendered = offline.render(kawaii, { autoCalibrate: true, region: { startSec: 0.5, durationSec: 0.75 }, mode: "preview" });
assert.equal(previewRendered.mode, "preview", "offline preview should preserve render mode");
assert.equal(previewRendered.region.isFull, false, "offline preview should be marked as a region render");
assert.equal(previewRendered.samples.length, Math.round(sampleRate * 0.75), "offline preview should render only the requested region");
assert.equal(previewRendered.region.startSample, Math.round(sampleRate * 0.5), "offline preview should preserve region start");
const deck = [
  { id: "full", rendered: autoRendered, review: autoReview },
  { id: "preview", rendered: previewRendered, review: renderReview(offline.source, previewRendered) }
];
const trimmedDeck = addRenderDeckItem(deck, { id: "next", rendered: previewRendered, review: renderReview(offline.source, previewRendered) }, { maxItems: 2, maxSeconds: 5 });
assert.equal(trimmedDeck.length, 2, "render deck should cap item count");
const budgetDeck = addRenderDeckItem(deck, { id: "budget", rendered: previewRendered, review: renderReview(offline.source, previewRendered) }, { maxItems: 4, maxSeconds: 2 });
assert.ok(totalDeckSeconds(budgetDeck) <= 2, "render deck should cap retained render seconds");

offline.generateSample(sampleRate, "high_bright");
const highRoutes = rankVoiceRoutes(offline.profile, offline.source, { limit: 6 });
assert.equal(highRoutes[0].presetId, "kawaii", "high bright sources should surface kawaii as the strongest route");
offline.generateSample(sampleRate, "breathy_close");
const breathyRoutes = rankVoiceRoutes(offline.profile, offline.source, { limit: 6 });
assert.equal(breathyRoutes[0].presetId, "asmr", "breathy close sources should surface ASMR as the strongest route");

const clampedRegion = normalizeRenderRegion(sampleRate * 3, sampleRate, { startSec: 2.8, durationSec: 1 });
assert.equal(clampedRegion.endSample, sampleRate * 3, "region should clamp to source end");
assert.ok(clampedRegion.durationSec <= 1 && clampedRegion.durationSec > 0.9, "clamped region should preserve requested duration where possible");

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
