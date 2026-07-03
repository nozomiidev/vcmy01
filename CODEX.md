# CODEX.md

This file is the project brief for Codex and other AI coding agents working on
this repository. Read it before changing code.

## Non-Negotiable Constraints

- This project must remain a static web service that runs on GitHub Pages.
- A single `index.html` file is not required. Multiple static HTML, CSS, JS,
  WASM, audio, and model files are allowed.
- Do not introduce a required backend for the core experience.
- User audio should stay local by default. Any network upload or external
  service use needs explicit user approval.
- The product target is not "basic pitch changer." The target is a browser
  character voice studio / super voice changer.

## Product Direction

The current prototype is useful but too simple. It should evolve toward
convincing character transformations:

- otome game style romantic voice
- sultry ikemen voice
- anime voice
- kawaii voice
- whisper / ASMR / breathy close-mic styles
- high-quality streamer / radio / narrator voices
- stylized robot, monster, creature, phone, and lo-fi voices

Do not treat these as preset names only. A preset must combine voice range,
spectral envelope, harmonic brightness, breath/noise shaping, dynamics, spatial
distance, and eventually prosody/performance macros.

## Quality Posture

Demo quality is forbidden. The goal is product-level craft, not an MVP, sample,
template, or thin technical proof.

- Prefer maintainable architecture over giant tangled code.
- Keep rendering fast and animations smooth.
- Prevent memory leaks, runaway audio graphs, unreleased object URLs, abandoned
  workers, and unbounded buffers.
- Build high-quality DSP where DSP is the feature.
- Design for error tolerance and graceful recovery.
- Make the architecture easy to extend with future plugins, workflows, effects,
  offline render steps, and optional model-backed engines.
- Do not use visible guide text, templates, or demos as a substitute for real
  capability.
- Do not ask the user to confirm routine design choices when the direction is
  already clear. Make the best product decision and continue.

Use community assets aggressively when they improve the product. Do not treat
"built from scratch" or "standard APIs only" as a virtue. OSS libraries, CDN
assets, WASM modules, model assets, browser APIs, and other community work are
allowed when they fit the static GitHub Pages constraint, license, privacy, and
performance budget.

Avoid timid engineering. Heavy UI, assets, and features may be appropriate if
they materially raise quality. Prefer lazy loading, workers, caching, streaming,
cleanup, profiling, and careful optimization over avoiding ambitious features.

## Technical Strategy

Work in this order:

1. Preserve and understand the current static prototype.
2. Research pro voice repair, podcast/radio polish, and voice changer practice
   while implementing, not as a detached paper exercise.
3. Build Studio Polish before Character Transform: analyze, clean, polish, then
   apply character direction.
4. Strengthen browser-side DSP first.
5. Add real-time and offline paths that share the same effect model.
6. Add calibration so presets adapt to the user's source voice.
7. Only then consider browser AI voice conversion if DSP cannot reach the
   desired character-voice quality.

AI is allowed, but it is not the first move. If AI is introduced, it must still
fit GitHub Pages deployment through static model assets loaded by the browser,
for example optional ONNX/WebGPU/WASM assets. Model size, license, latency,
privacy, and fallback behavior must be documented.

## Current Prototype Boundaries

The current `index.html` already has Web Audio / AudioWorklet processing,
monitoring, meters, presets, and processed-output recording. However:

- "formant-like" is not true voice-tract/spectral-envelope transformation.
- Prosody is not transformed.
- Breath, whisper, de-essing, dynamic EQ, exciter, and multiband character
  shaping are not yet enough for character voices.
- Recorded-take post-processing needs a dedicated offline render workflow.

When improving the app, name these limits honestly in code comments, docs, and
UI wording. Avoid marketing a feature as AI-level voice conversion unless it is
actually doing speaker/identity conversion.

## Chrome GUI Rule

Chrome GUI operation is allowed and encouraged when it is useful for browser
testing, service checks, research, or account-bound workflows. Before touching
Chrome:

1. Confirm the connected Chrome profile/window belongs to
   `nozomidevbusin@gmail.com`.
2. Do not rely on profile name alone. Open a temporary tab to
   `https://myaccount.google.com/` and read-confirm that the visible email is
   `nozomidevbusin@gmail.com`.
3. Only operate that confirmed account/window.
4. Do not operate other accounts, other profiles, or unconfirmed windows.
5. Prefer temporary tabs for tests. Avoid claiming or changing existing user
   tabs unless the task specifically requires it.
6. Restore any changed UI state such as theme, accent, localStorage-backed
   settings, or test data when practical.
7. Ask before microphone, camera, location, downloads, uploads, posting,
   permission changes, login changes, purchases, or other external side effects.
8. Finalize the browser session and close only the temporary tabs you created.

## Quality Bar

- Keep the app usable on GitHub Pages with no build step unless a build system is
  intentionally introduced and documented.
- Commit and push at appropriate, coherent milestones once tested, so useful
  progress is not left stranded in an oversized local diff.
- For frontend changes, test in a real browser when possible.
- For audio changes, test both real-time monitoring and recorded/offline output
  paths when they exist.
- Prefer measured audio state and clear UI diagnostics over vague claims.
- Keep docs current when changing product direction, constraints, or major audio
  architecture.

## Key Docs

- `docs/PROJECT_BRIEF.md`
- `docs/DSP_STRATEGY.md`
- `docs/STUDIO_POLISH_RESEARCH_MATRIX.md`
- `docs/RESEARCH_NOTES.md`
- `docs/ARCHITECTURE_DECISIONS.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPMENT_RULES.md`
- `docs/ex_prot_prompt.md`
