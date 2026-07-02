import { DIRECTOR_DEFS, FACTORY_PRESETS, MACRO_DEFS, PARAM_DEFS, paramsForPreset, presetById } from "./audio/presets.js";
import {
  coachLineReadTarget,
  firstLineReadForPreset,
  LINE_READ_TARGETS,
  lineReadById,
  paramsForLineReadTarget,
  scoreLineReadTarget,
  targetMatchBreakdown,
  topTargetGaps
} from "./audio/performance-targets.js";
import { encodeWavMono, REFERENCE_VOICE_PROFILES, runPresetQualitySuite, runReferenceQualitySuite, selfTestDspCore } from "./audio/dsp-core.js";
import { LiveAudioEngine, meterPercent } from "./audio/engine.js";
import { OfflineRenderer } from "./audio/offline-renderer.js";
import { rankVoiceRoutes } from "./audio/route-planner.js";
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

function init() {
  document.documentElement.dataset.theme = state.theme;
  renderPresets();
  renderReferenceSelectors();
  renderControls();
  renderLineReadPanel();
  renderLineReadLibrary();
  renderVoiceMap();
  bindTabs();
  bindTransport();
  bindOffline();
  bindLineReads();
  bindDiagnostics();
  bindTheme();
  window.addEventListener("resize", renderLineReadDiagnostics);
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
      updateActivePreset();
      updateSourceFit();
      updateRoutePlanner();
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
    const index = LINE_READ_TARGETS.findIndex((target) => target.id === state.lineReadId);
    const next = LINE_READ_TARGETS[(index + 1 + LINE_READ_TARGETS.length) % LINE_READ_TARGETS.length];
    applyLineReadTarget(next.id);
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
  updateActivePreset();
  updateSourceFit();
  updateRoutePlanner();
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
  updateSourceFit();
  updateRoutePlanner();
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
}

function updateLineReadScore() {
  const target = lineReadById(state.lineReadId);
  $("activeLineReadScore").textContent = `${scoreLineReadTarget(state.params, target)}%`;
  renderLineReadDiagnostics();
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

  $("analyzeSource").addEventListener("click", () => {
    try {
      const profile = offline.analyze();
      $("sourceStatus").textContent = `${offline.source.name} - ${profile.range} source`;
      drawSourceWaveform();
      drawAnalysisCards($("offlineAnalysis"), offline.source, offline.rendered);
      updateSourceFit();
      updateRoutePlanner();
      toast("Source analyzed", `${Math.round(profile.pitchMedianHz || 0)} Hz median F0, ${Math.round(profile.voicedRatio * 100)}% voiced.`);
    } catch (error) {
      toast("Analysis needs a source", error.message || "Generate or upload audio first.");
    }
  });

  $("applyCalibration").addEventListener("click", () => {
    try {
      const before = { ...state.params };
      state.params = offline.calibratedParams(state.params);
      persist();
      engine.setParams(state.params);
      renderControls();
      updateLineReadScore();
      updateSourceFit();
      updateRoutePlanner();
      toast("Tuned to source", describeCalibrationDelta(before, state.params));
    } catch (error) {
      toast("Tuning needs a source", error.message || "Generate or upload audio first.");
    }
  });

  $("previewOffline").addEventListener("click", () => renderOfflineToPreview(true));

  $("renderOffline").addEventListener("click", () => renderOfflineToPreview(false));

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
}

function useOfflineSource(source) {
  setAudioPreview("sourceAudio", "source", source.blob, source.samples, source.sampleRate);
  clearOfflineRenderPreview();
  setDefaultRegion(source);
  $("sourceStatus").textContent = `${source.name} - ${source.analysis.range} source`;
  $("renderStatus").textContent = "Ready";
  updateRegionControls();
  drawAnalysisCards($("offlineAnalysis"), source, offline.rendered);
  updateSourceFit();
  updateRoutePlanner();
}

function renderOfflineToPreview(preview) {
  try {
    const autoTune = $("autoTuneRender").checked;
    const rendered = offline.render(state.params, {
      autoCalibrate: autoTune,
      region: preview ? currentRegion() : null,
      mode: preview ? "preview" : "full"
    });
    setAudioPreview("renderAudio", "render", rendered.blob, rendered.samples, rendered.sampleRate);
    drawWaveform($("renderWave"), rendered.samples, "#8fa7ff");
    drawAnalysisCards($("offlineAnalysis"), offline.source, rendered);
    updateSourceFit();
    updateRoutePlanner();
    $("renderStatus").textContent = preview
      ? autoTune ? "Preview - tuned" : "Preview ready"
      : autoTune ? "Rendered - tuned" : "Rendered";
    $("downloadRender").disabled = false;
    $("playCompare").disabled = false;
    const scope = preview ? `${rendered.region.startSec.toFixed(1)}-${rendered.region.endSec.toFixed(1)}s` : "full source";
    toast(preview ? "Preview rendered" : "Offline render complete", autoTune ? `${scope}; ${describeCalibrationDelta(rendered.baseParams, rendered.appliedParams)}` : `${scope}; manual chain rendered.`);
  } catch (error) {
    toast(preview ? "Preview needs a source" : "Render needs a source", error.message || "Generate or upload audio first.");
  }
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
  updateActivePreset();
  updateSourceFit();
  updateRoutePlanner();
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
