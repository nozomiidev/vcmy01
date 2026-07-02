import { buildPerformanceScript, compareScriptToPerformance } from "./performance-script.js";
import { analyzePerformanceTrace, comparePerformanceTraces } from "./performance-trace.js";
import { lineReadById, scoreLineReadTarget } from "./performance-targets.js";
import { renderReview } from "./render-review.js";

const DEFAULT_WEIGHTS = Object.freeze({
  target: 0.34,
  script: 0.34,
  safety: 0.26,
  variant: 0.06
});

export function rankRenderDeckTakes(deck = [], source = null, targetOrId = null, options = {}) {
  const takes = Array.isArray(deck) ? deck.filter((item) => item?.rendered) : [];
  if (!takes.length) {
    return {
      score: 0,
      status: "waiting",
      winnerId: null,
      winner: null,
      items: [],
      summary: "No takes"
    };
  }

  const target = resolveTarget(targetOrId);
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const items = takes.map((item, index) => scoreTake(item, index, source, target, weights, options))
    .sort((a, b) => b.score - a.score || a.deckIndex - b.deckIndex);
  const winner = items[0] || null;
  return {
    score: winner?.score || 0,
    status: winner ? decisionStatus(winner.score) : "waiting",
    winnerId: winner?.id || null,
    winner,
    items,
    summary: winner ? `Keeper: ${winner.label} at ${winner.score}%` : "No takes"
  };
}

function scoreTake(item, deckIndex, source, target, weights, options) {
  const rendered = item.rendered;
  const params = rendered.appliedParams || rendered.baseParams || {};
  const targetScore = scoreLineReadTarget(params, target);
  const review = item.review || renderReview(source, rendered);
  const safetyScore = Number.isFinite(review?.score) ? review.score : fallbackSafetyScore(rendered);
  const comparison = compareTakePerformance(source, rendered, options.traceOptions);
  const script = rendered.performanceScriptPlan || buildPerformanceScript(target, params);
  const scriptMatch = compareScriptToPerformance(script, comparison);
  const scriptScore = Number.isFinite(scriptMatch?.score) ? scriptMatch.score : Number(script?.score || 0);
  const variantScore = Number.isFinite(item.variant?.score) ? item.variant.score : 76;
  const score = clampScore(
    targetScore * weights.target +
    scriptScore * weights.script +
    safetyScore * weights.safety +
    variantScore * weights.variant
  );

  const label = item.variant?.label || item.title || `Take ${deckIndex + 1}`;
  const status = decisionStatus(score);
  const weakest = weakestEvidence([
    ["Target", targetScore],
    ["Script", scriptScore],
    ["Safety", safetyScore]
  ]);
  return {
    id: item.id,
    deckIndex,
    label,
    title: item.title || label,
    target: item.target || target.name,
    mode: item.mode || rendered.mode || "Render",
    variantLabel: item.variant?.label || null,
    score,
    status,
    weakest,
    params: { ...params },
    baseParams: { ...(rendered.baseParams || params) },
    review,
    comparison,
    scriptMatch,
    items: [
      evidenceItem("target", "Target", targetScore, `${target.name} macro/director fit.`),
      evidenceItem("script", "Script", scriptScore, scriptMatch?.plannedOnly ? "Planned script only." : "Rendered motion against the acting script."),
      evidenceItem("safety", "Safety", safetyScore, review ? "Clip, level, tone, and texture review." : "Fallback render-safety estimate."),
      evidenceItem("variant", "Variant", variantScore, item.variant?.intent || "Baseline take without a variant direction.")
    ]
  };
}

function compareTakePerformance(source, rendered, traceOptions) {
  if (!source?.samples?.length || !rendered?.samples?.length) return null;
  const sourceSamples = sourceSamplesForRenderedRegion(source, rendered);
  if (!sourceSamples.length) return null;
  const sourceTrace = analyzePerformanceTrace(sourceSamples, source.sampleRate || rendered.sampleRate, traceOptions);
  const renderedTrace = analyzePerformanceTrace(rendered.samples, rendered.sampleRate, traceOptions);
  return comparePerformanceTraces(sourceTrace, renderedTrace);
}

export function sourceSamplesForRenderedRegion(source, rendered) {
  const samples = source?.samples instanceof Float32Array
    ? source.samples
    : new Float32Array(source?.samples || []);
  if (!samples.length) return samples;
  const region = rendered?.region || null;
  if (!region || region.isFull) return samples;
  const sampleRate = source.sampleRate || rendered?.sampleRate || 48000;
  const start = Number.isFinite(region.startSample)
    ? Math.round(region.startSample)
    : Math.round(Number(region.startSec || 0) * sampleRate);
  const end = Number.isFinite(region.endSample)
    ? Math.round(region.endSample)
    : Math.round(Number(region.endSec ?? (Number(region.startSec || 0) + Number(region.durationSec || 0))) * sampleRate);
  const safeStart = Math.max(0, Math.min(samples.length, start));
  const safeEnd = Math.max(safeStart + 1, Math.min(samples.length, end));
  return samples.slice(safeStart, safeEnd);
}

function resolveTarget(targetOrId) {
  if (!targetOrId) return lineReadById("studio_check");
  return typeof targetOrId === "string" ? lineReadById(targetOrId) : targetOrId;
}

function evidenceItem(id, label, score, detail) {
  return {
    id,
    label,
    score: clampScore(score),
    status: decisionStatus(score),
    value: `${clampScore(score)}%`,
    detail
  };
}

function weakestEvidence(items) {
  return [...items].sort((a, b) => a[1] - b[1])[0]?.[0] || "Evidence";
}

function fallbackSafetyScore(rendered) {
  const analysis = rendered?.analysis || {};
  let score = 72;
  if (analysis.clipped) score -= 24;
  if (Number.isFinite(analysis.peakDb) && analysis.peakDb > -0.5) score -= 12;
  if (Number.isFinite(analysis.rmsDb) && (analysis.rmsDb > -8 || analysis.rmsDb < -40)) score -= 10;
  return clampScore(score);
}

function decisionStatus(score) {
  if (score >= 86) return "ready";
  if (score >= 70) return "check";
  return "risk";
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}
