export const RENDER_DECK_LIMITS = Object.freeze({
  maxItems: 6,
  maxSeconds: 45
});

export function renderReview(source = null, rendered = null) {
  if (!source?.analysis || !rendered?.analysis) return null;
  const sourceAnalysis = source.analysis;
  const renderAnalysis = rendered.analysis;
  const deltaF0Hz = finiteDelta(renderAnalysis.pitchMedianHz, sourceAnalysis.pitchMedianHz);
  const rmsDeltaDb = finiteDelta(renderAnalysis.rmsDb, sourceAnalysis.rmsDb);
  const brightnessDelta = finiteDelta(renderAnalysis.brightnessRatio, sourceAnalysis.brightnessRatio);
  const zcrDelta = finiteDelta(renderAnalysis.zeroCrossingsPerSecond, sourceAnalysis.zeroCrossingsPerSecond);
  const headroomDb = Number.isFinite(renderAnalysis.peakDb) ? -renderAnalysis.peakDb : 0;
  const guardrail = guardrailRisk(rendered.appliedParams || rendered.baseParams || {});
  const score = reviewScore({
    clipped: renderAnalysis.clipped,
    peakDb: renderAnalysis.peakDb,
    rmsDb: renderAnalysis.rmsDb,
    duration: renderAnalysis.duration,
    brightnessDelta,
    zcrDelta,
    guardrailRisk: guardrail.score
  });
  const items = [
    {
      id: "f0",
      label: "F0 Move",
      value: formatHzDelta(deltaF0Hz),
      detail: deltaF0Hz > 0 ? "Lifted apparent pitch." : deltaF0Hz < 0 ? "Lowered apparent pitch." : "Pitch center held."
    },
    {
      id: "level",
      label: "Level",
      value: signedDb(rmsDeltaDb),
      detail: headroomDb >= 1.2 ? `${headroomDb.toFixed(1)} dB peak headroom.` : "Peak headroom is tight."
    }
  ];
  if (rendered.studioPolish?.enabled) {
    items.push({
      id: "studio-polish",
      label: "Studio Polish",
      value: rendered.studioPolish.intensity,
      detail: rendered.studioPolish.plan?.notes?.join("; ") || "Studio polish ran before character processing."
    });
  }
  if (guardrail.score > 0) {
    items.push({
      id: "guardrail",
      label: "Guardrail",
      value: guardrail.label,
      detail: guardrail.detail
    });
  }
  items.push(
    {
      id: "tone",
      label: "Tone",
      value: signedPercent(brightnessDelta),
      detail: brightnessDelta > 0 ? "Brighter spectral balance." : brightnessDelta < 0 ? "Darker spectral balance." : "Tone balance held."
    },
    {
      id: "texture",
      label: "Texture",
      value: signedNumber(zcrDelta, "/s"),
      detail: zcrDelta > 0 ? "More breath/frication detail." : zcrDelta < 0 ? "Smoother consonant texture." : "Texture held."
    }
  );
  return {
    score,
    status: score >= 86 ? "ready" : score >= 70 ? "check" : "risk",
    items
  };
}

export function addRenderDeckItem(deck = [], item, limits = RENDER_DECK_LIMITS) {
  const next = [item, ...deck.filter((candidate) => candidate.id !== item.id)].slice(0, limits.maxItems);
  while (totalDeckSeconds(next) > limits.maxSeconds && next.length > 1) next.pop();
  return next;
}

export function totalDeckSeconds(deck = []) {
  return deck.reduce((sum, item) => sum + Number(item.rendered?.analysis?.duration || 0), 0);
}

function reviewScore(metrics) {
  let score = 100;
  if (metrics.clipped) score -= 28;
  if (metrics.peakDb > -0.7) score -= 16;
  if (metrics.rmsDb > -8 || metrics.rmsDb < -38) score -= 10;
  if (!Number.isFinite(metrics.duration) || metrics.duration < 0.08) score -= 14;
  if (Math.abs(metrics.brightnessDelta || 0) < 0.01 && Math.abs(metrics.zcrDelta || 0) < 150) score -= 5;
  if (metrics.guardrailRisk > 0) score -= Math.min(34, metrics.guardrailRisk);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function guardrailRisk(params = {}) {
  const issues = [];
  const pitch = Math.abs(Number(params.pitch || 0));
  const formant = Math.abs(Number(params.formant || 0));
  const breathStack = Number(params.breath || 0) + Number(params.whisper || 0) + Number(params.romanticBreath || 0) * 0.45;
  const wet = Number(params.dryWet ?? 100);
  if (pitch > 8) issues.push({ label: "pitch", score: (pitch - 8) * 6 });
  if (formant > 8) issues.push({ label: "formant-like", score: (formant - 8) * 6 });
  if (breathStack > 125) issues.push({ label: "breath stack", score: (breathStack - 125) * 0.45 });
  if (wet > 100) issues.push({ label: "wet mix", score: (wet - 100) * 0.5 });
  const score = Math.max(0, Math.min(40, issues.reduce((sum, item) => sum + item.score, 0)));
  return {
    score,
    label: score >= 24 ? "risk" : "check",
    detail: issues.length
      ? `Aggressive ${issues.map((item) => item.label).join(", ")} can break voice identity or intelligibility.`
      : "Character macro range is within guardrails."
  };
}

function finiteDelta(after, before) {
  return Number.isFinite(after) && Number.isFinite(before) ? after - before : 0;
}

function formatHzDelta(value) {
  if (Math.abs(value) < 1) return "0 Hz";
  return `${value > 0 ? "+" : ""}${Math.round(value)} Hz`;
}

function signedDb(value) {
  if (Math.abs(value) < 0.05) return "0.0 dB";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

function signedPercent(value) {
  const percent = value * 100;
  if (Math.abs(percent) < 0.5) return "0%";
  return `${percent > 0 ? "+" : ""}${Math.round(percent)}%`;
}

function signedNumber(value, unit = "") {
  if (Math.abs(value) < 1) return `0${unit}`;
  return `${value > 0 ? "+" : ""}${Math.round(value)}${unit}`;
}
