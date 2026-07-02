# Architecture Decisions

## ADR 001 - Split Live And Offline Audio Engines

The prototype had a real-time Web Audio graph and processed-output recording,
but it did not have a first-class path for applying the same character chain to
recorded or uploaded audio.

Decision:

- Maintain a live engine for microphone monitoring and recording.
- Maintain an offline render engine for takes, generated samples, and uploaded
  audio.
- Share preset definitions, character macros, analysis helpers, WAV encoding,
  and as much DSP math as practical.

Rationale:

- Offline rendering can use heavier or higher-quality processing than the live
  path.
- Recorded-take processing is a core product feature, not a nice-to-have.
- A shared effect model keeps presets from drifting between live and offline
  workflows.

## ADR 002 - Treat Current Pitch/Formant-Like Processing As Provisional

The original processor used short granular delay modulation for pitch and a
second formant-like pass. This is useful as a low-latency browser effect, but it
is not true voice-tract or speaker-identity conversion.

Decision:

- Keep low-latency granular pitch/formant-like processing as a practical live
  DSP block.
- Label it honestly in docs and UI.
- Isolate it behind the engine boundary so it can later be replaced by WSOLA,
  PSOLA, phase-vocoder, Rubber Band-style WASM, or model-backed conversion.

## ADR 003 - Character Voices Are Macro Presets, Not Filter Names

Kawaii, anime, otome, ikemen, and breathy voices require coordinated movement of
many parameters. Pitch alone is not acceptable.

Decision:

- Presets should combine pitch, apparent mouth size, brightness, breath,
  consonant softness, body, intimacy, saturation, compression, and ambience.
- The UI should expose character macros before raw technical controls.
- Raw controls remain available for expert tuning and testing.

## ADR 004 - Prosody Is A First-Class Limitation

Otome, kawaii, anime, and ikemen voices are not only spectral effects. They also
depend on timing, phrase shape, consonant behavior, breath placement, pauses,
intonation, and emotional delivery.

Decision:

- Treat non-AI prosody features as approximations, not full performance
  transfer.
- Implement useful approximations such as micro-vibrato, phrase dynamics,
  syllable-envelope shaping, breath/whisper texture, and close-mic tone.
- Keep source-voice calibration in the preset workflow.
- Do not claim true actor-style or target-speaker conversion until a model
  separates content, style, F0, and timbre.

## ADR 005 - AI Voice Conversion Is A Later Escalation

Browser AI voice conversion may become necessary for true different-speaker
identity conversion. Low-latency VC research such as LLVC, StreamVC, and MeanVC
2 is relevant, and browser delivery through ONNX Runtime Web, Transformers.js,
WebGPU, or WASM may be possible.

Decision:

- Do not start with AI.
- Push DSP, offline rendering, calibration, and character macros first.
- Revisit AI only after the non-AI ceiling is measured and documented.
- Any AI path must still fit static GitHub Pages deployment, licensing,
  latency, privacy, and fallback constraints.

## ADR 006 - Static Pages Does Not Mean Tiny Or Primitive

GitHub Pages static deployment is a hard constraint, but it does not require a
single file or minimal assets.

Decision:

- Use static modules, workers, AudioWorklets, WASM, generated samples, and
  external OSS/CDN assets where they materially improve quality.
- Optimize ambitious features instead of avoiding them by default.
- Keep the app inspectable and testable without a backend.

## ADR 007 - Product Capability Is More Than Signal Quality

The project gap is not only that the current DSP needs to sound cleaner. The
larger gap is that the prototype still lacks production workflow and
performance-direction features expected from a character voice studio.

Decision:

- Treat offline region preview, A/B comparison, take routing, render history,
  and export as core product workflow, not auxiliary utilities.
- Treat Character Director controls such as phrase lift, distance, confidence,
  softness, and breath placement as first-class features.
- Keep Director controls wired into both live AudioWorklet processing and
  offline rendering so previewed character direction matches recorded output.
- Add repeatable Line Read targets as product workflow objects: they bind a
  script line, acting direction, preset, source profile, and real parameter
  patch so subjective evaluation has stable material and operational controls.
- Keep objective signal tests for regression safety, but do not confuse passing
  signal metrics with completing the product vision.
- When adding DSP controls, connect them back to user-facing character intent
  instead of only exposing more technical knobs.

## ADR 008 - Voice Design Needs Stage Diagnostics

A character preset cannot be treated as a flat bag of values. If an otome,
kawaii, anime, or ikemen target misses, the user needs to know whether the gap
is in range/mouth, tone, breath texture, performance, dynamics, space, or source
guardrails.

Decision:

- Maintain a Character Chain report that groups the active parameters into
  Voice Core, Tone, Texture, Performance, Dynamics, Space, and Guardrail stages.
- Compare every stage against the active Line Read target rather than only
  against a generic preset name.
- Expose one-step patches from the weakest stage so tuning becomes a workflow,
  not slider guessing.
- Keep the Guardrail stage aware of source calibration and render review so
  source-fit and post-render evidence can affect the next correction.

## ADR 009 - Performance Needs Time-Axis Evidence

Average F0, RMS, brightness, and ZCR can pass while the read still feels flat,
stiff, or unlike a character performance. Otome, kawaii, anime, ASMR, and ikemen
targets depend on phrase lift, ending release, breath placement, and changing
delivery over time.

Decision:

- Maintain a Performance Trace report for offline source/render regions.
- Bound the frame count so long uploaded files do not make tracing slow or
  memory-heavy.
- Overlay source and rendered traces for frame-level pitch and energy rather
  than only showing aggregate analysis cards.
- Surface deltas for phrase lift, ending motion, tail air, delivery motion, and
  active coverage so subjective listening has repeatable time-axis evidence.

## ADR 010 - Diagnostics Need A Production Plan

Source Fit, Voice Route, Character Chain, Performance Trace, and Render Deck can
all be correct while still forcing the user to decide which panel matters next.
That creates a "dashboard" rather than a character voice production session.

Decision:

- Add a Studio Plan layer that keeps the whole production flow visible.
- Let the plan choose one next action from the current state instead of making
  users mentally stitch separate diagnostics together.
- Keep the plan data-driven and testable so the UI does not become a pile of
  hard-coded button shortcuts.
- Treat the plan as orchestration only: it should call existing source, route,
  chain, preview, trace, and deck workflows rather than replacing them.

## ADR 011 - Character Acting Needs Scene Beats

Single Line Read targets are useful for calibration, but otome-game, kawaii,
ikemen, and ASMR delivery depend on context across several lines: invitation,
confession, tease, reassurance, release, and similar acting beats. A single
slider state cannot communicate that arc well enough.

Decision:

- Add Scene Kits as grouped acting beats above Line Reads.
- Represent every beat as a real target with script, direction, source profile,
  and macro/director goals so existing diagnostics and render workflows can
  evaluate it.
- Keep Scene Kits local and static so they work on GitHub Pages and can grow
  into larger reference phrase packs without requiring AI or a backend.
- Use Scene Kits as the bridge between subjective acting direction and the
  measurable DSP workflow: Source Fit, Voice Route, Character Chain, Studio
  Plan, Performance Trace, and Render Deck should all understand them.

## ADR 012 - Acting Intent Needs A Pre-Render Script

Performance Trace shows what happened after rendering, but it does not tell the
user what the read was supposed to do. Without a pre-render plan, the app can
score source fit, route choice, and render quality while still missing the
actual acting gesture: close entry, phrase lift, breath tail, tease, confession,
release, or protective landing.

Decision:

- Add a Performance Script layer generated from the active Line Read or Scene
  Beat.
- Represent the script as time-axis lanes for lift, energy, distance, breath,
  and release, plus concise acting cues.
- Keep the script static and deterministic so it works on GitHub Pages, remains
  testable, and does not require AI.
- Add Script Match after rendering so Performance Trace deltas are judged
  against the planned acting intent rather than generic signal movement alone.
- Include Script as a Studio Plan step between chain shaping and audition, so
  the production flow becomes target -> route -> shape -> script -> render ->
  trace -> choose.
