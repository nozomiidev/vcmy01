import { DIRECTOR_DEFS, FACTORY_PRESETS, MACRO_DEFS, PARAM_DEFS, paramsForPreset, presetById } from "./audio/presets.js";
import {
  ALL_LINE_READ_TARGETS,
  coachLineReadTarget,
  firstLineReadForPreset,
  LINE_READ_TARGETS,
  lineReadById,
  paramsForLineReadTarget,
  SCENE_KITS,
  sceneBeatByTargetId,
  sceneBeatTargetsForKit,
  scoreLineReadTarget,
  targetMatchBreakdown,
  topTargetGaps
} from "./audio/performance-targets.js";
import { encodeWavMono, REFERENCE_VOICE_PROFILES, runPresetQualitySuite, runReferenceQualitySuite, selfTestDspCore } from "./audio/dsp-core.js";
import { buildRenderZipPackage, encodeRenderedWebmOpus, preferredOpusMimeType, renderedBaseName } from "./audio/export-session.js";
import { characterSafetySummary } from "./audio/character-safety.js";
import { LiveAudioEngine, meterPercent } from "./audio/engine.js";
import { OfflineRenderer } from "./audio/offline-renderer.js";
import { auditionVariantSummary, buildAuditionVariants } from "./audio/audition-variants.js";
import { bestCharacterChainPatch, characterChainReport } from "./audio/character-chain.js";
import { bestEffectStackPatch, buildEffectStack } from "./audio/effect-stack.js";
import { buildStackAuditions, stackAuditionSummary } from "./audio/stack-audition.js";
import { analyzePerformanceTrace, comparePerformanceTraces } from "./audio/performance-trace.js";
import { buildPerformanceScript, compareScriptToPerformance } from "./audio/performance-script.js";
import { addRenderDeckItem, renderReview, totalDeckSeconds } from "./audio/render-review.js";
import { rankVoiceRoutes } from "./audio/route-planner.js";
import { buildDirectorBrief } from "./audio/director-brief.js";
import { buildStudioPlan } from "./audio/studio-plan.js";
import { rankRenderDeckTakes } from "./audio/take-decision.js";
import { buildKeeperRefinement } from "./audio/take-refinement.js";
import { buildSceneSession, sceneSessionSummary } from "./audio/scene-session.js";
import { addVoiceSnapshot, buildVoiceMemoryBoard, createVoiceSnapshot, sanitizeVoiceSnapshots } from "./audio/voice-memory.js";
import { addProjectSnapshot, buildProjectVault, createProjectSnapshot, projectParamPatch, sanitizeProjectSnapshots } from "./audio/project-vault.js";
import { buildSourceTimeline, cueRegion, nearestCueIdForRegion, sourceTimelineSummary } from "./audio/source-timeline.js";
import { buildStudioPolishPlan, STUDIO_POLISH_INTENSITIES, STUDIO_PRODUCTION_TARGETS } from "./audio/studio-polish.js";
import { ProjectStore, TakeStore, prefs } from "./storage.js";
import { drawAnalysisCards, drawSpectrum, drawWaveform, formatDb } from "./ui/canvas.js";
import { toast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);
const savedPresetId = prefs.get("presetId", "clean");
const savedLineReadId = prefs.get("lineReadId", null);

const state = {
  presetId: savedPresetId,
  params: prefs.get("params", null),
  theme: prefs.get("theme", "dark"),
  polishIntensity: prefs.get("polishIntensity", "standard"),
  productionTarget: prefs.get("productionTarget", "podcast"),
  directorOptimize: prefs.get("directorOptimize", true),
  monitor: false,
  bypass: false,
  takes: [],
  renderUrl: null,
  webmUrl: null,
  lastWebmBlob: null,
  sourceUrl: null,
  offlineRegion: { startSec: 0, durationSec: 0 },
  sourceTimeline: null,
  activeSourceCueId: null,
  lineReadId: savedLineReadId || firstLineReadForPreset(savedPresetId).id,
  voiceRoutes: [],
  renderDeck: [],
  activeRenderId: null,
  renderDeckSeq: 0,
  voiceSnapshots: sanitizeVoiceSnapshots(prefs.get("voiceSnapshots", [])),
  projectSnapshots: [],
  activeProjectId: null,
  projectStoreReady: false,
  qualitySuite: null
};

state.params = { ...paramsForPreset(state.presetId), ...(state.params || {}) };
state.lineReadId = lineReadById(state.lineReadId).id;

const engine = new LiveAudioEngine();
const offline = new OfflineRenderer();
const takeStore = new TakeStore();
const projectStore = new ProjectStore();

function persist() {
  prefs.set("presetId", state.presetId);
  prefs.set("params", state.params);
  prefs.set("lineReadId", state.lineReadId);
  prefs.set("polishIntensity", state.polishIntensity);
  prefs.set("productionTarget", state.productionTarget);
  prefs.set("directorOptimize", state.directorOptimize);
}

function persistVoiceSnapshots() {
  prefs.set("voiceSnapshots", state.voiceSnapshots);
}

async function persistProjectSnapshots() {
  if (!state.projectStoreReady) return false;
  return projectStore.replaceAll(state.projectSnapshots);
}

function init() {
  document.documentElement.dataset.theme = state.theme;
  renderPresets();
  renderReferenceSelectors();
  renderGuidedStudio();
  engine.setStudioPolishIntensity(state.polishIntensity);
  renderControls();
  renderLineReadPanel();
  renderLineReadLibrary();
  renderSceneKitPanel();
  renderSceneKitLibrary();
  renderSceneSession();
  renderPerformanceScript();
  renderCharacterChain();
  renderEffectStack();
  renderStackAuditions();
  renderVoiceMemory();
  renderProjectVault();
  renderSourceTimeline();
  renderPerformanceTrace();
  renderStudioPlan();
  renderAuditionVariants();
  renderRenderDeck();
  renderTakeDecision();
  renderVoiceMap();
  bindTabs();
  bindTransport();
  bindOffline();
  bindLineReads();
  bindDiagnostics();
  bindTheme();
  window.addEventListener("resize", () => {
    renderLineReadDiagnostics();
    renderPerformanceScript();
  });
  takeStore.open().then(async () => {
    state.takes = await takeStore.all();
    renderTakes();
  });
  projectStore.open().then(async (ok) => {
    state.projectStoreReady = ok;
    state.projectSnapshots = ok ? sanitizeProjectSnapshots(await projectStore.all()) : [];
    renderProjectVault();
    renderStudioPlan();
  });
  updateDiagnostics();
  loadInitialAudioFromQuery();
  requestAnimationFrame(drawLoop);
}

function renderReferenceSelectors() {
  $("sampleProfile").innerHTML = REFERENCE_VOICE_PROFILES.map((profile) => (
    `<option value="${profile.id}">${profile.name}</option>`
  )).join("");
  $("polishIntensity").innerHTML = STUDIO_POLISH_INTENSITIES.map((item) => (
    `<option value="${item.id}">${item.label}</option>`
  )).join("");
  $("polishIntensity").value = state.polishIntensity;
  $("productionTarget").innerHTML = STUDIO_PRODUCTION_TARGETS.map((item) => (
    `<option value="${item.id}">${item.label}</option>`
  )).join("");
  $("productionTarget").value = state.productionTarget;
  $("directorOptimize").checked = !!state.directorOptimize;
  $("qualityProfile").innerHTML = [
    `<option value="all">All Sources</option>`,
    ...REFERENCE_VOICE_PROFILES.map((profile) => `<option value="${profile.id}">${profile.name}</option>`)
  ].join("");
}

function renderGuidedStudio() {
  const panel = $("guidedStudioPanel");
  if (!panel) return;
  const source = offline.source;
  const rendered = offline.rendered;
  const analysis = source?.studioAnalysis || null;
  const plan = analysis ? buildStudioPolishPlan(analysis, state.polishIntensity, state.productionTarget) : null;
  const opusType = preferredOpusMimeType();
  const safetyLabel = rendered?.characterSafety?.enabled
    ? rendered.characterSafety.status === "guarded" ? "Safety Guarded" : "Safety Clear"
    : "Pending";
  const steps = [
    { id: "source", label: "Source", status: source ? "ready" : "waiting", value: source ? source.name : "No source" },
    { id: "clean", label: "Clean", status: analysis ? analysis.status : "waiting", value: analysis ? `${analysis.score}%` : "Waiting" },
    { id: "polish", label: "Polish", status: rendered?.studioPolish?.enabled ? "ready" : source ? "polish" : "waiting", value: rendered?.studioPolish?.enabled ? `${rendered.studioPolish.intensity}${rendered.studioPolish.optimized ? "+dir" : ""}` : state.polishIntensity },
    { id: "character", label: "Character", status: rendered?.stage === "character" ? rendered.characterSafety?.status || "ready" : source ? "polish" : "waiting", value: rendered?.stage === "character" ? `${presetById(state.presetId).name} / ${safetyLabel}` : "Pending" },
    { id: "export", label: "Export", status: rendered ? "ready" : "waiting", value: rendered ? (opusType ? "WAV/WebM/ZIP" : "WAV/ZIP") : "Pending" }
  ];
  panel.className = `guided-studio is-${analysis?.status || "waiting"}`;
  $("guidedStudioStatus").textContent = analysis ? `${analysis.score}% ${studioStatusLabel(analysis.status)}` : "No source";
  $("guidedStudioFlow").innerHTML = steps.map((step, index) => `
    <div class="guided-step is-${step.status}" data-step="${step.id}">
      <span>${String(index + 1).padStart(2, "0")} ${escapeHtml(step.label)}</span>
      <strong>${escapeHtml(step.value)}</strong>
    </div>
  `).join("");
  $("renderPolishOnly").disabled = !source;
  $("downloadWebm").disabled = !rendered || !opusType;
  $("downloadZip").disabled = !rendered;
  if (!analysis || !plan) {
    $("studioPolishGrid").innerHTML = "";
    $("studioPolishPatches").innerHTML = "";
    return;
  }
  const repairMap = plan.repairMap || analysis.repairMap;
  const repairByCard = new Map((repairMap?.steps || []).map((step) => [studioRepairCardKey(step.id), step]));
  $("studioPolishGrid").innerHTML = analysis.items.map((item) => `
    <div class="studio-polish-card is-${item.status}" data-polish="${item.id}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(repairByCard.get(item.id)?.action || item.detail)}</small>
    </div>
  `).join("");
  const stagePills = [
    ["Target", plan.target?.label || "Podcast"],
    ["Micro", formatMicroRepairPill(rendered?.studioPolish?.plan?.microRepair || plan.microRepair || analysis.microRepair)],
    ["De-plosive", `${Math.round(plan.stages.deplosive)}%`],
    ["Mouth", `${Math.round(plan.stages.mouthClick)}%`],
    ["Noise", `${Math.round(plan.stages.noiseReduction)}%`],
    ["HPF", `${Math.round(plan.stages.highPassHz)} Hz`],
    ["De-ess", `${Math.round(plan.stages.deEss)}%`],
    ["Level", `${Math.round(plan.stages.leveler)}%`],
    ["Ride", plan.reactivePlan?.levelRide ? `${plan.reactivePlan.levelRide.rangeDb} dB` : "off"],
    ["Out", `${plan.stages.outputGainDb > 0 ? "+" : ""}${plan.stages.outputGainDb.toFixed(1)} dB`]
  ];
  if (rendered?.studioPolish?.plan?.optimization?.enabled) {
    const opt = rendered.studioPolish.plan.optimization;
    const optLabel = opt.scoreBefore <= 0 && opt.scoreAfter <= 0 ? "guarded" : `${opt.scoreBefore}->${opt.scoreAfter}`;
    stagePills.push(["Director", optLabel]);
  }
  if (rendered?.characterSafety?.enabled) {
    stagePills.push([
      rendered.characterSafety.status === "guarded" ? "Safety Guarded" : "Safety Clear",
      characterSafetySummary(rendered.characterSafety)
    ]);
  }
  const repairPills = (repairMap?.steps || [])
    .filter((step) => step.status !== "ready")
    .slice(0, 4)
    .map((step) => [`${String(step.order).padStart(2, "0")} ${step.label}`, step.status]);
  $("studioPolishPatches").innerHTML = [
    ...stagePills.map(([label, value]) => `<span>${escapeHtml(label)} <b>${escapeHtml(value)}</b></span>`),
    ...repairPills.map(([label, value]) => `<span>${escapeHtml(label)} <b>${escapeHtml(value)}</b></span>`),
    ...plan.notes.slice(0, 3).map((note) => `<span>${escapeHtml(note)} <b>on</b></span>`)
  ].join("");
}

function studioRepairCardKey(id) {
  if (id === "input") return "level";
  if (id === "deplosive") return "plosive";
  if (id === "deess") return "sibilance";
  if (id === "level") return "dynamics";
  if (id === "target") return "tone";
  return id;
}

function formatMicroRepairPill(timeline = null) {
  const count = Number(timeline?.eventCount || 0);
  if (!count) return "0 events";
  const c = timeline.counts || {};
  return `${count} / M${c.mouth || 0} P${c.plosive || 0} S${c.sibilance || 0}`;
}

function renderPresets() {
  $("presetCount").textContent = String(FACTORY_PRESETS.length);
  $("presetList").innerHTML = FACTORY_PRESETS.map((preset) => `
    <button class="preset-card ${preset.id === state.presetId ? "is-active" : ""}" data-preset="${preset.id}" type="button">
      <strong>${preset.name}</strong>
      <span>${preset.target}</span>
    </button>
  `).join("");
  $("presetList").querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      state.presetId = button.dataset.preset;
      state.lineReadId = firstLineReadForPreset(state.presetId).id;
      state.params = paramsForPreset(state.presetId);
      persist();
      engine.setParams(state.params);
      renderPresets();
      renderControls();
      renderLineReadPanel();
      renderLineReadLibrary();
      renderSceneKitPanel();
      renderSceneKitLibrary();
      renderSceneSession();
      renderSourceTimeline();
      renderProjectVault();
      updateActivePreset();
      updateSourceFit();
      updateRoutePlanner();
      renderCharacterChain();
      renderEffectStack();
      renderProjectVault();
      toast(presetById(state.presetId).name, presetById(state.presetId).target);
    });
  });
  updateActivePreset();
}

function updateActivePreset() {
  $("activePresetName").textContent = presetById(state.presetId).name;
}

function renderControls() {
  renderControlGroup($("macroControls"), MACRO_DEFS);
  renderControlGroup($("directorControls"), DIRECTOR_DEFS);
  renderControlGroup($("voiceControls"), PARAM_DEFS);
}

function renderControlGroup(host, defs) {
  host.innerHTML = defs.map((def) => controlTemplate(def)).join("");
  host.querySelectorAll("input[type=range]").forEach((input) => {
    const key = input.dataset.key;
    input.addEventListener("input", () => {
      delete state.params._sourceCalibration;
      state.params[key] = Number(input.value);
      const output = host.querySelector(`[data-output="${key}"]`);
      if (output) output.textContent = formatValue(state.params[key], defs.find((d) => d.key === key));
      persist();
      engine.setParams(state.params);
      updateLineReadScore();
      updateSourceFit();
      updateRoutePlanner();
      renderCharacterChain();
      renderEffectStack();
      renderProjectVault();
    });
  });
}

function controlTemplate(def) {
  const value = Number(state.params[def.key] ?? 0);
  return `
    <div class="control-row">
      <label>
        <span>${def.label}</span>
        <output data-output="${def.key}">${formatValue(value, def)}</output>
      </label>
      <input type="range" data-key="${def.key}" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}" aria-label="${def.label}">
    </div>
  `;
}

function formatValue(value, def) {
  const n = def.step < 1 ? value.toFixed(2).replace(/\.00$/, "") : String(Math.round(value));
  return `${value > 0 && (def.unit === " st" || def.unit === " dB") ? "+" : ""}${n}${def.unit}`;
}

function bindTabs() {
  document.querySelectorAll("[data-view-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-view-tab]").forEach((item) => item.classList.remove("is-active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
      tab.classList.add("is-active");
      $(`view-${tab.dataset.viewTab}`).classList.add("is-active");
      requestAnimationFrame(renderLineReadDiagnostics);
    });
  });
}

function bindTransport() {
  $("startMic").addEventListener("click", async () => {
    try {
      await engine.start(state.params);
      $("micStatus").className = "status-pill ok";
      $("micStatus").innerHTML = "<i></i>Mic live";
      toast("Microphone ready", "Live character chain is active.");
    } catch (error) {
      $("micStatus").className = "status-pill bad";
      $("micStatus").innerHTML = "<i></i>Mic blocked";
      toast("Microphone unavailable", error.message || "Check browser permission.", "bad");
    }
  });

  $("monitorToggle").addEventListener("click", () => {
    if (!engine.ready) {
      toast("Start the microphone first", "Monitoring needs an active audio graph.");
      return;
    }
    if (!state.monitor && $("headphoneDialog").showModal) {
      $("headphoneDialog").showModal();
      return;
    }
    toggleMonitor(!state.monitor);
  });

  $("confirmMonitor").addEventListener("click", () => toggleMonitor(true));

  $("bypassToggle").addEventListener("click", () => {
    state.bypass = !state.bypass;
    engine.setBypass(state.bypass);
    $("bypassToggle").setAttribute("aria-pressed", String(state.bypass));
  });

  $("recordButton").addEventListener("click", async () => {
    if (!engine.ready) {
      toast("Start the microphone first", "Recording captures the processed live output.");
      return;
    }
    if (!engine.recording) {
      engine.startRecording();
      $("recordButton").classList.add("is-recording");
      $("engineStatus").className = "status-pill live";
      $("engineStatus").innerHTML = "<i></i>Recording";
    } else {
      const take = await engine.stopRecording();
      $("recordButton").classList.remove("is-recording");
      $("engineStatus").className = "status-pill ok";
      $("engineStatus").innerHTML = "<i></i>DSP ready";
      if (take && take.duration > 0.15) {
        await takeStore.put(take);
        state.takes = await takeStore.all();
        renderTakes();
        toast("Take saved", `${take.duration.toFixed(1)}s processed WAV stored locally.`);
      }
    }
  });

  $("resetPreset").addEventListener("click", () => {
    state.params = paramsForPreset(state.presetId);
    persist();
    engine.setParams(state.params);
    renderControls();
    updateLineReadScore();
    updateSourceFit();
    updateRoutePlanner();
    renderCharacterChain();
    renderEffectStack();
  });

  $("clearTakes").addEventListener("click", async () => {
    await takeStore.clear();
    state.takes = [];
    renderTakes();
  });
}

function toggleMonitor(on) {
  state.monitor = on;
  engine.setMonitor(on);
  $("monitorToggle").setAttribute("aria-pressed", String(on));
  $("monitorToggle").classList.toggle("primary", on);
}

function bindLineReads() {
  $("applyActiveLineRead").addEventListener("click", () => applyLineReadTarget(state.lineReadId));
  $("applyNextLineReadFix").addEventListener("click", applyNextLineReadFix);
  $("nextLineRead").addEventListener("click", () => {
    const index = ALL_LINE_READ_TARGETS.findIndex((target) => target.id === state.lineReadId);
    const next = ALL_LINE_READ_TARGETS[(index + 1 + ALL_LINE_READ_TARGETS.length) % ALL_LINE_READ_TARGETS.length];
    applyLineReadTarget(next.id);
  });
  $("sceneBeatList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-scene-target]");
    if (button) applyLineReadTarget(button.dataset.sceneTarget);
  });
  $("sceneKitLibrary").addEventListener("click", (event) => {
    const button = event.target.closest("[data-scene-target]");
    if (button) applyLineReadTarget(button.dataset.sceneTarget);
  });
  $("sceneSessionGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-session-target]");
    if (button) applyLineReadTarget(button.dataset.sessionTarget);
  });
  $("applySceneSessionStep")?.addEventListener("click", applySceneSessionStep);
}

function applyLineReadTarget(id) {
  const target = lineReadById(id);
  state.lineReadId = target.id;
  state.presetId = target.presetId;
  state.params = paramsForLineReadTarget(target.id);
  persist();
  engine.setParams(state.params);
  const option = $("sampleProfile")?.querySelector(`option[value="${target.sourceProfileId}"]`);
  if (option) $("sampleProfile").value = target.sourceProfileId;
  renderPresets();
  renderControls();
  renderLineReadPanel();
  renderLineReadLibrary();
  renderSceneKitPanel();
  renderSceneKitLibrary();
  renderSceneSession();
  renderSourceTimeline();
  renderProjectVault();
  updateActivePreset();
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderEffectStack();
  toast(target.name, target.direction);
}

function applyNextLineReadFix() {
  const target = lineReadById(state.lineReadId);
  const coach = coachLineReadTarget(state.params, target, 1);
  const [key, value] = Object.entries(coach.nextPatch)[0] || [];
  if (!key) {
    toast("Target already matched", "Line Read controls are locked to this read.");
    return;
  }
  state.params = { ...state.params, [key]: value };
  persist();
  engine.setParams(state.params);
  renderControls();
  updateLineReadScore();
  renderSceneKitPanel();
  renderSceneKitLibrary();
  renderSceneSession();
  renderSourceTimeline();
  renderProjectVault();
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderEffectStack();
  toast("Next fix applied", `${coach.cues[0].label} ${signed(Math.round(coach.cues[0].delta))}`);
}

function renderLineReadPanel() {
  const target = lineReadById(state.lineReadId);
  $("activeLineReadName").textContent = target.name;
  $("activeLineReadPreset").textContent = presetById(target.presetId).name;
  $("activeLineReadLine").textContent = target.line;
  $("activeLineReadDirection").textContent = target.direction;
  $("activeLineReadTags").innerHTML = target.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  updateLineReadScore();
  renderSceneKitPanel();
}

function updateLineReadScore() {
  const target = lineReadById(state.lineReadId);
  $("activeLineReadScore").textContent = `${scoreLineReadTarget(state.params, target)}%`;
  renderLineReadDiagnostics();
  renderPerformanceScript();
  renderScriptMatch();
}

function renderLineReadDiagnostics() {
  if (!$("lineReadBreakdown")) return;
  const target = lineReadById(state.lineReadId);
  const axes = targetMatchBreakdown(state.params, target);
  const targeted = axes.filter((axis) => axis.targeted);
  $("lineReadBreakdown").innerHTML = targeted.map((axis) => {
    const currentPercent = axisValuePercent(axis.key, axis.current);
    const targetPercent = axisValuePercent(axis.key, axis.target);
    return `
      <div class="target-axis ${axis.normalizedGap > 0.08 ? "is-drift" : ""}" data-axis="${axis.key}">
        <div class="target-axis-head">
          <strong>${escapeHtml(axis.fullLabel)}</strong>
          <span>${axis.score}%</span>
        </div>
        <div class="axis-track" style="--current:${currentPercent}%; --target:${targetPercent}%">
          <b></b><i></i>
        </div>
        <div class="target-axis-foot">
          <span>Now ${formatAxisNumber(axis.current)}</span>
          <span>Target ${formatAxisNumber(axis.target)}</span>
        </div>
      </div>
    `;
  }).join("");
  const gaps = topTargetGaps(state.params, target, 3);
  $("activeLineReadGaps").innerHTML = gaps.map((axis) => `
    <span>${axis.action === "raise" ? "Raise" : "Lower"} ${escapeHtml(axis.fullLabel)} <b>${signed(Math.round(axis.delta))}</b></span>
  `).join("");
  renderLineReadCoach(target);
  drawLineReadRadar(axes.slice(0, 6));
}

function renderLineReadCoach(target) {
  const coach = coachLineReadTarget(state.params, target, 3);
  $("lineReadCoachStatus").textContent = coachStatusLabel(coach.status);
  $("lineReadRecipeFlow").innerHTML = coach.groups.map((group) => `
    <div class="recipe-step is-${group.status}" data-recipe="${group.id}">
      <span>${escapeHtml(group.label)}</span>
      <strong>${group.score}%</strong>
      <small>${group.gap ? `${group.gap.action === "raise" ? "Raise" : "Lower"} ${escapeHtml(group.gap.label)}` : "Locked"}</small>
    </div>
  `).join("");
  $("lineReadCoachList").innerHTML = coach.cues.length ? coach.cues.map((cue) => `
    <div class="coach-item" data-axis="${cue.key}">
      <span>${cue.action === "raise" ? "Raise" : "Lower"} ${escapeHtml(cue.label)} <b>${signed(Math.round(cue.delta))}</b></span>
      <p>${escapeHtml(cue.cue)}</p>
    </div>
  `).join("") : `
    <div class="coach-item is-locked">
      <span>Target locked</span>
      <p>The current macro and director controls match this Line Read.</p>
    </div>
  `;
  const next = coach.cues[0];
  $("applyNextLineReadFix").disabled = !next;
  $("applyNextLineReadFix").textContent = next ? `Fix ${next.label}` : "Target Locked";
}

function coachStatusLabel(status) {
  if (status === "locked") return "Locked";
  if (status === "polish") return "Polish";
  return "Shape";
}

function currentPerformanceScript() {
  return buildPerformanceScript(lineReadById(state.lineReadId), state.params);
}

function renderPerformanceScript() {
  const canvas = $("performanceScriptCanvas");
  const cards = $("performanceScriptCards");
  const cues = $("performanceScriptCues");
  if (!canvas || !cards || !cues) return;
  const script = currentPerformanceScript();
  $("performanceScriptStatus").textContent = `${script.score}% ${scriptStatusLabel(script.status)}`;
  drawPerformanceScriptCanvas(canvas, script);
  cards.innerHTML = script.lanes.map((lane) => `
    <div class="performance-script-card is-${lane.id}">
      <span>${escapeHtml(lane.label)}</span>
      <strong>${lane.score}%</strong>
      <small>${escapeHtml(lane.summary)}</small>
    </div>
  `).join("");
  cues.innerHTML = script.cues.map((cue, index) => `
    <span><b>${String(index + 1).padStart(2, "0")}</b>${escapeHtml(cue)}</span>
  `).join("");
}

function drawPerformanceScriptCanvas(canvas, script) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(dpr, dpr);
  const w = width / dpr;
  const h = height / dpr;
  const pad = 14;
  const laneH = (h - pad * 2) / script.lanes.length;
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  script.phases.forEach((phase) => {
    const x = pad + (w - pad * 2) * (phase.range[0] / script.durationSec);
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, h - pad);
    ctx.stroke();
  });
  script.lanes.forEach((lane, index) => {
    const y0 = pad + laneH * index;
    const yMid = y0 + laneH * 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.beginPath();
    ctx.moveTo(pad, yMid);
    ctx.lineTo(w - pad, yMid);
    ctx.stroke();
    ctx.fillStyle = "rgba(247,247,251,0.58)";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(lane.label, pad, y0 + 10);
    drawScriptLaneLine(ctx, lane, script.durationSec, pad + 62, y0 + 5, w - pad, y0 + laneH - 6, scriptLaneColor(lane.id));
  });
  ctx.fillStyle = "rgba(247,247,251,0.58)";
  ctx.textAlign = "right";
  ctx.fillText(`${script.durationSec.toFixed(1)}s`, w - pad, h - 5);
  ctx.restore();
}

function drawScriptLaneLine(ctx, lane, durationSec, x0, y0, x1, y1, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  lane.points.forEach((point, index) => {
    const x = x0 + (x1 - x0) * (point.t / Math.max(0.001, durationSec));
    const y = y1 - (y1 - y0) * Math.max(0, Math.min(1, point.value));
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = color;
  lane.points.forEach((point) => {
    const x = x0 + (x1 - x0) * (point.t / Math.max(0.001, durationSec));
    const y = y1 - (y1 - y0) * Math.max(0, Math.min(1, point.value));
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function scriptLaneColor(id) {
  if (id === "lift") return "#8fa7ff";
  if (id === "energy") return "#ffd166";
  if (id === "distance") return "#69e3b5";
  if (id === "breath") return "#ff6d9e";
  return "#c59cff";
}

function renderScriptMatch() {
  const panel = $("scriptMatchPanel");
  if (!panel) return;
  const script = offline.rendered?.performanceScriptPlan || currentPerformanceScript();
  const match = compareScriptToPerformance(script, currentPerformanceComparison());
  panel.className = `script-match is-${match?.status || "empty"}`;
  $("scriptMatchStatus").textContent = match
    ? `${match.score}% ${match.plannedOnly ? "Planned" : scriptStatusLabel(match.status)}`
    : "No script";
  $("scriptMatchGrid").innerHTML = match?.items?.slice(0, 5).map((item) => `
    <div class="script-match-card is-${item.status || script.status}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.detail)}</small>
    </div>
  `).join("") || "";
}

function renderAutomationPanel() {
  const panel = $("automationPanel");
  if (!panel) return;
  const rendered = offline.rendered;
  const summary = rendered?.scriptAutomationSummary;
  if (!offline.source) {
    panel.className = "automation-panel";
    $("automationStatus").textContent = "No source";
    $("automationGrid").innerHTML = "";
    return;
  }
  if (!rendered) {
    panel.className = "automation-panel is-planned";
    $("automationStatus").textContent = $("scriptAutomationRender")?.checked ? "Armed" : "Off";
    $("automationGrid").innerHTML = currentPerformanceScript().lanes.map((lane) => `
      <div class="automation-card">
        <span>${escapeHtml(lane.label)}</span>
        <strong>${lane.score}%</strong>
        <small>${escapeHtml(lane.summary)}</small>
      </div>
    `).join("");
    return;
  }
  panel.className = `automation-panel ${rendered.scriptAutomated ? "is-active" : "is-static"}`;
  $("automationStatus").textContent = rendered.scriptAutomated
    ? `${rendered.scriptAutomation?.frameCount || 0} frames`
    : "Static";
  $("automationGrid").innerHTML = rendered.scriptAutomated && summary
    ? summary.lanes.map((lane) => `
      <div class="automation-card">
        <span>${escapeHtml(lane.label)}</span>
        <strong>${Math.round(lane.range * 100)}%</strong>
        <small>${Math.round(lane.min * 100)}-${Math.round(lane.max * 100)}%</small>
      </div>
    `).join("")
    : `<div class="automation-card"><span>Static</span><strong>0%</strong><small>Script automation disabled.</small></div>`;
}

function currentScriptMatch() {
  const comparison = currentPerformanceComparison();
  if (!comparison) return null;
  return compareScriptToPerformance(offline.rendered?.performanceScriptPlan || currentPerformanceScript(), comparison);
}

function scriptStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "check") return "Check";
  return "Risk";
}

function drawLineReadRadar(axes) {
  const canvas = $("lineReadRadar");
  if (!canvas || !axes.length) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(dpr, dpr);
  const w = width / dpr;
  const h = height / dpr;
  const cx = w / 2;
  const cy = h / 2 + 2;
  const radius = Math.max(36, Math.min(w, h) * 0.33);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let ring = 3; ring >= 1; ring -= 1) {
    const points = radarPoints(axes, cx, cy, radius * ring / 3, () => 1);
    drawPolygon(ctx, points, ring === 3);
  }
  axes.forEach((axis, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
    const endX = cx + Math.cos(angle) * radius;
    const endY = cy + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.fillStyle = "rgba(247,247,251,0.72)";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = endX < cx - 6 ? "right" : endX > cx + 6 ? "left" : "center";
    ctx.textBaseline = endY < cy ? "bottom" : "top";
    ctx.fillText(axis.label, endX + Math.cos(angle) * 8, endY + Math.sin(angle) * 8);
  });
  const targetPoints = radarPoints(axes, cx, cy, radius, (axis) => axisValueRatio(axis.key, axis.target));
  ctx.strokeStyle = "rgba(255,109,158,0.92)";
  ctx.fillStyle = "rgba(255,109,158,0.13)";
  drawPolygon(ctx, targetPoints, true);
  const currentPoints = radarPoints(axes, cx, cy, radius, (axis) => axisValueRatio(axis.key, axis.current));
  ctx.strokeStyle = "rgba(105,227,181,0.95)";
  ctx.fillStyle = "rgba(105,227,181,0.16)";
  drawPolygon(ctx, currentPoints, true);
  ctx.restore();
}

function radarPoints(axes, cx, cy, radius, valueForAxis) {
  return axes.map((axis, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
    const value = Math.max(0, Math.min(1, valueForAxis(axis)));
    return {
      x: cx + Math.cos(angle) * radius * value,
      y: cy + Math.sin(angle) * radius * value
    };
  });
}

function drawPolygon(ctx, points, fill) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}

function axisValueRatio(key, value) {
  if (key === "body") return (Math.max(-100, Math.min(100, value)) + 100) / 200;
  return Math.max(0, Math.min(100, value)) / 100;
}

function axisValuePercent(key, value) {
  return Math.round(axisValueRatio(key, value) * 100);
}

function formatAxisNumber(value) {
  return `${Math.round(value)}`;
}

function renderLineReadLibrary() {
  $("lineReadLibrary").innerHTML = LINE_READ_TARGETS.map((target) => `
    <button class="line-read-card ${target.id === state.lineReadId ? "is-active" : ""}" data-line-read="${target.id}" type="button">
      <span>${escapeHtml(presetById(target.presetId).name)}</span>
      <strong>${escapeHtml(target.name)}</strong>
      <p>${escapeHtml(target.line)}</p>
      <small>${escapeHtml(target.direction)}</small>
      <div class="tag-list">${target.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    </button>
  `).join("");
  $("lineReadLibrary").querySelectorAll("[data-line-read]").forEach((button) => {
    button.addEventListener("click", () => applyLineReadTarget(button.dataset.lineRead));
  });
}

function renderSceneKitPanel() {
  const host = $("sceneBeatList");
  if (!host) return;
  const activeTarget = lineReadById(state.lineReadId);
  const activeScene = sceneBeatByTargetId(state.lineReadId);
  const kit = activeScene?.kit
    || SCENE_KITS.find((candidate) => candidate.presetId === activeTarget.presetId)
    || SCENE_KITS[0];
  const sceneTargets = sceneBeatTargetsForKit(kit.id);
  $("activeSceneKitName").textContent = kit.name;
  host.innerHTML = sceneTargets.map((target, index) => {
    const active = target.id === state.lineReadId;
    return `
      <button class="scene-beat ${active ? "is-active" : ""}" data-scene-target="${target.id}" type="button">
        <span>${String(index + 1).padStart(2, "0")} ${escapeHtml(target.name)}</span>
        <strong>${escapeHtml(target.line)}</strong>
        <small>${escapeHtml(target.direction)}</small>
      </button>
    `;
  }).join("");
  renderSceneSession();
}

function renderSceneKitLibrary() {
  const host = $("sceneKitLibrary");
  if (!host) return;
  host.innerHTML = SCENE_KITS.map((kit) => {
    const targets = sceneBeatTargetsForKit(kit.id);
    const active = targets.some((target) => target.id === state.lineReadId);
    return `
      <div class="scene-kit-card ${active ? "is-active" : ""}" data-scene-kit="${kit.id}">
        <div class="scene-kit-card-head">
          <span>${escapeHtml(presetById(kit.presetId).name)}</span>
          <strong>${escapeHtml(kit.name)}</strong>
          <small>${escapeHtml(kit.description)}</small>
        </div>
        <div class="tag-list">${kit.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="scene-kit-beats">
          ${targets.map((target) => `
            <button class="scene-beat-mini ${target.id === state.lineReadId ? "is-active" : ""}" data-scene-target="${target.id}" type="button">
              <span>${escapeHtml(target.name)}</span>
              <small>${escapeHtml(target.line)}</small>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function currentSceneSession() {
  return buildSceneSession({
    activeLineReadId: state.lineReadId,
    params: state.params,
    snapshots: state.voiceSnapshots,
    renderDeck: state.renderDeck,
    hasSource: !!offline.source,
    takeDecision: currentTakeDecision()
  });
}

function renderSceneSession() {
  const panel = $("sceneSessionPanel");
  if (!panel) return;
  const session = currentSceneSession();
  const summary = sceneSessionSummary(session);
  panel.className = `scene-session-panel is-${summary.status}`;
  $("sceneSessionStatus").textContent = `${summary.readyCount}/${summary.count} beats / ${summary.score}%`;
  $("sceneSessionGrid").innerHTML = session.items.map((item) => `
    <button class="scene-session-card is-${item.status} ${item.active ? "is-active" : ""}" data-session-target="${item.targetId}" type="button">
      <span>${String(item.index + 1).padStart(2, "0")} ${escapeHtml(item.nextNeed)}</span>
      <strong>${escapeHtml(item.label)}</strong>
      <small>${escapeHtml(item.line)}</small>
      <div class="scene-session-bars">
        <i style="--score:${item.targetScore}%"><b>Target</b><em>${item.targetScore}%</em></i>
        <i style="--score:${item.memoryScore}%"><b>Design</b><em>${item.memoryCount}</em></i>
        <i style="--score:${item.bestTakeScore}%"><b>Takes</b><em>${item.takeCount}</em></i>
      </div>
    </button>
  `).join("");
  const action = session.nextAction;
  $("sceneSessionNext").textContent = action
    ? action.detail
    : `${session.kitName}: ${session.summary}.`;
  $("applySceneSessionStep").disabled = !action;
  $("applySceneSessionStep").textContent = action ? action.label : "Session Ready";
}

function applySceneSessionStep() {
  const session = currentSceneSession();
  const action = session.nextAction;
  if (!action) {
    toast("Scene session ready", `${session.kitName}: all visible beats are covered.`);
    return;
  }
  if (action.id === "load-source") {
    generateTargetSource();
    return;
  }
  if (action.id === "apply-scene-target" || action.id === "apply-scene-beat") {
    applyLineReadTarget(action.targetId);
    return;
  }
  if (action.id === "capture-scene-design") {
    captureVoiceMemory();
    return;
  }
  if (action.id === "preview-region") {
    if (action.cueId) applySourceCue(action.cueId, false);
    renderOfflineToPreview(true);
    return;
  }
  if (action.id === "render-variants") {
    renderAuditionVariantSet();
  }
}

function bindOffline() {
  $("regionStart").addEventListener("input", syncRegionFromInputs);
  $("regionLength").addEventListener("input", syncRegionFromInputs);
  $("sourceTimelineList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-source-cue]");
    if (button) applySourceCue(button.dataset.sourceCue);
  });
  $("applySourceCue")?.addEventListener("click", () => applySourceCue(currentSourceTimeline().nextAction?.cueId));

  $("loadSample").addEventListener("click", () => {
    const source = offline.generateSample(48000, $("sampleProfile").value);
    useOfflineSource(source);
  });

  $("audioUpload").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const source = await offline.loadFile(file);
      useOfflineSource(source);
    } catch (error) {
      toast("Could not decode audio", error.message || "Try a WAV, MP3, M4A, or WebM file.");
    }
  });

  $("loadAudioUrl").addEventListener("click", loadAudioUrlSource);
  $("audioUrl").addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadAudioUrlSource();
  });

  $("analyzeSource").addEventListener("click", analyzeOfflineSource);

  $("applyCalibration").addEventListener("click", tuneCurrentSource);

  $("polishIntensity").addEventListener("change", () => {
    state.polishIntensity = $("polishIntensity").value;
    persist();
    engine.setStudioPolishIntensity(state.polishIntensity);
    renderGuidedStudio();
    renderStudioPlan();
  });

  $("productionTarget").addEventListener("change", () => {
    state.productionTarget = $("productionTarget").value;
    persist();
    renderGuidedStudio();
    renderStudioPlan();
  });

  $("directorOptimize").addEventListener("change", () => {
    state.directorOptimize = $("directorOptimize").checked;
    persist();
    renderGuidedStudio();
    renderStudioPlan();
  });

  $("renderPolishOnly").addEventListener("click", () => renderOfflineToPreview(true, { stage: "polish" }));

  $("previewOffline").addEventListener("click", () => renderOfflineToPreview(true));

  $("renderOffline").addEventListener("click", () => renderOfflineToPreview(false));

  $("renderVariantSet")?.addEventListener("click", () => renderAuditionVariantSet());
  $("renderStackAuditions")?.addEventListener("click", () => renderStackAuditionSet());

  $("variantLabGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-variant-render]");
    if (button) renderAuditionVariantSet(button.dataset.variantRender);
  });

  $("stackAuditionGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stack-audition-render]");
    if (button) renderStackAuditionSet(button.dataset.stackAuditionRender);
  });

  $("scriptAutomationRender")?.addEventListener("change", () => {
    renderAutomationPanel();
    renderAuditionVariants();
    renderStackAuditions();
    renderStudioPlan();
  });

  $("downloadRender").addEventListener("click", downloadCurrentWav);
  $("downloadWebm").addEventListener("click", downloadCurrentWebm);
  $("downloadZip").addEventListener("click", downloadCurrentZip);
  $("directorBriefAction")?.addEventListener("click", applyStudioPlanStep);

  $("playCompare").addEventListener("click", async () => {
    if (!offline.source || !offline.rendered) return;
    try {
      const sourceStart = offline.rendered.region?.isFull ? 0 : offline.rendered.region?.startSec || 0;
      const seconds = Math.min(1.25, offline.rendered.region?.durationSec || 1.25);
      $("renderStatus").textContent = "A/B";
      await playSnippet($("sourceAudio"), seconds, sourceStart);
      await new Promise((resolve) => setTimeout(resolve, 160));
      await playSnippet($("renderAudio"), seconds, 0);
      $("renderStatus").textContent = offline.rendered.mode === "preview" ? "Preview ready" : "Rendered";
    } catch (error) {
      $("renderStatus").textContent = offline.rendered?.mode === "preview" ? "Preview ready" : "Rendered";
      toast("A/B playback failed", error.message || "Use the audio controls to play both versions.");
    }
  });

  $("voiceRouteList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-route]");
    if (button) applyVoiceRoute(button.dataset.route);
  });

  $("renderDeckList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-render-deck]");
    if (button) selectRenderDeckItem(button.dataset.renderDeck);
  });

  $("takeDecisionList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-take-decision]");
    if (button) selectRenderDeckItem(button.dataset.takeDecision);
  });

  $("applyKeeperRefinement")?.addEventListener("click", applyKeeperRefinement);

  $("applyChainFix").addEventListener("click", applyNextCharacterChainFix);
  $("applyStackFix")?.addEventListener("click", applyNextEffectStackFix);
  $("captureVoiceMemory")?.addEventListener("click", captureVoiceMemory);
  $("clearVoiceMemory")?.addEventListener("click", clearVoiceMemory);
  $("voiceMemoryList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-voice-memory]");
    if (button) applyVoiceMemory(button.dataset.voiceMemory);
  });
  $("captureProject")?.addEventListener("click", () => captureProjectSnapshot({ manual: true }));
  $("clearProjectVault")?.addEventListener("click", clearProjectVault);
  $("projectVaultList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project-vault]");
    if (button) applyProjectSnapshot(button.dataset.projectVault);
  });
  $("applyStudioPlanStep").addEventListener("click", applyStudioPlanStep);
}

async function loadInitialAudioFromQuery() {
  const query = new URLSearchParams(window.location.search);
  const audioUrl = query.get("audio") || query.get("url");
  if (!audioUrl) return;
  const target = query.get("target");
  const polish = query.get("polish");
  const director = query.get("director");
  const render = query.get("render");
  const tab = document.querySelector('[data-view-tab="offline"]');
  tab?.click();
  if (target && STUDIO_PRODUCTION_TARGETS.some((item) => item.id === target)) {
    state.productionTarget = target;
    $("productionTarget").value = target;
  }
  if (polish && STUDIO_POLISH_INTENSITIES.some((item) => item.id === polish)) {
    state.polishIntensity = polish;
    $("polishIntensity").value = polish;
    engine.setStudioPolishIntensity(polish);
  }
  if (director !== null) {
    state.directorOptimize = !/^(0|false|off)$/i.test(director);
    $("directorOptimize").checked = state.directorOptimize;
  }
  persist();
  renderGuidedStudio();
  renderStudioPlan();
  $("audioUrl").value = audioUrl;
  await loadAudioUrlSource();
  if (!offline.source) return;
  if (render === "polish") {
    renderOfflineToPreview(true, { stage: "polish" });
  } else if (render === "full" || render === "character") {
    renderOfflineToPreview(false);
  }
}

function currentSourceTimeline() {
  if (!offline.source) return buildSourceTimeline(null);
  const script = currentPerformanceScript();
  return buildSourceTimeline(offline.source, {
    activeCueId: state.activeSourceCueId,
    scriptDurationSec: script.durationSec
  });
}

function rebuildSourceTimeline(options = {}) {
  let timeline = currentSourceTimeline();
  if (options.selectBest && timeline.bestCue) {
    state.activeSourceCueId = timeline.bestCue.id;
    state.offlineRegion = cueRegion(timeline.bestCue) || state.offlineRegion;
    timeline = currentSourceTimeline();
  } else if (timeline.cues.length && !timeline.cues.some((cue) => cue.id === state.activeSourceCueId)) {
    state.activeSourceCueId = timeline.bestCue?.id || timeline.cues[0].id;
    timeline = currentSourceTimeline();
  }
  state.sourceTimeline = timeline;
  return timeline;
}

function renderSourceTimeline() {
  const panel = $("sourceTimelinePanel");
  if (!panel) return;
  const timeline = rebuildSourceTimeline();
  const summary = sourceTimelineSummary(timeline);
  panel.className = `source-timeline is-${summary.status}`;
  $("sourceTimelineStatus").textContent = timeline.cueCount
    ? `${timeline.cueCount} cues / ${timeline.score}%`
    : offline.source ? "No cues" : "No source";
  $("sourceTimelineList").innerHTML = timeline.cues.length ? timeline.cues.map((cue) => `
    <button class="source-cue-card is-${cue.status} ${cue.active ? "is-active" : ""}" data-source-cue="${cue.id}" type="button">
      <span>${escapeHtml(cue.label)}</span>
      <strong>${cue.startSec.toFixed(1)}-${cue.endSec.toFixed(1)}s</strong>
      <small>${escapeHtml(cue.detail)}</small>
      <div class="source-cue-metrics">
        <span>Fit <b>${cue.score}%</b></span>
        <span>RMS <b>${cue.rmsDb.toFixed(1)}</b></span>
        <span>F0 <b>${Math.round(cue.pitchMedianHz || 0)}</b></span>
      </div>
    </button>
  `).join("") : `<div class="empty-note">Generate or upload audio to build source cues.</div>`;
  const action = timeline.nextAction;
  $("sourceTimelineNext").textContent = action
    ? action.detail
    : timeline.activeCue
      ? `${timeline.activeCue.label}: preview region is locked to this source cue.`
      : summary.summary;
  $("applySourceCue").disabled = !action && !timeline.bestCue;
  $("applySourceCue").textContent = action ? action.label : timeline.bestCue ? "Use Best Cue" : "Timeline Ready";
}

function applySourceCue(cueId = null, notify = true) {
  const timeline = currentSourceTimeline();
  const cue = timeline.cues.find((item) => item.id === cueId) || timeline.bestCue;
  if (!cue) {
    toast("No source cue", "Load a source before selecting a timeline cue.");
    return;
  }
  state.activeSourceCueId = cue.id;
  state.offlineRegion = cueRegion(cue) || state.offlineRegion;
  updateRegionControls();
  renderSourceTimeline();
  renderStudioPlan();
  if (notify) toast("Source cue selected", `${cue.label}: ${cue.startSec.toFixed(1)}-${cue.endSec.toFixed(1)}s.`);
}

function analyzeOfflineSource() {
  try {
    const profile = offline.analyze();
    $("sourceStatus").textContent = `${offline.source.name} - ${profile.range} source`;
    drawSourceWaveform();
    drawAnalysisCards($("offlineAnalysis"), offline.source, offline.rendered);
    renderGuidedStudio();
    updateSourceFit();
    updateRoutePlanner();
    renderCharacterChain();
    renderSourceTimeline();
    renderPerformanceTrace();
    toast("Source analyzed", `${Math.round(profile.pitchMedianHz || 0)} Hz median F0, ${Math.round(profile.voicedRatio * 100)}% voiced.`);
  } catch (error) {
    toast("Analysis needs a source", error.message || "Generate or upload audio first.");
  }
}

async function loadAudioUrlSource() {
  const input = $("audioUrl");
  const button = $("loadAudioUrl");
  const url = input.value.trim();
  if (!url) {
    toast("Audio URL needed", "Paste a same-origin or CORS-enabled audio URL.");
    return;
  }
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Loading";
  try {
    const source = await offline.loadUrl(url);
    useOfflineSource(source);
    toast("URL audio loaded", `${source.name}: ${(source.samples.length / source.sampleRate).toFixed(1)}s decoded locally.`);
  } catch (error) {
    toast("Could not load URL", error.message || "Use a same-origin or CORS-enabled audio URL.");
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function tuneCurrentSource() {
  try {
    const before = { ...state.params };
    state.params = offline.calibratedParams(state.params);
    persist();
    engine.setParams(state.params);
    renderControls();
    updateLineReadScore();
    renderGuidedStudio();
    updateSourceFit();
    updateRoutePlanner();
    renderCharacterChain();
    renderProjectVault();
    renderStudioPlan();
    toast("Tuned to source", describeCalibrationDelta(before, state.params));
  } catch (error) {
    toast("Tuning needs a source", error.message || "Generate or upload audio first.");
  }
}

function useOfflineSource(source) {
  setAudioPreview("sourceAudio", "source", source.blob, source.samples, source.sampleRate);
  clearRenderDeck();
  clearOfflineRenderPreview();
  setDefaultRegion(source);
  state.activeSourceCueId = null;
  rebuildSourceTimeline({ selectBest: true });
  $("sourceStatus").textContent = `${source.name} - ${source.analysis.range} source`;
  $("renderStatus").textContent = "Ready";
  updateRegionControls();
  renderGuidedStudio();
  renderSourceTimeline();
  drawAnalysisCards($("offlineAnalysis"), source, offline.rendered);
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderPerformanceTrace();
  renderSceneSession();
  renderProjectVault();
  renderStudioPlan();
}

function renderOfflineToPreview(preview, renderOptions = {}) {
  try {
    const autoTune = $("autoTuneRender").checked;
    const scriptAuto = $("scriptAutomationRender")?.checked ?? true;
    const stage = renderOptions.stage || "character";
    const rendered = offline.render(state.params, {
      autoCalibrate: autoTune,
      automatePerformance: stage === "character" && scriptAuto,
      performanceScript: currentPerformanceScript(),
      region: preview ? currentRegion() : null,
      mode: preview ? "preview" : "full",
      stage,
      studioPolish: state.polishIntensity,
      studioTarget: state.productionTarget,
      directorOptimize: state.directorOptimize
    });
    state.lastWebmBlob = null;
    setAudioPreview("renderAudio", "render", rendered.blob, rendered.samples, rendered.sampleRate);
    drawWaveform($("renderWave"), rendered.samples, "#8fa7ff");
    drawAnalysisCards($("offlineAnalysis"), offline.source, rendered);
    addRenderedTakeToDeck(rendered, preview);
    updateSourceFit();
    updateRoutePlanner();
    renderCharacterChain();
    renderPerformanceTrace();
    renderRenderDeck();
    renderProjectVault();
    $("renderStatus").textContent = preview
      ? stage === "polish" ? "Polish preview" : autoTune ? "Preview - tuned" : "Preview ready"
      : autoTune ? "Rendered - tuned" : "Rendered";
    $("downloadRender").disabled = false;
    $("downloadWebm").disabled = !preferredOpusMimeType();
    $("downloadZip").disabled = false;
    $("playCompare").disabled = false;
    renderGuidedStudio();
    renderStudioPlan();
    const scope = preview ? `${rendered.region.startSec.toFixed(1)}-${rendered.region.endSec.toFixed(1)}s` : "full source";
    const renderNote = [
      stage === "polish" ? "Studio Polish only" : "Studio Polish -> Character",
      scope,
      autoTune ? describeDeltaList(rendered.calibrationDelta, "Profile already fits this voice.") : "manual chain rendered",
      rendered.characterSafety?.enabled ? characterSafetySummary(rendered.characterSafety) : "polish-only safety bypass",
      rendered.scriptAutomated ? `${rendered.scriptAutomation?.frameCount || 0} script frames` : "static script"
    ].join("; ");
    toast(preview ? "Preview rendered" : "Offline render complete", renderNote);
  } catch (error) {
    toast(preview ? "Preview needs a source" : "Render needs a source", error.message || "Generate or upload audio first.");
  }
}

function downloadCurrentWav() {
  if (!offline.rendered) return;
  downloadBlob(offline.rendered.blob, offline.rendered.name || `${renderedBaseName(offline.rendered)}.wav`);
  toast("WAV exported", `${renderedBaseName(offline.rendered)}.wav`);
}

async function downloadCurrentWebm() {
  if (!offline.rendered) return;
  try {
    $("renderStatus").textContent = "Encoding WebM";
    const blob = await encodeRenderedWebmOpus(offline.rendered);
    state.lastWebmBlob = blob;
    downloadBlob(blob, `${renderedBaseName(offline.rendered)}.webm`);
    $("renderStatus").textContent = offline.rendered.mode === "preview" ? "Preview ready" : "Rendered";
    renderGuidedStudio();
    toast("WebM exported", `${Math.round(blob.size / 1024)} KB Opus audio.`);
  } catch (error) {
    $("renderStatus").textContent = offline.rendered.mode === "preview" ? "Preview ready" : "Rendered";
    renderGuidedStudio();
    toast("WebM unavailable", error.message || "This browser did not expose Opus export.", "bad");
  }
}

async function downloadCurrentZip() {
  if (!offline.rendered) return;
  let webmBlob = state.lastWebmBlob;
  let webmError = "";
  if (!webmBlob && preferredOpusMimeType()) {
    try {
      $("renderStatus").textContent = "Encoding package";
      webmBlob = await encodeRenderedWebmOpus(offline.rendered);
      state.lastWebmBlob = webmBlob;
    } catch (error) {
      webmError = error.message || "Compressed audio unavailable.";
    }
  }
  try {
    const target = lineReadById(state.lineReadId);
    const review = offline.source && offline.rendered ? renderReview(offline.source, offline.rendered) : null;
    const takeDecision = currentTakeDecision();
    const pack = await buildRenderZipPackage({
      source: offline.source,
      rendered: offline.rendered,
      params: state.params,
      presetId: state.presetId,
      presetName: presetById(state.presetId).name,
      lineReadId: target.id,
      lineReadName: target.name,
      review,
      takeDecision,
      webmBlob
    });
    downloadBlob(pack.blob, pack.name);
    $("renderStatus").textContent = offline.rendered.mode === "preview" ? "Preview ready" : "Rendered";
    renderGuidedStudio();
    toast("ZIP exported", webmBlob ? "WAV, WebM, A/B audition files, settings, analysis, and notes." : `WAV + A/B audition package exported. ${webmError || "Compressed audio was not available."}`);
  } catch (error) {
    $("renderStatus").textContent = offline.rendered.mode === "preview" ? "Preview ready" : "Rendered";
    renderGuidedStudio();
    toast("ZIP export failed", error.message || "Package export could not be created.", "bad");
  }
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function addRenderedTakeToDeck(rendered, preview, variant = null, stackAudition = null) {
  const review = renderReview(offline.source, rendered);
  const auditionVariant = variant || rendered.auditionVariant || null;
  const stackLayer = stackAudition || rendered.stackAudition || null;
  const badge = auditionVariant || stackLayer;
  const target = lineReadById(state.lineReadId);
  const sceneBeat = sceneBeatByTargetId(target.id);
  const stageTitle = rendered.stage === "polish" ? "Studio Polish" : presetById(state.presetId).name;
  rendered.lineReadId = target.id;
  rendered.sceneKitId = sceneBeat?.kit?.id || target.sceneKitId || null;
  rendered.sceneBeatId = sceneBeat?.beat?.id || target.sceneBeatId || null;
  const item = {
    id: `render-${Date.now()}-${state.renderDeckSeq += 1}`,
    title: badge ? `${stageTitle} / ${badge.label}` : stageTitle,
    target: target.name,
    targetId: target.id,
    sceneKitId: rendered.sceneKitId,
    sceneBeatId: rendered.sceneBeatId,
    mode: `${preview ? "Preview" : "Full"}${rendered.scriptAutomated ? " Scripted" : ""}${auditionVariant ? " Variant" : ""}${stackLayer ? " Stack" : ""}`,
    route: state.voiceRoutes.find((route) => route.presetId === state.presetId && route.targetId === state.lineReadId)?.targetName || null,
    variant: auditionVariant,
    stackAudition: stackLayer,
    rendered,
    review
  };
  state.renderDeck = addRenderDeckItem(state.renderDeck, item);
  state.activeRenderId = item.id;
  renderSceneSession();
  renderProjectVault();
}

function selectRenderDeckItem(id) {
  const item = state.renderDeck.find((candidate) => candidate.id === id);
  if (!item) return;
  state.activeRenderId = item.id;
  offline.rendered = item.rendered;
  setAudioPreview("renderAudio", "render", item.rendered.blob, item.rendered.samples, item.rendered.sampleRate);
  drawWaveform($("renderWave"), item.rendered.samples, "#8fa7ff");
  drawAnalysisCards($("offlineAnalysis"), offline.source, item.rendered);
  $("renderStatus").textContent = item.rendered.mode === "preview" ? "Preview ready" : "Rendered";
  $("downloadRender").disabled = false;
  $("downloadWebm").disabled = !preferredOpusMimeType();
  $("downloadZip").disabled = false;
  $("playCompare").disabled = false;
  state.lastWebmBlob = null;
  renderGuidedStudio();
  renderCharacterChain();
  renderPerformanceTrace();
  renderRenderDeck();
  renderProjectVault();
}

function currentAuditionVariants() {
  if (!offline.source) return [];
  const target = lineReadById(state.lineReadId);
  const sourceFit = offline.sourceFitReport(state.params, target);
  return buildAuditionVariants(state.params, target, { sourceFit, limit: 5 });
}

function currentStackAuditions() {
  if (!offline.source) return [];
  return buildStackAuditions(state.params, currentEffectStackReport(), { limit: 7 });
}

function renderAuditionVariants() {
  const panel = $("variantLabPanel");
  if (!panel) return;
  const button = $("renderVariantSet");
  if (!offline.source) {
    panel.className = "variant-lab";
    $("variantLabStatus").textContent = "No source";
    $("variantLabGrid").innerHTML = "";
    if (button) button.disabled = true;
    return;
  }
  const variants = currentAuditionVariants();
  const summary = auditionVariantSummary(variants);
  panel.className = `variant-lab ${summary.ready ? "is-ready" : "is-check"}`;
  $("variantLabStatus").textContent = `${summary.count} variants`;
  if (button) button.disabled = !variants.length;
  $("variantLabGrid").innerHTML = variants.map((variant) => `
    <button class="variant-card is-${variant.status}" data-variant-render="${variant.id}" type="button">
      <span class="variant-score">${variant.score}% ${renderReviewStatusLabel(variant.status)}</span>
      <strong>${escapeHtml(variant.label)}</strong>
      <small>${escapeHtml(variant.intent)}</small>
      <div class="variant-axis-list">
        ${variant.axes.map((axis) => `
          <span style="--value:${axis.value}%">
            <b>${escapeHtml(axis.label)}</b>
            <i></i>
            <em>${axis.value}%</em>
          </span>
        `).join("")}
      </div>
      <div class="variant-patches">
        ${variant.patch.slice(0, 4).map((patch) => `<span>${escapeHtml(paramLabel(patch.key))} <b>${formatPatchDelta(patch)}</b></span>`).join("")}
      </div>
    </button>
  `).join("");
}

function renderStackAuditions() {
  const panel = $("stackAuditionPanel");
  if (!panel) return;
  const button = $("renderStackAuditions");
  if (!offline.source) {
    panel.className = "stack-audition";
    $("stackAuditionStatus").textContent = "No source";
    $("stackAuditionGrid").innerHTML = "";
    if (button) button.disabled = true;
    return;
  }
  const auditions = currentStackAuditions();
  const summary = stackAuditionSummary(auditions);
  panel.className = `stack-audition ${summary.ready ? "is-ready" : "is-check"}`;
  $("stackAuditionStatus").textContent = `${summary.count} layer takes`;
  if (button) button.disabled = !auditions.length;
  $("stackAuditionGrid").innerHTML = auditions.map((audition) => `
    <button class="stack-audition-card is-${audition.status}" data-stack-audition-render="${audition.id}" type="button">
      <span class="stack-audition-score">${audition.score}% ${renderReviewStatusLabel(audition.status)} / ${escapeHtml(audition.type)}</span>
      <strong>${escapeHtml(audition.label)}</strong>
      <small>${escapeHtml(audition.intent)}</small>
      <div class="stack-audition-axis-list">
        ${audition.axes.map((axis) => `
          <span style="--value:${axis.value}%">
            <b>${escapeHtml(axis.label)}</b>
            <i></i>
            <em>${axis.value}%</em>
          </span>
        `).join("")}
      </div>
      <div class="stack-audition-patches">
        ${audition.patch.slice(0, 4).map((patch) => `<span>${escapeHtml(paramLabel(patch.key))} <b>${formatPatchDelta(patch)}</b></span>`).join("")}
      </div>
    </button>
  `).join("");
}

function renderStackAuditionSet(auditionId = null) {
  if (!offline.source) {
    toast("Stack Audition needs a source", "Generate or upload audio before rendering layer auditions.");
    return;
  }
  const auditions = currentStackAuditions().filter((audition) => !auditionId || audition.id === auditionId);
  if (!auditions.length) {
    toast("No stack audition available", "The current signal stack has no renderable layer audition.");
    return;
  }

  const autoTune = $("autoTuneRender").checked;
  const scriptAuto = $("scriptAutomationRender")?.checked ?? true;
  const target = lineReadById(state.lineReadId);
  const region = currentRegion();
  let lastRendered = null;
  $("renderStatus").textContent = auditionId ? "Rendering stack layer" : "Rendering stack set";
  for (const audition of auditions) {
    const auditionScript = buildPerformanceScript(target, audition.params);
    const rendered = offline.render(audition.params, {
      autoCalibrate: autoTune,
      automatePerformance: scriptAuto,
      performanceScript: auditionScript,
      automationOptions: { intensity: audition.automationIntensity },
      region,
      mode: "preview",
      studioPolish: state.polishIntensity,
      studioTarget: state.productionTarget,
      directorOptimize: state.directorOptimize
    });
    rendered.stackAudition = {
      id: audition.id,
      label: audition.label,
      intent: audition.intent,
      focus: audition.focus,
      score: audition.score,
      status: audition.status,
      type: audition.type,
      stageId: audition.stageId,
      stageIntensity: audition.stageIntensity,
      patch: audition.patch
    };
    addRenderedTakeToDeck(rendered, true, null, rendered.stackAudition);
    lastRendered = rendered;
  }

  if (!lastRendered) return;
  setAudioPreview("renderAudio", "render", lastRendered.blob, lastRendered.samples, lastRendered.sampleRate);
  drawWaveform($("renderWave"), lastRendered.samples, "#8fa7ff");
  drawAnalysisCards($("offlineAnalysis"), offline.source, lastRendered);
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderPerformanceTrace();
  renderRenderDeck();
  renderProjectVault();
  renderAuditionVariants();
  renderStackAuditions();
  $("downloadRender").disabled = false;
  $("downloadWebm").disabled = !preferredOpusMimeType();
  $("downloadZip").disabled = false;
  $("playCompare").disabled = false;
  state.lastWebmBlob = null;
  renderGuidedStudio();
  $("renderStatus").textContent = auditionId ? "Stack layer ready" : "Stack set ready";
  toast(
    auditionId ? "Stack audition rendered" : "Stack audition set rendered",
    `${auditions.length} layer ${auditions.length === 1 ? "take" : "takes"} added to the deck.`
  );
}

function renderAuditionVariantSet(variantId = null) {
  if (!offline.source) {
    toast("Variant Lab needs a source", "Generate or upload audio before rendering audition variants.");
    return;
  }
  const variants = currentAuditionVariants().filter((variant) => !variantId || variant.id === variantId);
  if (!variants.length) {
    toast("No variant available", "The current target has no renderable audition variant.");
    return;
  }

  const autoTune = $("autoTuneRender").checked;
  const scriptAuto = $("scriptAutomationRender")?.checked ?? true;
  const region = currentRegion();
  let lastRendered = null;
  $("renderStatus").textContent = variantId ? "Rendering variant" : "Rendering variants";
  for (const variant of variants) {
    const variantScript = buildPerformanceScript(lineReadById(state.lineReadId), variant.params);
    const rendered = offline.render(variant.params, {
      autoCalibrate: autoTune,
      automatePerformance: scriptAuto,
      performanceScript: variantScript,
      automationOptions: { intensity: variant.automationIntensity },
      region,
      mode: "preview",
      studioPolish: state.polishIntensity,
      studioTarget: state.productionTarget,
      directorOptimize: state.directorOptimize
    });
    rendered.auditionVariant = {
      id: variant.id,
      label: variant.label,
      intent: variant.intent,
      score: variant.score,
      status: variant.status,
      automationIntensity: variant.automationIntensity,
      patch: variant.patch
    };
    addRenderedTakeToDeck(rendered, true, rendered.auditionVariant);
    lastRendered = rendered;
  }

  if (!lastRendered) return;
  setAudioPreview("renderAudio", "render", lastRendered.blob, lastRendered.samples, lastRendered.sampleRate);
  drawWaveform($("renderWave"), lastRendered.samples, "#8fa7ff");
  drawAnalysisCards($("offlineAnalysis"), offline.source, lastRendered);
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderPerformanceTrace();
  renderRenderDeck();
  renderProjectVault();
  renderAuditionVariants();
  $("downloadRender").disabled = false;
  $("downloadWebm").disabled = !preferredOpusMimeType();
  $("downloadZip").disabled = false;
  $("playCompare").disabled = false;
  state.lastWebmBlob = null;
  renderGuidedStudio();
  $("renderStatus").textContent = variantId ? "Variant ready" : "Variants ready";
  toast(
    variantId ? "Variant rendered" : "Variant set rendered",
    `${variants.length} preview ${variants.length === 1 ? "take" : "takes"} added to the deck.`
  );
}

function currentCharacterChainReport() {
  const target = lineReadById(state.lineReadId);
  let sourceFit = null;
  let sourceTunedParams = null;
  let review = null;
  if (offline.source) {
    sourceFit = offline.sourceFitReport(state.params, target);
    sourceTunedParams = offline.calibratedParams(state.params);
    if (offline.rendered) review = renderReview(offline.source, offline.rendered);
  }
  return characterChainReport(state.params, target, {
    sourceFit,
    sourceTunedParams,
    renderReview: review
  });
}

function renderCharacterChain() {
  const panel = $("characterChainPanel");
  if (!panel) return;
  const report = currentCharacterChainReport();
  panel.className = `character-chain is-${report.status}`;
  $("characterChainScore").textContent = `${report.score}% ${characterChainStatusLabel(report.status)}`;
  $("characterChainFlow").innerHTML = report.stages.map((stage, index) => `
    <div class="chain-stage is-${stage.status} ${stage.id === report.nextStageId ? "is-next" : ""}" data-chain-stage="${stage.id}">
      <span>${String(index + 1).padStart(2, "0")} ${escapeHtml(stage.label)}</span>
      <strong>${stage.score}%</strong>
      <small>${escapeHtml(stage.role)}${stage.notes.length ? ` - ${escapeHtml(stage.notes.join(" / "))}` : ""}</small>
      <div class="chain-stage-bars">
        ${stage.members.slice(0, 4).map((member) => `
          <i style="--current:${Math.round(member.currentRatio * 100)}%; --target:${Math.round(member.targetRatio * 100)}%">
            <b></b>
          </i>
        `).join("")}
      </div>
    </div>
  `).join("");
  const patchStage = report.stages.find((stage) => stage.id === report.nextStageId);
  const patchItems = (patchStage?.patch || []).filter((patch) => !patch.key.startsWith("_")).slice(0, 5);
  $("characterChainPatches").innerHTML = patchItems.length ? patchItems.map((patch) => `
    <span>${escapeHtml(paramLabel(patch.key))} <b>${formatPatchDelta(patch)}</b></span>
  `).join("") : `<span>Chain locked <b>0</b></span>`;
  const hasPatch = Object.keys(report.nextPatch).some((key) => !key.startsWith("_"));
  $("applyChainFix").disabled = !hasPatch;
  $("applyChainFix").textContent = hasPatch && patchStage ? `Fix ${patchStage.label}` : "Chain Locked";
  renderEffectStack();
  renderVoiceMemory();
  renderProjectVault();
  renderStudioPlan();
}

function applyNextCharacterChainFix() {
  const report = currentCharacterChainReport();
  const patch = bestCharacterChainPatch(report);
  const publicKeys = Object.keys(patch).filter((key) => !key.startsWith("_"));
  if (!publicKeys.length) {
    toast("Character chain locked", "Current voice chain already matches the active target.");
    return;
  }
  const stage = report.stages.find((item) => item.id === report.nextStageId);
  state.params = { ...state.params, ...patch };
  persist();
  engine.setParams(state.params);
  renderControls();
  updateLineReadScore();
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderProjectVault();
  toast("Chain fix applied", `${stage?.label || "Character Chain"}: ${describePatchObject(patch)}`);
}

function characterChainStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "shape") return "Shape";
  return "Risk";
}

function currentEffectStackReport() {
  const target = lineReadById(state.lineReadId);
  const sourceFit = offline.source ? offline.sourceFitReport(state.params, target) : null;
  const review = offline.source && offline.rendered ? renderReview(offline.source, offline.rendered) : null;
  return buildEffectStack(state.params, {
    target,
    sourceFit,
    renderReview: review,
    rendered: offline.rendered,
    performanceScript: currentPerformanceScript(),
    scriptMatch: currentScriptMatch(),
    keeperRefinement: currentKeeperRefinement()
  });
}

function renderEffectStack() {
  const panel = $("effectStackPanel");
  if (!panel) return;
  const stack = currentEffectStackReport();
  panel.className = `effect-stack is-${stack.status}`;
  $("effectStackStatus").textContent = `${stack.score}% ${effectStackStatusLabel(stack.status)} / ${stack.activeCount} active`;
  $("effectStackFlow").innerHTML = stack.stages.map((stage, index) => `
    <div class="effect-stage is-${stage.status} ${stage.id === stack.nextStageId ? "is-next" : ""}" data-stack-stage="${stage.id}">
      <div class="effect-stage-head">
        <span>${String(index + 1).padStart(2, "0")} ${escapeHtml(stage.label)}</span>
        <strong>${stage.intensity}%</strong>
      </div>
      <small>${escapeHtml(stage.role)}</small>
      <div class="effect-stage-mode">${escapeHtml(stage.mode)}${stage.notes.length ? ` / ${escapeHtml(stage.notes.join(" / "))}` : ""}</div>
      <div class="effect-stage-bars">
        ${stage.meters.map((meter) => `
          <i style="--value:${meter.value}%">
            <b>${escapeHtml(meter.label)}</b>
            <em>${meter.value}%</em>
          </i>
        `).join("")}
      </div>
    </div>
  `).join("");
  const patchStage = stack.stages.find((stage) => stage.id === stack.nextStageId);
  const patchItems = patchStage?.patch?.slice(0, 6) || [];
  $("effectStackPatches").innerHTML = patchItems.length ? patchItems.map((patch) => `
    <span>${escapeHtml(paramLabel(patch.key))} <b>${formatPatchDelta(patch)}</b><small>${escapeHtml(patch.reason)}</small></span>
  `).join("") : `<span>Stack locked <b>0</b><small>No next move</small></span>`;
  const hasPatch = Object.keys(stack.nextPatch).some((key) => !key.startsWith("_"));
  $("applyStackFix").disabled = !hasPatch;
  $("applyStackFix").textContent = hasPatch && patchStage ? `Fix ${patchStage.label}` : "Stack Locked";
  renderStackAuditions();
}

function applyNextEffectStackFix() {
  const stack = currentEffectStackReport();
  const patch = bestEffectStackPatch(stack);
  const keys = Object.keys(patch).filter((key) => !key.startsWith("_"));
  if (!keys.length) {
    toast("Signal stack locked", "The current processing stack has no next correction.");
    return;
  }
  const stage = stack.stages.find((item) => item.id === stack.nextStageId);
  state.params = { ...state.params, ...patch };
  persist();
  engine.setParams(state.params);
  renderControls();
  updateLineReadScore();
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderEffectStack();
  renderProjectVault();
  renderStudioPlan();
  toast("Stack fix applied", `${stage?.label || "Signal Stack"}: ${describePatchObject(patch)}`);
}

function effectStackStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "check") return "Check";
  return "Risk";
}

function currentVoiceMemoryBoard() {
  const target = lineReadById(state.lineReadId);
  const sourceFit = offline.source ? offline.sourceFitReport(state.params, target) : null;
  const review = offline.source && offline.rendered ? renderReview(offline.source, offline.rendered) : null;
  return buildVoiceMemoryBoard(state.voiceSnapshots, state.params, target, {
    sourceFit,
    chainReport: currentCharacterChainReport(),
    effectStack: currentEffectStackReport(),
    renderReview: review,
    takeDecision: currentTakeDecision(),
    allowManualCapture: true
  });
}

function renderVoiceMemory() {
  const panel = $("voiceMemoryPanel");
  if (!panel) return;
  const board = currentVoiceMemoryBoard();
  panel.className = `voice-memory is-${board.status}`;
  $("voiceMemoryStatus").textContent = board.count
    ? `${board.count} designs / ${board.score}%`
    : "No designs";
  $("clearVoiceMemory").disabled = !board.count;
  $("voiceMemoryList").innerHTML = board.items.length ? board.items.map((item) => `
    <button class="voice-memory-card is-${item.status} ${item.id === board.best?.id ? "is-best" : ""}" data-voice-memory="${item.id}" type="button">
      <span class="voice-memory-score">${item.id === board.best?.id ? "Best" : "Saved"} ${item.score}% ${voiceMemoryStatusLabel(item.status)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.targetName)} - ${new Date(item.createdAt).toLocaleString()}</small>
      <div class="voice-memory-metrics">
        <span>Target <b>${item.targetScore}%</b></span>
        <span>Evidence <b>${item.evidenceScore}%</b></span>
        <span>Delta <b>${item.patch.length}</b></span>
      </div>
      <div class="voice-memory-deltas">
        ${item.patch.slice(0, 4).map((patch) => `<span>${escapeHtml(paramLabel(patch.key))} <b>${formatPatchDelta(patch)}</b></span>`).join("") || "<span>Current match <b>0</b></span>"}
      </div>
    </button>
  `).join("") : `<div class="empty-note">Capture a voice design before making a risky change.</div>`;
  const best = board.best;
  $("voiceMemoryPatches").innerHTML = best?.patch?.length
    ? best.patch.slice(0, 8).map((patch) => `
      <span>${escapeHtml(paramLabel(patch.key))}<b>${formatPatchDelta(patch)}</b></span>
    `).join("")
    : board.count
      ? `<span>Current design saved <b>0</b></span>`
      : `<span>No memory patch <b>0</b></span>`;
}

function captureVoiceMemory() {
  const target = lineReadById(state.lineReadId);
  const snapshot = createVoiceSnapshot(state.params, {
    presetId: state.presetId,
    presetName: presetById(state.presetId).name,
    lineReadId: state.lineReadId,
    target,
    sourceName: offline.source?.name || "",
    sourceFit: offline.source ? offline.sourceFitReport(state.params, target) : null,
    chainReport: currentCharacterChainReport(),
    effectStack: currentEffectStackReport(),
    renderReview: offline.source && offline.rendered ? renderReview(offline.source, offline.rendered) : null,
    takeDecision: currentTakeDecision()
  });
  const beforeCount = state.voiceSnapshots.length;
  state.voiceSnapshots = addVoiceSnapshot(state.voiceSnapshots, snapshot);
  persistVoiceSnapshots();
  renderVoiceMemory();
  renderSceneSession();
  renderProjectVault();
  renderStudioPlan();
  toast(
    beforeCount === state.voiceSnapshots.length ? "Design updated" : "Design captured",
    `${snapshot.title}: ${snapshot.evidence.target}% target evidence.`
  );
}

function applyVoiceMemory(snapshotId) {
  const board = currentVoiceMemoryBoard();
  const item = board.items.find((candidate) => candidate.id === snapshotId) || board.best;
  if (!item) {
    toast("No saved design", "Capture a voice design before applying memory.");
    return;
  }
  const target = lineReadById(item.lineReadId);
  state.presetId = item.presetId || target.presetId || state.presetId;
  state.lineReadId = target.id;
  state.params = { ...paramsForPreset(state.presetId), ...item.params };
  persist();
  engine.setParams(state.params);
  renderPresets();
  renderControls();
  renderLineReadPanel();
  renderLineReadLibrary();
  renderSceneKitPanel();
  renderSceneKitLibrary();
  updateActivePreset();
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderVoiceMemory();
  renderSceneSession();
  renderProjectVault();
  renderStudioPlan();
  toast("Design restored", `${item.title}: ${describePatchList(item.patch)}`);
}

function clearVoiceMemory() {
  state.voiceSnapshots = [];
  persistVoiceSnapshots();
  renderVoiceMemory();
  renderSceneSession();
  renderProjectVault();
  renderStudioPlan();
  toast("Design board cleared", "Saved voice designs were removed from this browser.");
}

function currentProjectContext() {
  const target = lineReadById(state.lineReadId);
  return {
    presetId: state.presetId,
    presetName: presetById(state.presetId).name,
    lineReadId: state.lineReadId,
    params: state.params,
    source: offline.source,
    sourceTimeline: state.sourceTimeline || currentSourceTimeline(),
    activeSourceCueId: state.activeSourceCueId,
    voiceSnapshots: state.voiceSnapshots,
    renderDeck: state.renderDeck,
    activeRenderId: state.activeRenderId,
    offlineRegion: state.offlineRegion,
    sceneSession: currentSceneSession(),
    takeDecision: currentTakeDecision(),
    routes: state.voiceRoutes,
    target
  };
}

function currentProjectVault() {
  return buildProjectVault(state.projectSnapshots, currentProjectContext());
}

function renderProjectVault() {
  const panel = $("projectVaultPanel");
  if (!panel) return;
  const vault = currentProjectVault();
  panel.className = `project-vault is-${vault.status}`;
  $("projectVaultStatus").textContent = vault.count
    ? `${vault.count} projects / ${vault.score}%`
    : state.projectStoreReady ? "No projects" : "Opening";
  $("captureProject").disabled = !state.projectStoreReady;
  $("clearProjectVault").disabled = !state.projectStoreReady || !vault.count;
  $("projectVaultList").innerHTML = vault.items.length ? vault.items.map((item) => `
    <button class="project-vault-card is-${item.status} ${item.id === vault.best?.id ? "is-best" : ""} ${item.id === state.activeProjectId ? "is-active" : ""}" data-project-vault="${item.id}" type="button">
      <span class="project-vault-score">${item.id === vault.best?.id ? "Best" : "Saved"} ${item.score}% ${projectVaultStatusLabel(item.status)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.sceneKitName || item.targetName)} - ${new Date(item.updatedAt).toLocaleString()}</small>
      <div class="project-vault-metrics">
        <span>Source <b>${item.source?.hasAudio ? "On" : item.source?.name ? "Ref" : "No"}</b></span>
        <span>Takes <b>${item.renderDeckCount}</b></span>
        <span>Designs <b>${item.voiceSnapshotCount}</b></span>
        <span>Patch <b>${item.patch.length}</b></span>
      </div>
      <div class="project-vault-deltas">
        ${item.patch.slice(0, 4).map((patch) => `<span>${escapeHtml(paramLabel(patch.key))} <b>${formatPatchDelta(patch)}</b></span>`).join("") || "<span>Current match <b>0</b></span>"}
      </div>
    </button>
  `).join("") : `<div class="empty-note">No saved projects yet.</div>`;
  const best = vault.best;
  $("projectVaultPatches").innerHTML = best?.patch?.length
    ? best.patch.slice(0, 8).map((patch) => `
      <span>${escapeHtml(paramLabel(patch.key))}<b>${formatPatchDelta(patch)}</b></span>
    `).join("")
    : vault.count
      ? `<span>Project design aligned <b>0</b></span>`
      : `<span>No project patch <b>0</b></span>`;
}

async function captureProjectSnapshot(options = {}) {
  if (!state.projectStoreReady) {
    toast("Project vault unavailable", "IndexedDB is not ready in this browser session.");
    return;
  }
  const title = $("projectTitleInput")?.value?.trim() || "";
  const project = createProjectSnapshot(currentProjectContext(), {
    title,
    includeAudio: true,
    updatedAt: Date.now(),
    allowManualCapture: !!options.manual
  });
  state.projectSnapshots = addProjectSnapshot(state.projectSnapshots, project);
  state.activeProjectId = project.id;
  await persistProjectSnapshots();
  if ($("projectTitleInput")) $("projectTitleInput").value = "";
  renderProjectVault();
  renderStudioPlan();
  toast("Project saved", `${project.title}: ${project.renderDeck.length} takes and ${project.voiceSnapshots.length} designs.`);
}

function applyProjectSnapshot(projectId) {
  const vault = currentProjectVault();
  const project = vault.items.find((item) => item.id === projectId) || vault.best;
  if (!project) {
    toast("No saved project", "Save a project before restoring one.");
    return;
  }
  const target = lineReadById(project.lineReadId);
  const restorePatch = projectParamPatch(state.params, project.params);
  state.activeProjectId = project.id;
  state.presetId = project.presetId || target.presetId || state.presetId;
  state.lineReadId = target.id;
  state.params = { ...paramsForPreset(state.presetId), ...project.params };
  state.activeSourceCueId = project.activeSourceCueId || project.sourceTimeline?.activeCueId || null;
  state.offlineRegion = project.offlineRegion || state.offlineRegion;
  restoreProjectSource(project);
  restoreProjectDeck(project);
  if (offline.source) rebuildSourceTimeline();
  persist();
  engine.setParams(state.params);
  renderPresets();
  renderControls();
  renderLineReadPanel();
  renderLineReadLibrary();
  renderSceneKitPanel();
  renderSceneKitLibrary();
  updateActivePreset();
  updateRegionControls();
  drawAnalysisCards($("offlineAnalysis"), offline.source, offline.rendered);
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderVoiceMemory();
  renderProjectVault();
  renderPerformanceTrace();
  renderRenderDeck();
  renderStudioPlan();
  toast("Project restored", `${project.title}: ${describePatchList(restorePatch)}.`);
}

function restoreProjectSource(project) {
  const source = project.source;
  if (!source?.hasAudio || !(source.samples instanceof Float32Array) || !source.blob) {
    if (source?.sourceProfileId) {
      const generated = offline.generateSample(48000, source.sourceProfileId);
      setAudioPreview("sourceAudio", "source", generated.blob, generated.samples, generated.sampleRate);
      $("sourceStatus").textContent = `${generated.name} - regenerated`;
      setDefaultRegion(generated);
    }
    return;
  }
  offline.source = {
    name: source.name,
    sourceProfileId: source.sourceProfileId || "",
    sourceKind: source.sourceKind || "",
    sourceUrl: source.sourceUrl || "",
    sourceType: source.sourceType || "",
    sampleRate: source.sampleRate,
    samples: source.samples,
    blob: source.blob,
    analysis: source.analysis,
    studioAnalysis: source.studioAnalysis
  };
  offline.profile = source.analysis;
  setAudioPreview("sourceAudio", "source", source.blob, source.samples, source.sampleRate);
  $("sourceStatus").textContent = `${source.name} - restored`;
}

function restoreProjectDeck(project) {
  state.renderDeck = (project.renderDeck || []).filter((item) =>
    item?.rendered?.hasAudio &&
    item.rendered.samples instanceof Float32Array &&
    item.rendered.blob
  );
  state.activeRenderId = state.renderDeck.some((item) => item.id === project.activeRenderId)
    ? project.activeRenderId
    : state.renderDeck[0]?.id || null;
  const active = state.renderDeck.find((item) => item.id === state.activeRenderId) || null;
  offline.rendered = active?.rendered || null;
  if (offline.rendered) {
    setAudioPreview("renderAudio", "render", offline.rendered.blob, offline.rendered.samples, offline.rendered.sampleRate);
    drawWaveform($("renderWave"), offline.rendered.samples, "#8fa7ff");
    $("renderStatus").textContent = offline.rendered.mode === "preview" ? "Preview restored" : "Render restored";
    $("downloadRender").disabled = false;
    $("downloadWebm").disabled = !preferredOpusMimeType();
    $("downloadZip").disabled = false;
    $("playCompare").disabled = !offline.source;
    state.lastWebmBlob = null;
    renderGuidedStudio();
  } else {
    clearOfflineRenderPreview();
    $("renderStatus").textContent = "Project restored";
  }
}

async function clearProjectVault() {
  state.projectSnapshots = [];
  state.activeProjectId = null;
  await projectStore.clear();
  renderProjectVault();
  renderStudioPlan();
  toast("Project vault cleared", "Saved scene projects were removed from this browser.");
}

function projectVaultStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "empty") return "Empty";
  if (status === "check") return "Check";
  return "Risk";
}

function voiceMemoryStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "empty") return "Empty";
  if (status === "check") return "Check";
  return "Risk";
}

function renderPerformanceTrace() {
  const panel = $("performanceTracePanel");
  if (!panel) return;
  if (!offline.source) {
    panel.className = "performance-trace";
    $("performanceTraceStatus").textContent = "No source";
    $("performanceTraceMetrics").innerHTML = "";
    drawPerformanceTraceCanvas($("performanceTraceCanvas"), null, null);
    renderScriptMatch();
    renderAutomationPanel();
    renderEffectStack();
    renderVoiceMemory();
    renderStudioPlan();
    return;
  }

  const sourceSamples = sourceSamplesForPerformanceTrace();
  const sourceTrace = analyzePerformanceTrace(sourceSamples, offline.source.sampleRate);
  const renderedTrace = offline.rendered
    ? analyzePerformanceTrace(offline.rendered.samples, offline.rendered.sampleRate)
    : null;
  const comparison = comparePerformanceTraces(sourceTrace, renderedTrace);
  panel.className = `performance-trace is-${comparison?.status || "source"}`;
  $("performanceTraceStatus").textContent = comparison
    ? `${comparison.score}% ${performanceTraceStatusLabel(comparison.status)}`
    : `${sourceTrace.summary.frameCount} frames`;
  drawPerformanceTraceCanvas($("performanceTraceCanvas"), sourceTrace, renderedTrace);
  $("performanceTraceMetrics").innerHTML = comparison
    ? comparison.items.map((item) => `
      <div class="performance-trace-card is-${item.id}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.detail)}</small>
      </div>
    `).join("")
    : sourcePerformanceTraceCards(sourceTrace).map((item) => `
      <div class="performance-trace-card">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.detail)}</small>
      </div>
    `).join("");
  renderScriptMatch();
  renderAutomationPanel();
  renderEffectStack();
  renderVoiceMemory();
  renderStudioPlan();
}

function sourceSamplesForPerformanceTrace() {
  if (!offline.source) return new Float32Array(0);
  const region = offline.rendered?.region || currentRegion();
  if (!region || region.isFull) return offline.source.samples;
  const start = Math.max(0, Math.min(offline.source.samples.length, Math.round(region.startSec * offline.source.sampleRate)));
  const end = Math.max(start + 1, Math.min(offline.source.samples.length, Math.round(region.endSec ? region.endSec * offline.source.sampleRate : start + region.durationSec * offline.source.sampleRate)));
  return offline.source.samples.slice(start, end);
}

function sourcePerformanceTraceCards(trace) {
  const summary = trace.summary;
  return [
    { label: "Median F0", value: formatTraceHz(summary.pitchMedianHz), detail: "Source phrase center." },
    { label: "Phrase Lift", value: formatTraceCents(summary.phraseLiftCents), detail: "Upward motion inside the region." },
    { label: "Ending", value: formatTraceCents(summary.endingDropCents), detail: "Tail pitch against phrase body." },
    { label: "Tail Air", value: formatTraceNumber(summary.tailTexture, "/s"), detail: "Tail frication against phrase body." },
    { label: "Motion", value: formatTraceDb(summary.energyRangeDb), detail: "Delivery level movement." }
  ];
}

function drawPerformanceTraceCanvas(canvas, sourceTrace, renderedTrace) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(dpr, dpr);
  const w = width / dpr;
  const h = height / dpr;
  const pad = 14;
  const mid = Math.round(h * 0.52);
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const x = pad + (w - pad * 2) * i / 4;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, h - pad);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(pad, mid);
  ctx.lineTo(w - pad, mid);
  ctx.stroke();
  if (!sourceTrace) {
    ctx.fillStyle = "rgba(247,247,251,0.58)";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Load a source", w / 2, h / 2);
    ctx.restore();
    return;
  }

  const traces = [sourceTrace, renderedTrace].filter(Boolean);
  const maxDuration = Math.max(0.001, ...traces.map((trace) => trace.duration || 0));
  const pitchValues = traces.flatMap((trace) => trace.frames.map((frame) => frame.pitchHz).filter((value) => value > 0));
  const pitchMin = Math.max(50, Math.min(...pitchValues, sourceTrace.summary.pitchMedianHz || 120) * 0.82);
  const pitchMax = Math.max(pitchMin + 10, Math.max(...pitchValues, sourceTrace.summary.pitchMedianHz || 160) * 1.12);
  drawTraceLine(ctx, sourceTrace, maxDuration, pitchMin, pitchMax, pad, 18, w - pad, mid - 16, "pitchHz", "#69e3b5", 1.8);
  drawTraceLine(ctx, sourceTrace, maxDuration, 0, 1, pad, mid + 14, w - pad, h - pad, "energy", "rgba(105,227,181,0.9)", 1.6);
  if (renderedTrace) {
    drawTraceLine(ctx, renderedTrace, maxDuration, pitchMin, pitchMax, pad, 18, w - pad, mid - 16, "pitchHz", "#ff6d9e", 1.8);
    drawTraceLine(ctx, renderedTrace, maxDuration, 0, 1, pad, mid + 14, w - pad, h - pad, "energy", "rgba(255,109,158,0.9)", 1.6);
  }
  ctx.fillStyle = "rgba(247,247,251,0.64)";
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Pitch", pad, 12);
  ctx.fillText("Energy", pad, mid + 10);
  ctx.textAlign = "right";
  ctx.fillText(renderedTrace ? "Source / Render" : "Source", w - pad, 12);
  ctx.restore();
}

function drawTraceLine(ctx, trace, maxDuration, minValue, maxValue, x0, y0, x1, y1, key, color, lineWidth) {
  const frames = trace.frames.filter((frame) => Number.isFinite(frame[key]) && (key !== "pitchHz" || frame[key] > 0));
  if (frames.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  frames.forEach((frame, index) => {
    const x = x0 + (x1 - x0) * (frame.time / maxDuration);
    const ratio = Math.max(0, Math.min(1, (frame[key] - minValue) / Math.max(1e-9, maxValue - minValue)));
    const y = y1 - (y1 - y0) * ratio;
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function performanceTraceStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "check") return "Check";
  return "Risk";
}

function formatTraceHz(value) {
  return Number.isFinite(value) && value > 0 ? `${Math.round(value)} Hz` : "0 Hz";
}

function formatTraceCents(value) {
  return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${Math.round(value)} ct` : "0 ct";
}

function formatTraceDb(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dB` : "0.0 dB";
}

function formatTraceNumber(value, unit = "") {
  return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${Math.round(value)}${unit}` : `0${unit}`;
}

function currentStudioPlan() {
  const target = lineReadById(state.lineReadId);
  const sourceFit = offline.source ? offline.sourceFitReport(state.params, target) : null;
  const chainReport = currentCharacterChainReport();
  const effectStack = currentEffectStackReport();
  const voiceMemory = currentVoiceMemoryBoard();
  const review = offline.source && offline.rendered ? renderReview(offline.source, offline.rendered) : null;
  const takeDecision = currentTakeDecision();
  const sceneSession = buildSceneSession({
    activeLineReadId: state.lineReadId,
    params: state.params,
    snapshots: state.voiceSnapshots,
    renderDeck: state.renderDeck,
    hasSource: !!offline.source,
    takeDecision
  });
  return buildStudioPlan({
    projectVault: currentProjectVault(),
    hasSource: !!offline.source,
    sourceTimeline: currentSourceTimeline(),
    sourceFit,
    routes: state.voiceRoutes,
    activePresetId: state.presetId,
    activeLineReadId: state.lineReadId,
    chainReport,
    effectStack,
    voiceMemory,
    stackAuditionCount: currentStackAuditions().length,
    renderReview: review,
    performanceComparison: currentPerformanceComparison(),
    performanceScript: currentPerformanceScript(),
    scriptMatch: currentScriptMatch(),
    scriptAutomation: offline.rendered?.scriptAutomationSummary || null,
    sceneSession,
    auditionVariantCount: currentAuditionVariants().length,
    renderDeckCount: activeRenderDeck().length,
    renderDeckSeconds: totalDeckSeconds(activeRenderDeck()),
    takeDecision,
    keeperRefinement: currentKeeperRefinement(takeDecision)
  });
}

function currentTakeDecision() {
  return rankRenderDeckTakes(activeRenderDeck(), offline.source, lineReadById(state.lineReadId));
}

function activeRenderDeck(targetId = state.lineReadId) {
  const target = lineReadById(targetId);
  return state.renderDeck.filter((item) =>
    item.targetId ? item.targetId === target.id : item.target === target.name
  );
}

function currentKeeperRefinement(decision = currentTakeDecision()) {
  return buildKeeperRefinement(decision, state.params, lineReadById(state.lineReadId));
}

function currentPerformanceComparison() {
  if (!offline.source || !offline.rendered) return null;
  const sourceTrace = analyzePerformanceTrace(sourceSamplesForPerformanceTrace(), offline.source.sampleRate);
  const renderedTrace = analyzePerformanceTrace(offline.rendered.samples, offline.rendered.sampleRate);
  return comparePerformanceTraces(sourceTrace, renderedTrace);
}

function renderStudioPlan() {
  const panel = $("studioPlanPanel");
  if (!panel) return;
  const plan = currentStudioPlan();
  renderDirectorBrief(plan);
  const nextStep = plan.nextAction
    ? plan.steps.find((step) => step.action === plan.nextAction)
    : null;
  panel.className = `studio-plan is-${plan.status}`;
  $("studioPlanStatus").textContent = `${plan.score}% ${studioPlanStatusLabel(plan.status)}`;
  $("studioPlanFlow").innerHTML = plan.steps.map((step) => `
    <div class="studio-plan-step is-${step.status} ${step === nextStep ? "is-next" : ""}" data-studio-step="${step.id}">
      <span>${escapeHtml(step.label)}</span>
      <strong>${escapeHtml(step.summary)}</strong>
      <small>${escapeHtml(step.detail)}</small>
    </div>
  `).join("");
  const action = plan.nextAction;
  $("applyStudioPlanStep").disabled = !action;
  $("applyStudioPlanStep").textContent = action ? action.label : "Plan Ready";
  $("studioPlanNext").textContent = action && nextStep
    ? `${nextStep.label}: ${nextStep.detail}`
    : "Plan ready. Choose a take from the render deck.";
  renderAuditionVariants();
  renderTakeDecision();
}

function renderDirectorBrief(plan = currentStudioPlan()) {
  const panel = $("directorBriefPanel");
  if (!panel) return;
  const review = offline.source && offline.rendered ? renderReview(offline.source, offline.rendered) : null;
  const takeDecision = currentTakeDecision();
  const brief = buildDirectorBrief({
    hasSource: !!offline.source,
    source: offline.source,
    rendered: offline.rendered,
    plan,
    review,
    takeDecision,
    keeperRefinement: currentKeeperRefinement(takeDecision),
    sourceTimeline: currentSourceTimeline(),
    productionTarget: STUDIO_PRODUCTION_TARGETS.find((target) => target.id === state.productionTarget)
  });
  panel.className = `director-brief is-${brief.status}`;
  $("directorBriefStatus").textContent = directorBriefStatusLabel(brief.status);
  $("directorBriefHeadline").textContent = brief.headline;
  $("directorBriefSummary").textContent = brief.summary;
  $("directorBriefGrid").innerHTML = brief.cards.map((card) => `
    <div class="director-brief-card is-${card.status}" data-brief="${card.id}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.detail)}</small>
    </div>
  `).join("");
  $("directorBriefAction").disabled = !brief.action;
  $("directorBriefAction").textContent = brief.action?.label || "Brief Ready";
}

function applyStudioPlanStep() {
  const plan = currentStudioPlan();
  const action = plan.nextAction;
  if (!action) {
    toast("Studio plan ready", "The current source, route, chain, and deck are ready for review.");
    return;
  }
  if (action.id === "apply-project") {
    applyProjectSnapshot(action.projectId);
    return;
  }
  if (action.id === "capture-project") {
    captureProjectSnapshot();
    return;
  }
  if (action.id === "select-source-cue") {
    applySourceCue(action.cueId);
    return;
  }
  if (action.id === "load-source") {
    generateTargetSource();
    return;
  }
  if (action.id === "analyze-source") {
    analyzeOfflineSource();
    return;
  }
  if (action.id === "tune-source") {
    tuneCurrentSource();
    return;
  }
  if (action.id === "apply-route") {
    applyVoiceRoute(action.routeId);
    return;
  }
  if (action.id === "chain-fix") {
    applyNextCharacterChainFix();
    return;
  }
  if (action.id === "stack-fix") {
    applyNextEffectStackFix();
    return;
  }
  if (action.id === "render-stack") {
    renderStackAuditionSet();
    return;
  }
  if (action.id === "capture-memory") {
    captureVoiceMemory();
    return;
  }
  if (action.id === "apply-memory") {
    applyVoiceMemory(action.snapshotId);
    return;
  }
  if (action.id === "preview-region") {
    renderOfflineToPreview(true);
    return;
  }
  if (action.id === "render-variants") {
    renderAuditionVariantSet();
    return;
  }
  if (action.id === "apply-scene-beat") {
    applyLineReadTarget(action.targetId);
    return;
  }
  if (action.id === "keeper-refine") {
    applyKeeperRefinement();
    return;
  }
  if (action.id === "compare-deck") {
    if (!$("playCompare").disabled) $("playCompare").click();
    else toast("Comparison needs a render", "Preview a region before A/B playback.");
  }
}

function generateTargetSource() {
  const target = lineReadById(state.lineReadId);
  const profileId = target.sourceProfileId || $("sampleProfile").value || "neutral_medium";
  $("sampleProfile").value = profileId;
  const source = offline.generateSample(48000, profileId);
  useOfflineSource(source);
  toast("Target source generated", `${source.name} for ${target.name}.`);
}

function studioPlanStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "check") return "Check";
  return "Risk";
}

function directorBriefStatusLabel(status) {
  if (status === "ready") return "Ready for review";
  if (status === "check" || status === "polish") return "Needs a decision";
  if (status === "waiting") return "Waiting";
  return "Repair first";
}

function renderRenderDeck() {
  const host = $("renderDeckList");
  if (!host) return;
  if (!state.renderDeck.length) {
    $("renderDeckStatus").textContent = "No renders";
    host.innerHTML = "";
    renderTakeDecision();
    renderSceneSession();
    return;
  }
  $("renderDeckStatus").textContent = `${state.renderDeck.length} takes / ${totalDeckSeconds(state.renderDeck).toFixed(1)}s`;
  host.innerHTML = state.renderDeck.map((item, index) => {
    const review = item.review;
    const active = item.id === state.activeRenderId;
    const metrics = review?.items || [];
    const badge = item.variant || item.stackAudition || null;
    const badgeLabel = item.stackAudition ? `Stack: ${item.stackAudition.label}` : badge?.label || "";
    const safety = item.rendered?.characterSafety || null;
    const safetyBadge = safety?.enabled ? characterSafetySummary(safety) : "";
    const detailParts = [badge?.intent || "", safetyBadge, renderReviewSummary(review)].filter(Boolean);
    const detail = detailParts.join(" ");
    return `
      <button class="render-card is-${review?.status || "empty"} ${active ? "is-active" : ""}" data-render-deck="${item.id}" type="button">
        <span class="render-card-score">${review ? `${review.score}% ${renderReviewStatusLabel(review.status)}` : "No review"}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.target)} - ${escapeHtml(item.mode)} ${index === 0 ? "latest" : `#${index + 1}`}</small>
        ${badge ? `<span class="render-card-variant">${escapeHtml(badgeLabel)}</span>` : ""}
        <div class="render-card-metrics">
          ${metrics.map((metric) => `
            <span>
              ${escapeHtml(metric.label)}
              <b>${escapeHtml(metric.value)}</b>
            </span>
          `).join("")}
        </div>
        <p>${escapeHtml(detail)}</p>
      </button>
    `;
  }).join("");
  renderTakeDecision();
  renderSceneSession();
}

function renderTakeDecision() {
  const panel = $("takeDecisionPanel");
  if (!panel) return;
  const host = $("takeDecisionList");
  const decision = currentTakeDecision();
  if (!decision.items.length) {
    panel.className = "take-decision";
    $("takeDecisionStatus").textContent = offline.source ? "No takes" : "No source";
    host.innerHTML = "";
    renderKeeperRefinement(decision);
    return;
  }
  panel.className = `take-decision is-${decision.status}`;
  $("takeDecisionStatus").textContent = `${decision.score}% ${takeDecisionStatusLabel(decision.status)}`;
  host.innerHTML = decision.items.map((item, index) => {
    const isWinner = item.id === decision.winnerId;
    const isCandidate = !decision.winnerId && item.id === decision.candidateId;
    const isActive = item.id === state.activeRenderId;
    const rankLabel = isWinner ? "Keeper" : isCandidate ? "QC Hold" : `#${index + 1}`;
    return `
      <button class="take-decision-card is-${item.status} ${isWinner ? "is-winner" : ""} ${isCandidate ? "is-qc-hold" : ""} ${isActive ? "is-active" : ""}" data-take-decision="${item.id}" type="button">
        <span class="take-decision-score">${rankLabel} ${item.score}% ${takeDecisionStatusLabel(item.status)}</span>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.target)} - ${escapeHtml(item.mode)}</small>
        <div class="take-decision-bars">
          ${item.items.slice(0, 4).map((metric) => `
            <span class="is-${metric.status}" style="--score:${metric.score}%">
              <b>${escapeHtml(metric.label)}</b>
              <i></i>
              <em>${escapeHtml(metric.value)}</em>
            </span>
          `).join("")}
        </div>
        <p>${escapeHtml(takeDecisionDetail(item, isWinner, isCandidate))}</p>
      </button>
    `;
  }).join("");
  renderKeeperRefinement(decision);
}

function renderKeeperRefinement(decision = currentTakeDecision()) {
  const panel = $("takeRefinementPanel");
  if (!panel) return;
  const refinement = currentKeeperRefinement(decision);
  if (!decision.items.length) {
    panel.className = "take-refinement";
    $("takeRefinementStatus").textContent = offline.source ? "No keeper" : "No source";
    $("takeRefinementGrid").innerHTML = "";
    $("takeRefinementPatches").innerHTML = "";
    $("applyKeeperRefinement").disabled = true;
    return;
  }
  panel.className = `take-refinement is-${refinement.status}`;
  $("takeRefinementStatus").textContent = `${refinement.summary}`;
  $("applyKeeperRefinement").disabled = !refinement.patch.length;
  $("applyKeeperRefinement").textContent = refinement.patch.length ? "Apply Patch" : "Patch Locked";
  $("takeRefinementGrid").innerHTML = refinement.cards.map((card) => `
    <div class="take-refinement-card is-${card.status}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${card.score}%</strong>
      <small>${escapeHtml(card.summary)}</small>
    </div>
  `).join("");
  $("takeRefinementPatches").innerHTML = refinement.patch.length
    ? refinement.patch.slice(0, 8).map((patch) => `
      <span title="${escapeHtml(patch.reason)}">
        ${escapeHtml(paramLabel(patch.key))}
        <b>${formatPatchDelta(patch)}</b>
      </span>
    `).join("")
    : `<span>Keeper locked <b>0</b></span>`;
}

function applyKeeperRefinement() {
  const refinement = currentKeeperRefinement();
  if (!refinement.patch.length) {
    toast("Keeper locked", "No keeper patch is needed for the current decision.");
    return;
  }
  state.params = { ...refinement.params };
  persist();
  engine.setParams(state.params);
  renderControls();
  updateLineReadScore();
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderAuditionVariants();
  renderTakeDecision();
  renderProjectVault();
  toast("Keeper patch applied", `${refinement.winnerLabel}: ${describePatchList(refinement.patch)}`);
}

function clearRenderDeck() {
  state.renderDeck = [];
  state.activeRenderId = null;
  renderRenderDeck();
  renderProjectVault();
}

function renderReviewStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "check") return "Check";
  return "Risk";
}

function takeDecisionStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "check") return "Check";
  if (status === "waiting") return "Waiting";
  return "Risk";
}

function renderReviewSummary(review) {
  if (!review) return "Render review unavailable.";
  return review.items.slice(0, 2).map((item) => `${item.label} ${item.value}`).join(" / ");
}

function takeDecisionDetail(item, isWinner, isCandidate = false) {
  const prefix = isWinner
    ? "Recommended keeper"
    : isCandidate
      ? `QC hold: ${item.qc?.summary || "repair first"}`
      : "Alternate take";
  return `${prefix}; weakest evidence: ${item.weakest}. ${item.items.slice(0, 4).map((metric) => `${metric.label} ${metric.value}`).join(" / ")}`;
}

function updateSourceFit() {
  const panel = $("sourceFitPanel");
  if (!panel) return;
  const report = offline.sourceFitReport(state.params, lineReadById(state.lineReadId));
  if (!report) {
    panel.className = "source-fit";
    $("sourceFitScore").textContent = "No source";
    $("sourceFitGrid").innerHTML = "";
    $("sourceFitPatches").innerHTML = "";
    return;
  }
  panel.className = `source-fit is-${report.status}`;
  $("sourceFitScore").textContent = `${report.score}% ${sourceFitStatusLabel(report.status)}`;
  $("sourceFitGrid").innerHTML = report.items.map((item) => `
    <div class="source-fit-card is-${item.status}" data-fit="${item.id}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.detail)}</small>
    </div>
  `).join("");
  $("sourceFitPatches").innerHTML = report.patches.length ? report.patches.slice(0, 6).map((patch) => `
    <span data-patch="${patch.key}">
      ${escapeHtml(paramLabel(patch.key))}
      <b>${formatPatchDelta(patch)}</b>
    </span>
  `).join("") : `<span>No source patch needed <b>0</b></span>`;
}

function updateRoutePlanner() {
  const panel = $("routePlanner");
  if (!panel) return;
  if (!offline.source || !offline.profile) {
    state.voiceRoutes = [];
    panel.className = "route-planner";
    $("routePlannerStatus").textContent = "No source";
    $("voiceRouteList").innerHTML = "";
    return;
  }
  state.voiceRoutes = rankVoiceRoutes(offline.profile, offline.source, { limit: 6 });
  const topRoute = state.voiceRoutes[0];
  panel.className = `route-planner is-${topRoute?.status || "empty"}`;
  $("routePlannerStatus").textContent = topRoute ? `${topRoute.score}% best` : "No route";
  $("voiceRouteList").innerHTML = state.voiceRoutes.map((route) => {
    const active = route.presetId === state.presetId && route.targetId === state.lineReadId;
    const patchText = route.patches.length
      ? route.patches.slice(0, 3).map((patch) => `<span>${escapeHtml(paramLabel(patch.key))} <b>${formatPatchDelta(patch)}</b></span>`).join("")
      : `<span>No patch <b>0</b></span>`;
    const reasonText = route.reasons.length
      ? route.reasons.slice(0, 2).map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")
      : `<span>Source aligned</span>`;
    return `
      <button class="voice-route is-${route.status} ${active ? "is-active" : ""}" data-route="${route.id}" type="button">
        <span class="route-score">${route.score}% ${routeStatusLabel(route.status)}</span>
        <strong>${escapeHtml(route.presetName)}</strong>
        <small>${escapeHtml(route.targetName)}</small>
        <p>${escapeHtml(route.direction)}</p>
        <div class="route-metrics">
          <span>Fit <b>${route.fitAfterScore}%</b></span>
          <span>Read <b>${route.targetScore}%</b></span>
          <span>Patch <b>${route.patchCount}</b></span>
        </div>
        <div class="route-patches">${patchText}</div>
        <div class="route-reasons">${reasonText}</div>
      </button>
    `;
  }).join("");
}

function applyVoiceRoute(routeId) {
  const route = state.voiceRoutes.find((item) => item.id === routeId);
  if (!route) {
    toast("Route needs a source", "Generate or upload audio before choosing a voice route.");
    return;
  }
  state.presetId = route.presetId;
  state.lineReadId = route.hasLineRead ? route.targetId : firstLineReadForPreset(route.presetId).id;
  state.params = { ...route.tunedParams };
  persist();
  engine.setParams(state.params);
  renderPresets();
  renderControls();
  renderLineReadPanel();
  renderLineReadLibrary();
  renderSceneKitPanel();
  renderSceneKitLibrary();
  updateActivePreset();
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderProjectVault();
  toast("Route applied", `${route.presetName} - ${route.targetName}; ${route.patchCount ? `${route.patchCount} source patches` : "source aligned"}.`);
}

function sourceFitStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "tune") return "Tune";
  return "Risk";
}

function studioStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "polish") return "Polish";
  if (status === "repair") return "Repair";
  return "Waiting";
}

function routeStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "tune") return "Tune";
  return "Risk";
}

function setDefaultRegion(source) {
  const duration = source.samples.length / source.sampleRate;
  state.offlineRegion = {
    startSec: 0,
    durationSec: Math.min(duration, 2)
  };
}

function syncRegionFromInputs() {
  if (!offline.source) return;
  const total = sourceDurationSec();
  const minLength = Math.min(total, 0.35);
  const durationSec = Math.min(Number($("regionLength").value) || minLength, total);
  const startSec = Math.min(Number($("regionStart").value) || 0, Math.max(0, total - durationSec));
  state.offlineRegion = { startSec, durationSec };
  state.activeSourceCueId = nearestCueIdForRegion(state.sourceTimeline, state.offlineRegion);
  updateRegionControls();
  renderSourceTimeline();
}

function updateRegionControls() {
  const hasSource = !!offline.source;
  const start = $("regionStart");
  const length = $("regionLength");
  start.disabled = !hasSource;
  length.disabled = !hasSource;
  if (!hasSource) {
    $("regionStartOut").textContent = "0.0s";
    $("regionLengthOut").textContent = "0.0s";
    $("regionReadout").textContent = "No source";
    drawSourceWaveform();
    return;
  }

  const total = sourceDurationSec();
  const minLength = Math.min(total, 0.35);
  const maxLength = Math.min(total, 12);
  state.offlineRegion.durationSec = Math.min(Math.max(state.offlineRegion.durationSec || minLength, minLength), maxLength);
  state.offlineRegion.startSec = Math.min(Math.max(state.offlineRegion.startSec || 0, 0), Math.max(0, total - state.offlineRegion.durationSec));

  start.min = "0";
  start.max = Math.max(0, total - minLength).toFixed(1);
  start.step = total > 30 ? "0.5" : "0.1";
  start.value = state.offlineRegion.startSec.toFixed(1);
  length.min = minLength.toFixed(1);
  length.max = maxLength.toFixed(1);
  length.step = total > 30 ? "0.5" : "0.1";
  length.value = state.offlineRegion.durationSec.toFixed(1);
  $("regionStartOut").textContent = `${state.offlineRegion.startSec.toFixed(1)}s`;
  $("regionLengthOut").textContent = `${state.offlineRegion.durationSec.toFixed(1)}s`;
  $("regionReadout").textContent = `${state.offlineRegion.startSec.toFixed(1)}-${(state.offlineRegion.startSec + state.offlineRegion.durationSec).toFixed(1)}s / ${total.toFixed(1)}s`;
  drawSourceWaveform();
  renderPerformanceTrace();
}

function currentRegion() {
  if (!offline.source) return null;
  return {
    startSec: state.offlineRegion.startSec,
    durationSec: state.offlineRegion.durationSec,
    minDurationSec: 0.35
  };
}

function sourceDurationSec() {
  return offline.source ? offline.source.samples.length / offline.source.sampleRate : 0;
}

function drawSourceWaveform() {
  drawWaveform($("sourceWave"), offline.source?.samples || null, "#69e3b5", {
    region: offline.source ? {
      startSample: Math.round(state.offlineRegion.startSec * offline.source.sampleRate),
      endSample: Math.round((state.offlineRegion.startSec + state.offlineRegion.durationSec) * offline.source.sampleRate),
      isFull: false
    } : null
  });
}

function clearOfflineRenderPreview() {
  if (state.renderUrl) URL.revokeObjectURL(state.renderUrl);
  state.renderUrl = null;
  offline.rendered = null;
  $("renderAudio").removeAttribute("src");
  $("renderAudio").load();
  drawWaveform($("renderWave"), null, "#8fa7ff");
  $("downloadRender").disabled = true;
  $("downloadWebm").disabled = true;
  $("downloadZip").disabled = true;
  $("playCompare").disabled = true;
  state.lastWebmBlob = null;
  renderGuidedStudio();
}

function describeCalibrationDelta(before, after) {
  const keys = ["inputGain", "pitch", "formant", "body", "brightness", "air", "deEss", "breath"];
  const names = new Map([...MACRO_DEFS, ...DIRECTOR_DEFS, ...PARAM_DEFS].map((def) => [def.key, def.label]));
  const changes = keys
    .map((key) => ({ key, delta: Number(after[key] || 0) - Number(before[key] || 0) }))
    .filter((item) => Math.abs(item.delta) >= 0.1)
    .slice(0, 4)
    .map((item) => `${names.get(item.key) || item.key} ${item.delta > 0 ? "+" : ""}${item.delta.toFixed(item.key === "pitch" || item.key === "formant" ? 1 : 0)}`);
  return changes.length ? changes.join(", ") : "Profile already fits this voice.";
}

function describeDeltaList(deltas = [], fallback = "No public parameter change.") {
  const names = new Map([...MACRO_DEFS, ...DIRECTOR_DEFS, ...PARAM_DEFS].map((def) => [def.key, def.label]));
  const changes = (Array.isArray(deltas) ? deltas : [])
    .filter((item) => item && !String(item.key || "").startsWith("_") && Math.abs(Number(item.delta || 0)) >= 0.1)
    .slice(0, 4)
    .map((item) => {
      const fixed = item.key === "pitch" || item.key === "formant" || item.key === "inputGain" ? 1 : 0;
      const delta = Number(item.delta || 0);
      return `${names.get(item.key) || item.key} ${delta > 0 ? "+" : ""}${delta.toFixed(fixed)}`;
    });
  return changes.length ? changes.join(", ") : fallback;
}

function describePatchObject(patch = {}) {
  const entries = Object.entries(patch)
    .filter(([key]) => !key.startsWith("_"))
    .slice(0, 4)
    .map(([key, value]) => `${paramLabel(key)} -> ${formatPatchValue(key, value)}`);
  return entries.length ? entries.join(", ") : "No public parameter change.";
}

function describePatchList(patches = []) {
  const entries = patches
    .filter((patch) => !patch.key.startsWith("_"))
    .slice(0, 4)
    .map((patch) => `${paramLabel(patch.key)} ${formatPatchDelta(patch)}`);
  return entries.length ? entries.join(", ") : "No public parameter change.";
}

function formatPatchValue(key, value) {
  const def = [...MACRO_DEFS, ...DIRECTOR_DEFS, ...PARAM_DEFS].find((item) => item.key === key);
  const unit = key === "inputGain" ? " dB" : def?.unit || "";
  const fixed = key === "pitch" || key === "formant" || key === "inputGain" ? 1 : 0;
  return `${Number(value).toFixed(fixed)}${unit}`;
}

function paramLabel(key) {
  if (key === "inputGain") return "Input Gain";
  return [...MACRO_DEFS, ...DIRECTOR_DEFS, ...PARAM_DEFS].find((def) => def.key === key)?.label || key;
}

function formatPatchDelta(patch) {
  const def = [...MACRO_DEFS, ...DIRECTOR_DEFS, ...PARAM_DEFS].find((item) => item.key === patch.key);
  const unit = patch.key === "inputGain" ? " dB" : def?.unit || "";
  const fixed = patch.key === "pitch" || patch.key === "formant" || patch.key === "inputGain" ? 1 : 0;
  return `${patch.delta > 0 ? "+" : ""}${patch.delta.toFixed(fixed)}${unit}`;
}

function playSnippet(audio, seconds, startSec = 0) {
  return new Promise((resolve, reject) => {
    let done = false;
    let timer = 0;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      audio.removeEventListener("ended", finish);
      audio.pause();
      resolve();
    };
    audio.pause();
    const maxStart = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.05) : Math.max(0, startSec);
    audio.currentTime = Math.min(Math.max(0, startSec), maxStart);
    audio.addEventListener("ended", finish, { once: true });
    audio.play()
      .then(() => {
        timer = setTimeout(finish, seconds * 1000);
      })
      .catch((error) => {
        audio.removeEventListener("ended", finish);
        reject(error);
      });
  });
}

function setAudioPreview(audioId, slot, blob, samples, sampleRate) {
  if (state[`${slot}Url`]) URL.revokeObjectURL(state[`${slot}Url`]);
  const audio = $(audioId);
  const audioBlob = blob || encodeWavMono(samples, sampleRate);
  state[`${slot}Url`] = URL.createObjectURL(audioBlob);
  audio.src = state[`${slot}Url`];
}

function bindDiagnostics() {
  $("runSelfTest").addEventListener("click", () => {
    const result = selfTestDspCore();
    $("selfTestLog").textContent = JSON.stringify(result, null, 2);
    updateDiagnostics();
    toast(result.ok ? "Self-test passed" : "Self-test failed", "DSP core generated and processed reference audio.");
  });

  $("runQualityMatrix").addEventListener("click", async () => {
    $("selfTestLog").textContent = "Running preset quality matrix...";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const profileId = $("qualityProfile").value;
    const suite = profileId === "all"
      ? runReferenceQualitySuite({ duration: 0.52 })
      : runPresetQualitySuite({ duration: 0.9, sourceProfileId: profileId });
    state.qualitySuite = suite;
    renderQualityMatrix(suite);
    updateDiagnostics();
    $("selfTestLog").textContent = JSON.stringify({
      ok: suite.ok,
      counts: suite.counts,
      elapsedMs: Number(suite.elapsedMs.toFixed(1)),
      realtimeFactor: Number(suite.realtimeFactor.toFixed(3))
    }, null, 2);
    toast(suite.ok ? "Quality matrix passed" : "Quality matrix needs attention", `${suite.counts.pass} pass, ${suite.counts.warn} warn, ${suite.counts.fail} fail.`);
  });
}

function bindTheme() {
  $("themeToggle").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = state.theme;
    prefs.set("theme", state.theme);
  });
}

function renderTakes() {
  const host = $("takeList");
  if (!state.takes.length) {
    host.innerHTML = `<div class="empty-note">No takes yet. Record the processed voice or render offline audio.</div>`;
    return;
  }
  host.innerHTML = state.takes.map((take) => `
    <div class="take-item">
      <div>
        <strong>${take.name}</strong>
        <span>${new Date(take.date).toLocaleString()} - ${take.duration.toFixed(1)}s - WAV</span>
      </div>
      <button class="text-action" data-play-take="${take.id}" type="button">Play</button>
    </div>
  `).join("");
  host.querySelectorAll("[data-play-take]").forEach((button) => {
    button.addEventListener("click", () => {
      const take = state.takes.find((item) => item.id === button.dataset.playTake);
      if (!take) return;
      const url = URL.createObjectURL(take.blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    });
  });
}

function renderVoiceMap() {
  $("voiceMap").innerHTML = FACTORY_PRESETS.map((preset) => `
    <div class="voice-target">
      <span>${preset.id}</span>
      <strong>${preset.name}</strong>
      <p>${preset.target}</p>
    </div>
  `).join("");
}

function updateDiagnostics() {
  const quality = state.qualitySuite
    ? `${state.qualitySuite.counts.pass}/${state.qualitySuite.results.length} pass`
    : "Not run";
  const items = [
    ["Static", "GitHub Pages"],
    ["AudioWorklet", "Live DSP"],
    ["Offline", "Local render"],
    ["Presets", String(FACTORY_PRESETS.length)],
    ["Quality", quality],
    ["Privacy", "Local first"],
    ["AI", "Not loaded"]
  ];
  $("diagGrid").innerHTML = items.map(([k, v]) => `<div class="metric"><span>${k}</span><strong>${v}</strong></div>`).join("");
}

function renderQualityMatrix(suite) {
  const rows = suite.results || [];
  $("qualityMatrix").innerHTML = `
    <table class="quality-table">
      <thead>
        <tr>
          <th>Status</th>
          <th>Source</th>
          <th>Preset</th>
          <th class="numeric">RTx</th>
          <th class="numeric">RMS</th>
          <th class="numeric">Peak</th>
          <th class="numeric">F0</th>
          <th class="numeric">dF0</th>
          <th class="numeric">Bright</th>
          <th class="numeric">dZCR</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((item) => {
          const sourceName = item.sourceProfile?.name || suite.sourceProfile?.name || "Reference";
          return `
          <tr>
            <td><span class="quality-pill ${item.status}">${item.status}</span></td>
            <td>${escapeHtml(sourceName)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td class="numeric">${item.realtimeFactor.toFixed(2)}</td>
            <td class="numeric">${item.analysis.rmsDb.toFixed(1)} dB</td>
            <td class="numeric">${item.analysis.peakDb.toFixed(1)} dB</td>
            <td class="numeric">${Math.round(item.analysis.pitchMedianHz || 0)} Hz</td>
            <td class="numeric">${signed(Math.round(item.deltas.pitchHz || 0))} Hz</td>
            <td class="numeric">${signed(Math.round(item.deltas.brightness * 100))}%</td>
            <td class="numeric">${signed(Math.round(item.deltas.zcr || 0))}</td>
            <td>${escapeHtml(item.issues.map((issue) => issue.text).join(", ") || "stable")}</td>
          </tr>
        `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function drawLoop() {
  requestAnimationFrame(drawLoop);
  if (!engine.ready) return;
  const meters = engine.readMeters();
  if (!meters) return;
  $("inMeter").style.width = `${meterPercent(meters.inRms)}%`;
  $("outMeter").style.width = `${meterPercent(meters.outRms)}%`;
  $("inPeak").style.left = `${meterPercent(meters.inPeak)}%`;
  $("outPeak").style.left = `${meterPercent(meters.outPeak)}%`;
  $("inDb").textContent = formatDb(meters.inRms);
  $("outDb").textContent = formatDb(meters.outRms);
  drawWaveform($("waveCanvas"), meters.outData);
  drawSpectrum($("spectrumCanvas"), meters.freqData);
  if (engine.recording) {
    const seconds = engine.recordingSeconds();
    const min = Math.floor(seconds / 60);
    const sec = (seconds % 60).toFixed(1).padStart(4, "0");
    $("recordTime").textContent = `${String(min).padStart(2, "0")}:${sec}`;
  }
}

init();
