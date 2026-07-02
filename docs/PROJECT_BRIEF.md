# Project Brief

## One-Line Goal

Build a static GitHub Pages voice transformation studio that can move beyond
basic effects and toward convincing character voices.

## What The User Wants

The desired product is closer to a real-time character voice generation studio
than to a conventional "pitch up / pitch down" voice changer.

The aspirational voices include:

- otome game style romantic voice
- sultry ikemen voice
- anime voice
- kawaii voice
- breathy close-mic / whisper / ASMR voice
- polished streamer, narrator, radio, and podcast voices
- stylized fantasy, creature, robot, telephone, and lo-fi voices

The current prototype is a good base, but it does not yet satisfy the
"super voice changer" expectation.

## Why Basic Voice Changers Fail

Simple pitch shifting, EQ, reverb, and distortion can create obvious effects,
but they usually do not change perceived character identity.

Convincing character voices need a combined model of:

- F0 range and pitch contour
- true or approximate formant / spectral-envelope movement
- harmonic brightness and low-mid body
- breath, whisper, frication, and de-essing
- dynamics, proximity, and saturation
- voiced/unvoiced separation
- syllable endings, pauses, intonation, and delivery style
- source-voice calibration

DSP can improve many of these, but full "different speaker" conversion is a
voice-conversion problem, not just an effects-chain problem.

## Product Principles

- Static first: everything must work on GitHub Pages.
- Local first: audio should stay on the device unless the user explicitly
  chooses otherwise.
- Honest capability: call DSP "DSP" and AI conversion "AI conversion."
- Real-time matters: the app should support live monitoring when possible.
- Offline matters too: recorded or uploaded audio should be re-processable with
  the same character chains.
- Presets are product design, not labels. A voice preset should explain and
  encode a coherent character target.

## Current Prototype Strengths

- Good single-page app foundation.
- Real-time Web Audio path.
- AudioWorklet processing where available.
- Monitoring, metering, waveform/spectrum/pitch displays.
- Processed-output recording and local take storage.
- Preset management in browser storage.

## Current Prototype Gaps

- Character transformations are mostly conventional DSP effects.
- The formant control is only "formant-like."
- Prosody and performance style are not modeled.
- Recorded-take post-processing is not a first-class workflow.
- Presets do not yet adapt to the user's original voice.
- There is no clear distinction between quick effects, character voices, and
  future AI voice conversion.

## Success Bar

A future version should let a user pick "kawaii anime," "otome romantic,"
"sultry ikemen," or "breathy close" and hear a transformation that is not just
higher/lower pitch. The output should feel intentionally shaped in mouth size,
brightness, body, breath, dynamics, and delivery guidance.
