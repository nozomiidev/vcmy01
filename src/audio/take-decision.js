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

const QC_SCORE_CAPS = Object.freeze({
  ready: 100,
  check: 84,
  risk: 68
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
  const winner = items.find((item) => item.keeperEligible) || null;
  const candidate = winner || items[0] || null;
  return {
    score: candidate?.score || 0,
    status: winner ? decisionStatus(winner.score) : "risk",
    winnerId: winner?.id || null,
    winner,
    candidateId: candidate?.id || null,
    candidate,
    items,
    summary: winner
      ? `Keeper: ${winner.label} at ${winner.score}%`
      : candidate
        ? `QC hold: ${candidate.label} needs ${candidate.qc?.summary || "review"}`
        : "No takes"
  };
}

function scoreTake(item, deckIndex, source, target, weights, options) {
  const rendered = item.rendered;
  const params = rendered.appliedParams || rendered.baseParams || {};
  const targetScore = scoreLineReadTarget(params, target);
  const review = item.review || renderReview(source, rendered);
  const safetyScore = Number.isFinite(review?.score) ? review.score : fallbackSafetyScore(rendered);
  const qc = takeQualityGate(review, rendered, safetyScore);
  const comparison = compareTakePerformance(source, rendered, options.traceOptions);
  const script = rendered.performanceScriptPlan || buildPerformanceScript(target, params);
  const scriptMatch = compareScriptToPerformance(script, comparison);
  const scriptScore = Number.isFinite(scriptMatch?.score) ? scriptMatch.score : Number(script?.score || 0);
  const audition = item.variant || item.stackAudition || null;
  const variantScore = Number.isFinite(audition?.score) ? audition.score : 76;
  const weightedScore = clampScore(
    targetScore * weights.target +
    scriptScore * weights.script +
    safetyScore * weights.safety +
    variantScore * weights.variant
  );
  const score = Math.min(weightedScore, QC_SCORE_CAPS[qc.status] ?? QC_SCORE_CAPS.risk);

  const label = audition?.label || item.title || `Take ${deckIndex + 1}`;
  const status = decisionStatus(score);
  const weakest = weakestEvidence([
    ["Target", targetScore],
    ["Script", scriptScore],
    ["Safety", safetyScore],
    ["QC Gate", qc.score]
  ]);
  return {
    id: item.id,
    deckIndex,
    label,
    title: item.title || label,
    target: item.target || target.name,
    mode: item.mode || rendered.mode || "Render",
    variantLabel: audition?.label || null,
    score,
    status,
    keeperEligible: qc.status !== "risk",
    weakest,
    qc,
    params: { ...params },
    baseParams: { ...(rendered.baseParams || params) },
    review,
    comparison,
    scriptMatch,
    items: [
      evidenceItem("target", "Target", targetScore, `${target.name} macro/director fit.`),
      evidenceItem("script", "Script", scriptScore, scriptMatch?.plannedOnly ? "Planned script only." : "Rendered motion against the acting script."),
      evidenceItem("safety", "Safety", safetyScore, review ? "Clip, level, tone, and texture review." : "Fallback render-safety estimate."),
      evidenceItem("qc", "QC Gate", qc.score, qc.detail),
      evidenceItem(
        "variant",
        item.stackAudition ? "Layer" : "Variant",
        variantScore,
        audition?.intent || "Baseline take without a variant direction."
      )
    ]
  };
}

function takeQualityGate(review = null, rendered = null, safetyScore = 0) {
  const blockers = [];
  const checks = [];
  const analysis = rendered?.analysis || {};
  if (review?.status === "risk") blockers.push("render");
  if (review?.comfort?.status === "risk") blockers.push("comfort");
  if (review?.performanceBudget?.status === "risk") blockers.push("speed");
  if (analysis.clipped) blockers.push("clipping");
  if (Number.isFinite(analysis.truePeakDb) && analysis.truePeakDb > -0.8) blockers.push("true-peak");
  if (Number.isFinite(analysis.peakDb) && analysis.peakDb > -0.25) blockers.push("peak");
  if (!Number.isFinite(analysis.duration) || analysis.duration < 0.08) blockers.push("empty");

  if (review?.status === "check") checks.push("render");
  if (review?.comfort?.status === "check") checks.push("comfort");
  if (review?.performanceBudget?.status === "check") checks.push("speed");
  if (Number.isFinite(safetyScore) && safetyScore < 76) checks.push("safety");

  const status = blockers.length ? "risk" : checks.length ? "check" : "ready";
  const penalty = blockers.length * 18 + checks.length * 5;
  const score = clampScore((Number.isFinite(safetyScore) ? safetyScore : 72) - penalty);
  const summary = status === "risk"
    ? `${blockers.slice(0, 2).join(" + ")} QC`
    : status === "check"
      ? `${checks.slice(0, 2).join(" + ")} check`
      : "QC clear";
  return {
    status,
    score,
    blockers,
    checks,
    summary,
    detail: status === "risk"
      ? `Not keeper-eligible until ${blockers.join(", ")} is repaired.`
      : status === "check"
        ? `Keeper candidate, but ${checks.join(", ")} should be checked before export.`
        : "Delivery QC is clear enough for keeper comparison."
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
