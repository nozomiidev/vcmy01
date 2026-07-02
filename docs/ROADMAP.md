# Roadmap

This roadmap is intentionally staged. Each stage should leave the app usable on
GitHub Pages.

## Stage 0 - Stabilize The Prototype

- Keep the current app working.
- Document constraints and direction.
- Fix obvious text/encoding issues if they reappear.
- Add a small manual smoke-test checklist.
- Keep processed recording and preset storage stable.

## Stage 1 - Restructure Without Changing Product Behavior

- Split `index.html` into maintainable static files if useful.
- Keep deployment simple for GitHub Pages.
- Create a clear audio engine module boundary.
- Create a preset schema that can support character macros later.
- Add basic browser regression checks for the home/studio flows.

## Stage 2 - Real-Time DSP Upgrade

- Replace or improve the current pitch/formant-like processor.
- Add better F0 estimation and voice activity detection.
- Add de-esser, exciter, dynamic EQ, and multiband dynamics.
- Add breath/whisper/noise shaping.
- Improve limiter and loudness behavior.
- Add diagnostics that show when features are active or unavailable.

## Stage 3 - Recorded/Uploaded Audio Post-Processing

- Add a take-processing view.
- Reuse the same preset/effect schema for offline rendering.
- Support preview, A/B, render, and export.
- Allow offline-only high-quality modes that are too expensive for live use.

## Stage 4 - Character Preset System

- Redesign presets around character targets, not only effects.
- Add macro controls such as cuteness, intimacy, breath, body, and anime amount.
- Add source-voice calibration.
- Build target voices:
  - kawaii / anime bright
  - otome romantic
  - sultry ikemen
  - whisper / ASMR
  - streamer polish
  - narrator / radio
  - creature / monster / robot

## Stage 5 - Quality Evaluation

- Add repeatable reference phrases for manual testing.
- Compare original, live processed, and offline processed audio.
- Track latency, clipping, loudness, CPU load, and browser support.
- Keep subjective listening notes per preset.

## Stage 6 - Optional Browser AI Voice Conversion

Only start this stage after DSP limits are clear.

- Research static-browser deployment options.
- Prototype optional model loading.
- Measure latency and CPU/GPU load.
- Document model license and size.
- Keep non-AI fallback presets useful.
- Do not require a backend server.

## Always-On Work

- Preserve privacy and local-first behavior.
- Keep docs current with architecture changes.
- Test on Chrome first, then other browsers as practical.
- Keep the GitHub Pages deployment path simple.
