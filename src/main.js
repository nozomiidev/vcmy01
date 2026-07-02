import { FACTORY_PRESETS, MACRO_DEFS, PARAM_DEFS, paramsForPreset, presetById } from "./audio/presets.js";
import { encodeWavMono, REFERENCE_VOICE_PROFILES, runPresetQualitySuite, runReferenceQualitySuite, selfTestDspCore } from "./audio/dsp-core.js";
import { LiveAudioEngine, meterPercent } from "./audio/engine.js";
import { OfflineRenderer } from "./audio/offline-renderer.js";
import { TakeStore, prefs } from "./storage.js";
import { drawAnalysisCards, drawSpectrum, drawWaveform, formatDb } from "./ui/canvas.js";
import { toast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const state = {
  presetId: prefs.get("presetId", "clean"),
  params: prefs.get("params", null),
  theme: prefs.get("theme", "dark"),
  monitor: false,
  bypass: false,
  takes: [],
  renderUrl: null,
  sourceUrl: null,
  qualitySuite: null
};

state.params = state.params || paramsForPreset(state.presetId);

const engine = new LiveAudioEngine();
const offline = new OfflineRenderer();
const takeStore = new TakeStore();

function persist() {
  prefs.set("presetId", state.presetId);
  prefs.set("params", state.params);
}

function init() {
  document.documentElement.dataset.theme = state.theme;
  renderPresets();
  renderReferenceSelectors();
  renderControls();
  renderVoiceMap();
  bindTabs();
  bindTransport();
  bindOffline();
  bindDiagnostics();
  bindTheme();
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
      state.params = paramsForPreset(state.presetId);
      persist();
      engine.setParams(state.params);
      renderPresets();
      renderControls();
      updateActivePreset();
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
  renderControlGroup($("voiceControls"), PARAM_DEFS);
}

function renderControlGroup(host, defs) {
  host.innerHTML = defs.map((def) => controlTemplate(def)).join("");
  host.querySelectorAll("input[type=range]").forEach((input) => {
    const key = input.dataset.key;
    input.addEventListener("input", () => {
      state.params[key] = Number(input.value);
      const output = host.querySelector(`[data-output="${key}"]`);
      if (output) output.textContent = formatValue(state.params[key], defs.find((d) => d.key === key));
      persist();
      engine.setParams(state.params);
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

function bindOffline() {
  $("loadSample").addEventListener("click", () => {
    const source = offline.generateSample(48000, $("sampleProfile").value);
    setAudioPreview("sourceAudio", "source", source.blob, source.samples, source.sampleRate);
    clearOfflineRenderPreview();
    $("sourceStatus").textContent = `${source.name} - ${source.analysis.range} source`;
    $("renderStatus").textContent = "Ready";
    drawWaveform($("sourceWave"), source.samples);
    drawAnalysisCards($("offlineAnalysis"), source, offline.rendered);
  });

  $("audioUpload").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const source = await offline.loadFile(file);
      setAudioPreview("sourceAudio", "source", source.blob, source.samples, source.sampleRate);
      clearOfflineRenderPreview();
      $("sourceStatus").textContent = `${source.name} - ${source.analysis.range} source`;
      $("renderStatus").textContent = "Ready";
      drawWaveform($("sourceWave"), source.samples);
      drawAnalysisCards($("offlineAnalysis"), source, offline.rendered);
    } catch (error) {
      toast("Could not decode audio", error.message || "Try a WAV, MP3, M4A, or WebM file.");
    }
  });

  $("analyzeSource").addEventListener("click", () => {
    try {
      const profile = offline.analyze();
      $("sourceStatus").textContent = `${offline.source.name} - ${profile.range} source`;
      drawAnalysisCards($("offlineAnalysis"), offline.source, offline.rendered);
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
      toast("Tuned to source", describeCalibrationDelta(before, state.params));
    } catch (error) {
      toast("Tuning needs a source", error.message || "Generate or upload audio first.");
    }
  });

  $("renderOffline").addEventListener("click", () => {
    try {
      const rendered = offline.render(state.params);
      setAudioPreview("renderAudio", "render", rendered.blob, rendered.samples, rendered.sampleRate);
      drawWaveform($("renderWave"), rendered.samples, "#8fa7ff");
      drawAnalysisCards($("offlineAnalysis"), offline.source, rendered);
      $("renderStatus").textContent = "Rendered";
      $("downloadRender").disabled = false;
      $("playCompare").disabled = false;
      toast("Offline render complete", "The same character chain was applied to the source.");
    } catch (error) {
      toast("Render needs a source", error.message || "Generate or upload audio first.");
    }
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
      $("renderStatus").textContent = "A/B";
      await playSnippet($("sourceAudio"), 1.25);
      await new Promise((resolve) => setTimeout(resolve, 160));
      await playSnippet($("renderAudio"), 1.25);
      $("renderStatus").textContent = "Rendered";
    } catch (error) {
      $("renderStatus").textContent = "Rendered";
      toast("A/B playback failed", error.message || "Use the audio controls to play both versions.");
    }
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
  const names = new Map([...MACRO_DEFS, ...PARAM_DEFS].map((def) => [def.key, def.label]));
  const changes = keys
    .map((key) => ({ key, delta: Number(after[key] || 0) - Number(before[key] || 0) }))
    .filter((item) => Math.abs(item.delta) >= 0.1)
    .slice(0, 4)
    .map((item) => `${names.get(item.key) || item.key} ${item.delta > 0 ? "+" : ""}${item.delta.toFixed(item.key === "pitch" || item.key === "formant" ? 1 : 0)}`);
  return changes.length ? changes.join(", ") : "Profile already fits this voice.";
}

function playSnippet(audio, seconds) {
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
    audio.currentTime = 0;
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
