# DSP Strategy

## Strategy Summary

Build the strongest possible browser DSP voice changer first. Add AI only after
the DSP route has a clear measured gap.

The near-term aim is not perfect speaker identity conversion. The near-term aim
is a browser character voice production system that can create believable "voice
direction" for common targets.

This means the project should not accept "pitch, EQ, reverb, and labels" as a
complete character voice system. Kawaii, anime, otome, and ikemen targets need
coordinated treatment of F0, spectral envelope, breath, consonants, proximity,
dynamics, and performance cues.

This is primarily a capability and architecture gap, not just an audio polish
gap. The app needs production workflows and a character-director layer, not only
better values for existing sliders.

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
- consonant-detail restoration so pitch/formant-like processing does not smear
  intelligibility when the target voice needs clarity
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

## Character Director Layer

Character voices need controls that describe performance intent, not only signal
processing blocks. The director layer should eventually turn human concepts into
coordinated DSP, offline rendering, and future AI-style controls:

- phrase lift / falling endings
- delivery energy
- shyness / confidence
- close-mic distance
- romantic breath placement
- consonant softness vs crispness
- line-read presets for testing repeatable acting targets
- per-target guardrails that prevent "pitch only" presets

In the DSP-first phase this layer can only approximate performance through
envelope tracking, pitch motion, breath shaping, dynamics, and UI workflow. It
is still a first-class product feature because it defines what AI escalation
would need to preserve later.

Current first-pass Director controls are shared by live and offline rendering:

- Phrase Lift maps to phrase-rate pitch motion and mild delivery lift.
- Ending Softness maps to falling-end pitch motion, tail softening, and breath
  texture.
- Delivery Energy maps to dynamics, brightness, presence, compression, and
  stronger syllable envelopes.
- Close Mic maps to low-mid proximity, air, breath bed, and lower low-cut.
- Breath Placement maps breath/whisper texture toward phrase tails.
- Confidence maps clarity, presence, consonant crispness, and delivery emphasis.

Line Read targets are the first product workflow built on this layer. A target
combines a voice preset, repeatable script line, acting direction, source voice
profile, and parameter patch. Applying a target moves the actual preset and
Director/Macro controls; it is not just a note card. This gives kawaii, anime,
otome, ikemen, ASMR, streamer, narrator, and calibration reads stable material
for listening tests and browser regression checks.

The Line Read view should also make target drift visible. The current
implementation scores each targeted macro/director axis, surfaces the largest
gaps, and draws a compact radar so users can see whether a read is missing lift,
softness, energy, distance, breath placement, or confidence before rendering
another take.

The next layer is coaching. Target drift is now grouped into Character,
Performance, and Distance recipe stages, and the UI exposes an Apply Next Fix
action that moves only the highest-priority missing axis. This keeps the full
Apply Target path for fast setup while also supporting iterative shaping, which
is closer to how a user would tune an acted character read.

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

Offline rendering should support render-time Auto Tune. This applies calibration
to the rendered output without permanently moving the user's live sliders, while
the explicit Tune to Source command remains available when the user wants to
commit those offsets to the current voice chain.

## Prosody And Performance

Real prosody transformation requires knowing phrase structure, syllable timing,
intonation, pauses, emotion, and delivery. DSP can approximate a few of these
with envelope tracking, pitch-motion macros, breath/whisper shaping, and source
calibration. It cannot fully produce an acted otome-game performance from a flat
reading.

Therefore:

- expose character/performance macros instead of only technical sliders
- implement measurable DSP approximations first
- use repeatable Line Read targets so subjective listening has stable script
  material and known performance settings
- keep UI and docs honest about "approximate prosody" vs "AI style/VC"
- reserve future AI for true timbre identity and style conversion

## Offline Post-Processing

Recorded and uploaded audio needs a dedicated workflow:

- choose a take or upload an audio file
- pick a character preset
- preview short regions quickly
- A/B original vs processed
- adjust the region and character macros without committing a full render
- optionally apply render-time source calibration
- render full processed output
- export WAV/WebM
- keep processing local

Offline rendering can afford more latency and can use higher-quality algorithms
than the live path.

## Quality Evaluation

DSP changes need repeatable evidence, not only subjective listening notes.

Maintain generated reference source voices and a preset quality matrix that
checks:

- output length stability
- clipping and limiter behavior
- RMS and peak ranges
- apparent F0 movement
- brightness movement
- ZCR / texture movement for breath, whisper, and frication-heavy presets
- render speed against realtime duration
- per-preset warnings for weak character movement

This matrix cannot prove that a voice is emotionally convincing, but it catches
regressions where a character preset stops moving the signal, clips, becomes too
quiet, or loses basic F0 tracking. Browser Diagnostics and `npm run quality`
should stay aligned.

Aggregate realtime factor must be measured against every rendered preset/profile
pair, not only against the source duration. Otherwise a full quality matrix can
look slower than it really is and distort engineering decisions.

The reference set should include at least low, medium, high/bright, and breathy
source profiles so source-voice calibration and preset behavior are not judged
from a single comfortable test voice.

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
