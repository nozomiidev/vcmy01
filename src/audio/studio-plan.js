export const STUDIO_PLAN_STEP_IDS = Object.freeze([
  "project",
  "source",
  "timeline",
  "route",
  "shape",
  "stack",
  "memory",
  "script",
  "audition",
  "trace",
  "scene",
  "deck"
]);

export function buildStudioPlan(options = {}) {
  const hasSource = !!options.hasSource;
  const projectVault = options.projectVault || null;
  const sourceTimeline = options.sourceTimeline || null;
  const sourceFit = options.sourceFit || null;
  const routes = Array.isArray(options.routes) ? options.routes : [];
  const activeRoute = routes.find((route) =>
    route.presetId === options.activePresetId &&
    route.targetId === options.activeLineReadId
  ) || null;
  const topRoute = routes[0] || null;
  const chain = options.chainReport || null;
  const effectStack = options.effectStack || null;
  const voiceMemory = options.voiceMemory || null;
  const stackAuditionCount = Math.max(0, Number(options.stackAuditionCount || 0));
  const script = options.performanceScript || null;
  const scriptMatch = options.scriptMatch || null;
  const scriptAutomation = options.scriptAutomation || null;
  const sceneSession = options.sceneSession || null;
  const review = options.renderReview || null;
  const trace = options.performanceComparison || null;
  const takeDecision = options.takeDecision || null;
  const keeperRefinement = options.keeperRefinement || null;
  const auditionVariantCount = Math.max(0, Number(options.auditionVariantCount || 0));
  const renderDeckCount = Math.max(0, Number(options.renderDeckCount || 0));
  const renderDeckSeconds = Math.max(0, Number(options.renderDeckSeconds || 0));

  const steps = [
    projectStep(projectVault, review),
    sourceStep(hasSource, sourceFit),
    timelineStep(hasSource, sourceTimeline),
    routeStep(hasSource, topRoute, activeRoute),
    shapeStep(hasSource, chain),
    stackStep(hasSource, effectStack, stackAuditionCount),
    memoryStep(hasSource, voiceMemory, review),
    scriptStep(script, scriptMatch, scriptAutomation),
    auditionStep(hasSource, review, renderDeckCount, auditionVariantCount, sourceTimeline),
    traceStep(hasSource, review, trace),
    sceneStep(hasSource, sceneSession),
    deckStep(hasSource, renderDeckCount, renderDeckSeconds, takeDecision, keeperRefinement)
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

function timelineStep(hasSource, sourceTimeline) {
  if (!hasSource) {
    return waitingStep("timeline", "Timeline", "Waiting for source");
  }
  if (!sourceTimeline) {
    return step({
      id: "timeline",
      label: "Timeline",
      status: "check",
      score: 50,
      summary: "No cues",
      detail: "Source timeline cues have not been built yet."
    });
  }
  const action = sourceTimeline.nextAction;
  return step({
    id: "timeline",
    label: "Timeline",
    status: sourceTimeline.status,
    score: sourceTimeline.score,
    summary: sourceTimeline.cueCount
      ? `${sourceTimeline.cueCount} cues`
      : "No cues",
    detail: action
      ? action.detail
      : sourceTimeline.activeCue
        ? `${sourceTimeline.activeCue.label} is selected for preview and trace comparison.`
        : sourceTimeline.summary || "Timeline is ready.",
    action: action?.id === "select-source-cue"
      ? { id: "select-source-cue", label: action.label, cueId: action.cueId }
      : null
  });
}

function projectStep(projectVault, review) {
  if (!projectVault) {
    return step({
      id: "project",
      label: "Project",
      status: "waiting",
      score: null,
      summary: "No vault",
      detail: "Project recall is unavailable."
    });
  }
  const action = projectVault.nextAction;
  const blockingRisk = renderHasBlockingRisk(review);
  const status = projectVault.status === "empty" ? "waiting" : projectVault.status;
  return step({
    id: "project",
    label: "Project",
    status,
    score: projectVault.count ? projectVault.score : null,
    summary: projectVault.count
      ? `${projectVault.count} projects`
      : "No projects",
    detail: action?.id === "capture-project" && blockingRisk
      ? `${blockingRisk.label} should be fixed before saving this project as a reusable studio state.`
      : action?.id === "apply-project"
      ? `A saved project can restore source, scene, and renders: ${projectVault.best?.title || "Project"}.`
      : action?.id === "capture-project"
        ? "Current scene, source, design, and render evidence are not saved as a project."
        : projectVault.savedCurrent
          ? "Current project state is saved."
          : projectVault.summary || "Project vault is ready.",
    action: action?.id === "apply-project"
      ? { id: "apply-project", label: action.label, projectId: action.projectId }
      : action?.id === "capture-project" && !blockingRisk
        ? { id: "capture-project", label: action.label }
        : null
  });
}

function sceneStep(hasSource, sceneSession) {
  if (!hasSource) {
    return waitingStep("scene", "Scene", "Waiting for source");
  }
  if (!sceneSession) {
    return step({
      id: "scene",
      label: "Scene",
      status: "ready",
      score: 86,
      summary: "Optional",
      detail: "Scene coverage appears when a Scene Kit session is available."
    });
  }
  const action = sceneSession.nextAction?.id === "apply-scene-beat"
    ? sceneSession.nextAction
    : null;
  return step({
    id: "scene",
    label: "Scene",
    status: sceneSession.status,
    score: sceneSession.score,
    summary: `${sceneSession.readyCount}/${sceneSession.count} beats`,
    detail: action
      ? action.detail
      : sceneSession.activeBeat
        ? `${sceneSession.activeBeat.label}: ${sceneSession.activeBeat.nextNeed}.`
        : sceneSession.summary,
    action: action
      ? { id: "apply-scene-beat", label: action.label, targetId: action.targetId }
      : null
  });
}

function memoryStep(hasSource, voiceMemory, review) {
  if (!hasSource) {
    return waitingStep("memory", "Memory", "Waiting for source");
  }
  if (!voiceMemory) {
    return step({
      id: "memory",
      label: "Memory",
      status: "check",
      score: 54,
      summary: "No board",
      detail: "Voice design memory is unavailable."
    });
  }
  const action = voiceMemory.nextAction;
  const blockingRisk = renderHasBlockingRisk(review);
  const shouldCapture = action?.id === "capture-memory" && review && !blockingRisk;
  const shouldApply = action?.id === "apply-memory";
  return step({
    id: "memory",
    label: "Memory",
    status: voiceMemory.status === "empty" ? "check" : voiceMemory.status,
    score: voiceMemory.score,
    summary: voiceMemory.count
      ? `${voiceMemory.count} designs / ${voiceMemory.score}%`
      : "No designs",
    detail: action?.id === "capture-memory" && blockingRisk
      ? `${blockingRisk.label} should be fixed before capturing this voice as reusable memory.`
      : shouldCapture
      ? "Current audition has not been saved as a recoverable design."
      : shouldApply
        ? `A saved design can improve this target: ${voiceMemory.best?.title || "Memory"}.`
        : voiceMemory.summary || "Saved designs are available for recall.",
    action: shouldApply
      ? { id: "apply-memory", label: "Apply Memory", snapshotId: action.snapshotId }
      : shouldCapture
        ? { id: "capture-memory", label: "Capture Design" }
        : null
  });
}

function renderHasBlockingRisk(review = null) {
  if (!review) return null;
  if (review.performanceBudget?.status === "risk") return { id: "performance", label: "Render speed risk" };
  if (review.comfort?.status === "risk") return { id: "comfort", label: "Listening comfort risk" };
  if (review.status === "risk") return { id: "render", label: "Render review risk" };
  return null;
}

function stackStep(hasSource, effectStack, stackAuditionCount = 0) {
  if (!hasSource) {
    return waitingStep("stack", "Stack", "Waiting for source");
  }
  if (!effectStack) {
    return step({
      id: "stack",
      label: "Stack",
      status: "check",
      score: 54,
      summary: "No stack",
      detail: "Signal stack diagnostics are unavailable."
    });
  }
  const hasPatch = Object.keys(effectStack.nextPatch || {}).some((key) => !key.startsWith("_"));
  const nextStage = effectStack.stages?.find((stage) => stage.id === effectStack.nextStageId);
  const needsAudition = !hasPatch && stackAuditionCount > 0 && effectStack.status !== "ready";
  return step({
    id: "stack",
    label: "Stack",
    status: effectStack.status,
    score: effectStack.score,
    summary: `${effectStack.score}% ${labelForStatus(effectStack.status)}`,
    detail: nextStage
      ? `Next signal layer: ${nextStage.label}; ${effectStack.summary}.`
      : needsAudition
        ? `${stackAuditionCount} layer auditions can isolate the stack before another full take.`
        : `${effectStack.activeCount || 0} active signal layers are balanced.`,
    action: hasPatch
      ? { id: "stack-fix", label: `Fix ${nextStage?.label || "Stack"}` }
      : needsAudition
        ? { id: "render-stack", label: "Render Stack" }
      : null
  });
}

function scriptStep(script, scriptMatch, scriptAutomation) {
  if (!script) {
    return step({
      id: "script",
      label: "Script",
      status: "check",
      score: 50,
      summary: "No script",
      detail: "Select a Line Read or Scene Beat before judging performance motion."
    });
  }
  if (scriptMatch && !scriptMatch.plannedOnly) {
    const matchDetail = scriptMatch.items?.slice(0, 2).map((item) => `${item.label} ${item.value}`).join(" / ") || "Rendered motion compared to the script.";
    const automationDetail = scriptAutomation?.frameCount
      ? `${scriptAutomation.frameCount} acting-automation frames applied.`
      : "Rendered with static character chain.";
    return step({
      id: "script",
      label: "Script",
      status: scriptMatch.status,
      score: scriptMatch.score,
      summary: `${scriptMatch.score}% Match`,
      detail: `${automationDetail} ${matchDetail}`
    });
  }
  return step({
    id: "script",
    label: "Script",
    status: script.status,
    score: script.score,
    summary: `${script.score}% Planned`,
    detail: script.cues?.slice(0, 2).join(" / ") || "Performance gestures are planned."
  });
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

function auditionStep(hasSource, review, renderDeckCount, auditionVariantCount, sourceTimeline = null) {
  if (!hasSource) {
    return waitingStep("audition", "Audition", "Waiting for source");
  }
  const previewCueId = sourceTimeline?.activeCue?.id || sourceTimeline?.bestCue?.id || null;
  if (!review) {
    return step({
      id: "audition",
      label: "Audition",
      status: "tune",
      score: 52,
      summary: "No preview",
      detail: "Render a region before trusting the current voice design.",
      action: { id: "preview-region", label: "Preview Region", cueId: previewCueId }
    });
  }
  const performanceBudget = review.performanceBudget || null;
  const slowRender = performanceBudget?.status === "risk";
  return step({
    id: "audition",
    label: "Audition",
    status: review.status,
    score: review.score,
    summary: `${review.score}% ${labelForStatus(review.status)}`,
    detail: slowRender
      ? performanceBudget.detail
      : renderDeckCount > 1
      ? "Multiple takes are ready for comparison."
      : auditionVariantCount
        ? `${auditionVariantCount} audition variants can test nearby character directions.`
        : "One take is ready; another take improves choice.",
    action: slowRender
      ? { id: "preview-region", label: "Use Short Preview", cueId: previewCueId }
      : review.status !== "ready" || renderDeckCount < 2
        ? auditionVariantCount && renderDeckCount
        ? { id: "render-variants", label: "Render Variants" }
        : { id: "preview-region", label: renderDeckCount ? "Add Another Take" : "Preview Region", cueId: previewCueId }
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

function deckStep(hasSource, renderDeckCount, renderDeckSeconds, takeDecision, keeperRefinement) {
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
  const score = Number.isFinite(takeDecision?.score)
    ? takeDecision.score
    : Math.min(100, 72 + renderDeckCount * 6);
  const winner = takeDecision?.winner || null;
  const candidate = winner || takeDecision?.candidate || null;
  const patchCount = keeperRefinement?.patch?.length || 0;
  const qcHold = !winner && !!candidate;
  const needsRefinement = patchCount > 0 && (takeDecision?.status !== "ready" || qcHold);
  return step({
    id: "deck",
    label: "Deck",
    status: takeDecision?.status || "ready",
    score,
    summary: candidate ? `${renderDeckCount} takes / ${score}%` : `${renderDeckCount} takes`,
    detail: needsRefinement
      ? `${qcHold ? "QC candidate" : "Keeper"}: ${candidate?.label || "Take"}; ${patchCount} keeper patch moves are ready.`
      : qcHold
        ? `No QC-ready keeper yet; ${candidate.label} is blocked by ${candidate.qc?.summary || "render QC"}.`
      : winner
        ? `Keeper: ${winner.label}; weakest evidence is ${winner.weakest}.`
        : `${renderDeckSeconds.toFixed(1)}s retained for A/B decisions.`,
    action: needsRefinement
      ? { id: "keeper-refine", label: "Refine Keeper" }
      : qcHold
        ? { id: "preview-region", label: "Fix QC Take" }
      : { id: "compare-deck", label: "A/B Compare" }
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
