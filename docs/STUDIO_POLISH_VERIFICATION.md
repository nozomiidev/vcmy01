# Studio Polish Verification Notes

Date: 2026-07-03

## Automated Checks

- `npm test` passed for DSP core, Studio Polish analysis, guardrails, offline render metadata, and export manifest helpers.
- `npm run quality` passed with 44 character preset cases and 4 Studio Polish cases.
- Quality report now tracks Studio Polish pass/warn/fail separately from character preset regression.

## Browser Checks

- In-app Browser loaded `http://127.0.0.1:4174/` and verified the Offline guided flow renders `Source -> Clean -> Polish -> Character -> Export`.
- Generated source analysis produced Studio Polish diagnostics, including level, noise floor, plosive, mouth click, sibilance, tone balance, and dynamics cards.
- Polish-only render and full Character render completed and enabled WAV, WebM, and ZIP export controls.
- In-app Browser does not support download events, so file creation was verified in Chrome.

## Chrome Checks

- Chrome account/window was confirmed as `nozomidevbusin@gmail.com` before operating the Chrome UI.
- Chrome generated-source flow completed full render and created:
  - `Generated Neutral Medium - VoiceForge full.wav`
  - `Generated Neutral Medium - VoiceForge full.webm`
  - `Generated Neutral Medium - VoiceForge full.zip`
- ZIP package contents were verified:
  - rendered WAV
  - rendered WebM
  - `settings.json`
  - `analysis.json`
  - `research-notes.md`

## Local Voice Sample

- `tests/data/konichiwabokunonamaewayamadatarodesu.webm` is ignored by Git and was not staged.
- Chrome file chooser upload was attempted only against the local static app, but the Codex Chrome extension returned `Not allowed` when setting the local file. Manual upload should work after enabling the extension file access setting described by the Chrome plugin docs.

## Listening Review Notes

- Generated sample before/after was checked structurally with objective indicators rather than treated as a final aesthetic verdict.
- Studio Polish is intentionally conservative: it improves level, headroom, repair planning, and harsh/ess/body balance before character processing.
- Character transforms now run after polish and expose guardrail risk when pitch, formant-like shift, breath, or wet effects move toward breakage.
- Remaining subjective work: run A/B listening on real spoken samples once Chrome upload permission is enabled or a non-private committed fixture is added.
