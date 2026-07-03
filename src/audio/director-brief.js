export function buildDirectorBrief({
  hasSource = false,
  source = null,
  rendered = null,
  plan = null,
  review = null,
  takeDecision = null,
  keeperRefinement = null,
  sourceTimeline = null,
  productionTarget = null
} = {}) {
  const action = plan?.nextAction || null;
  const cards = [];
  if (!hasSource) {
    return brief({
      status: "risk",
      headline: "Start with a source voice",
      summary: "Load, upload, or generate speech before the studio can judge cleanup, character fit, or export QC.",
      action: action || { id: "load-source", label: "Generate Target Source" },
      cards: [
        briefCard("source", "Source", "Missing", "Import or generate speech first.", "risk"),
        briefCard("workflow", "Workflow", "Blocked", "Analysis, polish, character, and export are waiting.", "waiting")
      ]
    });
  }

  const sourceLabel = source?.name || "Source loaded";
  const sourceScore = source?.studioAnalysis?.score;
  cards.push(briefCard(
    "source",
    "Source",
    Number.isFinite(sourceScore) ? `${Math.round(sourceScore)}%` : "Loaded",
    sourceTimeline?.activeCue
      ? `${sourceLabel}; active cue ${sourceTimeline.activeCue.label}.`
      : sourceLabel,
    statusFromScore(sourceScore, "ready")
  ));

  const polishLabel = rendered?.studioPolish?.enabled
    ? `${rendered.studioPolish.intensity || "polish"}${rendered.studioPolish.optimized ? "+dir" : ""}`
    : source?.studioAnalysis?.status || "Pending";
  cards.push(briefCard(
    "polish",
    "Polish",
    polishLabel,
    rendered?.studioPolish?.plan?.repairMap?.topIssue
      ? `${rendered.studioPolish.plan.repairMap.topIssue.label} is the top repair evidence.`
      : source?.studioAnalysis?.repairMap?.topIssue
        ? `${source.studioAnalysis.repairMap.topIssue.label} should be checked before character work.`
        : "Studio polish evidence is ready for review.",
    rendered?.studioPolish?.enabled ? "ready" : source?.studioAnalysis?.status === "repair" ? "risk" : "check"
  ));

  if (review?.comfort) {
    cards.push(briefCard(
      "comfort",
      "Comfort",
      `${Math.round(review.comfort.score)}%`,
      review.comfort.detail || "Listening comfort has been scored.",
      review.comfort.status
    ));
  } else {
    cards.push(briefCard(
      "comfort",
      "Comfort",
      "No render",
      "Render a preview so loudness, micro-events, tone, and peak headroom can be judged.",
      "waiting"
    ));
  }

  const decisionCandidate = takeDecision?.winner || takeDecision?.candidate || null;
  const qcHold = !takeDecision?.winner && !!takeDecision?.candidate && takeDecision?.status === "risk";
  const patchCount = keeperRefinement?.patch?.length || 0;
  if (qcHold) {
    const blockers = takeDecision.candidate?.qc?.blockers || [];
    cards.push(briefCard(
      "take",
      "Take",
      "QC Hold",
      blockers.length ? `Blocked by ${blockers.join(", ")}.` : "Candidate needs repair before keeper lock.",
      "risk"
    ));
    return brief({
      status: "risk",
      headline: patchCount ? "Repair the QC-held take first" : "Preview the repaired QC take",
      summary: patchCount
        ? `${decisionCandidate.label || "Candidate"} has ${patchCount} targeted repair moves. Do not save it as a reusable keeper yet.`
        : "The repair patch is already applied; the old render-deck evidence is stale until a fresh preview is heard.",
      action: action || {
        id: patchCount ? "keeper-refine" : "preview-region",
        label: patchCount ? "Fix QC Take" : "Preview QC Fix"
      },
      cards
    });
  }

  if (review?.comfort?.status === "risk") {
    return brief({
      status: "risk",
      headline: "Listening comfort is blocking approval",
      summary: review.comfort.issues?.length
        ? `Top issue: ${review.comfort.issues[0].id}. Repair comfort before chasing more character exaggeration.`
        : "Repair loudness, harshness, mouth events, or dynamics before preserving this take.",
      action: action || { id: "stack-fix", label: "Fix Comfort" },
      cards
    });
  }

  if (takeDecision?.winner) {
    cards.push(briefCard(
      "take",
      "Take",
      `${Math.round(takeDecision.winner.score || takeDecision.score || 0)}%`,
      `Keeper: ${takeDecision.winner.label || "Take"}; weakest evidence is ${takeDecision.winner.weakest || "unknown"}.`,
      takeDecision.status || "ready"
    ));
    return brief({
      status: takeDecision.status || "ready",
      headline: takeDecision.status === "ready" ? "Keeper is ready for A/B and export" : "Keeper needs one refinement pass",
      summary: patchCount
        ? `${patchCount} keeper refinement moves are available before final comparison.`
        : "Compare the keeper at matched loudness, then export WAV/WebM/ZIP when the read feels right.",
      action: action,
      cards
    });
  }

  if (!rendered) {
    return brief({
      status: plan?.status === "risk" ? "risk" : "check",
      headline: "Render a short audition before full export",
      summary: sourceTimeline?.activeCue
        ? `${sourceTimeline.activeCue.label} is the current preview window; use it to check cleanup and character safety quickly.`
        : "A short preview gives the studio enough evidence to judge comfort, tone, and character guardrails.",
      action: action || { id: "preview-region", label: "Preview Region" },
      cards
    });
  }

  return brief({
    status: plan?.status || review?.status || "check",
    headline: action ? "Follow the next studio move" : "Review the deck at matched loudness",
    summary: action
      ? actionSummary(action, productionTarget)
      : "No blocking repair is visible. Compare takes, listen for performance, then export.",
    action,
    cards
  });
}

function brief({ status, headline, summary, action, cards }) {
  return {
    status: normalizeStatus(status),
    headline,
    summary,
    action: action ? { id: action.id || "", label: action.label || "Continue" } : null,
    cards: cards.slice(0, 5)
  };
}

function briefCard(id, label, value, detail, status) {
  return {
    id,
    label,
    value,
    detail,
    status: normalizeStatus(status)
  };
}

function statusFromScore(score, fallback = "check") {
  if (!Number.isFinite(score)) return fallback;
  if (score >= 86) return "ready";
  if (score >= 68) return "check";
  return "risk";
}

function normalizeStatus(status) {
  if (status === "ready" || status === "polish" || status === "check" || status === "waiting" || status === "risk") return status;
  if (status === "guarded" || status === "tune" || status === "shape") return "check";
  if (status === "repair") return "risk";
  return "waiting";
}

function actionSummary(action, productionTarget) {
  const label = action?.label || "Continue";
  if (action?.id === "keeper-refine") return `${label}: apply targeted QC or keeper moves before rendering another full take.`;
  if (action?.id === "preview-region") return `${label}: check the current ${productionTarget?.label || "studio"} direction on a short cue.`;
  if (action?.id === "render-variants") return `${label}: audition nearby character directions after the current cleanup is stable.`;
  if (action?.id === "compare-deck") return "A/B Compare: judge takes at matched loudness before export.";
  if (action?.id === "stack-fix" || action?.id === "chain-fix") return `${label}: apply the weakest signal-layer patch, then re-render a preview.`;
  return `${label}: continue the guided studio order.`;
}
