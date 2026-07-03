export const OPUS_MIME_CANDIDATES = Object.freeze([
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus"
]);

export function preferredOpusMimeType() {
  const Recorder = globalThis.MediaRecorder;
  if (!Recorder || typeof Recorder.isTypeSupported !== "function") return "";
  return OPUS_MIME_CANDIDATES.find((type) => Recorder.isTypeSupported(type)) || "";
}

export function renderedBaseName(rendered = null) {
  const raw = String(rendered?.name || "voiceforge-render.wav")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return raw || "voiceforge-render";
}

export function buildExportManifest({
  source = null,
  rendered = null,
  params = {},
  presetId = "",
  presetName = "",
  lineReadId = "",
  lineReadName = "",
  review = null,
  compressed = null
} = {}) {
  return {
    app: "VoiceForge",
    version: 1,
    exportedAt: new Date().toISOString(),
    source: source ? {
      name: source.name || "",
      sampleRate: source.sampleRate || 0,
      durationSec: source.samples?.length && source.sampleRate ? source.samples.length / source.sampleRate : 0,
      analysis: compactAnalysis(source.analysis),
      studioAnalysis: compactStudioAnalysis(source.studioAnalysis)
    } : null,
    render: rendered ? {
      name: rendered.name || "",
      sampleRate: rendered.sampleRate || 0,
      durationSec: rendered.samples?.length && rendered.sampleRate ? rendered.samples.length / rendered.sampleRate : 0,
      mode: rendered.mode || "",
      stage: rendered.stage || "character",
      region: rendered.region || null,
      analysis: compactAnalysis(rendered.analysis),
      studioAnalysis: compactStudioAnalysis(rendered.studioAnalysis),
      studioPolish: compactStudioPolish(rendered.studioPolish),
      autoCalibrated: !!rendered.autoCalibrated,
      scriptAutomated: !!rendered.scriptAutomated,
      calibrationDelta: Array.isArray(rendered.calibrationDelta) ? rendered.calibrationDelta.slice(0, 12) : []
    } : null,
    voice: {
      presetId,
      presetName,
      lineReadId,
      lineReadName,
      params: compactParams(params)
    },
    review: review ? {
      status: review.status,
      score: review.score,
      items: review.items?.map((item) => ({
        id: item.id,
        label: item.label,
        value: item.value,
        detail: item.detail
      })) || []
    } : null,
    files: {
      wav: rendered ? `${renderedBaseName(rendered)}.wav` : "",
      webm: compressed?.blob ? `${renderedBaseName(rendered)}.webm` : "",
      zip: rendered ? `${renderedBaseName(rendered)}.zip` : ""
    },
    compressed: compressed ? {
      ok: !!compressed.blob,
      mimeType: compressed.mimeType || "",
      size: compressed.blob?.size || 0,
      error: compressed.error || ""
    } : null,
    privacy: "All audio was processed locally in the browser. No backend is required."
  };
}

export function studioPolishResearchNotes(rendered = null) {
  const polish = rendered?.studioPolish;
  const notes = [
    "# VoiceForge Studio Polish Notes",
    "",
    "This render follows the Studio Polish First workflow: clean and polish the source before character transformation.",
    "",
    "Processing order:",
    "",
    "1. Input trim and gain safety",
    "2. De-plosive",
    "3. Mouth de-click",
    "4. Noise and room reduction",
    "5. Adaptive high-pass",
    "6. Tonal cleanup",
    "7. De-ess and dynamic EQ",
    "8. Leveler and compressor",
    "9. Presence, air, and light saturation",
    "10. Limiter and loudness target",
    "",
    "Research anchors:",
    "",
    "- iZotope RX Mouth De-click, Voice De-noise, De-plosive, and Dialogue Isolate",
    "- Auphonic Adaptive Leveler, loudness, denoise, and AutoEQ documentation",
    "- Apple Podcasts audio requirements",
    "- Transom podcast processing and loudness workflow",
    "- MDN MediaRecorder and OfflineAudioContext",
    "- JSZip generateAsync",
    ""
  ];
  if (polish?.enabled) {
    notes.push("Applied Studio Polish:", "");
    notes.push(`- Intensity: ${polish.intensity}`);
    notes.push(`- Label: ${polish.label}`);
    for (const note of polish.plan?.notes || []) notes.push(`- ${note}`);
  } else {
    notes.push("Studio Polish was disabled for this render.");
  }
  notes.push("", "DSP honesty:", "", "This is browser DSP polish, not AI dialogue isolation or speaker-identity voice conversion.");
  return `${notes.join("\n")}\n`;
}

export async function encodeRenderedWebmOpus(rendered, options = {}) {
  if (!rendered?.samples?.length) throw new Error("No rendered samples to encode.");
  const mimeType = options.mimeType || preferredOpusMimeType();
  if (!mimeType) throw new Error("This browser does not expose a supported Opus MediaRecorder MIME type.");
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC || !globalThis.MediaRecorder) throw new Error("Compressed export needs AudioContext and MediaRecorder.");
  const ctx = new AC({ sampleRate: rendered.sampleRate || 48000 });
  await ctx.resume?.();
  const buffer = ctx.createBuffer(1, rendered.samples.length, rendered.sampleRate || ctx.sampleRate);
  buffer.copyToChannel(rendered.samples, 0);
  const source = ctx.createBufferSource();
  const destination = ctx.createMediaStreamDestination();
  source.buffer = buffer;
  source.connect(destination);
  const chunks = [];
  const recorder = new MediaRecorder(destination.stream, {
    mimeType,
    audioBitsPerSecond: options.audioBitsPerSecond || 96000
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = async () => {
      try {
        source.disconnect();
        destination.disconnect?.();
        await ctx.close?.();
      } catch {
        // Best effort cleanup for browser export resources.
      }
    };
    const fail = async (error) => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(error);
    };
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = (event) => fail(event.error || new Error("MediaRecorder failed."));
    recorder.onstop = async () => {
      if (settled) return;
      settled = true;
      await cleanup();
      resolve(new Blob(chunks, { type: mimeType }));
    };
    source.onended = () => {
      if (recorder.state !== "inactive") recorder.stop();
    };
    try {
      recorder.start(250);
      source.start();
    } catch (error) {
      fail(error);
    }
  });
}

export async function buildRenderZipPackage({
  source = null,
  rendered = null,
  params = {},
  presetId = "",
  presetName = "",
  lineReadId = "",
  lineReadName = "",
  review = null,
  webmBlob = null
} = {}) {
  if (!rendered?.blob) throw new Error("No rendered WAV is available for ZIP export.");
  const JSZip = await loadJSZip();
  const base = renderedBaseName(rendered);
  const compressed = webmBlob ? { blob: webmBlob, mimeType: webmBlob.type } : null;
  const manifest = buildExportManifest({
    source,
    rendered,
    params,
    presetId,
    presetName,
    lineReadId,
    lineReadName,
    review,
    compressed
  });
  const zip = new JSZip();
  zip.file(`${base}.wav`, rendered.blob);
  if (webmBlob) zip.file(`${base}.webm`, webmBlob);
  zip.file("settings.json", JSON.stringify(manifest.voice, null, 2));
  zip.file("analysis.json", JSON.stringify(manifest, null, 2));
  zip.file("research-notes.md", studioPolishResearchNotes(rendered));
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
  return {
    name: `${base}.zip`,
    blob,
    manifest
  };
}

async function loadJSZip() {
  if (globalThis.JSZip) return globalThis.JSZip;
  const mod = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  return mod.default || mod.JSZip;
}

function compactAnalysis(analysis = null) {
  if (!analysis) return null;
  return {
    duration: round(analysis.duration, 3),
    rmsDb: round(analysis.rmsDb, 2),
    peakDb: round(analysis.peakDb, 2),
    pitchMedianHz: round(analysis.pitchMedianHz, 1),
    voicedRatio: round(analysis.voicedRatio, 3),
    brightnessRatio: round(analysis.brightnessRatio, 4),
    zeroCrossingsPerSecond: Math.round(analysis.zeroCrossingsPerSecond || 0),
    crestDb: round(analysis.crestDb, 2),
    clipped: !!analysis.clipped
  };
}

function compactStudioAnalysis(analysis = null) {
  if (!analysis) return null;
  return {
    status: analysis.status,
    score: analysis.score,
    noiseFloorDb: round(analysis.noiseFloorDb, 2),
    headroomDb: round(analysis.headroomDb, 2),
    loudnessProxyDb: round(analysis.loudnessProxyDb, 2),
    dynamicRangeDb: round(analysis.dynamicRangeDb, 2),
    problemScores: analysis.problemScores || null
  };
}

function compactStudioPolish(polish = null) {
  if (!polish) return null;
  return {
    enabled: !!polish.enabled,
    intensity: polish.intensity || "off",
    label: polish.label || "",
    notes: polish.plan?.notes || [],
    stages: polish.plan?.stages || null,
    input: compactStudioAnalysis(polish.inputAnalysis),
    output: compactStudioAnalysis(polish.outputAnalysis)
  };
}

function compactParams(params = {}) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("_")) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = round(value, 4);
    else if (typeof value === "string" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

function round(value, digits) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}
