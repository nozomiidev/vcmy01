import { DEFAULT_PARAMS } from "./presets.js";
import { lineReadById, sceneKitForTargetId, scoreLineReadTarget } from "./performance-targets.js";
import { snapshotParamPatch } from "./voice-memory.js";

export const PROJECT_VAULT_LIMITS = Object.freeze({
  maxProjects: 6,
  maxRenderDeckItems: 6,
  maxVoiceSnapshots: 8
});

const PROJECT_PARAM_KEYS = Object.freeze(Object.keys(DEFAULT_PARAMS).filter((key) => !key.startsWith("_")));

export function createProjectSnapshot(context = {}, options = {}) {
  const target = lineReadById(context.lineReadId);
  const params = normalizeProjectParams(context.params || {});
  const sceneSession = context.sceneSession || null;
  const sceneKit = sceneKitForTargetId(target.id);
  const renderDeck = sanitizeRenderDeck(context.renderDeck, options);
  const voiceSnapshots = sanitizeVoiceSnapshotRefs(context.voiceSnapshots);
  const source = sanitizeSource(context.source, options);
  const sourceTimeline = sanitizeSourceTimeline(context.sourceTimeline);
  const activeSourceCueId = cleanText(context.activeSourceCueId || sourceTimeline?.activeCueId || "", 80);
  const offlineRegion = sanitizeRegion(context.offlineRegion);
  const createdAt = Number(options.createdAt || Date.now());
  const updatedAt = Number(options.updatedAt || createdAt);
  const score = projectEvidenceScore({
    params,
    target,
    sceneSession,
    renderDeck,
    voiceSnapshots,
    source,
    takeDecision: context.takeDecision
  });
  const title = cleanText(options.title, 80) || projectTitle(sceneSession, target, source);
  const project = {
    id: options.id || `project-${updatedAt.toString(36)}-${hashFingerprint(projectFingerprintBody(params, target.id, renderDeck, voiceSnapshots)).slice(0, 6)}`,
    title,
    createdAt,
    updatedAt,
    presetId: cleanText(context.presetId || target.presetId || "clean", 48),
    presetName: cleanText(context.presetName || "", 80),
    lineReadId: target.id,
    targetName: target.name,
    targetLine: target.line,
    sceneKitId: sceneSession?.kitId || sceneKit?.id || target.sceneKitId || null,
    sceneKitName: sceneSession?.kitName || sceneKit?.name || target.sceneName || "",
    params,
    source,
    voiceSnapshots,
    renderDeck,
    activeRenderId: cleanText(context.activeRenderId || "", 96),
    activeSourceCueId,
    offlineRegion,
    sourceTimeline,
    sceneSession: sanitizeSceneSession(sceneSession),
    takeDecision: sanitizeTakeDecision(context.takeDecision),
    routes: sanitizeRoutes(context.routes),
    score,
    status: projectStatus(score, renderDeck.length, source.hasAudio),
    fingerprint: projectFingerprintBody(params, target.id, renderDeck, voiceSnapshots, activeSourceCueId, offlineRegion)
  };
  return project;
}

export function addProjectSnapshot(projects = [], project, limits = PROJECT_VAULT_LIMITS) {
  if (!project?.params) return sanitizeProjectSnapshots(projects, limits);
  const incoming = sanitizeProjectSnapshot(project);
  const maxProjects = Math.max(1, Number(limits.maxProjects || PROJECT_VAULT_LIMITS.maxProjects));
  const deduped = sanitizeProjectSnapshots(projects, { ...limits, maxProjects: maxProjects + 1 })
    .filter((item) => item.id !== incoming.id && item.fingerprint !== incoming.fingerprint);
  return [incoming, ...deduped]
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, maxProjects);
}

export function sanitizeProjectSnapshots(projects = [], limits = PROJECT_VAULT_LIMITS) {
  const maxProjects = Math.max(1, Number(limits.maxProjects || PROJECT_VAULT_LIMITS.maxProjects));
  return (Array.isArray(projects) ? projects : [])
    .map(sanitizeProjectSnapshot)
    .filter(Boolean)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, maxProjects);
}

export function buildProjectVault(projects = [], context = {}, options = {}) {
  const current = createProjectSnapshot(context, {
    id: "current-project-context",
    createdAt: 1,
    updatedAt: 1,
    title: "Current Project",
    includeAudio: false
  });
  const cleanProjects = sanitizeProjectSnapshots(projects, options.limits || PROJECT_VAULT_LIMITS);
  const items = cleanProjects
    .map((project) => scoreProject(project, current))
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
  const best = items[0] || null;
  const savedCurrent = items.some((item) => item.fingerprint === current.fingerprint);
  const captureReady = shouldCaptureCurrent(current, context, savedCurrent, options);
  const restoreReady = !!best && !savedCurrent && best.score >= 68 && (best.sameTarget || best.sameScene || best.hasAudio);
  const score = items.length
    ? Math.round(Math.max(current.score, (best?.score || 0) * 0.64 + current.score * 0.36))
    : current.score;
  const nextAction = restoreReady
    ? { id: "apply-project", label: "Restore Project", projectId: best.id }
    : captureReady
      ? { id: "capture-project", label: "Save Project" }
      : null;
  return {
    score,
    status: vaultStatus(score, items, savedCurrent),
    count: cleanProjects.length,
    current,
    savedCurrent,
    items,
    best,
    nextAction,
    summary: cleanProjects.length
      ? best
        ? `Best project: ${best.title}`
        : `${cleanProjects.length} projects`
      : "No saved projects"
  };
}

export function projectParamPatch(currentParams = {}, projectParams = {}, options = {}) {
  return snapshotParamPatch(currentParams, projectParams, options);
}

function sanitizeProjectSnapshot(project) {
  if (!project?.params) return null;
  const target = lineReadById(project.lineReadId);
  const params = normalizeProjectParams(project.params);
  const renderDeck = sanitizeRenderDeck(project.renderDeck || [], { includeAudio: true });
  const voiceSnapshots = sanitizeVoiceSnapshotRefs(project.voiceSnapshots || []);
  const source = sanitizeSource(project.source, { includeAudio: true });
  const score = Number.isFinite(project.score)
    ? clampScore(project.score)
    : projectEvidenceScore({
      params,
      target,
      sceneSession: project.sceneSession,
      renderDeck,
      voiceSnapshots,
      source,
      takeDecision: project.takeDecision
    });
  return {
    id: cleanText(project.id || `project-${Number(project.updatedAt || Date.now()).toString(36)}`, 96),
    title: cleanText(project.title || projectTitle(project.sceneSession, target, source), 80),
    createdAt: Number(project.createdAt || Date.now()),
    updatedAt: Number(project.updatedAt || project.createdAt || Date.now()),
    presetId: cleanText(project.presetId || target.presetId || "clean", 48),
    presetName: cleanText(project.presetName || "", 80),
    lineReadId: target.id,
    targetName: cleanText(project.targetName || target.name, 80),
    targetLine: cleanText(project.targetLine || target.line, 160),
    sceneKitId: project.sceneKitId ? cleanText(project.sceneKitId, 80) : null,
    sceneKitName: cleanText(project.sceneKitName || "", 80),
    params,
    source,
    voiceSnapshots,
    renderDeck,
    activeRenderId: cleanText(project.activeRenderId || "", 96),
    activeSourceCueId: cleanText(project.activeSourceCueId || project.sourceTimeline?.activeCueId || "", 80),
    offlineRegion: sanitizeRegion(project.offlineRegion),
    sourceTimeline: sanitizeSourceTimeline(project.sourceTimeline),
    sceneSession: sanitizeSceneSession(project.sceneSession),
    takeDecision: sanitizeTakeDecision(project.takeDecision),
    routes: sanitizeRoutes(project.routes),
    score,
    status: project.status || projectStatus(score, renderDeck.length, source.hasAudio),
    fingerprint: project.fingerprint || projectFingerprintBody(
      params,
      target.id,
      renderDeck,
      voiceSnapshots,
      project.activeSourceCueId || project.sourceTimeline?.activeCueId || "",
      project.offlineRegion
    )
  };
}

function scoreProject(project, current) {
  const sameTarget = project.lineReadId === current.lineReadId;
  const sameScene = !!project.sceneKitId && project.sceneKitId === current.sceneKitId;
  const patch = projectParamPatch(current.params, project.params, { limit: 8 });
  const deckScore = Math.min(100, Number(project.renderDeck?.length || 0) * 18 + Number(project.takeDecision?.score || 0) * 0.42);
  const sourceScore = project.source?.hasAudio ? 100 : project.source?.name ? 62 : 20;
  const sceneScore = Number(project.sceneSession?.score || 0);
  const relevance = sameTarget ? 100 : sameScene ? 84 : 58;
  const patchScore = patch.length ? Math.min(100, 56 + patch.length * 8) : sameTarget ? 82 : 50;
  const score = Math.round(
    project.score * 0.34 +
    relevance * 0.22 +
    deckScore * 0.18 +
    sourceScore * 0.12 +
    sceneScore * 0.08 +
    patchScore * 0.06
  );
  return {
    ...project,
    sameTarget,
    sameScene,
    patch,
    hasAudio: !!project.source?.hasAudio || project.renderDeck?.some((item) => item.rendered?.hasAudio),
    renderDeckCount: project.renderDeck?.length || 0,
    voiceSnapshotCount: project.voiceSnapshots?.length || 0,
    relevance,
    score: clampScore(score),
    status: projectStatus(score, project.renderDeck?.length || 0, !!project.source?.hasAudio),
    summary: `${project.renderDeck?.length || 0} takes / ${project.voiceSnapshots?.length || 0} designs`
  };
}

function sanitizeSource(source = null, options = {}) {
  if (!source) {
    return {
      name: "",
      sourceProfileId: "",
      sampleRate: 0,
      durationSec: 0,
      analysis: null,
      hasAudio: false
    };
  }
  const sampleRate = Math.max(0, Number(source.sampleRate || 0));
  const samples = source.samples instanceof Float32Array ? source.samples : null;
  const includeAudio = options.includeAudio !== false;
  const durationSec = samples ? samples.length / Math.max(1, sampleRate) : Number(source.analysis?.duration || source.durationSec || 0);
  return {
    name: cleanText(source.name || "Source", 120),
    sourceProfileId: cleanText(source.sourceProfileId || "", 80),
    sampleRate,
    durationSec: Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0,
    analysis: sanitizeAnalysis(source.analysis),
    studioAnalysis: sanitizeStudioAnalysis(source.studioAnalysis),
    hasAudio: includeAudio && !!(samples && source.blob),
    samples: includeAudio ? samples : null,
    blob: includeAudio ? source.blob || null : null
  };
}

function sanitizeRenderDeck(deck = [], options = {}) {
  const includeAudio = options.includeAudio !== false;
  const maxItems = Math.max(1, Number(options.maxRenderDeckItems || PROJECT_VAULT_LIMITS.maxRenderDeckItems));
  return (Array.isArray(deck) ? deck : []).slice(0, maxItems).map((item) => {
    const rendered = item?.rendered || null;
    const samples = rendered?.samples instanceof Float32Array ? rendered.samples : null;
    return {
      id: cleanText(item?.id || "", 96),
      title: cleanText(item?.title || "Render", 120),
      target: cleanText(item?.target || "", 80),
      targetId: cleanText(item?.targetId || rendered?.lineReadId || "", 96),
      sceneKitId: item?.sceneKitId ? cleanText(item.sceneKitId, 96) : null,
      sceneBeatId: item?.sceneBeatId ? cleanText(item.sceneBeatId, 96) : null,
      mode: cleanText(item?.mode || rendered?.mode || "Render", 80),
      route: item?.route ? cleanText(item.route, 100) : null,
      variant: sanitizeBadge(item?.variant || rendered?.auditionVariant),
      stackAudition: sanitizeBadge(item?.stackAudition || rendered?.stackAudition),
      review: sanitizeReview(item?.review),
      rendered: rendered ? {
        name: cleanText(rendered.name || "VoiceForge render.wav", 160),
        sampleRate: Number(rendered.sampleRate || 0),
        analysis: sanitizeAnalysis(rendered.analysis),
        studioAnalysis: sanitizeStudioAnalysis(rendered.studioAnalysis),
        region: sanitizeRegion(rendered.region),
        mode: cleanText(rendered.mode || "preview", 32),
        stage: cleanText(rendered.stage || "character", 32),
        studioPolish: sanitizeStudioPolish(rendered.studioPolish),
        autoCalibrated: !!rendered.autoCalibrated,
        scriptAutomated: !!rendered.scriptAutomated,
        performanceScript: rendered.performanceScript || null,
        performanceScriptPlan: rendered.performanceScriptPlan || null,
        scriptAutomation: rendered.scriptAutomation || null,
        scriptAutomationSummary: rendered.scriptAutomationSummary || null,
        baseParams: normalizeProjectParams(rendered.baseParams || {}),
        appliedParams: normalizeProjectParams(rendered.appliedParams || {}),
        calibrationDelta: Array.isArray(rendered.calibrationDelta) ? rendered.calibrationDelta.slice(0, 12) : [],
        lineReadId: cleanText(rendered.lineReadId || item?.targetId || "", 96),
        sceneKitId: rendered.sceneKitId ? cleanText(rendered.sceneKitId, 96) : null,
        sceneBeatId: rendered.sceneBeatId ? cleanText(rendered.sceneBeatId, 96) : null,
        hasAudio: includeAudio && !!(samples && rendered.blob),
        samples: includeAudio ? samples : null,
        blob: includeAudio ? rendered.blob || null : null,
        auditionVariant: sanitizeBadge(rendered.auditionVariant),
        stackAudition: sanitizeBadge(rendered.stackAudition)
      } : null
    };
  });
}

function sanitizeVoiceSnapshotRefs(snapshots = []) {
  return (Array.isArray(snapshots) ? snapshots : [])
    .slice(0, PROJECT_VAULT_LIMITS.maxVoiceSnapshots)
    .map((snapshot) => ({
      id: cleanText(snapshot?.id || "", 96),
      title: cleanText(snapshot?.title || snapshot?.targetName || "Voice design", 100),
      lineReadId: cleanText(snapshot?.lineReadId || "", 96),
      targetName: cleanText(snapshot?.targetName || "", 80),
      presetId: cleanText(snapshot?.presetId || "", 48),
      createdAt: Number(snapshot?.createdAt || 0),
      evidence: snapshot?.evidence || null
    }))
    .filter((snapshot) => snapshot.id || snapshot.title);
}

function sanitizeSceneSession(session = null) {
  if (!session) return null;
  return {
    kitId: cleanText(session.kitId || "", 80),
    kitName: cleanText(session.kitName || "", 100),
    activeTargetId: cleanText(session.activeTargetId || "", 96),
    count: Math.max(0, Number(session.count || 0)),
    readyCount: Math.max(0, Number(session.readyCount || 0)),
    score: clampScore(session.score),
    status: cleanText(session.status || "waiting", 24),
    summary: cleanText(session.summary || "", 160),
    activeBeat: session.activeBeat ? {
      label: cleanText(session.activeBeat.label || "", 100),
      nextNeed: cleanText(session.activeBeat.nextNeed || "", 80),
      score: clampScore(session.activeBeat.score)
    } : null,
    nextAction: session.nextAction ? {
      id: cleanText(session.nextAction.id || "", 80),
      label: cleanText(session.nextAction.label || "", 100),
      targetId: cleanText(session.nextAction.targetId || "", 96),
      detail: cleanText(session.nextAction.detail || "", 180)
    } : null
  };
}

function sanitizeSourceTimeline(timeline = null) {
  if (!timeline) return null;
  return {
    cueCount: Math.max(0, Number(timeline.cueCount || 0)),
    score: clampScore(timeline.score),
    status: cleanText(timeline.status || "waiting", 24),
    summary: cleanText(timeline.summary || "", 160),
    activeCueId: cleanText(timeline.activeCue?.id || timeline.activeCueId || "", 80),
    cues: (Array.isArray(timeline.cues) ? timeline.cues : []).slice(0, 10).map((cue) => ({
      id: cleanText(cue.id || "", 80),
      label: cleanText(cue.label || "", 100),
      role: cleanText(cue.role || "", 80),
      startSec: Math.max(0, Number(cue.startSec || 0)),
      endSec: Math.max(0, Number(cue.endSec || 0)),
      durationSec: Math.max(0, Number(cue.durationSec || 0)),
      score: clampScore(cue.score),
      status: cleanText(cue.status || "check", 24)
    }))
  };
}

function sanitizeTakeDecision(decision = null) {
  if (!decision) return null;
  return {
    status: cleanText(decision.status || "waiting", 24),
    score: clampScore(decision.score),
    winnerId: cleanText(decision.winnerId || "", 96),
    winner: decision.winner ? {
      label: cleanText(decision.winner.label || "", 100),
      weakest: cleanText(decision.winner.weakest || "", 80),
      score: clampScore(decision.winner.score)
    } : null,
    count: Array.isArray(decision.items) ? decision.items.length : 0
  };
}

function sanitizeRoutes(routes = []) {
  return (Array.isArray(routes) ? routes : []).slice(0, 4).map((route) => ({
    id: cleanText(route?.id || "", 96),
    presetId: cleanText(route?.presetId || "", 48),
    targetId: cleanText(route?.targetId || "", 96),
    presetName: cleanText(route?.presetName || "", 80),
    targetName: cleanText(route?.targetName || "", 80),
    status: cleanText(route?.status || "", 24),
    score: clampScore(route?.score)
  }));
}

function sanitizeRegion(region = null) {
  if (!region) return null;
  return {
    startSample: Math.max(0, Number(region.startSample || 0)),
    endSample: Math.max(0, Number(region.endSample || 0)),
    startSec: Math.max(0, Number(region.startSec || 0)),
    endSec: Math.max(0, Number(region.endSec || 0)),
    durationSec: Math.max(0, Number(region.durationSec || 0)),
    isFull: !!region.isFull
  };
}

function sanitizeReview(review = null) {
  if (!review) return null;
  return {
    score: clampScore(review.score),
    status: cleanText(review.status || "check", 24),
    items: Array.isArray(review.items) ? review.items.slice(0, 6).map((item) => ({
      id: cleanText(item.id || "", 48),
      label: cleanText(item.label || "", 80),
      value: cleanText(item.value || "", 80),
      detail: cleanText(item.detail || "", 160)
    })) : []
  };
}

function sanitizeBadge(badge = null) {
  if (!badge) return null;
  return {
    id: cleanText(badge.id || "", 80),
    label: cleanText(badge.label || "", 100),
    intent: cleanText(badge.intent || badge.focus || "", 160),
    score: clampScore(badge.score),
    status: cleanText(badge.status || "check", 24),
    type: badge.type ? cleanText(badge.type, 48) : null,
    stageId: badge.stageId ? cleanText(badge.stageId, 48) : null
  };
}

function sanitizeAnalysis(analysis = null) {
  if (!analysis) return null;
  return {
    duration: finiteNumber(analysis.duration),
    rmsDb: finiteNumber(analysis.rmsDb),
    peakDb: finiteNumber(analysis.peakDb),
    pitchMedianHz: finiteNumber(analysis.pitchMedianHz),
    zeroCrossingsPerSecond: finiteNumber(analysis.zeroCrossingsPerSecond),
    brightnessRatio: finiteNumber(analysis.brightnessRatio),
    range: cleanText(analysis.range || "", 32),
    clipped: !!analysis.clipped,
    tooQuiet: !!analysis.tooQuiet,
    tooHot: !!analysis.tooHot,
    bright: !!analysis.bright,
    dark: !!analysis.dark,
    breathyOrNoisy: !!analysis.breathyOrNoisy
  };
}

function sanitizeStudioAnalysis(analysis = null) {
  if (!analysis) return null;
  return {
    ...sanitizeAnalysis(analysis),
    status: cleanText(analysis.status || "", 32),
    score: clampScore(analysis.score),
    noiseFloorDb: finiteNumber(analysis.noiseFloorDb),
    headroomDb: finiteNumber(analysis.headroomDb),
    loudnessProxyDb: finiteNumber(analysis.loudnessProxyDb),
    dynamicRangeDb: finiteNumber(analysis.dynamicRangeDb),
    problemScores: sanitizeProblemScores(analysis.problemScores),
    repairMap: sanitizeRepairMap(analysis.repairMap)
  };
}

function sanitizeStudioPolish(polish = null) {
  if (!polish) return null;
  return {
    enabled: !!polish.enabled,
    intensity: cleanText(polish.intensity || "off", 32),
    target: polish.target ? {
      id: cleanText(polish.target.id || "", 48),
      label: cleanText(polish.target.label || "", 80)
    } : null,
    optimized: !!polish.optimized,
    label: cleanText(polish.label || "", 80),
    plan: polish.plan ? {
      id: cleanText(polish.plan.id || "", 80),
      intensity: cleanText(polish.plan.intensity || "", 32),
      label: cleanText(polish.plan.label || "", 80),
      target: polish.plan.target ? {
        id: cleanText(polish.plan.target.id || "", 48),
        label: cleanText(polish.plan.target.label || "", 80)
      } : null,
      targetRmsDb: finiteNumber(polish.plan.targetRmsDb),
      stages: sanitizeProblemScores(polish.plan.stages),
      repairMap: sanitizeRepairMap(polish.plan.repairMap),
      optimization: polish.plan.optimization ? {
        enabled: !!polish.plan.optimization.enabled,
        algorithm: cleanText(polish.plan.optimization.algorithm || "", 80),
        iterations: finiteNumber(polish.plan.optimization.iterations),
        accepted: finiteNumber(polish.plan.optimization.accepted),
        scoreBefore: finiteNumber(polish.plan.optimization.scoreBefore),
        scoreAfter: finiteNumber(polish.plan.optimization.scoreAfter),
        objective: sanitizeProblemScores(polish.plan.optimization.objective),
        target: polish.plan.optimization.target ? {
          id: cleanText(polish.plan.optimization.target.id || "", 48),
          label: cleanText(polish.plan.optimization.target.label || "", 80)
        } : null
      } : null,
      notes: Array.isArray(polish.plan.notes) ? polish.plan.notes.slice(0, 8).map((note) => cleanText(note, 120)) : []
    } : null,
    inputAnalysis: sanitizeStudioAnalysis(polish.inputAnalysis),
    outputAnalysis: sanitizeStudioAnalysis(polish.outputAnalysis)
  };
}

function sanitizeRepairMap(map = null) {
  if (!map) return null;
  return {
    status: cleanText(map.status || "", 32),
    score: clampScore(map.score),
    target: map.target ? {
      id: cleanText(map.target.id || "", 48),
      label: cleanText(map.target.label || "", 80)
    } : null,
    topIssue: map.topIssue ? {
      id: cleanText(map.topIssue.id || "", 48),
      label: cleanText(map.topIssue.label || "", 80),
      status: cleanText(map.topIssue.status || "", 32),
      risk: clampScore(map.topIssue.risk)
    } : null,
    nextAction: map.nextAction ? {
      id: cleanText(map.nextAction.id || "", 48),
      label: cleanText(map.nextAction.label || "", 80),
      action: cleanText(map.nextAction.action || "", 120)
    } : null,
    steps: (Array.isArray(map.steps) ? map.steps : []).slice(0, 10).map((step) => ({
      order: Math.max(0, Number(step.order || 0)),
      id: cleanText(step.id || "", 48),
      label: cleanText(step.label || "", 80),
      status: cleanText(step.status || "", 32),
      risk: clampScore(step.risk),
      score: clampScore(step.score),
      value: cleanText(step.value || "", 80),
      action: cleanText(step.action || "", 120),
      why: cleanText(step.why || "", 180),
      overuseRisk: cleanText(step.overuseRisk || "", 180)
    })),
    overprocessRisks: (Array.isArray(map.overprocessRisks) ? map.overprocessRisks : []).slice(0, 6).map((item) => ({
      id: cleanText(item.id || "", 48),
      label: cleanText(item.label || "", 80),
      risk: cleanText(item.risk || "", 180)
    }))
  };
}

function sanitizeProblemScores(scores = null) {
  if (!scores || typeof scores !== "object") return null;
  const out = {};
  for (const [key, value] of Object.entries(scores).slice(0, 32)) out[cleanText(key, 48)] = finiteNumber(value);
  return out;
}

function normalizeProjectParams(params = {}) {
  const out = {};
  for (const key of PROJECT_PARAM_KEYS) {
    const value = Number(params[key] ?? DEFAULT_PARAMS[key] ?? 0);
    out[key] = roundParam(key, value);
  }
  if (params._sourceCalibration) out._sourceCalibration = String(params._sourceCalibration);
  return out;
}

function projectEvidenceScore(context) {
  const targetScore = scoreLineReadTarget(context.params, context.target);
  const sceneScore = Number(context.sceneSession?.score || 0);
  const deckCount = context.renderDeck.length;
  const deckReviewScore = average(context.renderDeck.map((item) => item.review?.score).filter(Number.isFinite), deckCount ? 72 : 0);
  const takeScore = Number(context.takeDecision?.score || 0);
  const memoryScore = Math.min(100, context.voiceSnapshots.length * 18 + 48);
  const sourceScore = context.source.hasAudio ? 100 : context.source.name ? 58 : 0;
  return clampScore(Math.round(
    targetScore * 0.28 +
    Math.max(sceneScore, targetScore) * 0.18 +
    Math.max(deckReviewScore, takeScore) * 0.26 +
    memoryScore * 0.14 +
    sourceScore * 0.14
  ));
}

function shouldCaptureCurrent(current, context, savedCurrent, options) {
  if (savedCurrent) return false;
  if (options.allowManualCapture) return true;
  const hasSource = !!context.source?.samples?.length || !!context.source?.name;
  const hasRenderDeck = Array.isArray(context.renderDeck) && context.renderDeck.length > 0;
  const hasDesignMemory = Array.isArray(context.voiceSnapshots) && context.voiceSnapshots.length > 0;
  const hasSceneProgress = Number(context.sceneSession?.readyCount || 0) > 0;
  const hasDecision = !!context.takeDecision?.winnerId;
  return hasSource && (hasRenderDeck || hasDesignMemory || hasSceneProgress || hasDecision);
}

function projectStatus(score, renderDeckCount, hasAudio) {
  if (score >= 86 && renderDeckCount && hasAudio) return "ready";
  if (score >= 66) return "check";
  return "risk";
}

function vaultStatus(score, items, savedCurrent) {
  if (!items.length) return "empty";
  if (savedCurrent && score >= 80) return "ready";
  if (score >= 68) return "check";
  return "risk";
}

function projectTitle(sceneSession, target, source) {
  const scene = sceneSession?.kitName || target.sceneName || target.name || "Voice Project";
  const sourceName = source?.name ? ` / ${source.name}` : "";
  return `${scene}${sourceName}`;
}

function projectFingerprintBody(params, lineReadId, renderDeck, voiceSnapshots, activeSourceCueId = "", offlineRegion = null) {
  const paramsBody = PROJECT_PARAM_KEYS.map((key) => `${key}:${roundParam(key, Number(params[key] ?? DEFAULT_PARAMS[key] ?? 0))}`).join("|");
  const deckBody = renderDeck.map((item) => `${item.targetId || item.target}:${item.mode}:${item.review?.score || 0}`).join("|");
  const memoryBody = voiceSnapshots.map((item) => item.id).join("|");
  return `${lineReadId}|${paramsBody}|deck:${deckBody}|memory:${memoryBody}|cue:${cleanText(activeSourceCueId, 80)}|region:${regionFingerprint(offlineRegion)}`;
}

function regionFingerprint(region = null) {
  if (!region) return "none";
  const start = Number(region.startSec || 0).toFixed(2);
  const duration = Number(region.durationSec || 0).toFixed(2);
  return `${start}+${duration}`;
}

function roundParam(key, value) {
  if (key === "pitch" || key === "formant" || key === "inputGain" || key === "outputGain" || key === "limiter") {
    return Math.round(value * 4) / 4;
  }
  return Math.round(value);
}

function average(values, fallback = 0) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(Number(value)) ? Number(value) : 0)));
}

function hashFingerprint(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
