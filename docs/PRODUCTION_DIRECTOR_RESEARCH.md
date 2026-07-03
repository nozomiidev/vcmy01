# Production Director Research Loop

Date: 2026-07-03

## Research Question

Studio Polish First made the source safer, but a product-grade voice studio also needs a production target. The same raw voice should not be polished identically for podcast narration, talk radio, intimate ikemen, and bright kawaii/anime character direction.

The next loop adds a target-aware Production Director:

1. Choose the production target.
2. Build a conservative Studio Polish chain.
3. Run a bounded deterministic optimization pass.
4. Preserve the target, optimization score, and processing notes in render/export metadata.

## De Facto Workflow Signals

### Podcast / Radio Post

Auphonic documents a singletrack workflow built around adaptive leveling, loudness normalization, true-peak limiting, denoise/reverb reduction, adaptive filtering, AutoEQ, and automatic cutting. The key product lesson is that level, loudness, noise, tone, and unwanted segments are not separate user chores; they are a coordinated production pass.

Implementation response:

- Add production targets with different RMS proxy, peak ceiling, brightness, and band limits.
- Keep noise and plosive work before strong level/compression.
- Make the optimization pass penalize target loudness misses, peak risk, nasal/harsh/sibilance excess, and over-processing.

Source:
https://auphonic.com/help/algorithms/singletrack.html

### Dynamic EQ / Surgical Tone Control

FabFilter Pro-Q 4 frames dynamic EQ as level-dependent EQ bands for subtle surgical edits, similar to multiband compression but easier to reason about. VoiceForge cannot clone Pro-Q, but the design lesson is important: tone correction should not be only static EQ; it should react to source risk and avoid global dulling.

Implementation response:

- Keep bounded de-ess and dynamic high-band attenuation.
- Score band risks separately instead of treating all brightness as good.
- Let the optimizer move harshness, nasal, air, and presence in small bounded steps.

Source:
https://www.fabfilter.com/help/pro-q/using/dynamic-eq

### Real-Time Voice Changer Products

Voicemod presents voice design as chained real-time effects such as pitch, ambience, devices, reverb, echo, distortion, robot, radio, and phone-style processing. MorphVOX exposes pitch and timbre as core user-facing voice identity controls. The common product pattern is not a mastering plug-in UI; it is a target voice workflow with approachable macro controls.

Implementation response:

- Keep user-facing target names like Podcast Studio, Talk Radio, Ikemen Body, and Kawaii / Anime.
- Preserve lower-level chain details as evidence pills, not as the primary workflow.
- Keep true speaker-identity conversion documented as a later AI/VC gap.

Sources:
https://www.voicemod.net/en/voice-fx/
https://www.voicemod.net/en/voicelab/
https://screamingbee.com/docs/morphvoxpro/morphdocpitchtimbre

### Classical Voice Conversion Boundary

WORLD is a high-quality speech analysis/manipulation/synthesis system that estimates F0, spectral envelope, and aperiodicity. Rubber Band is a high-quality pitch/time library but GPL/commercial licensing matters for redistribution. These are important reference points, but not drop-in dependencies for the current static GitHub Pages iteration.

Implementation response:

- Use target-aware classical DSP and deterministic optimization now.
- Keep future vocoder/WASM research separate from current product claims.
- Avoid shipping GPL pitch libraries by accident.

Sources:
https://github.com/mmorise/World
https://github.com/breakfastquay/rubberband

## Production Target Model

| Target | Purpose | Polish Bias | Overuse Risk |
| --- | --- | --- | --- |
| Podcast Studio | Comfortable long-form listening | Balanced loudness, gentle AutoEQ, true-peak safety | Over-compression and noise pumping |
| Talk Radio | Forward broadcast presence | Stronger compression, presence, saturation | Fatigue, harshness, crushed dynamics |
| Ikemen Body | Warm close voice before character transform | Lower high-pass, less nasal, controlled air | Mud, proximity boom, dullness |
| Kawaii / Anime | Bright small-mouth source before character transform | Higher high-pass, more air/presence, tighter mud/nasal | Lisping, thinness, brittle sibilance |

## Optimization Design

The first Director Optimize pass uses deterministic simulated annealing over bounded Studio Polish parameters. It is intentionally small and classical:

- Variables: high-pass, mud/nasal/harsh EQ, de-ess, leveler, compression, presence, air, saturation, output gain.
- Objective: maximize repair score while matching target loudness, peak ceiling, brightness range, band limits, and minimal deviation from the conservative base plan.
- Guardrail: never let optimization bypass limiter safety, change length, or use unbounded gains.

This is not magic mastering. It is an audio-director assistant that turns professional target judgment into measurable constraints.

## Repair Map Loop

The second production-director pass turns Studio Polish into an ordered repair map instead of a bag of sliders.

Research decisions:

- RX Mouth De-click warns that higher sensitivity can damage plosives or the original signal, and notes that two passes can outperform one heavy pass. VoiceForge therefore exposes mouth repair as a staged decision and runs severe cases as two lighter passes.
- RX De-plosive recommends detecting plosives before high-pass filtering because plosive detection depends on very low-frequency energy. VoiceForge keeps De-plosive before HPF in both documentation and DSP order.
- FabFilter Pro-DS documents lookahead for catching the start of sibilance while preserving natural consonants. VoiceForge now uses a bounded lookahead path for de-ess when the source is sibilant enough to need it.
- Vocal EQ practice separates fundamental/body, vowels, nasal range, presence, sibilance, and air. VoiceForge reflects that as tone surgery instead of one generic "brightness" control.

Implementation response:

- `analyzeStudioVoice()` now returns `repairMap.steps`, `topIssue`, `nextAction`, and `overprocessRisks`.
- `buildStudioPolishPlan()` stores the target-aware repair map with the plan, so UI, exports, and project snapshots can explain why a chain was chosen.
- The Guided Studio surface shows the repair queue before low-level parameter details.
- Export ZIP research notes and `analysis.json` include repair-map evidence.

## Verification Notes

2026-07-03 local verification covered the new production-target and Director Optimize flow.

- Unit and quality suites passed with Director Optimize enabled.
- In-app Browser verified generated source -> analyze -> Render Polish -> Render Full Voice, with target and director evidence shown in the guided studio.
- In-app Browser cannot upload local private audio files in this environment, so `tests/data/konichiwabokunonamaewayamadatarodesu.webm` remains a local-only test asset.
- Chrome was used only after confirming the active Google account page showed `nozomidevbusin@gmail.com`.
- Chrome verified generated source -> analyze -> polish -> full render with `Kawaii / Anime` target and Director Optimize checked.
- Chrome download clicks generated real local files for WAV, WebM Opus, and ZIP in the Windows Downloads folder. The Chrome automation download event did not fire, so OS file presence is the reliable verification signal here.
- Computer Use bootstrap currently fails before app inspection with the bundled `@oai/sky` package export error; Browser and Chrome remain the usable GUI verification surfaces until that runtime is fixed.
- The repair-map loop was verified in the in-app Browser with generated source, Talk Radio target, and Render Polish. The UI showed ordered repair steps such as Mouth De-click, Room Noise, Tone Surgery, and Production Target, and WAV/WebM/ZIP became enabled after render.

Open follow-up:

- Local private WebM decoding is still blocked by the lack of `ffmpeg` or an equivalent local decoder in this workspace. Browser upload should be retried after Chrome extension file access is available, or a Node/browser-side decode fixture should be added without committing the private sample.
- The in-app Browser runtime also blocks page `import()` and `fetch()` inside evaluation, so it cannot currently decode `tests/data/konichiwabokunonamaewayamadatarodesu.webm` through a test-only eval path. A proper local fixture runner or Chrome file-access fix is the next path for private-sample regression.
