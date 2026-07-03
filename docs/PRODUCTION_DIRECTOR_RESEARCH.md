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

## Character Safety Loop

The fourth production-director pass adds a source-adaptive safety stage before Character Transform output.

Research decisions:

- Celemony Melodyne treats formants as pitch-independent spectral emphasis regions that define tone color/timbre, and its Formant Tool can make a voice sound more masculine/feminine or deliberately denatured. VoiceForge therefore treats formant-like movement as an identity-risk control, not just another EQ knob.
- Professional vocal pitch/time manipulation guidance consistently warns that large pitch shifts create artifacts unless source quality, moderation, and formant preservation are handled carefully. VoiceForge therefore clamps large non-creative pitch/formant moves before rendering.
- De-essing practice treats sibilance, EQ, compression, and air as interdependent. iZotope notes that de-essers should suppress harsh sibilance while keeping speech natural/intelligible, and that multiple light passes can be more natural than one heavy hand. VoiceForge therefore caps added air/presence/saturation on sibilant or harsh sources and raises de-ess/soft consonants instead.
- Creative robot/creature voices are intentionally non-human, so they get wider pitch/formant limits while still preserving clipping/headroom review.

Implementation response:

- `applyCharacterSafety()` normalizes preset/macros once, then clamps pitch, formant-like movement, pitch/formant divergence, air, presence, saturation, breath, whisper, and consonant softness according to the source profile and Studio Analysis problem scores.
- `OfflineRenderer.render()` now separates `calibrationDelta` from `safetyDelta`, so source tuning and destructive-transform prevention remain auditable.
- Guided Studio, Render Deck, render review, export ZIP metadata, and Project Vault snapshots now preserve Character Safety status and top moves.
- The safety stage is deliberately conservative for human targets and permissive only for creative robot/creature voices.

Sources:
https://helpcenter.celemony.com/M5/doc/melodyneStudio5/en/M5tour_ToolFormants?env=standAlone
https://www.sonarworks.com/blog/learn/can-you-stretch-or-shift-vocals-without-artifacts-using-plugins
https://www.izotope.com/community/blog/the-dos-and-donts-of-de-essing

## Micro Repair Timeline Loop

The fifth production-director pass moves Studio Polish further away from static global processing. Mouth clicks, plosives, and sibilance are now detected as local waveform events before the broad polish chain runs.

Research decisions:

- RX De-click and Mouth De-click expose sensitivity as a detector threshold, and iZotope warns that excessive sensitivity can damage plosives or the original signal. VoiceForge therefore records detected repair events and applies bounded local work before the broader de-click/de-ess stages.
- Plosive guidance from Transom and production-engineering practice treats P-pops as short low-frequency air bursts. A high-pass or low shelf can reduce them, but broad EQ can thin the whole voice. VoiceForge therefore uses short low-band event subtraction before the general high-pass.
- De-essing workflow is inherently dynamic: find the problematic high band, reduce only when sibilance appears, and avoid dulling the whole voice. VoiceForge therefore adds short high-band event ducking before its existing lookahead de-esser.
- This is still classical DSP, not AI restoration. The product claim is now stronger because the engine can say which time-local events it touched.

Implementation response:

- `buildMicroRepairTimeline()` detects mouth-click, plosive, and sibilance events with band-limited envelopes, event spacing, and bounded risk scores.
- `applyStudioPolishPlan()` now runs event-local interpolation/low-band/high-band subtraction before the existing global repair chain.
- Source analysis, polish plans, export metadata, Project Vault snapshots, Guided Studio pills, analysis cards, tests, and quality reports all retain micro-repair evidence.

Sources:
https://downloads.izotope.com/docs/rx6/21-de-click/index.html
https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/mouth-de-click/index.html
https://transom.org/2016/p-pops-plosives/
https://www.production-expert.com/production-expert-1/how-to-reduce-plosive-thumps-in-vocal-recordings

## FFT Tone Map Loop

The sixth production-director pass adds Fourier-domain voice evidence to Studio Polish. The previous band profile used IIR-filtered RMS bands, which is useful, but professional AutoEQ and spectrum-analyzer workflows rely on visible spectral shape, resonant peaks, centroid/brightness, rolloff, and tilt.

Research decisions:

- Auphonic describes AutoEQ as automatically analyzing and optimizing the frequency spectrum of voice recordings to avoid speech that sounds sharp, muddy, or unpleasant.
- FabFilter Pro-Q emphasizes spectrum-analyzer visibility and dynamic EQ as a way to perform subtle surgical edits when resonances or harsh bands appear.
- Spectral descriptors such as centroid, rolloff, flatness, and spectral slope are standard low-level audio features. They are not "the sound" by themselves, but they are useful objective evidence for brightness, noisy texture, and spectral balance.

Implementation response:

- `analyzeSpectralVoice()` performs a bounded radix-2 FFT analysis over a small set of Hann-windowed frames, returning centroid, 85/95% rolloff, flatness, dB/octave tilt, relative vocal bands, and resonant peaks.
- `analyzeStudioVoice()` now combines FFT risks with the existing IIR band profile for dark/thin/mud/nasal/harsh/sibilance decisions.
- Source cards, export metadata, Project Vault snapshots, tests, and quality reports retain FFT Tone Map evidence.

Sources:
https://auphonic.com/help/algorithms/singletrack.html
https://auphonic.com/blog/2023/01/24/autoeq-beta/
https://www.fabfilter.com/help/pro-q/using/analyzer
https://www.mathworks.com/help/audio/ug/spectral-descriptors.html

## Dynamic Tone Surgery Loop

The seventh production-director pass turns tone cleanup from fixed EQ cuts into source-adaptive dynamic tone surgery.

Research decisions:

- FabFilter Pro-Q documents dynamic EQ as program-dependent band behavior, and Pro-Q 4 positions dynamic/spectral EQ and spectrum visibility as core professional workflow tools.
- iZotope's dynamic-EQ guidance separates narrow resonance control from broad multiband compression: use dynamic EQ when the problem is a specific tone that should only move when it becomes excessive.
- iZotope's de-essing guidance reinforces the same pattern for sibilance: detect an aggressive frequency range and attenuate it while keeping the voice natural and intelligible.
- Community studio practice agrees with the caution: voice work usually uses gentle EQ/compression/de-ess, and RX-style repair is safer as staged light passes before later processing changes the detectability of clicks or resonances.

Implementation response:

- `buildStudioPolishPlan()` now emits `toneSurgery` metadata with mud, nasal, and harsh bands chosen from FFT peak evidence when available.
- `applyStudioPolishPlan()` replaces fixed 245/930/3300 Hz static cuts with dynamic-EQ-style tone bands: a light constant cut plus a deeper cut crossfaded only when a band-limited envelope exceeds its threshold.
- Export notes, Project Vault snapshots, render cards, tests, and quality reports retain the chosen band, risk, trigger, and evidence so studio decisions remain auditable.

Sources:
https://www.fabfilter.com/help/pro-q/using/dynamic-eq
https://www.fabfilter.com/products/pro-q-4-equalizer-plug-in
https://www.izotope.com/community/blog/when-to-use-dynamic-eq-in-a-mix
https://www.izotope.com/community/blog/the-dos-and-donts-of-de-essing
https://www.reddit.com/r/audioengineering/comments/10rw2ym/how_much_magic_to_put_on_a_podcast/
https://www.reddit.com/r/audioengineering/comments/15ac6yu/care_to_share_some_izotope_rx_hottakes_or_tips_n/

## Loudness Mastering Loop

The eighth production-director pass adds broadcast/podcast-style loudness evidence. RMS and sample peak are useful engineering values, but they are not enough for a studio product because streaming/podcast delivery is judged by perceived loudness and true-peak headroom.

Research decisions:

- Apple Podcasts recommends overall loudness around `-16 dB LKFS` with `+/- 1 dB` tolerance and true peak no higher than `-1 dB FS`, calculated according to ITU-R BS.1770 before encoding.
- ITU-R BS.1770 defines the loudness algorithm around K-weighting, mean-square energy, 400 ms gated blocks, and true-peak indication.
- AES's loudness education summarizes K-weighting as an 80 Hz low-frequency cutoff plus a presence shelf designed to better match subjective broadcast loudness.
- Auphonic stresses the practical studio point: peak normalization alone does not match human loudness perception, so podcast speech should be normalized by loudness with true-peak constraints.

Implementation response:

- `analyzeLoudness()` adds a static-site-safe BS.1770-style mono proxy: K-weighted filtering, 400 ms absolute/relative gated integrated LUFS, short-term/momentary values, LRA proxy, and 4x Hermite true-peak proxy.
- `analyzeBuffer()` now carries loudness and true-peak metadata, so source analysis, render analysis, export manifests, and Project Vault snapshots keep delivery evidence.
- Studio Polish uses integrated LUFS as `loudnessProxyDb` when available and uses true peak for headroom/ceiling warnings.
- Offline render now performs final bounded loudness mastering after Studio Polish and character processing, raising or trimming the finished render toward the selected production target while respecting the true-peak ceiling.
- UI, export notes, Project Vault snapshots, and quality reports show LUFS and dBTP instead of only RMS/sample peak.

Sources:
https://podcasters.apple.com/support/893-audio-requirements
https://www.itu.int/rec/R-REC-BS.1770
https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-3-201208-S!!PDF-E.pdf
https://aes.org/resources/audio-topics/loudness-project/learn-more/
https://auphonic.com/blog/2011/07/25/loudness-normalization-and-compression-podcasts-and-speech-audio/
https://auphonic.com/features/loudnorm

## Room Floor Shaping Loop

The ninth production-director pass improves the silence and room-floor behavior between phrases. A professional voice track should not pump, chatter, or drop into unnatural digital silence, but low-level room/device noise should not be lifted by later compression and mastering.

Research decisions:

- Podcast and voiceover workflows typically place cleanup before compression because compression makes noise, breaths, and mouth tails more audible.
- RX-style dialogue tools separate dialogue isolation/noise reduction from mouth repair; both should be conservative because over-reduction can create watery tails, chopped consonants, or dead room tone.
- Gate/expander practice for spoken voice favors threshold, range, hold, and release over hard muting. A downward expander with limited range is safer than an infinite gate for natural speech.
- Breath and room tone are not always defects. The product should attenuate room floor and messy tails while preserving enough continuity that close speech still feels embodied.

Implementation response:

- `buildStudioPolishPlan()` now emits `roomShaper` metadata with threshold, range, attack, hold, release, and room-tone policy.
- `reduceRoomNoise()` is now a bounded downward-expander-style room floor shaper rather than a simple quiet-sample gain dip.
- Export notes, Project Vault snapshots, render cards, tests, and quality reports retain room-floor evidence.

Sources:
https://rode.com/en-us/about/news-info/a-guide-to-audio-processing-and-fx-for-podcasting
https://s3.amazonaws.com/izotopedownloads/docs/rx9/en/dialogue-isolate/index.html
https://downloads.izotope.com/docs/rx6/36-voice-de-noise/index.html
https://transom.org/2015/podcasting-basics-part-3-audio-levels-and-processing/
https://www.reddit.com/r/audioengineering/comments/10rw2ym/how_much_magic_to_put_on_a_podcast/

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

## URL Import Loop

The third loop adds audio URL import as a static-site-safe source path. This is not a backend upload feature; it uses the browser only:

1. Fetch an audio URL as an ArrayBuffer.
2. Decode complete audio data with Web Audio `decodeAudioData()`.
3. Mix to mono, analyze, and run the same Studio Polish / Character / Export chain used by file uploads.

Design constraints:

- Relative and same-origin URLs work well for GitHub Pages demos and local fixtures.
- Cross-origin URLs depend on CORS headers from the host.
- The source metadata records whether audio came from generated, file, or URL input so exports and project snapshots remain auditable.

Sources:
https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
https://github.com/mdn/content/blob/main/files/en-us/web/api/baseaudiocontext/decodeaudiodata/index.md?plain=1

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
- URL import was verified in the in-app Browser with the private local fixture `/tests/data/konichiwabokunonamaewayamadatarodesu.webm`. The app decoded a 7.0s source locally, analyzed it as a medium source, showed repair steps for Mouth De-click, Tone Surgery, De-ess, and Level / Dynamics, then completed Polish -> Character render with WAV/WebM/ZIP enabled.
- Character Safety was verified in the in-app Browser with the same private fixture and Kawaii / Anime target. The Guided Studio and Render Deck showed `Safety Guarded` with pitch, formant-like, and air clamps, while WAV, WebM, and ZIP export controls became available.
- Micro Repair Timeline was verified in the in-app Browser with the same private fixture. The source analysis showed `43 events / M27 P3 S13`, Guided Studio showed the same micro count before rendering, and the rendered analysis preserved `Polish Events` with WAV/WebM/ZIP enabled.
- FFT Tone Map was verified in the in-app Browser with the same private fixture. The source analysis showed `FFT Tone 616 Hz / 563 Hz / -12.1 dB/oct` alongside Micro Repair evidence, so tone risks now have spectral evidence in UI, exports, and project snapshots.
- Dynamic Tone Surgery was verified in the in-app Browser with the same private fixture, Kawaii / Anime target, and Director Optimize enabled. The rendered metric card showed `Low-Mid Mud 255Hz / Nasal Ring 1050Hz / Presence Harshness 3469Hz`, and WAV/WebM/ZIP export controls were enabled after full render.
- Loudness Mastering was verified in the in-app Browser through the static deep link `?audio=/tests/data/konichiwabokunonamaewayamadatarodesu.webm&target=kawaii&polish=standard&director=1&render=full`. The source showed `-24.0 LUFS / -5.8 dBTP`, final mastering showed `+6.8 dB -> -19.2 LUFS`, and the render showed `-19.2 LUFS / -1.6 dBTP` with WAV/WebM/ZIP controls enabled.
- Room Floor Shaping was verified through the same private-fixture deep link. The rendered metric card showed `Room Floor -58 dB / -3 dB`, while Tone Surgery, Master Gain, Render Loudness, Render True Peak, and WAV/WebM/ZIP export readiness remained visible.

Open follow-up:

- CLI-side private WebM decoding is still blocked by the lack of `ffmpeg` or an equivalent local decoder in this workspace. Browser upload should be retried after Chrome extension file access is available, but URL import now provides a working local fixture path without committing the private sample.
- The in-app Browser runtime also blocks page `import()` and `fetch()` inside evaluation, so it cannot currently decode `tests/data/konichiwabokunonamaewayamadatarodesu.webm` through a test-only eval path. A proper local fixture runner or Chrome file-access fix is the next path for private-sample regression.
