import assert from "node:assert/strict";
import { DIRECTOR_DEFS, FACTORY_PRESETS, paramsForPreset } from "../src/audio/presets.js";
import {
  ALL_LINE_READ_TARGETS,
  coachLineReadTarget,
  LINE_READ_TARGETS,
  lineReadRecipe,
  paramsForLineReadTarget,
  SCENE_KITS,
  sceneBeatTargetsForKit,
  sceneKitForTargetId,
  scoreLineReadTarget,
  targetMatchBreakdown,
  topTargetGaps,
  validateLineReadTargets
} from "../src/audio/performance-targets.js";
import { normalizeRenderRegion, OfflineRenderer } from "../src/audio/offline-renderer.js";
import { livePolishedParams } from "../src/audio/engine.js";
import { AUDITION_VARIANT_IDS, auditionVariantSummary, buildAuditionVariants } from "../src/audio/audition-variants.js";
import { addRenderDeckItem, listeningComfortReview, renderPerformanceBudget, renderReview, totalDeckSeconds } from "../src/audio/render-review.js";
import { rankRenderDeckTakes, sourceSamplesForRenderedRegion } from "../src/audio/take-decision.js";
import { buildKeeperRefinement } from "../src/audio/take-refinement.js";
import { rankVoiceRoutes, voiceRouteTargets } from "../src/audio/route-planner.js";
import { bestCharacterChainPatch, characterChainReport, CHARACTER_CHAIN_STAGES } from "../src/audio/character-chain.js";
import { bestEffectStackPatch, buildEffectStack, EFFECT_STACK_STAGE_IDS } from "../src/audio/effect-stack.js";
import { buildStackAuditions, stackAuditionSummary } from "../src/audio/stack-audition.js";
import { analyzePerformanceTrace, comparePerformanceTraces } from "../src/audio/performance-trace.js";
import { automationSummary, buildPerformanceScript, compareScriptToPerformance, renderScriptAutomation, SCRIPT_LANES } from "../src/audio/performance-script.js";
import { buildDirectorBrief } from "../src/audio/director-brief.js";
import { buildStudioPlan, STUDIO_PLAN_STEP_IDS } from "../src/audio/studio-plan.js";
import { buildSceneSession, sceneSessionSummary } from "../src/audio/scene-session.js";
import { addVoiceSnapshot, buildVoiceMemoryBoard, createVoiceSnapshot, snapshotParamPatch } from "../src/audio/voice-memory.js";
import { addProjectSnapshot, buildProjectVault, createProjectSnapshot, projectParamPatch } from "../src/audio/project-vault.js";
import { buildSourceTimeline, cueRegion, nearestCueIdForRegion, sourceTimelineSummary } from "../src/audio/source-timeline.js";
import {
  analyzeStudioVoice,
  buildMicroRepairTimeline,
  buildSourceReactivePlan,
  buildStudioRepairMap,
  buildStudioPolishPlan,
  optimizeStudioPolishPlan,
  processStudioPolish,
  runStudioPolishQualitySuite,
  STUDIO_PRODUCTION_TARGETS
} from "../src/audio/studio-polish.js";
import { auditionComparisonNotes, buildAuditionComparison, buildExportManifest, renderedBaseName, studioPolishResearchNotes, takeDecisionNotes } from "../src/audio/export-session.js";
import { applyCharacterSafety, characterSafetySummary } from "../src/audio/character-safety.js";
import { analyzeSpectralVoice, spectralVoiceSummary } from "../src/audio/spectral-voice.js";
import { analyzeLoudness, loudnessTargetReview } from "../src/audio/loudness-meter.js";
import {
  analyzeBuffer,
  buildCalibrationProfile,
  calibrateParamsForVoice,
  encodeWavMono,
  estimatePitch,
  generateReferenceVoice,
  generateTestVoice,
  granularShift,
  applyBiquad,
  normalizeParams,
  peak,
  processVoiceBuffer,
  REFERENCE_VOICE_PROFILES,
  runPresetQualitySuite,
  runReferenceQualitySuite,
  selfTestDspCore,
  vocalTractProfile
} from "../src/audio/dsp-core.js";

const sampleRate = 48000;
const source = generateTestVoice({ sampleRate, duration: 1.25, f0: 150 });
const kawaiiTract = vocalTractProfile(paramsForPreset("kawaii"));
const ikemenTract = vocalTractProfile(paramsForPreset("ikemen"));
const liveLight = livePolishedParams(paramsForPreset("kawaii"), "light");
const liveStrong = livePolishedParams(paramsForPreset("kawaii"), "strong");

function concatFloat32(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function studioPolishFixture(base, sampleRate) {
  const out = new Float32Array(base);
  let seed = 9091;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out[i] += ((seed / 0xffffffff) * 2 - 1) * 0.0045;
  }
  for (const sec of [0.12, 0.62, 0.96]) {
    const start = Math.round(sec * sampleRate);
    const len = Math.round(0.075 * sampleRate);
    for (let i = 0; i < len && start + i < out.length; i++) {
      const env = 1 - i / len;
      out[start + i] += Math.sin((i / sampleRate) * Math.PI * 2 * 58) * 0.2 * env;
    }
  }
  for (const sec of [0.24, 0.52, 0.77, 1.05]) {
    const index = Math.round(sec * sampleRate);
    if (index > 2 && index + 2 < out.length) {
      out[index - 1] -= 0.22;
      out[index] += 0.5;
      out[index + 1] -= 0.28;
    }
  }
  return out;
}

assert.ok(FACTORY_PRESETS.length >= 10, "factory preset count should cover multiple character targets");
assert.ok(kawaiiTract.ratio > 1 && kawaiiTract.smallMouth > 0, "kawaii tract profile should lift apparent vocal-tract size");
assert.ok(ikemenTract.chest > kawaiiTract.chest && ikemenTract.gains.chestDb > kawaiiTract.gains.chestDb, "ikemen tract profile should emphasize chest resonance");
assert.ok(DIRECTOR_DEFS.length >= 6, "director controls should expose performance intent, not only DSP knobs");
assert.ok(CHARACTER_CHAIN_STAGES.length >= 7, "character chain should expose staged voice-design workflow");
assert.ok(liveStrong.comfortGuard > liveLight.comfortGuard && liveStrong.comfortGuard <= 0.72, "live engine should expose bounded comfort guard intensity");
assert.ok(liveStrong.deEss >= liveLight.deEss, "live engine comfort guard should track stronger live de-ess settings");
assert.deepEqual(EFFECT_STACK_STAGE_IDS, ["input", "core", "tract", "tone", "texture", "performance", "dynamics", "space", "guard"], "effect stack should expose ordered signal-path layers");
assert.equal(AUDITION_VARIANT_IDS.length >= 5, true, "audition variants should cover multiple nearby character directions");
assert.deepEqual(STUDIO_PLAN_STEP_IDS, ["project", "source", "timeline", "route", "shape", "stack", "memory", "script", "audition", "trace", "scene", "deck"], "studio plan should expose the full production flow");
assert.ok(LINE_READ_TARGETS.length >= 8, "line-read targets should cover repeatable acting checks");
assert.ok(SCENE_KITS.length >= 4, "scene kits should expand single reads into multi-beat acting workflows");
assert.ok(ALL_LINE_READ_TARGETS.length > LINE_READ_TARGETS.length, "scene beats should be usable as line-read targets");
assert.equal(SCENE_KITS.every((kit) => kit.beats.length >= 3), true, "each scene kit should include multiple acting beats");
assert.equal(SCRIPT_LANES.length >= 5, true, "performance script should expose multiple temporal acting lanes");
assert.equal(validateLineReadTargets().every((target) => target.ok), true, "line-read targets should reference real presets and copy");
assert.equal(new Set(voiceRouteTargets().map((target) => target.presetId)).size, FACTORY_PRESETS.length, "route planner should cover every factory voice target");
assert.ok(REFERENCE_VOICE_PROFILES.length >= 4, "reference profiles should cover varied source voices");
assert.equal(source.length, Math.round(sampleRate * 1.25), "generated sample length");
const sourceAnalysis = analyzeBuffer(source, sampleRate);
const sourcePitch = estimatePitch(source, sampleRate);
const sourceSpectral = analyzeSpectralVoice(source, sampleRate);
const sourceLoudness = analyzeLoudness(source, sampleRate);
const sourceLoudnessReview = loudnessTargetReview(sourceLoudness, -16, -1);
assert.ok(sourceAnalysis.rms > 0.02, "generated sample should contain audible energy");
assert.ok(sourceAnalysis.pitchMedianHz > 90 && sourceAnalysis.pitchMedianHz < 240, "generated sample exposes a plausible F0");
assert.ok(Number.isFinite(sourceAnalysis.brightnessRatio), "generated sample exposes brightness analysis");
assert.ok(Number.isFinite(sourceAnalysis.integratedLufs), "generated sample should expose K-weighted loudness");
assert.ok(Number.isFinite(sourceAnalysis.truePeakDb), "generated sample should expose true-peak proxy");
assert.equal(sourceAnalysis.loudnessStandard, "BS.1770-style mono proxy", "generated sample should name the loudness proxy");
assert.equal(sourceAnalysis.pitchMethod, "yin-autocorr-hybrid", "analysis should use the hybrid YIN pitch tracker");
assert.ok(Math.abs(sourcePitch.medianHz - 150) < 24, "hybrid pitch tracker should keep generated F0 in range");
assert.ok(sourcePitch.octaveCorrections >= 0, "hybrid pitch tracker should expose octave correction evidence");
assert.ok(sourceLoudness.gatedBlockCount >= 0, "loudness analysis should expose gating metadata");
assert.ok(Number.isFinite(sourceLoudnessReview.gainToTargetDb), "loudness target review should expose target gain");
assert.ok(sourceSpectral.frameCount > 0, "spectral voice analysis should inspect FFT frames");
assert.ok(sourceSpectral.centroidHz > 0 && sourceSpectral.rolloff85Hz >= sourceSpectral.centroidHz, "spectral voice analysis should expose plausible centroid and rolloff");
assert.ok(Number.isFinite(sourceSpectral.tiltDbPerOctave), "spectral voice analysis should expose finite spectral tilt");
assert.equal(sourceSpectral.envelope.method, "lpc-autocorrelation-envelope", "spectral voice analysis should expose LPC envelope metadata");
assert.ok(sourceSpectral.envelope.order >= 8, "LPC envelope should use a bounded speech-analysis order");
assert.ok(sourceSpectral.envelope.peaks.every((peak) => Number.isFinite(peak.hz)), "LPC envelope peaks should expose finite frequencies");
assert.equal(sourceSpectral.perceptual.method, "erb-critical-band-tone-map", "spectral voice analysis should expose ERB perceptual metadata");
assert.ok(sourceSpectral.perceptual.bandCount >= 12, "perceptual tone map should create bounded ear bands");
assert.ok(sourceSpectral.perceptual.bands.every((band) => Number.isFinite(band.bark) && Number.isFinite(band.erbRate)), "perceptual bands should expose Bark and ERB coordinates");
assert.ok(spectralVoiceSummary(sourceSpectral).includes("centroid"), "spectral summary should describe centroid evidence");
const dirtyStudioSource = studioPolishFixture(source, sampleRate);
const dirtyStudioAnalysis = analyzeStudioVoice(dirtyStudioSource, sampleRate);
const dirtyMicroRepair = buildMicroRepairTimeline(dirtyStudioSource, sampleRate);
const studioPolishPlan = buildStudioPolishPlan(dirtyStudioAnalysis, "standard");
const standaloneReactivePlan = buildSourceReactivePlan(
  dirtyStudioAnalysis,
  STUDIO_PRODUCTION_TARGETS.find((target) => target.id === "podcast"),
  1,
  studioPolishPlan.stages
);
const studioPolished = processStudioPolish(dirtyStudioSource, sampleRate, studioPolishPlan);
const nasalSource = applyBiquad(source, sampleRate, "peaking", 1050, 1.2, 9);
const nasalPlan = buildStudioPolishPlan(analyzeStudioVoice(nasalSource, sampleRate), "standard", "podcast");
const nasalSurgeryBand = nasalPlan.toneSurgery.bands.find((band) => band.id === "nasal");
const lowerEssSource = applyBiquad(source, sampleRate, "peaking", 3600, 1.6, 10);
const lowerEssAnalysis = analyzeStudioVoice(lowerEssSource, sampleRate);
const lowerEssPlan = buildStudioPolishPlan(lowerEssAnalysis, "standard", "podcast");
const lowerEssPolished = processStudioPolish(lowerEssSource, sampleRate, lowerEssPlan);
const kawaiiPolishPlan = buildStudioPolishPlan(dirtyStudioAnalysis, "standard", "kawaii");
const kawaiiRepairMap = buildStudioRepairMap(dirtyStudioAnalysis, "kawaii");
const directorPlan = optimizeStudioPolishPlan(dirtyStudioSource, sampleRate, kawaiiPolishPlan, { target: "kawaii", iterations: 10 });
const directorPolished = processStudioPolish(dirtyStudioSource, sampleRate, {
  intensity: "standard",
  target: "kawaii",
  optimize: true,
  iterations: 10
});
assert.equal(studioPolished.samples.length, dirtyStudioSource.length, "studio polish preserves source length");
assert.ok(dirtyMicroRepair.eventCount > 0, "micro repair should detect local artifact events");
assert.equal(dirtyMicroRepair.topEvent.shape.method, "multiscale-pulse-envelope", "micro repair should expose pulse-shape evidence");
assert.ok(dirtyMicroRepair.topEvent.decision.windowMs > 0, "micro repair should expose bounded repair-window decisions");
assert.ok(dirtyStudioAnalysis.spectral.centroidHz > 0, "studio analysis should retain FFT tone map");
assert.ok(Number.isFinite(dirtyStudioAnalysis.integratedLufs), "studio analysis should retain loudness metadata");
assert.ok(Number.isFinite(dirtyStudioAnalysis.truePeakDb), "studio analysis should retain true-peak metadata");
assert.ok(dirtyStudioAnalysis.items.some((item) => item.id === "spectral"), "studio analysis should expose FFT tone map as a review item");
assert.ok(studioPolishPlan.toneSurgery.activeCount >= 0, "studio polish plan should retain tone-surgery metadata");
assert.ok(studioPolishPlan.roomShaper.rangeDb <= 0 && studioPolishPlan.roomShaper.releaseMs >= 120, "studio polish plan should retain a gentle room-floor expander");
assert.equal(studioPolishPlan.reactivePlan.mode, "source-reactive-control", "studio polish plan should include source-reactive control metadata");
assert.equal(standaloneReactivePlan.mode, studioPolishPlan.reactivePlan.mode, "standalone source-reactive planner should match the embedded plan mode");
assert.equal(studioPolishPlan.reactivePlan.levelRide.mode, "phrase-aware-fader-ride", "source-reactive plan should use phrase-aware fader riding");
assert.ok(studioPolishPlan.reactivePlan.levelRide.rangeDb > 0 && studioPolishPlan.reactivePlan.levelRide.rangeDb <= 7.4, "source-reactive ride should keep a bounded range");
assert.ok(studioPolishPlan.reactivePlan.eventLanes.adaptiveDeEss >= studioPolishPlan.stages.deEss, "source-reactive lane should bias de-ess from detected source events");
assert.ok(nasalSurgeryBand.frequencyHz >= 650 && nasalSurgeryBand.frequencyHz <= 1300, "tone surgery should keep nasal treatment in the vocal nasal range");
assert.ok(nasalSurgeryBand.stageDb < 0 && nasalSurgeryBand.dynamicDepthDb <= 0, "tone surgery should use downward dynamic nasal control");
assert.ok(nasalSurgeryBand.perceptual && nasalSurgeryBand.evidence.includes("ERB band"), "tone surgery should prefer ERB ear-band evidence when nasal energy crowds perception");
assert.ok(dirtyMicroRepair.counts.mouth > 0 || dirtyMicroRepair.counts.plosive > 0, "micro repair should classify click or plosive events");
assert.equal(studioPolishPlan.microRepair.eventCount, dirtyStudioAnalysis.microRepair.eventCount, "studio polish plan should retain micro-repair timeline");
assert.equal(studioPolished.plan.microRepair.eventCount, dirtyStudioAnalysis.microRepair.eventCount, "studio polish render should carry micro-repair evidence");
assert.equal(studioPolishPlan.stages.highPassHz >= 54, true, "studio polish plan should choose a valid adaptive high-pass");
assert.equal(kawaiiPolishPlan.target.id, "kawaii", "studio polish should support production targets");
assert.equal(kawaiiRepairMap.steps[1].id, "deplosive", "repair map should put de-plosive before high-pass/tone work");
assert.equal(kawaiiRepairMap.steps[2].id, "mouth", "repair map should put mouth de-click before compression");
assert.ok(kawaiiRepairMap.overprocessRisks.length > 0, "repair map should expose over-processing risks");
assert.equal(kawaiiPolishPlan.repairMap.target.id, "kawaii", "studio polish plan should retain target-aware repair map");
assert.ok(kawaiiPolishPlan.stages.mouthClickPasses >= 1 && kawaiiPolishPlan.stages.mouthClickPasses <= 2, "mouth repair should use bounded staged passes");
assert.ok(kawaiiPolishPlan.stages.deEssLookaheadMs === 0 || kawaiiPolishPlan.stages.deEssLookaheadMs === 8, "de-ess lookahead should be bounded");
assert.ok(Number.isFinite(kawaiiPolishPlan.stages.deEssLow) && Number.isFinite(kawaiiPolishPlan.stages.deEssHigh), "de-ess should expose separate lower and upper bands");
assert.ok(lowerEssPlan.stages.deEssLow > 0, "lower de-ess should react to painful 3-5k presence");
assert.ok(lowerEssPolished.outputAnalysis.problemScores.harsh <= 40, "lower de-ess should keep post-polish harshness below the risk zone");
assert.ok(kawaiiPolishPlan.stages.highPassHz >= studioPolishPlan.stages.highPassHz, "kawaii target should lift the cleanup high-pass boundary");
assert.equal(directorPlan.optimization.enabled, true, "director optimizer should add optimization metadata");
assert.ok(directorPlan.optimization.scoreAfter >= directorPlan.optimization.scoreBefore - 8, "director optimizer should avoid large objective regressions");
assert.ok(studioPolishPlan.stages.deplosive > 0 || studioPolishPlan.stages.mouthClick > 0, "studio polish plan should react to dirty speech artifacts");
assert.ok(Number.isFinite(studioPolished.outputAnalysis.rms), "studio polish output should have finite rms");
assert.ok(peak(studioPolished.samples) <= 1, "studio polish output should be limited");
assert.equal(directorPolished.samples.length, dirtyStudioSource.length, "director polish should preserve source length");
assert.equal(directorPolished.plan.target.id, "kawaii", "director polish should preserve target metadata");
assert.equal(directorPolished.plan.optimization.enabled, true, "director polish should run bounded optimization");
assert.ok(peak(directorPolished.samples) <= 1, "director polish output should be limited");
assert.ok(studioPolished.outputAnalysis.problemScores.sibilance <= dirtyStudioAnalysis.problemScores.sibilance + 16, "studio polish should not create a sibilance regression");
assert.ok(studioPolished.outputAnalysis.problemScores.harsh <= dirtyStudioAnalysis.problemScores.harsh + 18, "studio polish should not create a harshness regression");
assert.ok(studioPolished.outputAnalysis.microRepair.eventCount <= dirtyStudioAnalysis.microRepair.eventCount + 6, "studio polish should not create many new micro-repair events");
const studioPolishQuality = runStudioPolishQualitySuite({ sampleRate, duration: 0.36 });
assert.equal(studioPolishQuality.ok, true, "studio polish quality suite should pass");
assert.equal(studioPolishQuality.results.length, REFERENCE_VOICE_PROFILES.length, "studio polish suite should cover reference profiles");
assert.ok(STUDIO_PRODUCTION_TARGETS.some((target) => target.id === "ikemen"), "production targets should include ikemen-oriented polish");
const sourceTrace = analyzePerformanceTrace(source, sampleRate);
assert.ok(sourceTrace.frames.length > 10, "performance trace should create time frames");
assert.ok(sourceTrace.summary.pitchMedianHz > 90 && sourceTrace.summary.pitchMedianHz < 240, "performance trace should expose frame-level F0");
assert.ok(Number.isFinite(sourceTrace.summary.endingDropCents), "performance trace should expose ending movement");
const emptyStudioPlan = buildStudioPlan({ hasSource: false });
assert.equal(emptyStudioPlan.nextAction.id, "load-source", "studio plan should start by loading a source");
assert.equal(emptyStudioPlan.steps.length, STUDIO_PLAN_STEP_IDS.length, "studio plan should keep every workflow step visible");
const restoreProjectStudioPlan = buildStudioPlan({
  hasSource: false,
  projectVault: {
    status: "check",
    score: 82,
    count: 1,
    summary: "Saved project",
    best: { id: "project-restore", title: "Saved Otome Scene" },
    nextAction: { id: "apply-project", label: "Restore Project", projectId: "project-restore" }
  }
});
assert.equal(restoreProjectStudioPlan.nextAction.id, "apply-project", "studio plan should restore a saved project before creating a fresh source");

const timelineFixture = {
  name: "Timeline fixture",
  sampleRate,
  samples: concatFloat32([
    generateTestVoice({ sampleRate, duration: 0.7, f0: 145 }),
    new Float32Array(Math.round(sampleRate * 0.5)),
    generateTestVoice({ sampleRate, duration: 1.05, f0: 215 }),
    new Float32Array(Math.round(sampleRate * 0.35)),
    generateTestVoice({ sampleRate, duration: 0.82, f0: 170 })
  ])
};
const sourceTimeline = buildSourceTimeline(timelineFixture, { scriptDurationSec: 0.9, activeCueId: "cue-02" });
assert.ok(sourceTimeline.cueCount >= 2, "source timeline should split separated phrases into cues");
assert.ok(sourceTimeline.bestCue, "source timeline should pick a best preview cue");
assert.ok(sourceTimeline.cues.some((cue) => cue.active), "source timeline should mark an active cue");
const sourceTimelineRegion = cueRegion(sourceTimeline.bestCue);
assert.ok(sourceTimelineRegion.durationSec > 0.3, "source timeline cue should become a render region");
assert.equal(nearestCueIdForRegion(sourceTimeline, sourceTimelineRegion), sourceTimeline.bestCue.id, "source timeline should match manual region edits back to a cue");
assert.equal(sourceTimelineSummary(sourceTimeline).cueCount, sourceTimeline.cueCount, "source timeline summary should preserve cue count");

const mockReadySourceFit = { status: "ready", score: 96, patches: [] };
const mockReadyTimeline = { status: "ready", score: 94, cueCount: 2, activeCue: { label: "02 Body cue" }, nextAction: null };
const mockCueTimeline = { ...mockReadyTimeline, activeCue: { id: "cue-02", label: "02 Body cue" }, bestCue: { id: "cue-02" } };
const mockReadyStack = { status: "ready", score: 94, activeCount: 5, nextPatch: {}, summary: "Stack locked", stages: [] };
const mockReadyMemory = { status: "ready", score: 94, count: 1, summary: "Design memory locked", nextAction: null, items: [], best: null };
const mockRoute = {
  id: "route-otome",
  presetId: "otome",
  targetId: "otome_promise",
  presetName: "Otome Romantic",
  targetName: "Otome Promise",
  status: "ready",
  score: 91
};
const timelineStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  sourceTimeline: {
    status: "check",
    score: 72,
    cueCount: 2,
    activeCue: { label: "01 Lead cue" },
    summary: "2 cues",
    nextAction: {
      id: "select-source-cue",
      label: "Select Cue",
      cueId: "cue-02",
      detail: "02 Body cue is the strongest preview window."
    }
  },
  routes: [mockRoute],
  activePresetId: "clean",
  activeLineReadId: "studio_check",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  renderDeckCount: 0
});
assert.equal(timelineStudioPlan.nextAction.id, "select-source-cue", "studio plan should select a source cue before route and render decisions");
assert.equal(timelineStudioPlan.nextAction.cueId, "cue-02", "studio plan timeline action should carry the cue id");
const routeStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "clean",
  activeLineReadId: "studio_check",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  renderDeckCount: 0
});
assert.equal(routeStudioPlan.nextAction.id, "apply-route", "studio plan should route before shaping when a better target is available");
assert.equal(routeStudioPlan.nextAction.routeId, mockRoute.id, "studio plan route action should carry the route id");

const shapeStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: {
    status: "shape",
    score: 84,
    nextStageId: "texture",
    nextPatch: { breath: 58 },
    stages: [{ id: "texture", label: "Texture" }]
  },
  effectStack: mockReadyStack,
  renderDeckCount: 0
});
assert.equal(shapeStudioPlan.nextAction.id, "chain-fix", "studio plan should expose the next character-chain fix");

const auditionStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  sourceTimeline: mockCueTimeline,
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  renderDeckCount: 0
});
assert.equal(auditionStudioPlan.nextAction.id, "preview-region", "studio plan should request an audition before final judgment");
assert.equal(auditionStudioPlan.nextAction.cueId, "cue-02", "studio plan should carry the active source cue into preview actions");

const stackStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  sourceTimeline: mockCueTimeline,
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: {
    status: "check",
    score: 78,
    activeCount: 7,
    nextStageId: "dynamics",
    nextPatch: { outputGain: -1 },
    summary: "1 Dynamics move",
    stages: [{ id: "dynamics", label: "Dynamics" }]
  },
  renderDeckCount: 0
});
assert.equal(stackStudioPlan.nextAction.id, "stack-fix", "studio plan should fix a weak signal stack before auditioning");
const stackAuditionStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: {
    status: "check",
    score: 80,
    activeCount: 5,
    nextPatch: {},
    summary: "Needs layer audition",
    stages: []
  },
  voiceMemory: mockReadyMemory,
  stackAuditionCount: 4,
  renderDeckCount: 0
});
assert.equal(stackAuditionStudioPlan.nextAction.id, "render-stack", "studio plan should render stack auditions when a weak stack has no direct patch");
const sceneStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  sourceTimeline: mockCueTimeline,
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: { status: "ready", score: 94, items: [] },
  performanceComparison: { status: "ready", score: 92, items: [] },
  sceneSession: {
    status: "check",
    score: 78,
    readyCount: 1,
    count: 3,
    activeBeat: { label: "Whisper Promise", nextNeed: "Covered" },
    nextAction: {
      id: "apply-scene-beat",
      label: "Next Beat: Hold The Moment",
      targetId: "scene_otome_close_scene_hold",
      detail: "Whisper Promise is covered; continue the scene arc with Hold The Moment."
    }
  },
  renderDeckCount: 2,
  takeDecision: { status: "ready", score: 90, winner: { label: "Keeper", weakest: "Script" } }
});
assert.equal(sceneStudioPlan.nextAction.id, "apply-scene-beat", "studio plan should advance the scene after a beat is covered");

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
const shiftedAnalysis = analyzeBuffer(shifted, sampleRate);
assert.notEqual(shiftedAnalysis.zeroCrossingsPerSecond, analyzeBuffer(source, sampleRate).zeroCrossingsPerSecond);
assert.ok(shiftedAnalysis.pitchMedianHz > sourceAnalysis.pitchMedianHz * 1.08, "pitch-aware shifter should move generated F0 in the requested direction");
assert.ok(peak(shifted) <= 1 && shifted.every((value) => Number.isFinite(value)), "pitch-aware shifter should remain finite and peak-safe");

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
const otomeSceneTargets = sceneBeatTargetsForKit("otome_close_scene");
const otomeWhisperBeat = otomeSceneTargets.find((target) => target.id.endsWith("_release"));
assert.ok(otomeWhisperBeat, "otome scene should expose a whisper promise beat");
assert.equal(sceneKitForTargetId(otomeWhisperBeat.id).id, "otome_close_scene", "scene beat target should resolve back to its kit");
assert.ok(voiceRouteTargets().some((target) => target.id === otomeWhisperBeat.id), "route planner should include scene beats as targets");
const otomeWhisperParams = paramsForLineReadTarget(otomeWhisperBeat.id);
assert.equal(scoreLineReadTarget(otomeWhisperParams, otomeWhisperBeat), 100, "scene beat params should score as a complete acting target");
assert.ok(otomeWhisperParams.closeMic > paramsForLineReadTarget(otomeRead.id).closeMic, "scene beat should push distance beyond the base line read");
assert.ok(otomeWhisperParams.whisper > paramsForLineReadTarget(otomeRead.id).whisper, "scene beat should carry stronger whisper color");
const otomeWhisperScript = buildPerformanceScript(otomeWhisperBeat, otomeWhisperParams);
assert.equal(otomeWhisperScript.lanes.length, SCRIPT_LANES.length, "scene beat should become a multi-lane performance script");
assert.equal(otomeWhisperScript.sceneKitId, "otome_close_scene", "performance script should preserve scene context");
assert.ok(otomeWhisperScript.durationSec >= 1.4, "performance script should estimate a usable read duration");
assert.ok(otomeWhisperScript.cues.some((cue) => /breath|close/i.test(cue)), "performance script should produce actionable acting cues");
const automatedWhisper = renderScriptAutomation(source, sampleRate, otomeWhisperParams, otomeWhisperScript);
const staticWhisper = processVoiceBuffer(source, sampleRate, otomeWhisperParams);
const automationDelta = automatedWhisper.samples.reduce((sum, value, index) => sum + Math.abs(value - staticWhisper[index]), 0) / automatedWhisper.samples.length;
const automatedSummary = automationSummary(automatedWhisper.plan);
assert.equal(automatedWhisper.samples.length, source.length, "script automation should preserve source length");
assert.ok(automatedWhisper.plan.frameCount >= 4, "script automation should create overlapping automation frames");
assert.ok(automatedWhisper.plan.summary.breath.range > 0, "script automation should move breath lane over time");
assert.ok(automationDelta > 0.0005, "script automation should change rendered audio beyond static processing");
assert.equal(automatedSummary.frameCount, automatedWhisper.plan.frameCount, "automation summary should track frame count");
const otomeWhisperSnapshot = createVoiceSnapshot(otomeWhisperParams, {
  id: "scene-memory-release",
  lineReadId: otomeWhisperBeat.id,
  target: otomeWhisperBeat,
  renderReview: { score: 91 },
  createdAt: 1000
});
const otomeSceneSession = buildSceneSession({
  activeLineReadId: otomeWhisperBeat.id,
  params: otomeWhisperParams,
  snapshots: [otomeWhisperSnapshot],
  renderDeck: [
    { id: "scene-take-a", target: otomeWhisperBeat.name, targetId: otomeWhisperBeat.id, review: { score: 92 }, rendered: { lineReadId: otomeWhisperBeat.id } },
    { id: "scene-take-b", target: otomeWhisperBeat.name, targetId: otomeWhisperBeat.id, review: { score: 88 }, rendered: { lineReadId: otomeWhisperBeat.id } }
  ],
  hasSource: true,
  takeDecision: { winnerId: "scene-take-a", score: 93 }
});
const otomeSceneSessionSummary = sceneSessionSummary(otomeSceneSession);
assert.equal(otomeSceneSession.items.length, 3, "scene session should cover every beat in the active kit");
assert.equal(otomeSceneSession.activeBeat.status, "ready", "scene session should mark a beat ready when design and takes are covered");
assert.equal(otomeSceneSession.nextAction.id, "apply-scene-beat", "scene session should offer the next uncovered beat");
assert.equal(otomeSceneSessionSummary.readyCount, 1, "scene session summary should count covered beats");
assert.ok(otomeSceneSession.items.some((item) => item.memoryCount === 1 && item.takeCount === 2), "scene session should connect saved designs and render takes to the beat");
const otomeProject = createProjectSnapshot({
  presetId: "otome",
  presetName: "Otome Romantic",
  lineReadId: otomeWhisperBeat.id,
  params: otomeWhisperParams,
  source: {
    name: "Generated Neutral",
    sourceProfileId: "neutral_medium",
    sampleRate,
    samples: source,
    blob: null,
    analysis: sourceAnalysis
  },
  voiceSnapshots: [otomeWhisperSnapshot],
  renderDeck: [
    { id: "scene-take-a", title: "Scene A", target: otomeWhisperBeat.name, targetId: otomeWhisperBeat.id, mode: "Preview", review: { score: 92, status: "ready", items: [] }, rendered: { sampleRate, samples: automatedWhisper.samples, analysis: analyzeBuffer(automatedWhisper.samples, sampleRate), mode: "preview", lineReadId: otomeWhisperBeat.id } },
    { id: "scene-take-b", title: "Scene B", target: otomeWhisperBeat.name, targetId: otomeWhisperBeat.id, mode: "Preview", review: { score: 88, status: "ready", items: [] }, rendered: { sampleRate, samples: staticWhisper, analysis: analyzeBuffer(staticWhisper, sampleRate), mode: "preview", lineReadId: otomeWhisperBeat.id } }
  ],
  sceneSession: otomeSceneSession,
  takeDecision: { winnerId: "scene-take-a", score: 93, winner: { label: "Scene A", weakest: "Script", score: 93 } }
}, { id: "project-otome", title: "Otome close scene pass", createdAt: 2000, includeAudio: false });
const otomeProjectVault = buildProjectVault([], {
  presetId: "otome",
  lineReadId: otomeWhisperBeat.id,
  params: otomeWhisperParams,
  source: { name: "Generated Neutral", sourceProfileId: "neutral_medium", sampleRate, samples: source, analysis: sourceAnalysis },
  voiceSnapshots: [otomeWhisperSnapshot],
  renderDeck: [{ id: "scene-take-a", targetId: otomeWhisperBeat.id, review: { score: 92 } }],
  sceneSession: otomeSceneSession,
  takeDecision: { winnerId: "scene-take-a", score: 93 }
});
assert.equal(otomeProject.renderDeck.length, 2, "project snapshot should retain bounded render-deck evidence");
assert.equal(otomeProject.sceneSession.readyCount, 1, "project snapshot should retain scene coverage evidence");
assert.equal(otomeProjectVault.nextAction.id, "capture-project", "project vault should save a current evidenced scene");
const cueProjectA = createProjectSnapshot({
  presetId: "otome",
  lineReadId: otomeWhisperBeat.id,
  params: otomeWhisperParams,
  source: { name: "Generated Neutral", sampleRate, samples: source, analysis: sourceAnalysis },
  activeSourceCueId: "cue-01",
  offlineRegion: { startSec: 0.4, durationSec: 0.55 },
  sourceTimeline: { cueCount: 2, score: 86, status: "ready", activeCue: { id: "cue-01" }, cues: [{ id: "cue-01", label: "01 Lead" }] }
}, { id: "project-cue-a", createdAt: 2100, includeAudio: false });
const cueProjectB = createProjectSnapshot({
  presetId: "otome",
  lineReadId: otomeWhisperBeat.id,
  params: otomeWhisperParams,
  source: { name: "Generated Neutral", sampleRate, samples: source, analysis: sourceAnalysis },
  activeSourceCueId: "cue-02",
  offlineRegion: { startSec: 1.2, durationSec: 0.62 },
  sourceTimeline: { cueCount: 2, score: 88, status: "ready", activeCue: { id: "cue-02" }, cues: [{ id: "cue-02", label: "02 Body" }] }
}, { id: "project-cue-b", createdAt: 2200, includeAudio: false });
const cueProjects = addProjectSnapshot([cueProjectA], cueProjectB, { maxProjects: 4 });
assert.equal(cueProjects.length, 2, "project vault should preserve separate source-cue project contexts");
assert.equal(cueProjects[0].activeSourceCueId, "cue-02", "project snapshot should retain active source cue");
assert.equal(cueProjects[0].sourceTimeline.activeCueId, "cue-02", "project snapshot should retain source timeline active cue");
const savedProjects = addProjectSnapshot([], otomeProject);
const restoreProjectVault = buildProjectVault(savedProjects, {
  presetId: "clean",
  lineReadId: otomeWhisperBeat.id,
  params: paramsForPreset("clean"),
  source: null,
  voiceSnapshots: [],
  renderDeck: [],
  sceneSession: buildSceneSession({ activeLineReadId: otomeWhisperBeat.id, params: paramsForPreset("clean"), hasSource: false })
});
assert.equal(savedProjects.length, 1, "project vault should retain captured projects");
assert.equal(restoreProjectVault.nextAction.id, "apply-project", "project vault should restore a stronger saved scene project");
assert.ok(projectParamPatch(paramsForPreset("clean"), otomeProject.params).some((patch) => patch.key === "closeMic" || patch.key === "romanticBreath"), "project restore patch should expose meaningful voice-design deltas");
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
const otomeTrace = analyzePerformanceTrace(otomeReadRendered, sampleRate);
const otomeTraceCompare = comparePerformanceTraces(sourceTrace, otomeTrace);
const otomeScriptMatch = compareScriptToPerformance(buildPerformanceScript(otomeRead, otomeReadParams), otomeTraceCompare);
assert.equal(otomeReadRendered.length, source.length, "line-read target processing preserves source length");
assert.ok(otomeReadAnalysis.zeroCrossingsPerSecond > sourceAnalysis.zeroCrossingsPerSecond + 600, "otome line read should add measurable close breath texture");
assert.ok(otomeTraceCompare.items.some((item) => item.id === "tail-air"), "trace compare should expose tail air movement");
assert.ok(otomeTraceCompare.deltas.tailTexture > 0, "otome line read should increase tail breath/frication in the performance trace");
assert.ok(otomeScriptMatch.items.some((item) => item.id === "breath"), "script match should judge planned breath against rendered motion");
assert.ok(otomeScriptMatch.score >= 30, "script match should produce a bounded render-vs-script score");

const lowSource = generateTestVoice({ sampleRate, duration: 1.0, f0: 95 });
const lowProfile = buildCalibrationProfile(lowSource, sampleRate);
const kawaii = paramsForPreset("kawaii");
const tunedKawaii = calibrateParamsForVoice(kawaii, lowProfile);
const tunedKawaiiAgain = calibrateParamsForVoice(tunedKawaii, lowProfile);
const riskyCharacterSafety = applyCharacterSafety({
  ...paramsForPreset("kawaii"),
  pitch: 10.5,
  formant: -8.5,
  air: 82,
  breath: 96,
  whisper: 62,
  consonantSoftness: 5,
  saturation: 34
}, {
  sourceProfile: { ...lowProfile, breathyOrNoisy: true },
  source: {
    studioAnalysis: {
      problemScores: {
        sibilance: 68,
        harsh: 61,
        mouthClick: 73
      }
    }
  },
  target: { id: "kawaii_spark", name: "Kawaii Spark" }
});
const spectralCharacterSafety = applyCharacterSafety(paramsForPreset("kawaii", {
  formant: 7.2,
  air: 78,
  presence: 70
}), {
  sourceProfile: lowProfile,
  source: {
    studioAnalysis: {
      problemScores: {},
      spectral: {
        risks: { nasal: 58, harsh: 48, sibilance: 44 },
        envelope: { peaks: [{ hz: 1050, prominenceDb: 4.4 }] },
        perceptual: { crowding: { risk: "nasal", score: 76, band: { centerHz: 1050 } } }
      }
    }
  },
  target: { id: "kawaii_spark", name: "Kawaii Spark" }
});
assert.equal(lowProfile.range, "low", "low reference voice should calibrate as low range");
assert.ok(tunedKawaii.pitch > kawaii.pitch, "low voice kawaii calibration should lift pitch");
assert.ok(tunedKawaii.formant > kawaii.formant, "low voice kawaii calibration should lift formant-like shift");
assert.equal(tunedKawaiiAgain.pitch, tunedKawaii.pitch, "calibration should not stack repeatedly for the same source profile");
assert.equal(riskyCharacterSafety.status, "guarded", "character safety should clamp risky non-creative character transforms");
assert.ok(riskyCharacterSafety.moves.some((move) => move.key === "pitch"), "character safety should clamp excessive pitch");
assert.ok(riskyCharacterSafety.moves.some((move) => move.key === "formant"), "character safety should clamp excessive formant spread");
assert.ok(riskyCharacterSafety.moves.some((move) => move.key === "air"), "character safety should limit air on sibilant sources");
assert.ok(riskyCharacterSafety.moves.some((move) => move.key === "consonantSoftness"), "character safety should soften click-heavy consonants");
assert.ok(characterSafetySummary(riskyCharacterSafety).includes("Pitch"), "character safety summary should expose its top moves");
assert.equal(spectralCharacterSafety.status, "guarded", "character safety should react to spectral evidence");
assert.ok(spectralCharacterSafety.moves.some((move) => move.key === "formant"), "spectral character safety should reduce pinched formant shifts");
assert.ok(spectralCharacterSafety.moves.some((move) => move.key === "deEss"), "spectral character safety should raise de-ess for sharp bright targets");
assert.equal(spectralCharacterSafety.evidence.perceptualRisk, "nasal:1050Hz", "character safety should retain ERB crowding evidence");

const offline = new OfflineRenderer();
offline.generateSample(sampleRate, "low_warm");
assert.equal(typeof offline.loadUrl, "function", "offline renderer should expose URL audio import");
assert.equal(offline.source.sourceKind, "generated", "generated sources should carry source kind metadata");
const lowRoutes = rankVoiceRoutes(offline.profile, offline.source, { limit: voiceRouteTargets().length });
const lowIkemenRoute = lowRoutes.find((route) => route.presetId === "ikemen");
const lowKawaiiRoute = lowRoutes.find((route) => route.presetId === "kawaii");
assert.ok(lowRoutes.length >= FACTORY_PRESETS.length, "route planner should rank line-read and synthetic preset routes");
assert.ok(lowIkemenRoute.score > lowKawaiiRoute.score, "low warm sources should rank low/close character routes above kawaii stretch routes");
assert.ok(lowIkemenRoute.tunedParams._sourceCalibration, "applied route params should carry source calibration idempotency");
const kawaiiSpark = LINE_READ_TARGETS.find((target) => target.id === "kawaii_spark");
const lowToKawaiiFit = offline.sourceFitReport(kawaii, kawaiiSpark);
const kawaiiVariants = buildAuditionVariants(kawaii, kawaiiSpark, { sourceFit: lowToKawaiiFit });
const kawaiiVariantSummary = auditionVariantSummary(kawaiiVariants);
assert.equal(kawaiiVariants.length, AUDITION_VARIANT_IDS.length, "audition variants should build a full candidate set");
assert.equal(kawaiiVariants[0].id, "sweet-lift", "bright kawaii targets should prioritize the sweet lift variant");
assert.ok(kawaiiVariants.every((variant) => variant.patch.length > 0), "each audition variant should carry real parameter moves");
assert.ok(kawaiiVariants.some((variant) => variant.id === "broadcast-guard" && variant.sourceRepair.length > 0), "variant lab should carry source repair into the cleanup candidate");
assert.ok(kawaiiVariantSummary.patchCount > kawaiiVariants.length, "variant summary should count useful patch evidence");
const lowKawaiiChain = characterChainReport(kawaii, kawaiiSpark, {
  sourceFit: lowToKawaiiFit,
  sourceTunedParams: offline.calibratedParams(kawaii)
});
const lowKawaiiStack = buildEffectStack(kawaii, {
  target: kawaiiSpark,
  sourceFit: lowToKawaiiFit,
  performanceScript: buildPerformanceScript(kawaiiSpark, kawaii)
});
const lowKawaiiStackAuditions = buildStackAuditions(kawaii, lowKawaiiStack, { limit: 7 });
const lowKawaiiStackAuditionSummary = stackAuditionSummary(lowKawaiiStackAuditions);
assert.ok(lowKawaiiStackAuditions.length >= 3, "stack audition should expose multiple layer audition candidates");
assert.ok(lowKawaiiStackAuditions.some((item) => item.type === "fix" && item.patch.length > 0), "stack audition should include direct fix candidates");
assert.ok(lowKawaiiStackAuditions.some((item) => item.type === "bypass" && item.patch.length > 0), "stack audition should include bypass-like candidates");
assert.ok(lowKawaiiStackAuditionSummary.patchCount >= lowKawaiiStackAuditions.length, "stack audition summary should count meaningful patch moves");
assert.ok(lowKawaiiStackAuditions.every((item) => item.params && item.axes.length >= 3), "stack audition candidates should be renderable and visualizable");
const kawaiiMemoryParams = paramsForLineReadTarget(kawaiiSpark.id);
const kawaiiSnapshot = createVoiceSnapshot(kawaiiMemoryParams, {
  id: "snap-kawaii",
  createdAt: 1,
  presetId: "kawaii",
  presetName: "Kawaii Bright",
  lineReadId: kawaiiSpark.id,
  target: kawaiiSpark,
  sourceName: "Low Warm",
  sourceFit: lowToKawaiiFit,
  chainReport: lowKawaiiChain,
  effectStack: lowKawaiiStack
});
const kawaiiMemory = addVoiceSnapshot([], kawaiiSnapshot, { maxItems: 4, maxPatchItems: 8 });
const duplicateKawaiiMemory = addVoiceSnapshot(kawaiiMemory, kawaiiSnapshot, { maxItems: 4, maxPatchItems: 8 });
const memoryBoard = buildVoiceMemoryBoard(kawaiiMemory, paramsForPreset("clean"), kawaiiSpark, {
  chainReport: { status: "ready", score: 88 },
  effectStack: { status: "ready", score: 90 },
  allowManualCapture: true
});
assert.equal(kawaiiMemory.length, 1, "voice memory should retain captured snapshots");
assert.equal(duplicateKawaiiMemory.length, 1, "voice memory should deduplicate identical designs");
assert.equal(memoryBoard.count, 1, "voice memory board should score saved designs");
assert.ok(memoryBoard.items[0].patch.length > 0, "voice memory board should expose restore deltas");
assert.equal(memoryBoard.nextAction.id, "apply-memory", "voice memory should recall a stronger saved design for the same target");
assert.ok(snapshotParamPatch(paramsForPreset("clean"), kawaiiSnapshot.params).some((patch) => ["cuteness", "anime", "phraseLift"].includes(patch.key)), "voice memory patch should include core voice-design deltas");
assert.equal(lowToKawaiiFit.status, "risk", "low source should be risky for a bright kawaii target before tuning");
assert.ok(lowToKawaiiFit.score < 70, "source fit should score mismatched source and target conservatively");
assert.ok(lowToKawaiiFit.items.some((item) => item.id === "range" && item.status === "risk"), "source fit should flag range mismatch");
assert.ok(lowToKawaiiFit.items.some((item) => item.id === "spectral" && ["ready", "tune", "risk"].includes(item.status)), "source fit should include spectral-fit evidence");
assert.ok(lowToKawaiiFit.patches.some((item) => item.key === "pitch" && item.delta > 0), "source fit should expose calibration patches");
assert.equal(lowKawaiiChain.nextStageId, "guardrail", "source mismatch should prioritize the guardrail chain stage");
assert.ok(bestCharacterChainPatch(lowKawaiiChain)._sourceCalibration, "guardrail chain patch should carry calibration idempotency");
assert.ok(lowKawaiiStack.stages.find((stage) => stage.id === "input").patch.length > 0, "effect stack should turn source mismatch into input/source-compensation moves");
assert.ok(Object.keys(bestEffectStackPatch(lowKawaiiStack)).length > 0, "effect stack should expose an actionable next signal-path patch");
const autoRendered = offline.render(kawaii, { autoCalibrate: true });
assert.equal(autoRendered.autoCalibrated, true, "offline render should preserve auto calibration metadata");
assert.equal(autoRendered.studioPolish.enabled, true, "offline render should run Studio Polish before character processing");
assert.equal(autoRendered.studioPolish.intensity, "standard", "offline render should default to standard Studio Polish");
assert.equal(autoRendered.mastering.enabled, true, "offline render should run final loudness mastering");
assert.ok(Math.abs(autoRendered.analysis.integratedLufs - autoRendered.mastering.targetLufs) < 1.2 || autoRendered.mastering.limitedByTruePeak, "offline render should move final loudness toward its target");
assert.ok(autoRendered.analysis.truePeakDb <= autoRendered.mastering.truePeakCeilingDb + 0.3, "offline render should respect true-peak mastering ceiling");
assert.equal(autoRendered.stage, "character", "offline render should default to character stage after Studio Polish");
assert.equal(autoRendered.region.isFull, true, "default offline render should cover the full source");
assert.ok(autoRendered.performance.elapsedMs >= 0, "offline render should measure elapsed render time");
assert.ok(autoRendered.performance.renderedSeconds > 0, "offline render should retain rendered duration for performance review");
assert.ok(Number.isFinite(autoRendered.performance.realtimeFactor) && autoRendered.performance.realtimeFactor >= 0, "offline render should expose a bounded realtime factor");
assert.equal(autoRendered.characterSafety.enabled, true, "offline render should attach character safety metadata");
assert.ok(autoRendered.characterSafety.score >= 0 && autoRendered.characterSafety.score <= 100, "character safety score should be bounded");
assert.ok(Array.isArray(autoRendered.safetyDelta), "offline render should expose safety deltas separately from calibration");
assert.ok(autoRendered.calibrationDelta.some((item) => item.key === "pitch" && item.delta > 0), "auto render should lift low-source pitch for kawaii");
assert.ok(autoRendered.calibrationDelta.some((item) => item.key === "formant" && item.delta > 0), "auto render should lift low-source formant for kawaii");
assert.ok(autoRendered.calibrationDelta.some((item) => item.key === "body" && item.delta < 0), "auto render should reduce low-source body for kawaii");
const tunedLowToKawaiiFit = offline.sourceFitReport(autoRendered.appliedParams, kawaiiSpark);
assert.equal(tunedLowToKawaiiFit.patches.length, 0, "source fit should not keep suggesting the same source patch after tuning");
assert.ok(tunedLowToKawaiiFit.score > lowToKawaiiFit.score, "source fit should improve after tuning even when range remains risky");
const autoReview = renderReview(offline.source, autoRendered);
const autoComfort = listeningComfortReview(offline.source.analysis, autoRendered.analysis, autoRendered.studioAnalysis, autoRendered.mastering);
assert.ok(autoReview.score >= 70, "render review should score usable offline renders");
assert.ok(autoReview.items.some((item) => item.id === "f0" && item.value.includes("+")), "render review should expose apparent F0 movement");
assert.ok(autoReview.items.some((item) => item.id === "comfort"), "render review should expose listening-comfort evidence");
assert.equal(autoReview.comfort.score, autoComfort.score, "render review should retain the computed listening-comfort score");
assert.ok(autoReview.comfort.score >= 0 && autoReview.comfort.score <= 100, "listening-comfort score should be bounded");
assert.ok(autoReview.comfort.reasons.length <= 5, "listening-comfort review should keep a bounded issue list");
const denseComfort = listeningComfortReview(offline.source.analysis, {
  ...autoRendered.analysis,
  integratedLufs: -11,
  truePeakDb: -0.2
}, {
  problemScores: { sibilance: 82, harsh: 74 },
  dynamicRangeDb: 2.2,
  microRepair: { counts: { mouth: 80, plosive: 10, sibilance: 35 } },
  spectral: { risks: { nasal: 72, mud: 70 } }
}, { targetLufs: -16, truePeakCeilingDb: -1 });
assert.ok(denseComfort.reasons.length > 2, "listening-comfort review should expose multiple simultaneous QC reasons");
assert.ok(denseComfort.issues.every((issue) => issue.penalty > 0), "listening-comfort issues should retain penalty evidence");
assert.ok(autoReview.items.some((item) => item.id === "performance"), "render review should expose offline render performance evidence");
assert.ok(autoReview.performanceBudget && ["ready", "check", "risk"].includes(autoReview.performanceBudget.status), "render review should include performance-budget status");
assert.ok(autoReview.items.some((item) => item.id === "studio-polish"), "render review should expose Studio Polish evidence");
assert.ok(autoReview.items.some((item) => item.id === "character-safety"), "render review should expose character-safety evidence");
const slowPerformanceBudget = renderPerformanceBudget({ elapsedMs: 23000, renderedSeconds: 7, realtimeFactor: 3.29, mode: "full", stage: "character" });
assert.equal(slowPerformanceBudget.status, "risk", "performance budget should flag renders slower than realtime");
assert.equal(slowPerformanceBudget.recommendation, "short-preview-first", "slow render budget should recommend short previews before more full renders");
const slowReview = renderReview(offline.source, {
  ...autoRendered,
  performance: { ...autoRendered.performance, elapsedMs: 23000, renderedSeconds: 7, realtimeFactor: 3.29 }
});
assert.equal(slowReview.performanceBudget.status, "risk", "render review should carry slow-render budget risk");
assert.equal(slowReview.status, "risk", "slow render budget should downgrade the review status");
const polishOnlyRender = offline.render(kawaii, { stage: "polish", studioPolish: "light", studioTarget: "ikemen", directorOptimize: true, mode: "preview", region: { startSec: 0, durationSec: 0.6 } });
assert.equal(polishOnlyRender.stage, "polish", "offline render should support polish-only preview");
assert.equal(polishOnlyRender.studioPolish.target.id, "ikemen", "offline render should retain production target");
assert.equal(polishOnlyRender.studioPolish.optimized, true, "offline render should retain director optimization state");
assert.equal(polishOnlyRender.scriptAutomated, false, "polish-only render should not apply acting automation");
assert.equal(polishOnlyRender.characterSafety, null, "polish-only render should not run character safety");
assert.equal(polishOnlyRender.samples.length, Math.round(sampleRate * 0.6), "polish-only render should preserve region length");
const extremeRender = offline.render(paramsForPreset("kawaii", {
  pitch: 11,
  formant: 11,
  breath: 95,
  whisper: 70,
  romanticBreath: 100
}), { studioPolish: "standard", region: { startSec: 0, durationSec: 0.6 }, mode: "preview" });
const extremeReview = renderReview(offline.source, extremeRender);
assert.equal(extremeRender.characterSafety.status, "guarded", "offline render should guard extreme character transforms");
assert.ok(extremeRender.safetyDelta.some((item) => item.key === "pitch" && item.delta < 0), "offline safety should reduce excessive pitch");
assert.ok(extremeRender.safetyDelta.some((item) => item.key === "formant" && item.delta < 0), "offline safety should reduce excessive formant shift");
assert.ok(extremeReview.items.some((item) => item.id === "character-safety" && item.value === "Guarded"), "render review should include character-safety evidence");
assert.equal(autoRendered.audition.status, "ready", "offline render should expose a lightweight A/B audition summary");
const exportAudition = buildAuditionComparison({ source: offline.source, rendered: autoRendered });
assert.equal(exportAudition.status, "ready", "export audition should loudness-match stages for honest A/B checks");
assert.ok(exportAudition.stages.length >= 3, "export audition should include source, polish, and character stages");
assert.ok(exportAudition.stages.every((stage) => stage.file.endsWith(".wav") && stage.blob?.size > 44), "export audition should create matched WAV files for every stage");
assert.ok(exportAudition.stages.some((stage) => stage.id === "studio-polish"), "export audition should include Studio Polish as a separate listenable stage");
assert.ok(exportAudition.stages.every((stage) => Math.abs(stage.match.deltaLu) <= 1.2 || stage.match.limitedByPeak), "audition stages should be loudness matched or explicitly peak-limited");
assert.ok(auditionComparisonNotes(exportAudition).includes("level-matched before/after"), "audition notes should explain the comparison method");
const exportTakeDecision = {
  status: "risk",
  score: 68,
  winnerId: "",
  candidateId: "safety-render",
  candidate: {
    id: "safety-render",
    label: "Safety Render",
    score: 68,
    status: "risk",
    weakest: "QC Gate",
    keeperEligible: false,
    qc: { status: "risk", score: 31, summary: "render + comfort QC", blockers: ["render", "comfort"], checks: [] }
  },
  items: [
    { id: "safety-render", keeperEligible: false }
  ],
  summary: "QC hold: Safety Render needs render + comfort QC"
};
const exportManifest = buildExportManifest({
  source: offline.source,
  rendered: autoRendered,
  params: kawaii,
  presetId: "kawaii",
  presetName: "Kawaii Bright",
  lineReadId: kawaiiSpark.id,
  lineReadName: kawaiiSpark.name,
  review: autoReview,
  takeDecision: exportTakeDecision,
  compressed: { blob: { size: 1234 }, mimeType: "audio/webm;codecs=opus" },
  audition: exportAudition
});
assert.equal(exportManifest.render.studioPolish.enabled, true, "export manifest should retain Studio Polish metadata");
assert.equal(exportManifest.render.studioPolish.repairMap.steps[1].id, "deplosive", "export manifest should retain ordered repair-map evidence");
assert.equal(exportManifest.render.studioPolish.microRepair.eventCount >= 0, true, "export manifest should retain micro-repair metadata");
assert.ok(exportManifest.render.studioPolish.microRepair.events.every((event) => event.shape?.method === "multiscale-pulse-envelope"), "export manifest should retain micro-repair pulse shapes");
assert.ok(exportManifest.render.studioPolish.microRepair.events.every((event) => event.decision?.windowMs > 0), "export manifest should retain micro-repair repair decisions");
assert.ok(exportManifest.render.studioPolish.toneSurgery.bands.some((band) => band.id === "nasal"), "export manifest should retain tone-surgery metadata");
assert.ok(exportManifest.render.studioPolish.toneSurgery.bands.some((band) => band.perceptual?.salience >= 0), "export manifest should retain perceptual tone-surgery evidence");
assert.equal(exportManifest.render.studioPolish.roomShaper.roomTonePolicy, "attenuate, never hard-mute", "export manifest should retain room-floor metadata");
assert.equal(exportManifest.render.studioPolish.reactivePlan.levelRide.mode, "phrase-aware-fader-ride", "export manifest should retain source-reactive level ride metadata");
assert.equal(exportManifest.render.mastering.enabled, true, "export manifest should retain final mastering metadata");
assert.ok(exportManifest.source.studioAnalysis.spectral.centroidHz > 0, "export manifest should retain FFT tone map metadata");
assert.equal(exportManifest.source.studioAnalysis.spectral.envelope.method, "lpc-autocorrelation-envelope", "export manifest should retain LPC envelope metadata");
assert.equal(exportManifest.source.studioAnalysis.spectral.perceptual.method, "erb-critical-band-tone-map", "export manifest should retain perceptual tone metadata");
assert.ok(Number.isFinite(exportManifest.render.analysis.integratedLufs), "export manifest should retain render loudness metadata");
assert.ok(Number.isFinite(exportManifest.render.analysis.truePeakDb), "export manifest should retain render true-peak metadata");
assert.ok(Number.isFinite(exportManifest.render.performance.realtimeFactor), "export manifest should retain offline render performance metadata");
assert.equal(exportManifest.render.characterSafety.enabled, true, "export manifest should retain character safety metadata");
assert.ok(Number.isFinite(exportManifest.render.characterSafety.evidence.nasal), "export manifest should retain character safety tone evidence");
assert.equal(Array.isArray(exportManifest.render.safetyDelta), true, "export manifest should retain safety delta metadata");
assert.equal(exportManifest.review.comfort.score, autoReview.comfort.score, "export manifest should retain listening comfort metadata");
assert.equal(exportManifest.review.performanceBudget.status, autoReview.performanceBudget.status, "export manifest should retain review performance-budget metadata");
assert.equal(exportManifest.takeDecision.candidate.qc.blockers.includes("comfort"), true, "export manifest should retain take QC blockers");
assert.equal(exportManifest.takeDecision.blockedCount, 1, "export manifest should count QC-blocked deck items");
assert.ok(takeDecisionNotes(exportTakeDecision).includes("QC Hold"), "take decision notes should explain held candidates");
assert.ok(takeDecisionNotes(exportTakeDecision).includes("- comfort"), "take decision notes should list QC blockers");
assert.equal(exportManifest.audition.status, "ready", "export manifest should retain A/B audition status");
assert.ok(exportManifest.audition.stages.some((stage) => stage.id === "character-render"), "export manifest should retain final audition stage metadata");
assert.equal(exportManifest.source.sourceKind, "generated", "export manifest should retain source import kind");
assert.equal(exportManifest.files.webm.endsWith(".webm"), true, "export manifest should name compressed WebM output");
assert.equal(renderedBaseName(autoRendered).includes("VoiceForge"), true, "export base name should derive from render name");
assert.ok(studioPolishResearchNotes(autoRendered).includes("Studio Polish First"), "export research notes should document the polish workflow");
assert.ok(studioPolishResearchNotes(autoRendered).includes("Repair map:"), "export research notes should include repair-map rationale");
assert.ok(studioPolishResearchNotes(autoRendered).includes("Micro repair events:"), "export research notes should include micro-repair rationale");
assert.ok(studioPolishResearchNotes(extremeRender).includes("Character safety:"), "export research notes should include character-safety rationale");
const safetyProject = createProjectSnapshot({
  presetId: "kawaii",
  presetName: "Kawaii Bright",
  lineReadId: kawaiiSpark.id,
  params: autoRendered.appliedParams,
  source: offline.source,
  takeDecision: exportTakeDecision,
  renderDeck: [{ id: "safety-render", title: "Safety Render", target: kawaiiSpark.name, targetId: kawaiiSpark.id, review: autoReview, rendered: autoRendered }]
}, { id: "project-safety", title: "Safety metadata project", includeAudio: false });
assert.equal(safetyProject.renderDeck[0].rendered.characterSafety.enabled, true, "project snapshot should retain character-safety metadata");
assert.ok(Number.isFinite(safetyProject.renderDeck[0].rendered.characterSafety.evidence.nasal), "project snapshot should retain character-safety tone evidence");
assert.equal(safetyProject.renderDeck[0].rendered.mastering.enabled, true, "project snapshot should retain mastering metadata");
assert.equal(safetyProject.takeDecision.candidate.qc.blockers.includes("render"), true, "project snapshot should retain take QC candidate blockers");
assert.equal(safetyProject.takeDecision.winnerId, "", "project snapshot should distinguish QC-held candidates from keepers");
assert.ok(safetyProject.source.studioAnalysis.spectral.centroidHz > 0, "project snapshot should retain source FFT tone map");
assert.equal(safetyProject.source.studioAnalysis.spectral.envelope.method, "lpc-autocorrelation-envelope", "project snapshot should retain LPC envelope metadata");
assert.equal(safetyProject.source.studioAnalysis.spectral.perceptual.method, "erb-critical-band-tone-map", "project snapshot should retain perceptual tone metadata");
assert.ok(Number.isFinite(safetyProject.source.studioAnalysis.integratedLufs), "project snapshot should retain source loudness metadata");
assert.equal(safetyProject.renderDeck[0].rendered.studioPolish.plan.microRepair.eventCount >= 0, true, "project snapshot should retain micro-repair metadata");
assert.ok(safetyProject.renderDeck[0].rendered.studioPolish.plan.toneSurgery.bands.some((band) => band.id === "harsh"), "project snapshot should retain tone-surgery metadata");
assert.ok(safetyProject.renderDeck[0].rendered.studioPolish.plan.toneSurgery.bands.some((band) => band.perceptual?.salience >= 0), "project snapshot should retain perceptual tone-surgery evidence");
assert.equal(safetyProject.renderDeck[0].rendered.studioPolish.plan.roomShaper.roomTonePolicy, "attenuate, never hard-mute", "project snapshot should retain room-floor metadata");
assert.equal(Array.isArray(safetyProject.renderDeck[0].rendered.safetyDelta), true, "project snapshot should retain safety deltas");
const memoryStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: { status: "check", score: 82, count: 0, nextAction: { id: "capture-memory", label: "Capture Design" }, summary: "No saved designs", items: [] },
  renderReview: autoReview,
  renderDeckCount: 1
});
assert.equal(memoryStudioPlan.nextAction.id, "capture-memory", "studio plan should capture auditioned designs before more rendering");
const slowRenderStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  sourceTimeline: mockCueTimeline,
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: slowReview,
  renderDeckCount: 1
});
assert.equal(slowRenderStudioPlan.nextAction.id, "preview-region", "studio plan should steer slow full renders back to short previews");
assert.equal(slowRenderStudioPlan.nextAction.label, "Use Short Preview", "studio plan should make the slow-render action explicit");
assert.equal(slowRenderStudioPlan.nextAction.cueId, "cue-02", "slow render preview action should carry the active source cue");
const blockedProjectStudioPlan = buildStudioPlan({
  projectVault: { status: "check", score: 82, count: 0, savedCurrent: false, nextAction: { id: "capture-project", label: "Save Project" }, summary: "Unsaved project" },
  hasSource: true,
  sourceFit: mockReadySourceFit,
  sourceTimeline: mockCueTimeline,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: slowReview,
  renderDeckCount: 1
});
assert.equal(blockedProjectStudioPlan.nextAction.id, "preview-region", "studio plan should fix risky renders before saving project state");
assert.ok(blockedProjectStudioPlan.steps.find((step) => step.id === "project").detail.includes("risk"), "project step should explain why risky renders are not saved yet");
const blockedMemoryStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  sourceTimeline: mockCueTimeline,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: { status: "check", score: 82, count: 0, nextAction: { id: "capture-memory", label: "Capture Design" }, summary: "No saved designs", items: [] },
  renderReview: slowReview,
  renderDeckCount: 1
});
assert.equal(blockedMemoryStudioPlan.nextAction.id, "preview-region", "studio plan should fix risky renders before capturing voice memory");
const hotStack = buildEffectStack(paramsForPreset("streamer", { outputGain: 3, saturation: 62, compression: 80 }), {
  target: LINE_READ_TARGETS.find((target) => target.id === "streamer_hook"),
  renderReview: { status: "risk", score: 48, items: [] },
  rendered: { analysis: { ...autoRendered.analysis, clipped: true, peakDb: -0.2, rmsDb: -7.8 } }
});
assert.equal(hotStack.nextStageId, "dynamics", "effect stack should prioritize dynamics when rendered audio loses headroom");
assert.ok(bestEffectStackPatch(hotStack).outputGain < 3, "effect stack dynamics patch should restore output headroom");
const comfortStack = buildEffectStack(paramsForPreset("kawaii"), {
  target: { id: "comfort-kawaii", name: "Comfort Kawaii", presetId: "kawaii", params: paramsForPreset("kawaii"), tags: [] },
  renderReview: {
    status: "ready",
    score: 92,
    comfort: { score: 32, status: "risk", reasons: ["micro", "sibilance"], detail: "Comfort correction" },
    items: [{ id: "comfort", label: "Comfort", value: "32%", detail: "Comfort correction" }]
  },
  rendered: { analysis: { ...autoRendered.analysis, clipped: false, peakDb: -4.2, rmsDb: -18.5 } }
});
const comfortPatch = bestEffectStackPatch(comfortStack);
const comfortBase = paramsForPreset("kawaii");
assert.ok(comfortStack.stages.some((stage) => stage.notes.some((note) => note.includes("Comfort"))), "effect stack should expose comfort evidence in stage notes");
assert.ok(["tone", "texture", "guard"].includes(comfortStack.nextStageId), "effect stack should prioritize comfort repair layers when comfort is risky");
assert.ok(Number(comfortPatch.deEss || 0) > Number(comfortBase.deEss || 0) || Number(comfortPatch.consonantSoftness || 0) > Number(comfortBase.consonantSoftness || 0), "effect stack should turn comfort issues into actionable cleanup patches");
const previewRendered = offline.render(kawaii, { autoCalibrate: true, region: { startSec: 0.5, durationSec: 0.75 }, mode: "preview" });
assert.equal(previewRendered.mode, "preview", "offline preview should preserve render mode");
assert.equal(previewRendered.region.isFull, false, "offline preview should be marked as a region render");
assert.equal(previewRendered.samples.length, Math.round(sampleRate * 0.75), "offline preview should render only the requested region");
assert.equal(previewRendered.region.startSample, Math.round(sampleRate * 0.5), "offline preview should preserve region start");
const scriptedPreview = offline.render(kawaii, {
  autoCalibrate: true,
  automatePerformance: true,
  performanceScript: buildPerformanceScript(kawaiiSpark, paramsForLineReadTarget(kawaiiSpark.id)),
  region: { startSec: 0.5, durationSec: 0.75 },
  mode: "preview"
});
assert.equal(scriptedPreview.scriptAutomated, true, "offline preview should preserve acting automation metadata");
assert.ok(scriptedPreview.scriptAutomation.frameCount > 0, "offline preview should expose automation frame count");
assert.equal(scriptedPreview.scriptAutomationSummary.lanes.length, SCRIPT_LANES.length, "offline preview should summarize every script lane");
const variantPreview = offline.render(kawaiiVariants[0].params, {
  autoCalibrate: true,
  automatePerformance: true,
  performanceScript: buildPerformanceScript(kawaiiSpark, kawaiiVariants[0].params),
  region: { startSec: 0.5, durationSec: 0.75 },
  mode: "preview"
});
assert.equal(variantPreview.performanceScriptPlan.targetId, kawaiiSpark.id, "variant render should preserve its script plan for later scoring");
assert.equal(variantPreview.scriptAutomated, true, "variant render should support script automation");
const takeDecisionDeck = [
  { id: "base", title: "Base", target: kawaiiSpark.name, mode: "Preview", rendered: previewRendered, review: renderReview(offline.source, previewRendered) },
  {
    id: "variant",
    title: "Variant",
    target: kawaiiSpark.name,
    mode: "Preview Scripted Variant",
    variant: { label: kawaiiVariants[0].label, score: kawaiiVariants[0].score, intent: kawaiiVariants[0].intent },
    rendered: variantPreview,
    review: renderReview(offline.source, variantPreview)
  }
];
const takeDecision = rankRenderDeckTakes(takeDecisionDeck, offline.source, kawaiiSpark);
assert.equal(takeDecision.items.length, 2, "take decision should rank every render-deck item");
assert.ok(takeDecision.winnerId, "take decision should select a keeper candidate");
assert.ok(takeDecision.items[0].items.some((item) => item.id === "target"), "take decision should include target-fit evidence");
assert.ok(takeDecision.items[0].items.some((item) => item.id === "script"), "take decision should include script-match evidence");
assert.ok(takeDecision.items[0].items.some((item) => item.id === "safety"), "take decision should include render-safety evidence");
assert.ok(takeDecision.items[0].items.some((item) => item.id === "qc"), "take decision should include delivery-QC evidence");
assert.ok(takeDecision.score >= 0 && takeDecision.score <= 100, "take decision score should be bounded");
assert.ok(takeDecision.items[0].baseParams, "take decision should preserve the render base params for refinement");
assert.equal(sourceSamplesForRenderedRegion(offline.source, previewRendered).length, previewRendered.samples.length, "take decision should compare matching source/render regions");
const qcBlockedReview = {
  ...renderReview(offline.source, variantPreview),
  status: "risk",
  score: 96,
  comfort: { status: "risk", score: 38, reasons: ["micro"], issues: [], detail: "Mouth artifacts are fatiguing." },
  performanceBudget: { status: "ready", score: 91, recommendation: "full-render-ok" }
};
const qcSafeReview = {
  ...renderReview(offline.source, previewRendered),
  status: "check",
  score: 80,
  comfort: { status: "check", score: 78, reasons: ["nasal"], issues: [], detail: "Audible but still needs a final QC listen." },
  performanceBudget: { status: "ready", score: 92, recommendation: "full-render-ok" }
};
const qcGateDecision = rankRenderDeckTakes([
  {
    id: "unsafe-but-cute",
    title: "Unsafe Cute",
    target: kawaiiSpark.name,
    mode: "Preview Scripted Variant",
    variant: { label: "Unsafe Cute", score: 100, intent: "Strong target read with audible QC problems." },
    rendered: variantPreview,
    review: qcBlockedReview
  },
  { id: "safe-take", title: "Safe Take", target: kawaiiSpark.name, mode: "Preview", rendered: previewRendered, review: qcSafeReview }
], offline.source, kawaiiSpark);
assert.equal(qcGateDecision.winnerId, "safe-take", "take decision should not name a QC-risk take as keeper when a safer take exists");
assert.equal(qcGateDecision.items.find((item) => item.id === "unsafe-but-cute").keeperEligible, false, "QC-risk takes should be marked ineligible for keeper selection");
const allRiskDecision = rankRenderDeckTakes([
  {
    id: "only-risk",
    title: "Only Risk",
    target: kawaiiSpark.name,
    mode: "Preview",
    rendered: variantPreview,
    review: qcBlockedReview
  }
], offline.source, kawaiiSpark);
assert.equal(allRiskDecision.winnerId, null, "take decision should hold keeper selection when every take fails QC");
assert.equal(allRiskDecision.candidateId, "only-risk", "take decision should still expose the best QC candidate for repair");
const betterRiskReview = {
  ...qcBlockedReview,
  score: 88,
  comfort: { status: "risk", score: 54, reasons: ["micro"], issues: [], detail: "Still risky, but less fatiguing." }
};
const worseRiskReview = {
  ...qcBlockedReview,
  score: 84,
  comfort: { status: "risk", score: 15, reasons: ["micro", "sibilance"], issues: [], detail: "Very fatiguing." }
};
const riskProgressDecision = rankRenderDeckTakes([
  { id: "worse-risk", title: "Worse Risk", target: kawaiiSpark.name, mode: "Full", rendered: variantPreview, review: worseRiskReview },
  { id: "better-risk", title: "Better Risk", target: kawaiiSpark.name, mode: "Preview", rendered: variantPreview, review: betterRiskReview }
], offline.source, kawaiiSpark);
assert.equal(riskProgressDecision.candidateId, "better-risk", "take decision should prefer the QC-improved candidate while every take is still blocked");
const qcRefinement = buildKeeperRefinement(allRiskDecision, kawaii, kawaiiSpark);
assert.ok(qcRefinement.patch.length > 0, "QC-held candidates should produce repair moves before keeper lock");
assert.ok(["Safety", "Comfort"].some((label) => qcRefinement.patch[0].group.includes(label)), "QC-held candidate patches should show safety/comfort repairs before performance tweaks");
assert.ok(qcRefinement.patch.some((patch) => patch.key === "consonantSoftness" && patch.group.includes("Comfort")), "QC-held comfort repair should add issue-specific mouth/transient smoothing");
const singleQcHoldStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: qcBlockedReview,
  auditionVariantCount: kawaiiVariants.length,
  renderDeckCount: 1,
  takeDecision: allRiskDecision,
  keeperRefinement: qcRefinement
});
assert.equal(singleQcHoldStudioPlan.nextAction.id, "keeper-refine", "studio plan should repair a single QC-held take before rendering variants");
assert.equal(singleQcHoldStudioPlan.nextAction.label, "Fix QC Take", "studio plan should name the QC repair action clearly");
const qcHoldPriorityStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "check", score: 76, stages: [{ id: "prosody", label: "Phrase Lift" }], nextStageId: "prosody", nextPatch: { phraseLift: 6 } },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: qcBlockedReview,
  auditionVariantCount: kawaiiVariants.length,
  renderDeckCount: 1,
  takeDecision: allRiskDecision,
  keeperRefinement: qcRefinement
});
assert.equal(qcHoldPriorityStudioPlan.nextAction.id, "keeper-refine", "studio plan should prioritize QC-held take repair over upstream character-shape tweaks");
const appliedQcHoldStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "check", score: 76, stages: [{ id: "prosody", label: "Phrase Lift" }], nextStageId: "prosody", nextPatch: { phraseLift: 6 } },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: qcBlockedReview,
  auditionVariantCount: kawaiiVariants.length,
  renderDeckCount: 1,
  takeDecision: allRiskDecision,
  keeperRefinement: { patch: [] }
});
assert.equal(appliedQcHoldStudioPlan.nextAction.id, "preview-region", "studio plan should re-preview after a QC repair patch has been applied");
assert.equal(appliedQcHoldStudioPlan.nextAction.label, "Preview QC Fix", "studio plan should name the post-QC-patch preview action");
const keeperRefinement = buildKeeperRefinement(takeDecision, kawaii, kawaiiSpark);
assert.ok(keeperRefinement.patch.length > 0, "keeper refinement should turn weak decision evidence into patch moves");
assert.ok(keeperRefinement.cards.some((card) => card.id === "script"), "keeper refinement should expose script refinement evidence");
assert.notDeepEqual(keeperRefinement.params, takeDecision.items[0].baseParams, "keeper refinement should produce next-render params");
assert.equal(buildKeeperRefinement(takeDecision, keeperRefinement.params, kawaiiSpark).patch.length, 0, "keeper refinement should lock once its patch has been applied");
const variantStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: renderReview(offline.source, previewRendered),
  auditionVariantCount: kawaiiVariants.length,
  renderDeckCount: 1
});
assert.equal(variantStudioPlan.nextAction.id, "render-variants", "studio plan should suggest variants after the first audition take");
const deck = [
  { id: "full", rendered: autoRendered, review: autoReview },
  { id: "preview", rendered: previewRendered, review: renderReview(offline.source, previewRendered) }
];
const trimmedDeck = addRenderDeckItem(deck, { id: "next", rendered: previewRendered, review: renderReview(offline.source, previewRendered) }, { maxItems: 2, maxSeconds: 5 });
assert.equal(trimmedDeck.length, 2, "render deck should cap item count");
const budgetDeck = addRenderDeckItem(deck, { id: "budget", rendered: previewRendered, review: renderReview(offline.source, previewRendered) }, { maxItems: 4, maxSeconds: 2 });
assert.ok(totalDeckSeconds(budgetDeck) <= 2, "render deck should cap retained render seconds");
const deckStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  sourceTimeline: mockReadyTimeline,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: autoReview,
  performanceComparison: { status: "ready", score: 92, items: [{ label: "Tail Air", value: "+800/s" }] },
  performanceScript: otomeWhisperScript,
  scriptAutomation: scriptedPreview.scriptAutomationSummary,
  scriptMatch: { status: "ready", score: 88, items: [{ label: "Breath", value: "+900 / +850" }] },
  renderDeckCount: 2,
  renderDeckSeconds: totalDeckSeconds(deck),
  takeDecision: { score: 90, status: "ready", winner: { label: "Sweet Lift", weakest: "Script" } },
  keeperRefinement: { patch: [] }
});
assert.equal(deckStudioPlan.nextAction.id, "compare-deck", "studio plan should end in deck comparison once multiple takes exist");
assert.equal(deckStudioPlan.status, "ready", "studio plan should mark a fully evidenced deck as ready");
assert.ok(deckStudioPlan.steps.find((step) => step.id === "script").detail.includes("acting-automation frames"), "studio plan should preserve scripted automation evidence");
assert.ok(deckStudioPlan.steps.find((step) => step.id === "deck").detail.includes("Keeper: Sweet Lift"), "studio plan should preserve take-decision evidence");
const refineStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: autoReview,
  performanceComparison: { status: "ready", score: 92, items: [{ label: "Tail Air", value: "+800/s" }] },
  performanceScript: otomeWhisperScript,
  scriptAutomation: scriptedPreview.scriptAutomationSummary,
  scriptMatch: { status: "ready", score: 88, items: [{ label: "Breath", value: "+900 / +850" }] },
  renderDeckCount: 2,
  renderDeckSeconds: totalDeckSeconds(deck),
  takeDecision: { score: 81, status: "check", winner: { label: "Sweet Lift", weakest: "Script" } },
  keeperRefinement: { patch: [{ key: "phraseLift", delta: 5 }] }
});
assert.equal(refineStudioPlan.nextAction.id, "keeper-refine", "studio plan should refine a weak keeper before final comparison");
assert.ok(refineStudioPlan.steps.find((step) => step.id === "deck").detail.includes("keeper patch"), "studio plan should expose keeper patch evidence");
const qcHoldStudioPlan = buildStudioPlan({
  hasSource: true,
  sourceFit: mockReadySourceFit,
  routes: [mockRoute],
  activePresetId: "otome",
  activeLineReadId: "otome_promise",
  chainReport: { status: "ready", score: 97, stages: [], nextPatch: {} },
  effectStack: mockReadyStack,
  voiceMemory: mockReadyMemory,
  renderReview: autoReview,
  renderDeckCount: 2,
  renderDeckSeconds: totalDeckSeconds(deck),
  takeDecision: allRiskDecision,
  keeperRefinement: qcRefinement
});
assert.equal(qcHoldStudioPlan.nextAction.id, "keeper-refine", "studio plan should refine a QC-held candidate before A/B comparison");
assert.ok(qcHoldStudioPlan.steps.find((step) => step.id === "deck").detail.includes("QC candidate"), "studio plan should explain QC-held candidates");
const emptyDirectorBrief = buildDirectorBrief({ plan: buildStudioPlan({ hasSource: false }) });
assert.equal(emptyDirectorBrief.action.id, "load-source", "director brief should start no-source sessions at source generation");
assert.equal(emptyDirectorBrief.status, "risk", "director brief should mark missing source as blocking");
const qcDirectorBrief = buildDirectorBrief({
  hasSource: true,
  source: offline.source,
  rendered: autoRendered,
  plan: qcHoldStudioPlan,
  review: qcBlockedReview,
  takeDecision: allRiskDecision,
  keeperRefinement: qcRefinement,
  sourceTimeline: mockReadyTimeline,
  productionTarget: STUDIO_PRODUCTION_TARGETS.find((target) => target.id === "kawaii")
});
assert.equal(qcDirectorBrief.action.id, "keeper-refine", "director brief should route QC-held takes to the repair action");
assert.equal(qcDirectorBrief.status, "risk", "director brief should keep QC-held candidates out of ready state");
assert.ok(qcDirectorBrief.cards.some((card) => card.id === "take" && card.value === "QC Hold"), "director brief should expose take QC status");
const readyDirectorBrief = buildDirectorBrief({
  hasSource: true,
  source: offline.source,
  rendered: autoRendered,
  plan: deckStudioPlan,
  review: autoReview,
  takeDecision: { score: 90, status: "ready", winner: { label: "Sweet Lift", weakest: "Script", score: 90 } },
  keeperRefinement: { patch: [] },
  sourceTimeline: mockReadyTimeline
});
assert.equal(readyDirectorBrief.status, "ready", "director brief should surface a ready keeper");
assert.ok(readyDirectorBrief.headline.includes("Keeper"), "director brief should make the keeper decision obvious");

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
