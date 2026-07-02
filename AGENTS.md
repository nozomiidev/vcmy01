# AGENTS.md

AI agents working in this repository must read `CODEX.md` first.

Essential rules:

- Keep the product deployable as static files on GitHub Pages.
- Do not add a required backend.
- The target is a character voice studio / super voice changer, not only pitch,
  EQ, and reverb presets.
- Push browser DSP and offline rendering as far as practical before adding AI.
- Keep user audio local by default.
- Demo quality is forbidden. Build toward product-level polish, maintainable
  architecture, fast rendering, smooth animation, error tolerance, and extensible
  future workflows/effects.
- Use OSS, CDNs, WASM, static model assets, and community work when they improve
  quality and fit the static GitHub Pages/privacy/license constraints.
- Commit and push at appropriate coherent milestones when ongoing product work
  has been requested.
- When Chrome GUI is needed, only use a window/account confirmed as
  `nozomidevbusin@gmail.com` by opening `https://myaccount.google.com/` in a
  temporary tab and reading the visible email.
- Do not use microphone/camera/location/download/upload/account-changing actions
  without explicit approval.

Primary docs:

- `CODEX.md`
- `docs/PROJECT_BRIEF.md`
- `docs/DSP_STRATEGY.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPMENT_RULES.md`
