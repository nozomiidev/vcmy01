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

Scene Kits extend the repeatable-read concept from a single target line into a
short acting arc. Each kit contains multiple beats for one character direction,
such as otome hold/confess/release or ikemen invite/tease/protect. A beat is
not just script copy: it becomes a real Line Read target with preset, source
profile, and macro/director parameter goals, so Source Fit, Voice Route,
Character Chain, Studio Plan, Performance Trace, and Render Deck can all judge
it the same way they judge the base targets. This is the non-AI bridge toward
"otome-game voice" and "ikemen scene" workflows: the app gives the user a
performable scene structure while DSP handles the measurable voice shaping.

Performance Script is the next bridge between acting intent and DSP evidence.
It converts the active Line Read or Scene Beat into a planned time-axis shape:
lift, energy, distance, breath, and release lanes, with concrete cues such as
near-mic entry, upward phrase gesture, soft tail, or breath placement. This is
not AI prosody transfer. It is a local, static, testable plan that lets the user
see how the read should move before recording or offline rendering.

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

Source Fit is the workflow layer on top of this calibration. It compares the
loaded or generated source against the active Line Read target, scores range,
level, tone, and texture, and exposes the exact patch that Tune to Source would
apply. This makes source calibration part of the creative decision flow instead
of a hidden DSP side effect.

Voice Route planning sits one layer above Source Fit. It ranks every character
target for the loaded source, combines pre-tune fit, post-tune fit, Line Read
match, patch load, and explicit source-profile hints, then lets the user apply
the route as preset + Line Read + source-tuned parameters. This turns
calibration from a corrective button into a route-selection workflow.

Character Chain is the stage view of the active voice design. It breaks the
current chain into Voice Core, Tone, Texture, Performance, Dynamics, Space, and
Guardrail stages, compares each stage against the active Line Read target, and
exposes the next meaningful patch. This is intentionally a production workflow
layer: users should be able to see which part of the character voice is missing
instead of guessing from a flat preset name or a wall of sliders.

Signal Stack is the signal-path view of the active processing design. Character
Chain asks "which target layer is missing?" while Signal Stack asks "which DSP
layer is currently active, risky, or overloaded?" It keeps input prep, core
shift, voice tract, tone, texture, performance motion, dynamics, space, and
guardrails in processing order, then surfaces bounded stack fixes from source
fit, script match, keeper refinement, and render safety evidence. This is the
first non-destructive effect-stack layer: it does not replace the DSP chain,
but it makes the chain inspectable and gives Studio Plan an operational stack
step before auditioning.

Stack Audition turns that diagnosis into listening evidence. For active or weak
Signal Stack stages, it creates renderable Fix and Bypass-style candidates:
Fix candidates apply the next bounded stage moves, while Bypass candidates pull
only that stage's parameters toward neutral so the user can hear what the layer
is contributing. The output goes into the same Render Deck as normal previews
and Variant Lab takes, which keeps subjective A/B comparison connected to
measured review, Script Match, and Take Decision evidence.

Design Board is the recoverability layer above the active chain. A character
voice studio cannot rely on one fragile slider state: users need to capture a
promising kawaii, otome, ikemen, or ASMR design, compare it against the current
Line Read target, and restore the meaningful macro/director/DSP deltas later.
The board keeps local snapshots bounded, scores them with target and evidence
signals, and lets Studio Plan recall a stronger saved design before asking the
user to render more takes. This is still static and local, but it moves the app
from "effect box" toward an iterative voice-design workspace.

Studio Plan is the workflow coordinator above those panels. Source Fit, Voice
Route, Character Chain, Signal Stack, Stack Audition, Design Board, Performance
Script, Performance Trace, and Render Deck are useful evidence, but they can
still leave a user asking what to do next.
Studio Plan keeps every production step visible and chooses the next action in
order: load or analyze a source, apply a stronger route, fix the weakest chain
stage, balance or audition the signal stack, save or recall a design, inspect
the acting script, render a preview, compare performance evidence, then choose
from the deck. This makes the app feel like a voice-production session instead
of a collection of unrelated widgets.

Performance Trace is the time-axis evidence layer. It analyzes source and
rendered regions into bounded frames for energy, frame-level F0, ending motion,
tail breath/frication, and delivery range, then overlays source/render curves.
This cannot prove emotional acting quality, but it makes phrase lift, tail
release, breath placement, and over-flattened delivery visible instead of hidden
inside average F0 or loudness metrics.

Script Match connects Performance Script to Performance Trace. After a preview
or full render, the trace deltas are scored against the planned lift, release,
tail-air, energy, and coverage moves. This does not claim to judge beauty or
acting truth, but it prevents a render from looking "good" only because generic
signal metrics passed while the intended scene gesture was missed.

Acting Automation is the first point where Performance Script changes the
offline render itself. The renderer chunks the source, samples the planned lift,
energy, distance, breath, and release lanes over time, maps those lanes into
Director/Macro/DSP parameters, and overlap-adds the processed chunks back into a
single take. This is still non-AI approximation, but it makes the script an
active render control rather than a passive note card.

Variant Lab is the subjective-audition layer above that renderer. Character
voices are rarely found by a single perfect slider move, so the app should
generate nearby candidate directions: sweet lift, close breath, body gloss,
broadcast cleanup, and script focus. Each candidate is still a real parameter
chain, not a label. Rendering the set into the same deck turns taste and acting
judgment into a repeatable A/B workflow instead of isolated guessing.

Render Deck is the audition layer after rendering. Every offline preview or full
render can be kept as a bounded in-memory take with F0 movement, level delta,
tone delta, texture delta, and a review score. The deck is intentionally capped
by item count and total seconds so comparison does not become an unbounded audio
buffer leak.

Take Decision is the keeper-selection layer above the deck. It ranks retained
takes by target macro/director fit, Script Match evidence, render safety, and
variant intent. This still does not claim to judge taste or acting beauty, but
it turns "which one should I keep?" into an evidence-backed workflow instead of
forcing the user to infer everything from isolated cards.

Keeper Refinement closes that loop. After a keeper is selected, the app should
convert the weakest evidence into a next-render patch: target axis corrections
when the character recipe drifted, performance moves when Script Match missed
lift/release/breath/energy, and mix guards when safety evidence is weak. This
keeps auditioning from becoming a dead-end score display.

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
- optionally apply Performance Script / Acting Automation to time-vary the
  offline DSP chain
- generate audition variants for nearby macro/director directions
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
