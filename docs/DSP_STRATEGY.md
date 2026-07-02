# DSP Strategy

## Strategy Summary

Build the strongest possible browser DSP voice changer first. Add AI only after
the DSP route has a clear measured gap.

The near-term aim is not perfect speaker identity conversion. The near-term aim
is a high-quality character effect engine that can create believable "voice
direction" for common targets.

This means the project should not accept "pitch, EQ, reverb, and labels" as a
complete character voice system. Kawaii, anime, otome, and ikemen targets need
coordinated treatment of F0, spectral envelope, breath, consonants, proximity,
dynamics, and performance cues.

## Audio Architecture Targets

Use one shared effect model for:

- live microphone monitoring
- processed recording
- offline rendering for recorded takes
- offline rendering for uploaded audio
- preset import/export

The real-time path and offline path should not drift into separate products.

## DSP Building Blocks

Priority DSP blocks to investigate and implement:

- voice activity detection
- better F0 estimation and pitch tracking
- pitch curve smoothing and target range mapping
- phrase/ending-aware pitch motion where feasible
- WSOLA, PSOLA, phase-vocoder, or WASM-backed high-quality pitch shifting
- voiced/unvoiced separation
- LPC, cepstral, or other spectral-envelope/formant approximation
- harmonic exciter and controlled saturation
- breath and whisper noise shaping
- de-esser
- dynamic EQ
- multiband compression
- proximity/body shaping around low-mid ranges
- transient and consonant softness controls
- stereo/spatial distance and close-mic simulation
- non-AI prosody approximations such as micro-vibrato, phrase dynamics, and
  syllable-envelope shaping
- limiter and loudness management

## Character Macro Layer

Raw sliders are not enough. Add higher-level macros that move multiple DSP
parameters together:

- character age / apparent size
- cuteness / brightness
- intimacy / distance
- breathiness
- confidence / softness
- anime exaggeration
- low-body / ikemen weight
- whisper blend
- consonant softness

These macros should map to real parameters and should be calibratable per user.

## Calibration

Presets should eventually ask for or infer:

- comfortable speaking pitch range
- noise floor
- input loudness
- brightness/darkness of the source voice
- sibilance level
- breathiness level

Without calibration, a preset that works on one source voice may fail badly on
another.

Calibration is not optional polish for character voices. A "kawaii" preset that
starts from a low source voice and a "sultry ikemen" preset that starts from a
high source voice need different pitch, formant-like, body, de-esser, and air
offsets.

## Prosody And Performance

Real prosody transformation requires knowing phrase structure, syllable timing,
intonation, pauses, emotion, and delivery. DSP can approximate a few of these
with envelope tracking, pitch-motion macros, breath/whisper shaping, and source
calibration. It cannot fully produce an acted otome-game performance from a flat
reading.

Therefore:

- expose character/performance macros instead of only technical sliders
- implement measurable DSP approximations first
- keep UI and docs honest about "approximate prosody" vs "AI style/VC"
- reserve future AI for true timbre identity and style conversion

## Offline Post-Processing

Recorded and uploaded audio needs a dedicated workflow:

- choose a take or upload an audio file
- pick a character preset
- preview short regions quickly
- A/B original vs processed
- render full processed output
- export WAV/WebM
- keep processing local

Offline rendering can afford more latency and can use higher-quality algorithms
than the live path.

## Quality Evaluation

DSP changes need repeatable evidence, not only subjective listening notes.

Maintain a generated reference voice and a preset quality matrix that checks:

- output length stability
- clipping and limiter behavior
- RMS and peak ranges
- apparent F0 movement
- brightness movement
- render speed against realtime duration
- per-preset warnings for weak character movement

This matrix cannot prove that a voice is emotionally convincing, but it catches
regressions where a character preset stops moving the signal, clips, becomes too
quiet, or loses basic F0 tracking. Browser Diagnostics and `npm run quality`
should stay aligned.

## AI Escalation Criteria

Consider browser AI voice conversion only when:

- DSP character presets are implemented and still cannot meet the target.
- Offline and real-time DSP paths are stable.
- The expected latency, CPU/GPU cost, and model size are acceptable.
- Model licenses and hosting are compatible with GitHub Pages.
- There is a documented fallback for browsers without WebGPU/WASM acceleration.

Possible browser AI delivery paths include static model files loaded by ONNX
Runtime Web, Transformers.js, WebGPU, or WASM. Do not add a required server.

Keep `docs/RESEARCH_NOTES.md` current when adding a major DSP library, WASM
asset, model candidate, or AI delivery path.

## Naming Discipline

Use precise names:

- "pitch shift" for pitch shift
- "formant-like" for approximate formant effects
- "spectral envelope" when actually estimating/shaping the envelope
- "character preset" for DSP macro presets
- "voice conversion" only when content and speaker/identity representation are
  separated by a model
