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
- EQ, dynamics, reverb, delay, chorus, robot, crush, monitoring, and meters.
- Processed-output recording with local take storage and WAV/WebM export.
- Preset save/import/export in browser storage.

Known product gap:

- It sounds like a conventional DSP voice changer, not a convincing character
  voice studio.
- Pitch/formant changes are not enough for kawaii/anime/ikemen/otome voices.
- Prosody, breath, whisper, mouth/voice-tract character, and performance macros
  are not yet first-class features.
- Applying a full effect chain to already-recorded or uploaded audio needs to be
  designed as a separate offline workflow, even though live processed recording
  already exists.

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
