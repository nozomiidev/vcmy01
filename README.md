# VoiceForge / vcmy01

Prototype repository for a browser-only voice changer and recording studio.

The current app is a promising static GitHub Pages prototype, but the target is
larger than a simple pitch/EQ effect box: this project should evolve toward a
general-purpose "super voice changer" for character-style voices such as otome
game romantic voices, sultry ikemen voices, anime voices, and kawaii voices.

## Hard Constraints

- Must run as a static web service on GitHub Pages.
- May be split into multiple HTML/CSS/JS/WASM/model asset files.
- Must not require a backend server for the core product.
- Prefer local/browser-side processing. Do not upload user audio by default.
- AI voice conversion is allowed only after the browser DSP path has been pushed
  as far as practical and the remaining gap is clear.

## Current Prototype

`index.html` currently includes:

- Web Audio / AudioWorklet based real-time voice effects.
- Pitch and "formant-like" controls.
- Character macros for cuteness, anime lift, intimacy, breath, body, and
  consonant softness.
- Character Director controls for phrase lift, ending softness, delivery
  energy, close-mic distance, romantic breath placement, and confidence.
- Repeatable Line Read targets that apply character-specific performance
  settings for otome, kawaii, anime, ikemen, ASMR, streamer, narrator, and
  calibration reads.
- Line Read target visualization with radar and per-axis gap bars for lift,
  softness, energy, distance, breath placement, confidence, and related macros.
- Offline generated/uploaded source processing with analysis, A/B compare,
  preview-region rendering, source-aware Auto Tune, and WAV export.
- EQ, dynamics, ambience, delay, robot/creature effects, monitoring, meters,
  local take storage, and diagnostics.

Known product capability gap:

- It sounds like a conventional DSP voice changer, not a convincing character
  voice studio.
- Pitch/formant changes are not enough for kawaii/anime/ikemen/otome voices.
- Prosody, breath, whisper, and mouth/voice-tract character need further
  refinement to feel like performed character voices.
- The Character Director layer is now functional, but still uses DSP
  approximations rather than real phrase understanding, emotion transfer, or
  actor-style timing conversion.
- Offline post-processing has region preview, but still needs a fuller
  production workflow for takes, batches, non-destructive effect stacks, and
  longer uploaded files.
- The app still needs richer performance targets, repeatable line-read tests,
  phrase/ending behavior, distance, emotion, and delivery workflows beyond the
  first Director controls and first Line Read target set.

## Documentation Map

- [CODEX.md](CODEX.md) - Codex-facing project rules and priorities.
- [AGENTS.md](AGENTS.md) - short Codex/agent entrypoint.
- [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) - product vision and success bar.
- [docs/DSP_STRATEGY.md](docs/DSP_STRATEGY.md) - DSP-first technical strategy.
- [docs/RESEARCH_NOTES.md](docs/RESEARCH_NOTES.md) - voice conversion,
  browser audio, and future AI/WASM research notes.
- [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md) - key audio
  architecture decisions and rationale.
- [docs/ROADMAP.md](docs/ROADMAP.md) - phased implementation plan.
- [docs/DEVELOPMENT_RULES.md](docs/DEVELOPMENT_RULES.md) - static site, testing,
  browser operation, and safety rules.
- [docs/ex_prot_prompt.md](docs/ex_prot_prompt.md) - original prototype prompt
  kept as context and a cautionary reference.

## Development Notes

This repository is intentionally small right now. Future work may split the app
into `src/`, `styles/`, `assets/`, and optional `wasm/` or `models/` directories,
as long as the built result remains deployable by GitHub Pages as static files.

When browser GUI testing requires Chrome, use only the Google account window for
`nozomidevbusin@gmail.com`. See [docs/DEVELOPMENT_RULES.md](docs/DEVELOPMENT_RULES.md).

## Local Checks

- `npm test` runs the DSP unit and quality assertions.
- `npm run quality` renders every factory preset against multiple generated
  reference source voices and reports clipping, loudness, F0 movement,
  brightness movement, breath/frication texture movement, and aggregate render
  speed across every preset/profile pair.
- `npm run serve` starts a no-build static server for browser verification.
