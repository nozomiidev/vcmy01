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
