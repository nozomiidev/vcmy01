export const STUDIO_PLAN_STEP_IDS = Object.freeze([
  "source",
  "route",
  "shape",
  "audition",
  "trace",
  "deck"
]);

export function buildStudioPlan(options = {}) {
  const hasSource = !!options.hasSource;
  const sourceFit = options.sourceFit || null;
  const routes = Array.isArray(options.routes) ? options.routes : [];
  const activeRoute = routes.find((route) =>
    route.presetId === options.activePresetId &&
    route.targetId === options.activeLineReadId
  ) || null;
  const topRoute = routes[0] || null;
  const chain = options.chainReport || null;
  const review = options.renderReview || null;
  const trace = options.performanceComparison || null;
  const renderDeckCount = Math.max(0, Number(options.renderDeckCount || 0));
  const renderDeckSeconds = Math.max(0, Number(options.renderDeckSeconds || 0));

  const steps = [
    sourceStep(hasSource, sourceFit),
    routeStep(hasSource, topRoute, activeRoute),
    shapeStep(hasSource, chain),
    auditionStep(hasSource, review, renderDeckCount),
    traceStep(hasSource, review, trace),
    deckStep(hasSource, renderDeckCount, renderDeckSeconds)
  ];
  const nextAction = steps.find((step) => step.action)?.action || null;
  const scored = steps.filter((step) => Number.isFinite(step.score));
  const score = scored.length
    ? Math.round(scored.reduce((sum, step) => sum + step.score, 0) / scored.length)
    : 0;
  return {
    score,
    status: planStatus(score, steps, hasSource),
    steps,
    nextAction
  };
}

function sourceStep(hasSource, sourceFit) {
  if (!hasSource) {
    return step({
      id: "source",
      label: "Source",
      status: "risk",
      score: 0,
      summary: "No source",
      detail: "Start with a generated or uploaded voice before judging character fit.",
      action: {
        id: "load-source",
        label: "Generate Target Source"
      }
    });
  }
  if (!sourceFit) {
    return step({
      id: "source",
      label: "Source",
      status: "check",
      score: 58,
      summary: "Loaded",
      detail: "Source exists, but fit analysis has not been refreshed.",
      action: {
        id: "analyze-source",
        label: "Analyze Source"
      }
    });
  }
  const hasPatch = sourceFit.patches?.length > 0;
  return step({
    id: "source",
    label: "Source",
    status: sourceFit.status,
    score: sourceFit.score,
    summary: `${sourceFit.score}% ${labelForStatus(sourceFit.status)}`,
    detail: hasPatch
      ? `${sourceFit.patches.length} source compensation moves are available.`
      : "Source calibration is aligned for this target.",
    action: hasPatch && sourceFit.status !== "ready"
      ? { id: "tune-source", label: "Tune Source" }
      : null
  });
}

function routeStep(hasSource, topRoute, activeRoute) {
  if (!hasSource) {
    return waitingStep("route", "Route", "Waiting for source");
  }
  if (!topRoute) {
    return step({
      id: "route",
      label: "Route",
      status: "check",
      score: 48,
      summary: "No route",
      detail: "Route ranking needs source analysis.",
      action: { id: "analyze-source", label: "Analyze Source" }
    });
  }
  if (activeRoute) {
    return step({
      id: "route",
      label: "Route",
      status: activeRoute.status,
      score: activeRoute.score,
      summary: `${activeRoute.score}% Active`,
      detail: `${activeRoute.presetName} / ${activeRoute.targetName}`
    });
  }
  return step({
    id: "route",
    label: "Route",
    status: topRoute.status,
    score: topRoute.score,
    summary: `${topRoute.score}% Best`,
    detail: `${topRoute.presetName} / ${topRoute.targetName}`,
    action: {
      id: "apply-route",
      label: "Apply Best Route",
      routeId: topRoute.id
    }
  });
}

function shapeStep(hasSource, chain) {
  if (!hasSource) {
    return waitingStep("shape", "Shape", "Waiting for source");
  }
  if (!chain) {
    return step({
      id: "shape",
      label: "Shape",
      status: "check",
      score: 50,
      summary: "No chain",
      detail: "Character chain diagnostics are unavailable."
    });
  }
  const hasPatch = Object.keys(chain.nextPatch || {}).some((key) => !key.startsWith("_"));
  const nextStage = chain.stages?.find((stage) => stage.id === chain.nextStageId);
  return step({
    id: "shape",
    label: "Shape",
    status: chain.status,
    score: chain.score,
    summary: `${chain.score}% ${labelForStatus(chain.status)}`,
    detail: nextStage ? `Next weak layer: ${nextStage.label}.` : "Character chain is locked to the target.",
    action: hasPatch
      ? { id: "chain-fix", label: `Fix ${nextStage?.label || "Chain"}` }
      : null
  });
}

function auditionStep(hasSource, review, renderDeckCount) {
  if (!hasSource) {
    return waitingStep("audition", "Audition", "Waiting for source");
  }
  if (!review) {
    return step({
      id: "audition",
      label: "Audition",
      status: "tune",
      score: 52,
      summary: "No preview",
      detail: "Render a region before trusting the current voice design.",
      action: { id: "preview-region", label: "Preview Region" }
    });
  }
  return step({
    id: "audition",
    label: "Audition",
    status: review.status,
    score: review.score,
    summary: `${review.score}% ${labelForStatus(review.status)}`,
    detail: renderDeckCount > 1 ? "Multiple takes are ready for comparison." : "One take is ready; another take improves choice.",
    action: review.status !== "ready" || renderDeckCount < 2
      ? { id: "preview-region", label: renderDeckCount ? "Add Another Take" : "Preview Region" }
      : null
  });
}

function traceStep(hasSource, review, trace) {
  if (!hasSource) {
    return waitingStep("trace", "Trace", "Waiting for source");
  }
  if (!review) {
    return waitingStep("trace", "Trace", "Needs preview");
  }
  if (!trace) {
    return step({
      id: "trace",
      label: "Trace",
      status: "check",
      score: 56,
      summary: "No trace",
      detail: "Performance motion has not been compared yet."
    });
  }
  return step({
    id: "trace",
    label: "Trace",
    status: trace.status,
    score: trace.score,
    summary: `${trace.score}% ${labelForStatus(trace.status)}`,
    detail: trace.items?.slice(0, 2).map((item) => `${item.label} ${item.value}`).join(" / ") || "Performance movement compared."
  });
}

function deckStep(hasSource, renderDeckCount, renderDeckSeconds) {
  if (!hasSource) {
    return waitingStep("deck", "Deck", "Waiting for source");
  }
  if (!renderDeckCount) {
    return waitingStep("deck", "Deck", "No takes yet");
  }
  if (renderDeckCount < 2) {
    return step({
      id: "deck",
      label: "Deck",
      status: "tune",
      score: 66,
      summary: "1 take",
      detail: "Create one more take before choosing a keeper.",
      action: { id: "preview-region", label: "Add Another Take" }
    });
  }
  const score = Math.min(100, 72 + renderDeckCount * 6);
  return step({
    id: "deck",
    label: "Deck",
    status: "ready",
    score,
    summary: `${renderDeckCount} takes`,
    detail: `${renderDeckSeconds.toFixed(1)}s retained for A/B decisions.`,
    action: { id: "compare-deck", label: "A/B Compare" }
  });
}

function waitingStep(id, label, detail) {
  return step({
    id,
    label,
    status: "waiting",
    score: null,
    summary: "Waiting",
    detail
  });
}

function step({ id, label, status, score, summary, detail, action = null }) {
  return {
    id,
    label,
    status,
    score,
    summary,
    detail,
    action
  };
}

function planStatus(score, steps, hasSource) {
  if (!hasSource) return "risk";
  if (steps.some((step) => step.status === "risk")) return score >= 78 ? "check" : "risk";
  if (steps.some((step) => step.status === "tune" || step.status === "shape" || step.status === "check")) return "check";
  return score >= 86 ? "ready" : "check";
}

function labelForStatus(status) {
  if (status === "ready") return "Ready";
  if (status === "shape") return "Shape";
  if (status === "tune") return "Tune";
  if (status === "check") return "Check";
  if (status === "risk") return "Risk";
  return "Waiting";
}
