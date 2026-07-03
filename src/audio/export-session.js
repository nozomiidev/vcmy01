import { analyzeBuffer, clamp, dbToLin, encodeWavMono } from "./dsp-core.js";
import { processStudioPolish } from "./studio-polish.js";

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
  compressed = null,
  audition = null
} = {}) {
  return {
    app: "VoiceForge",
    version: 1,
    exportedAt: new Date().toISOString(),
    source: source ? {
      name: source.name || "",
      sourceKind: source.sourceKind || "",
      sourceUrl: source.sourceUrl || "",
      sourceType: source.sourceType || "",
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
      performance: compactRenderPerformance(rendered.performance),
      region: rendered.region || null,
      analysis: compactAnalysis(rendered.analysis),
      studioAnalysis: compactStudioAnalysis(rendered.studioAnalysis),
      mastering: compactMastering(rendered.mastering),
      studioPolish: compactStudioPolish(rendered.studioPolish),
      characterSafety: compactCharacterSafety(rendered.characterSafety),
      autoCalibrated: !!rendered.autoCalibrated,
      scriptAutomated: !!rendered.scriptAutomated,
      calibrationDelta: Array.isArray(rendered.calibrationDelta) ? rendered.calibrationDelta.slice(0, 12) : [],
      safetyDelta: Array.isArray(rendered.safetyDelta) ? rendered.safetyDelta.slice(0, 12) : []
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
    audition: compactAuditionComparison(audition || rendered?.audition),
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

export function buildAuditionComparison({ source = null, rendered = null } = {}) {
  if (!source?.samples?.length || !rendered?.samples?.length) return null;
  const sampleRate = rendered.sampleRate || source.sampleRate || 48000;
  const sourceSamples = sourceSamplesForRender(source, rendered);
  const stages = [
    createAuditionStage("source", "Source", "Raw input, level-matched for honest before/after listening.", sourceSamples, sampleRate)
  ];
  const polishSamples = buildPolishAuditionSamples(sourceSamples, sampleRate, rendered);
  if (polishSamples) {
    stages.push(createAuditionStage("studio-polish", "Studio Polish", "Cleanup and broadcast polish before character transformation.", polishSamples, sampleRate));
  }
  stages.push(createAuditionStage(
    rendered.stage === "polish" ? "polish-render" : "character-render",
    rendered.stage === "polish" ? "Polish Render" : "Character Render",
    "Final exported render used as the loudness reference for A/B checks.",
    rendered.samples,
    sampleRate
  ));
  const renderAnalysis = rendered.analysis || stages[stages.length - 1].analysis;
  const referenceLufs = Number.isFinite(renderAnalysis?.integratedLufs)
    ? renderAnalysis.integratedLufs
    : Number.isFinite(rendered.mastering?.targetLufs)
    ? rendered.mastering.targetLufs
    : -19;
  const truePeakCeilingDb = Number.isFinite(rendered.mastering?.truePeakCeilingDb)
    ? rendered.mastering.truePeakCeilingDb
    : -1;
  const matchedStages = stages.map((stage) => matchAuditionStage(stage, referenceLufs, truePeakCeilingDb, sampleRate));
  const warnings = matchedStages
    .filter((stage) => stage.match.status !== "ready")
    .map((stage) => `${stage.label}: ${stage.match.reason}`);
  return {
    version: 1,
    status: warnings.length ? "check" : "ready",
    summary: warnings.length
      ? `A/B package created with ${warnings.length} loudness-match warning(s).`
      : "A/B package is loudness-matched against the final render.",
    reference: {
      stageId: matchedStages[matchedStages.length - 1]?.id || "character-render",
      integratedLufs: round(referenceLufs, 2),
      truePeakCeilingDb: round(truePeakCeilingDb, 2),
      principle: "Compare tone and character at matched loudness so louder does not automatically feel better."
    },
    stages: matchedStages,
    warnings
  };
}

export function auditionComparisonNotes(audition = null) {
  if (!audition) return "# VoiceForge A/B Audition\n\nNo audition comparison was available.\n";
  const lines = [
    "# VoiceForge A/B Audition",
    "",
    "Use these files for level-matched before/after listening. The final render is the reference; source and polish stages are gain-matched within true-peak safety so decisions are not biased by loudness.",
    "",
    `Status: ${audition.status}`,
    `Reference: ${audition.reference.integratedLufs} LUFS / ${audition.reference.truePeakCeilingDb} dBTP ceiling`,
    "",
    "Files:"
  ];
  for (const stage of audition.stages || []) {
    lines.push(`- ${stage.file}: ${stage.label}; gain ${signedDb(stage.match.gainDb)}; matched ${stage.match.integratedLufs} LUFS / ${stage.match.truePeakDb} dBTP; ${stage.purpose}`);
  }
  if (audition.warnings?.length) {
    lines.push("", "Warnings:");
    for (const warning of audition.warnings) lines.push(`- ${warning}`);
  }
  lines.push(
    "",
    "Research anchor:",
    "- A/B and reference workflows should be loudness-matched; otherwise louder processing is often perceived as better even when tone or articulation got worse.",
    "- This package is a local browser export. It is not a substitute for a calibrated room, headphones, or human listening notes."
  );
  return `${lines.join("\n")}\n`;
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
    if (polish.target?.label || polish.plan?.target?.label) notes.push(`- Production target: ${polish.target?.label || polish.plan.target.label}`);
    if (polish.optimized || polish.plan?.optimization?.enabled) {
      const opt = polish.plan?.optimization;
      notes.push(`- Director optimize: ${opt?.scoreBefore ?? "?"} -> ${opt?.scoreAfter ?? "?"}`);
    }
    if (polish.plan?.microRepair) {
      const micro = polish.plan.microRepair;
      notes.push(`- Micro repair events: ${micro.eventCount} (${micro.counts?.mouth || 0} mouth, ${micro.counts?.plosive || 0} plosive, ${micro.counts?.sibilance || 0} sibilance)`);
    }
    if (polish.plan?.toneSurgery) {
      const tone = polish.plan.toneSurgery;
      notes.push(`- Tone surgery: ${tone.summary || "No dynamic tone cuts needed"}`);
      for (const band of (tone.bands || []).filter((item) => item.risk > 12).slice(0, 3)) {
        notes.push(`  - ${band.label}: ${Math.round(band.frequencyHz)} Hz, ${round(band.stageDb, 2)} dB, ${band.evidence}`);
      }
    }
    if (polish.plan?.roomShaper) {
      const room = polish.plan.roomShaper;
      notes.push(`- Room floor: ${round(room.thresholdDb, 1)} dB threshold, ${round(room.rangeDb, 1)} dB range, ${room.roomTonePolicy}`);
    }
    if (rendered?.mastering?.enabled) {
      notes.push(`- Final mastering: ${round(rendered.mastering.gainDb, 2)} dB to ${round(rendered.mastering.targetLufs, 1)} LUFS / ${round(rendered.mastering.truePeakCeilingDb, 1)} dBTP ceiling`);
    }
    notes.push(`- Label: ${polish.label}`);
    for (const note of polish.plan?.notes || []) notes.push(`- ${note}`);
    if (polish.plan?.repairMap?.steps?.length) {
      notes.push("", "Repair map:");
      for (const step of polish.plan.repairMap.steps.slice(0, 8)) {
        notes.push(`- ${step.order}. ${step.label}: ${step.status}; ${step.action}; risk if overdone: ${step.overuseRisk}`);
      }
    }
  } else {
    notes.push("Studio Polish was disabled for this render.");
  }
  if (rendered?.characterSafety?.enabled) {
    notes.push("", "Character safety:");
    notes.push(`- Status: ${rendered.characterSafety.status}`);
    notes.push(`- Score: ${rendered.characterSafety.score}`);
    if (rendered.characterSafety.creative) notes.push("- Creative exception: robot/creature style allows wider non-human shifts.");
    if (rendered.characterSafety.moves?.length) {
      for (const move of rendered.characterSafety.moves.slice(0, 8)) {
        notes.push(`- ${move.label}: ${round(move.before, 2)} -> ${round(move.after, 2)}; ${move.reason}`);
      }
    } else {
      notes.push("- No pitch, formant, air, breath, or harshness clamps were needed.");
    }
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
    let timer = 0;
    const durationMs = rendered.samples.length / Math.max(1, rendered.sampleRate || ctx.sampleRate) * 1000;
    const maxEncodeMs = options.timeoutMs || Math.max(4000, Math.min(90000, durationMs + 3500));
    const stopRecorder = () => {
      try {
        recorder.requestData?.();
      } catch {
        // Some MediaRecorder implementations do not allow requestData near stop.
      }
      if (recorder.state !== "inactive") recorder.stop();
    };
    const cleanup = async () => {
      try {
        clearTimeout(timer);
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
      if (!chunks.length) {
        reject(new Error("MediaRecorder produced no compressed audio."));
        return;
      }
      resolve(new Blob(chunks, { type: mimeType }));
    };
    source.onended = () => {
      stopRecorder();
    };
    try {
      recorder.start(250);
      source.start();
      timer = setTimeout(() => stopRecorder(), maxEncodeMs);
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
  const audition = buildAuditionComparison({ source, rendered });
  const manifest = buildExportManifest({
    source,
    rendered,
    params,
    presetId,
    presetName,
    lineReadId,
    lineReadName,
    review,
    compressed,
    audition
  });
  const zip = new JSZip();
  zip.file(`${base}.wav`, rendered.blob);
  if (webmBlob) zip.file(`${base}.webm`, webmBlob);
  if (audition?.stages?.length) {
    for (const stage of audition.stages) zip.file(`audition/${stage.file}`, stage.blob);
    zip.file("audition/ab-report.json", JSON.stringify(compactAuditionComparison(audition), null, 2));
    zip.file("audition/ab-notes.md", auditionComparisonNotes(audition));
  }
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

function createAuditionStage(id, label, purpose, samples, sampleRate) {
  return {
    id,
    label,
    purpose,
    file: `${id}-loudness-matched.wav`,
    samples: toFloat32(samples),
    sampleRate,
    analysis: analyzeBuffer(samples, sampleRate)
  };
}

function matchAuditionStage(stage, referenceLufs, truePeakCeilingDb, sampleRate) {
  const analysis = stage.analysis;
  const loudnessGainDb = referenceLufs - safeNumber(analysis.integratedLufs, referenceLufs);
  const peakSafeGainDb = truePeakCeilingDb - safeNumber(analysis.truePeakDb, -120);
  const gainDb = clamp(Math.min(loudnessGainDb, peakSafeGainDb), -18, 18);
  const matchedSamples = applyGain(stage.samples, gainDb);
  const matchedAnalysis = analyzeBuffer(matchedSamples, sampleRate);
  const deltaLu = matchedAnalysis.integratedLufs - referenceLufs;
  const limitedByPeak = loudnessGainDb > peakSafeGainDb;
  const status = Math.abs(deltaLu) <= 1.2 || limitedByPeak ? "ready" : "check";
  return {
    ...stage,
    match: {
      targetLufs: round(referenceLufs, 2),
      gainDb: round(gainDb, 2),
      integratedLufs: round(matchedAnalysis.integratedLufs, 2),
      truePeakDb: round(matchedAnalysis.truePeakDb, 2),
      deltaLu: round(deltaLu, 2),
      limitedByPeak,
      status,
      reason: status === "ready"
        ? limitedByPeak ? "true-peak ceiling constrained exact loudness match" : "within loudness-match tolerance"
        : "loudness remained outside tolerance after safety gain"
    },
    analysis: compactAnalysis(analysis),
    matchedAnalysis: compactAnalysis(matchedAnalysis),
    samples: matchedSamples,
    blob: encodeWavMono(matchedSamples, sampleRate)
  };
}

function buildPolishAuditionSamples(sourceSamples, sampleRate, rendered) {
  if (!rendered?.studioPolish?.enabled || !rendered.studioPolish.plan) return null;
  try {
    return processStudioPolish(sourceSamples, sampleRate, rendered.studioPolish.plan).samples;
  } catch {
    return null;
  }
}

function sourceSamplesForRender(source, rendered) {
  const samples = source.samples || new Float32Array();
  const region = rendered?.region || null;
  if (region && !region.isFull && Number.isFinite(region.startSample) && Number.isFinite(region.endSample)) {
    const start = clamp(Math.round(region.startSample), 0, samples.length);
    const end = clamp(Math.round(region.endSample), start, samples.length);
    return samples.slice(start, end);
  }
  return samples;
}

function compactAuditionComparison(audition = null) {
  if (!audition) return null;
  return {
    version: audition.version || 1,
    status: audition.status || "",
    summary: audition.summary || "",
    reference: audition.reference || null,
    warnings: audition.warnings || [],
    stages: (audition.stages || []).map((stage) => ({
      id: stage.id,
      label: stage.label,
      purpose: stage.purpose,
      file: stage.file,
      analysis: stage.analysis,
      matchedAnalysis: stage.matchedAnalysis,
      match: stage.match
    }))
  };
}

function applyGain(samples, gainDb) {
  const gain = dbToLin(gainDb);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = clamp(samples[i] * gain, -1, 1);
  return out;
}

function toFloat32(samples) {
  return samples instanceof Float32Array ? samples : new Float32Array(samples || []);
}

function safeNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function signedDb(value) {
  return `${value > 0 ? "+" : ""}${round(value, 2)} dB`;
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
    integratedLufs: round(analysis.integratedLufs, 2),
    momentaryMaxLufs: round(analysis.momentaryMaxLufs, 2),
    shortTermLufs: round(analysis.shortTermLufs, 2),
    loudnessRangeLu: round(analysis.loudnessRangeLu, 2),
    truePeakDb: round(analysis.truePeakDb, 2),
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
    truePeakDb: round(analysis.truePeakDb, 2),
    integratedLufs: round(analysis.integratedLufs, 2),
    loudnessRangeLu: round(analysis.loudnessRangeLu, 2),
    dynamicRangeDb: round(analysis.dynamicRangeDb, 2),
    problemScores: analysis.problemScores || null,
    spectral: compactSpectral(analysis.spectral),
    microRepair: compactMicroRepair(analysis.microRepair),
    repairMap: compactRepairMap(analysis.repairMap)
  };
}

function compactStudioPolish(polish = null) {
  if (!polish) return null;
  return {
    enabled: !!polish.enabled,
    intensity: polish.intensity || "off",
    target: polish.target || polish.plan?.target || null,
    optimized: !!(polish.optimized || polish.plan?.optimization?.enabled),
    label: polish.label || "",
    notes: polish.plan?.notes || [],
    optimization: polish.plan?.optimization || null,
    microRepair: compactMicroRepair(polish.plan?.microRepair),
    toneSurgery: compactToneSurgery(polish.plan?.toneSurgery),
    roomShaper: compactRoomShaper(polish.plan?.roomShaper),
    reactivePlan: compactReactivePlan(polish.plan?.reactivePlan),
    repairMap: compactRepairMap(polish.plan?.repairMap),
    stages: polish.plan?.stages || null,
    input: compactStudioAnalysis(polish.inputAnalysis),
    output: compactStudioAnalysis(polish.outputAnalysis)
  };
}

function compactCharacterSafety(plan = null) {
  if (!plan) return null;
  return {
    enabled: !!plan.enabled,
    status: plan.status || "",
    score: Math.round(plan.score || 0),
    creative: !!plan.creative,
    target: plan.target || null,
    limits: plan.limits || null,
    evidence: plan.evidence ? {
      mud: Math.round(plan.evidence.mud || 0),
      nasal: Math.round(plan.evidence.nasal || 0),
      harsh: Math.round(plan.evidence.harsh || 0),
      sibilance: Math.round(plan.evidence.sibilance || 0),
      perceptualRisk: plan.evidence.perceptualRisk || ""
    } : null,
    moves: (plan.moves || []).slice(0, 12).map((move) => ({
      key: move.key,
      label: move.label,
      before: round(move.before, 3),
      after: round(move.after, 3),
      reason: move.reason
    }))
  };
}

function compactRenderPerformance(performance = null) {
  if (!performance) return null;
  return {
    elapsedMs: round(performance.elapsedMs, 2),
    renderedSeconds: round(performance.renderedSeconds, 3),
    realtimeFactor: round(performance.realtimeFactor, 4),
    sampleRate: Math.max(0, Number(performance.sampleRate || 0)),
    mode: performance.mode || "",
    stage: performance.stage || ""
  };
}

function compactMastering(mastering = null) {
  if (!mastering) return null;
  return {
    enabled: !!mastering.enabled,
    target: mastering.target || null,
    targetLufs: round(mastering.targetLufs, 2),
    truePeakCeilingDb: round(mastering.truePeakCeilingDb, 2),
    gainDb: round(mastering.gainDb, 2),
    limitedByTruePeak: !!mastering.limitedByTruePeak,
    before: compactLoudness(mastering.before),
    after: compactLoudness(mastering.after)
  };
}

function compactLoudness(loudness = null) {
  if (!loudness) return null;
  return {
    integratedLufs: round(loudness.integratedLufs, 2),
    momentaryMaxLufs: round(loudness.momentaryMaxLufs, 2),
    shortTermLufs: round(loudness.shortTermLufs, 2),
    loudnessRangeLu: round(loudness.loudnessRangeLu, 2),
    truePeakDb: round(loudness.truePeakDb, 2),
    gatedBlockCount: Math.max(0, Number(loudness.gatedBlockCount || 0))
  };
}

function compactMicroRepair(timeline = null) {
  if (!timeline) return null;
  return {
    status: timeline.status || "",
    score: Math.round(timeline.score || 0),
    eventCount: Math.max(0, Number(timeline.eventCount || 0)),
    eventsPerMinute: Math.max(0, Number(timeline.eventsPerMinute || 0)),
    counts: timeline.counts || null,
    topEvent: timeline.topEvent || null,
    events: (timeline.events || []).slice(0, 12).map((event) => ({
      id: event.id,
      type: event.type,
      label: event.label,
      action: event.action,
      decision: event.decision ? {
        id: event.decision.id,
        windowMs: round(event.decision.windowMs, 1),
        band: event.decision.band,
        preserve: event.decision.preserve
      } : null,
      shape: event.shape ? {
        method: event.shape.method,
        widthMs: round(event.shape.widthMs, 2),
        riseDb: round(event.shape.riseDb, 1),
        decayDb: round(event.shape.decayDb, 1),
        focus: round(event.shape.focus, 3),
        confidence: Math.round(event.shape.confidence || 0)
      } : null,
      startSec: round(event.startSec, 3),
      endSec: round(event.endSec, 3),
      risk: Math.round(event.risk || 0)
    }))
  };
}

function compactToneSurgery(surgery = null) {
  if (!surgery) return null;
  return {
    mode: surgery.mode || "",
    source: surgery.source || "",
    target: surgery.target || null,
    activeCount: Math.max(0, Number(surgery.activeCount || 0)),
    summary: surgery.summary || "",
    bands: (surgery.bands || []).slice(0, 6).map((band) => ({
      id: band.id,
      label: band.label,
      frequencyHz: round(band.frequencyHz, 1),
      q: round(band.q, 2),
      risk: Math.round(band.risk || 0),
      stageDb: round(band.stageDb, 2),
      dynamicDepthDb: round(band.dynamicDepthDb, 2),
      trigger: band.trigger,
      evidence: band.evidence,
      perceptual: band.perceptual ? {
        centerHz: round(band.perceptual.centerHz, 1),
        bark: round(band.perceptual.bark, 2),
        erbRate: round(band.perceptual.erbRate, 2),
        salience: round(band.perceptual.salience, 4),
        weight: round(band.perceptual.weight, 5)
      } : null,
      reason: band.reason
    }))
  };
}

function compactRoomShaper(room = null) {
  if (!room) return null;
  return {
    mode: room.mode || "",
    thresholdDb: round(room.thresholdDb, 1),
    rangeDb: round(room.rangeDb, 1),
    attackMs: round(room.attackMs, 1),
    holdMs: round(room.holdMs, 1),
    releaseMs: round(room.releaseMs, 1),
    minGainDb: round(room.minGainDb, 1),
    roomTonePolicy: room.roomTonePolicy || "",
    active: !!room.active,
    reason: room.reason || ""
  };
}

function compactReactivePlan(plan = null) {
  if (!plan) return null;
  return {
    mode: plan.mode || "",
    active: !!plan.active,
    levelRide: plan.levelRide ? {
      mode: plan.levelRide.mode || "",
      targetDb: round(plan.levelRide.targetDb, 1),
      rangeDb: round(plan.levelRide.rangeDb, 1),
      boostDb: round(plan.levelRide.boostDb, 1),
      cutDb: round(plan.levelRide.cutDb, 1),
      speedMs: round(plan.levelRide.speedMs, 1),
      attackMs: round(plan.levelRide.attackMs, 1),
      releaseMs: round(plan.levelRide.releaseMs, 1),
      noiseGateDb: round(plan.levelRide.noiseGateDb, 1),
      amount: Math.round(plan.levelRide.amount || 0),
      naturalMode: !!plan.levelRide.naturalMode
    } : null,
    eventLanes: plan.eventLanes ? {
      eventsPerMinute: Math.max(0, Number(plan.eventLanes.eventsPerMinute || 0)),
      microDensity: round(plan.eventLanes.microDensity, 3),
      mouth: round(plan.eventLanes.mouth, 1),
      plosive: round(plan.eventLanes.plosive, 1),
      sibilance: round(plan.eventLanes.sibilance, 1),
      adaptiveDeEss: round(plan.eventLanes.adaptiveDeEss, 1)
    } : null,
    notes: (plan.notes || []).slice(0, 4)
  };
}

function compactSpectral(spectral = null) {
  if (!spectral) return null;
  return {
    frameSize: spectral.frameSize || 0,
    frameCount: spectral.frameCount || 0,
    centroidHz: round(spectral.centroidHz, 1),
    rolloff85Hz: round(spectral.rolloff85Hz, 1),
    rolloff95Hz: round(spectral.rolloff95Hz, 1),
    flatness: round(spectral.flatness, 4),
    tiltDbPerOctave: round(spectral.tiltDbPerOctave, 2),
    risks: spectral.risks || null,
    bands: spectral.bands || null,
    peaks: (spectral.peaks || []).slice(0, 6),
    envelope: compactSpectralEnvelope(spectral.envelope),
    perceptual: compactPerceptualToneMap(spectral.perceptual),
    summary: spectral.summary || ""
  };
}

function compactSpectralEnvelope(envelope = null) {
  if (!envelope) return null;
  return {
    method: envelope.method || "",
    order: Math.max(0, Number(envelope.order || 0)),
    maxHz: round(envelope.maxHz, 1),
    error: round(envelope.error, 8),
    summary: envelope.summary || "",
    peaks: (envelope.peaks || []).slice(0, 6).map((peak) => ({
      hz: round(peak.hz, 1),
      db: round(peak.db, 2),
      prominenceDb: round(peak.prominenceDb, 2)
    }))
  };
}

function compactPerceptualToneMap(perceptual = null) {
  if (!perceptual) return null;
  return {
    method: perceptual.method || "",
    bandCount: Math.max(0, Number(perceptual.bandCount || 0)),
    maxHz: round(perceptual.maxHz, 1),
    weightedCenterHz: round(perceptual.weightedCenterHz, 1),
    lowWeight: round(perceptual.lowWeight, 4),
    speechWeight: round(perceptual.speechWeight, 4),
    presenceWeight: round(perceptual.presenceWeight, 4),
    airWeight: round(perceptual.airWeight, 4),
    adjacentContrastDb: round(perceptual.adjacentContrastDb, 2),
    crowding: perceptual.crowding ? {
      score: Math.round(perceptual.crowding.score || 0),
      risk: perceptual.crowding.risk || "",
      band: compactPerceptualBand(perceptual.crowding.band)
    } : null,
    summary: perceptual.summary || "",
    bands: (perceptual.bands || []).slice(0, 24).map(compactPerceptualBand)
  };
}

function compactPerceptualBand(band = null) {
  if (!band) return null;
  return {
    index: Math.max(0, Number(band.index || 0)),
    centerHz: round(band.centerHz, 1),
    lowHz: round(band.lowHz, 1),
    highHz: round(band.highHz, 1),
    bark: round(band.bark, 2),
    erbRate: round(band.erbRate, 2),
    db: round(band.db, 2),
    weight: round(band.weight, 5),
    salience: round(band.salience, 4)
  };
}

function compactRepairMap(map = null) {
  if (!map) return null;
  return {
    status: map.status || "",
    score: map.score || 0,
    target: map.target || null,
    topIssue: map.topIssue || null,
    nextAction: map.nextAction || null,
    steps: (map.steps || []).map((step) => ({
      order: step.order,
      id: step.id,
      label: step.label,
      status: step.status,
      risk: step.risk,
      value: step.value,
      action: step.action,
      why: step.why,
      overuseRisk: step.overuseRisk
    }))
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
