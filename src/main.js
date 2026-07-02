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
import { LiveAudioEngine, meterPercent } from "./audio/engine.js";
import { OfflineRenderer } from "./audio/offline-renderer.js";
import { auditionVariantSummary, buildAuditionVariants } from "./audio/audition-variants.js";
import { bestCharacterChainPatch, characterChainReport } from "./audio/character-chain.js";
import { bestEffectStackPatch, buildEffectStack } from "./audio/effect-stack.js";
import { analyzePerformanceTrace, comparePerformanceTraces } from "./audio/performance-trace.js";
import { buildPerformanceScript, compareScriptToPerformance } from "./audio/performance-script.js";
import { addRenderDeckItem, renderReview, totalDeckSeconds } from "./audio/render-review.js";
import { rankVoiceRoutes } from "./audio/route-planner.js";
import { buildStudioPlan } from "./audio/studio-plan.js";
import { rankRenderDeckTakes } from "./audio/take-decision.js";
import { buildKeeperRefinement } from "./audio/take-refinement.js";
import { addVoiceSnapshot, buildVoiceMemoryBoard, createVoiceSnapshot, sanitizeVoiceSnapshots } from "./audio/voice-memory.js";
import { TakeStore, prefs } from "./storage.js";
import { drawAnalysisCards, drawSpectrum, drawWaveform, formatDb } from "./ui/canvas.js";
import { toast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);
const savedPresetId = prefs.get("presetId", "clean");
const savedLineReadId = prefs.get("lineReadId", null);

const state = {
  presetId: savedPresetId,
  params: prefs.get("params", null),
  theme: prefs.get("theme", "dark"),
  monitor: false,
  bypass: false,
  takes: [],
  renderUrl: null,
  sourceUrl: null,
  offlineRegion: { startSec: 0, durationSec: 0 },
  lineReadId: savedLineReadId || firstLineReadForPreset(savedPresetId).id,
  voiceRoutes: [],
  renderDeck: [],
  activeRenderId: null,
  renderDeckSeq: 0,
  voiceSnapshots: sanitizeVoiceSnapshots(prefs.get("voiceSnapshots", [])),
  qualitySuite: null
};

state.params = { ...paramsForPreset(state.presetId), ...(state.params || {}) };
state.lineReadId = lineReadById(state.lineReadId).id;

const engine = new LiveAudioEngine();
const offline = new OfflineRenderer();
const takeStore = new TakeStore();

function persist() {
  prefs.set("presetId", state.presetId);
  prefs.set("params", state.params);
  prefs.set("lineReadId", state.lineReadId);
}

function persistVoiceSnapshots() {
  prefs.set("voiceSnapshots", state.voiceSnapshots);
}

function init() {
  document.documentElement.dataset.theme = state.theme;
  renderPresets();
  renderReferenceSelectors();
  renderControls();
  renderLineReadPanel();
  renderLineReadLibrary();
  renderSceneKitPanel();
  renderSceneKitLibrary();
  renderPerformanceScript();
  renderCharacterChain();
  renderEffectStack();
  renderVoiceMemory();
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
  updateDiagnostics();
  requestAnimationFrame(drawLoop);
}

function renderReferenceSelectors() {
  $("sampleProfile").innerHTML = REFERENCE_VOICE_PROFILES.map((profile) => (
    `<option value="${profile.id}">${profile.name}</option>`
  )).join("");
  $("qualityProfile").innerHTML = [
    `<option value="all">All Sources</option>`,
    ...REFERENCE_VOICE_PROFILES.map((profile) => `<option value="${profile.id}">${profile.name}</option>`)
  ].join("");
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
      updateActivePreset();
      updateSourceFit();
      updateRoutePlanner();
      renderCharacterChain();
      renderEffectStack();
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

function bindOffline() {
  $("regionStart").addEventListener("input", syncRegionFromInputs);
  $("regionLength").addEventListener("input", syncRegionFromInputs);

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

  $("analyzeSource").addEventListener("click", analyzeOfflineSource);

  $("applyCalibration").addEventListener("click", tuneCurrentSource);

  $("previewOffline").addEventListener("click", () => renderOfflineToPreview(true));

  $("renderOffline").addEventListener("click", () => renderOfflineToPreview(false));

  $("renderVariantSet")?.addEventListener("click", () => renderAuditionVariantSet());

  $("variantLabGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-variant-render]");
    if (button) renderAuditionVariantSet(button.dataset.variantRender);
  });

  $("scriptAutomationRender")?.addEventListener("change", () => {
    renderAutomationPanel();
    renderAuditionVariants();
    renderStudioPlan();
  });

  $("downloadRender").addEventListener("click", () => {
    if (!offline.rendered) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(offline.rendered.blob);
    a.download = offline.rendered.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  });

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
  $("applyStudioPlanStep").addEventListener("click", applyStudioPlanStep);
}

function analyzeOfflineSource() {
  try {
    const profile = offline.analyze();
    $("sourceStatus").textContent = `${offline.source.name} - ${profile.range} source`;
    drawSourceWaveform();
    drawAnalysisCards($("offlineAnalysis"), offline.source, offline.rendered);
    updateSourceFit();
    updateRoutePlanner();
    renderCharacterChain();
    renderPerformanceTrace();
    toast("Source analyzed", `${Math.round(profile.pitchMedianHz || 0)} Hz median F0, ${Math.round(profile.voicedRatio * 100)}% voiced.`);
  } catch (error) {
    toast("Analysis needs a source", error.message || "Generate or upload audio first.");
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
    updateSourceFit();
    updateRoutePlanner();
    renderCharacterChain();
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
  $("sourceStatus").textContent = `${source.name} - ${source.analysis.range} source`;
  $("renderStatus").textContent = "Ready";
  updateRegionControls();
  drawAnalysisCards($("offlineAnalysis"), source, offline.rendered);
  updateSourceFit();
  updateRoutePlanner();
  renderCharacterChain();
  renderPerformanceTrace();
}

function renderOfflineToPreview(preview) {
  try {
    const autoTune = $("autoTuneRender").checked;
    const scriptAuto = $("scriptAutomationRender")?.checked ?? true;
    const rendered = offline.render(state.params, {
      autoCalibrate: autoTune,
      automatePerformance: scriptAuto,
      performanceScript: currentPerformanceScript(),
      region: preview ? currentRegion() : null,
      mode: preview ? "preview" : "full"
    });
    setAudioPreview("renderAudio", "render", rendered.blob, rendered.samples, rendered.sampleRate);
    drawWaveform($("renderWave"), rendered.samples, "#8fa7ff");
    drawAnalysisCards($("offlineAnalysis"), offline.source, rendered);
    addRenderedTakeToDeck(rendered, preview);
    updateSourceFit();
    updateRoutePlanner();
    renderCharacterChain();
    renderPerformanceTrace();
    renderRenderDeck();
    $("renderStatus").textContent = preview
      ? autoTune ? "Preview - tuned" : "Preview ready"
      : autoTune ? "Rendered - tuned" : "Rendered";
    $("downloadRender").disabled = false;
    $("playCompare").disabled = false;
    const scope = preview ? `${rendered.region.startSec.toFixed(1)}-${rendered.region.endSec.toFixed(1)}s` : "full source";
    const renderNote = [
      scope,
      autoTune ? describeCalibrationDelta(rendered.baseParams, rendered.appliedParams) : "manual chain rendered",
      rendered.scriptAutomated ? `${rendered.scriptAutomation?.frameCount || 0} script frames` : "static script"
    ].join("; ");
    toast(preview ? "Preview rendered" : "Offline render complete", renderNote);
  } catch (error) {
    toast(preview ? "Preview needs a source" : "Render needs a source", error.message || "Generate or upload audio first.");
  }
}

function addRenderedTakeToDeck(rendered, preview, variant = null) {
  const review = renderReview(offline.source, rendered);
  const auditionVariant = variant || rendered.auditionVariant || null;
  const item = {
    id: `render-${Date.now()}-${state.renderDeckSeq += 1}`,
    title: auditionVariant ? `${presetById(state.presetId).name} / ${auditionVariant.label}` : presetById(state.presetId).name,
    target: lineReadById(state.lineReadId).name,
    mode: `${preview ? "Preview" : "Full"}${rendered.scriptAutomated ? " Scripted" : ""}${auditionVariant ? " Variant" : ""}`,
    route: state.voiceRoutes.find((route) => route.presetId === state.presetId && route.targetId === state.lineReadId)?.targetName || null,
    variant: auditionVariant,
    rendered,
    review
  };
  state.renderDeck = addRenderDeckItem(state.renderDeck, item);
  state.activeRenderId = item.id;
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
  $("playCompare").disabled = false;
  renderCharacterChain();
  renderPerformanceTrace();
  renderRenderDeck();
}

function currentAuditionVariants() {
  if (!offline.source) return [];
  const target = lineReadById(state.lineReadId);
  const sourceFit = offline.sourceFitReport(state.params, target);
  return buildAuditionVariants(state.params, target, { sourceFit, limit: 5 });
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
      mode: "preview"
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
  renderAuditionVariants();
  $("downloadRender").disabled = false;
  $("playCompare").disabled = false;
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
  renderStudioPlan();
  toast("Design restored", `${item.title}: ${describePatchList(item.patch)}`);
}

function clearVoiceMemory() {
  state.voiceSnapshots = [];
  persistVoiceSnapshots();
  renderVoiceMemory();
  renderStudioPlan();
  toast("Design board cleared", "Saved voice designs were removed from this browser.");
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
  return buildStudioPlan({
    hasSource: !!offline.source,
    sourceFit,
    routes: state.voiceRoutes,
    activePresetId: state.presetId,
    activeLineReadId: state.lineReadId,
    chainReport,
    effectStack,
    voiceMemory,
    renderReview: review,
    performanceComparison: currentPerformanceComparison(),
    performanceScript: currentPerformanceScript(),
    scriptMatch: currentScriptMatch(),
    scriptAutomation: offline.rendered?.scriptAutomationSummary || null,
    auditionVariantCount: currentAuditionVariants().length,
    renderDeckCount: state.renderDeck.length,
    renderDeckSeconds: totalDeckSeconds(state.renderDeck),
    takeDecision,
    keeperRefinement: currentKeeperRefinement(takeDecision)
  });
}

function currentTakeDecision() {
  return rankRenderDeckTakes(state.renderDeck, offline.source, lineReadById(state.lineReadId));
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

function applyStudioPlanStep() {
  const plan = currentStudioPlan();
  const action = plan.nextAction;
  if (!action) {
    toast("Studio plan ready", "The current source, route, chain, and deck are ready for review.");
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

function renderRenderDeck() {
  const host = $("renderDeckList");
  if (!host) return;
  if (!state.renderDeck.length) {
    $("renderDeckStatus").textContent = "No renders";
    host.innerHTML = "";
    renderTakeDecision();
    return;
  }
  $("renderDeckStatus").textContent = `${state.renderDeck.length} takes / ${totalDeckSeconds(state.renderDeck).toFixed(1)}s`;
  host.innerHTML = state.renderDeck.map((item, index) => {
    const review = item.review;
    const active = item.id === state.activeRenderId;
    const metrics = review?.items || [];
    return `
      <button class="render-card is-${review?.status || "empty"} ${active ? "is-active" : ""}" data-render-deck="${item.id}" type="button">
        <span class="render-card-score">${review ? `${review.score}% ${renderReviewStatusLabel(review.status)}` : "No review"}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.target)} - ${escapeHtml(item.mode)} ${index === 0 ? "latest" : `#${index + 1}`}</small>
        ${item.variant ? `<span class="render-card-variant">${escapeHtml(item.variant.label)}</span>` : ""}
        <div class="render-card-metrics">
          ${metrics.map((metric) => `
            <span>
              ${escapeHtml(metric.label)}
              <b>${escapeHtml(metric.value)}</b>
            </span>
          `).join("")}
        </div>
        <p>${escapeHtml(item.variant ? `${item.variant.intent} ${renderReviewSummary(review)}` : renderReviewSummary(review))}</p>
      </button>
    `;
  }).join("");
  renderTakeDecision();
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
    const isActive = item.id === state.activeRenderId;
    return `
      <button class="take-decision-card is-${item.status} ${isWinner ? "is-winner" : ""} ${isActive ? "is-active" : ""}" data-take-decision="${item.id}" type="button">
        <span class="take-decision-score">${isWinner ? "Keeper" : `#${index + 1}`} ${item.score}% ${takeDecisionStatusLabel(item.status)}</span>
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
        <p>${escapeHtml(takeDecisionDetail(item, isWinner))}</p>
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
  toast("Keeper patch applied", `${refinement.winnerLabel}: ${describePatchList(refinement.patch)}`);
}

function clearRenderDeck() {
  state.renderDeck = [];
  state.activeRenderId = null;
  renderRenderDeck();
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

function takeDecisionDetail(item, isWinner) {
  const prefix = isWinner ? "Recommended keeper" : "Alternate take";
  return `${prefix}; weakest evidence: ${item.weakest}. ${item.items.slice(0, 3).map((metric) => `${metric.label} ${metric.value}`).join(" / ")}`;
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
  toast("Route applied", `${route.presetName} - ${route.targetName}; ${route.patchCount ? `${route.patchCount} source patches` : "source aligned"}.`);
}

function sourceFitStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "tune") return "Tune";
  return "Risk";
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
  updateRegionControls();
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
  $("playCompare").disabled = true;
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
