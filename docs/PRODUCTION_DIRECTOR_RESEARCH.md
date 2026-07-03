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

## Vocal Tract Character Loop

The tenth production-director pass moves the character engine away from only pitch/formant-like grains and generic EQ. It adds a lightweight source-filter-inspired vocal tract profile for apparent mouth size, chest resonance, and formant-region emphasis.

Research decisions:

- Praat vocal-tract manipulation treats apparent vocal tract size as a formant-shift operation, separate from pitch.
- Rubber Band and related production tools distinguish pitch shifting from formant preservation or formant manipulation; otherwise pitch shifts drag the timbre into chipmunk/giant artifacts.
- Source-filter speech processing models vocal identity as excitation plus a vocal-tract filter. A static browser app cannot do full LPC resynthesis yet, but it can still use bounded resonator banks to reinforce target mouth/chest cues.
- Community DSP guidance converges on the same distinction: a convincing voice changer needs pitch tracking or resynthesis for true formants, while simple filters are only a controlled approximation.

Implementation response:

- `vocalTractProfile()` derives formant-region centers, small-mouth bias, chest bias, and nasal guard from character parameters.
- `processVoiceBuffer()` now runs `vocalTractShape()` after formant-like granular shifting and before broad character EQ.
- Kawaii/anime profiles get higher apparent tract centers and small-mouth emphasis; ikemen/deep profiles get stronger chest resonance and nasal guarding.

Verification:

- In-app Browser private-fixture deep link completed source import, Standard polish, Kawaii full character render, Safety Guarded review, and WAV/WebM/ZIP export readiness after vocal-tract shaping.
- The local `konichiwabokunonamaewayamadatarodesu.webm` run reported Source Loudness -24.0 LUFS, Polish Events 43 / M27 P3 S13, Room Floor -58 dB / -3 dB, Tone Surgery at 255/1050/3469 Hz, Master Gain +6.3 dB toward -19.2 LUFS, Render Loudness -19.5 LUFS, and Render True Peak -1.2 dBTP.

Sources:
https://www.praatvocaltoolkit.com/change-vocal-tract.html
https://breakfastquay.com/rubberband/
https://github.com/breakfastquay/rubberband
https://dsprelated.com/freebooks/pasp/Formant_Synthesis_Models.html
https://dsp.stackexchange.com/questions/89674/change-pitch-of-voice

## A/B Audition Export Loop

The eleventh production-director pass strengthens export from "download the result" into "download the evidence needed to judge the result." Professional A/B and reference workflows repeatedly warn that louder processing is perceived as better, so comparisons need level matching before judging tone, articulation, mouth repair, breath, or character believability.

Research decisions:

- Reference and A/B tooling such as Perception AB centers on fast before/after switching, loudness matching, and compensation so the engineer hears processing choices rather than gain differences.
- Podcast workflows such as Transom's loudness guidance treat final loudness normalization as part of the production chain, not an afterthought.
- Community mastering and mixing practice also converges on level-matching references and processed material; useful, but it should be implemented as a bounded, measurable utility rather than accepted as folklore.

Implementation response:

- ZIP export now builds an `audition/` package with source, Studio Polish, and final character render WAV files matched to the final render loudness within true-peak safety.
- `analysis.json` now carries an A/B audition manifest with per-stage gain, matched LUFS, true peak, delta LU, and peak-limited warnings.
- `drawAnalysisCards()` exposes an A/B Match card so the user can see that the render is ready for fair before/polish/character listening before exporting.
- Render objects keep only a lightweight audition summary; long intermediate audio is regenerated on ZIP export to avoid retaining unnecessary memory for long files.
- WebM package encoding now has a timeout and WAV-package fallback because in-app Browser verification showed `MediaRecorder` can stall without an end event in some automation surfaces.

Verification:

- In-app Browser private-fixture render showed A/B Match Ready / 3 stages at -19.5 LUFS, Render Loudness -19.5 LUFS, Render True Peak -1.2 dBTP, and enabled WAV/WebM/ZIP controls.
- Clicking ZIP in the in-app Browser cannot complete a real download event on that surface, but the UI recovered from Encoding package back to Rendered - tuned with no console errors after adding the encoder timeout/fallback.

Sources:
https://www.production-expert.com/production-expert-1/an-accurate-way-to-make-ab-audio-comparisons
https://transom.org/2015/podcasting-basics-part-3-audio-levels-and-processing/
https://www.reddit.com/r/audioengineering/comments/1hnmimn/how_do_you_ab_with_your_reference_tracks/
https://gearspace.com/board/mastering-forum/1364051-b-ing-level-matching-original-mix-your-master.html

## Dual-Band De-Ess Loop

The twelfth production-director pass focuses on the "pleasant professional voice" layer before character conversion. The practical problem is that a voice can be technically loud and bright but still feel cheap because lower ess/presence around 3-5 kHz stabs the ear, while classic sibilance above 5 kHz spits. Treating both with one broad high-frequency cut either misses the lower pain or dulls the whole voice.

Research decisions:

- iZotope's de-essing guidance distinguishes wideband and spectral approaches; the important production idea is to attenuate only the sibilant event instead of darkening every word.
- Pro Audio Files' RX spectral de-ess walkthrough emphasizes previewing the ess-only path and backing off if whole words are being affected.
- Community engineering practice commonly stacks or splits de-essing: lower harsh ess around 3-4 kHz and brighter sibilance around 5-8 kHz need different thresholds and depths.
- Nasal cleanup stays in Tone Surgery around the 650-1300 Hz range; de-ess should not be used as a crude nasal remover.

Implementation response:

- Studio Polish plans now expose `deEssLow` and `deEssHigh` alongside the compatibility `deEss` value.
- `dualBandDeEss()` runs a gentler 3.2-5.2 kHz lower-ess duck followed by the existing upper-ess duck above 5.2 kHz.
- A light post-presence de-ess pass catches presence/air polish that reintroduces sharpness after the first repair pass.
- Tests cover bounded lower/high de-ess planning and a 3.6 kHz harshness fixture.

Verification:

- `npm run quality` remained all-pass after the split de-ess pass.
- In-app Browser private-fixture Kawaii render reported Polish Events 43 / M27 P3 S13, Tone Surgery 255/1050/3469 Hz, Master Gain +7.0 dB toward -19.2 LUFS, A/B Match Ready / 3 stages at -19.2 LUFS, Render Loudness -19.2 LUFS, Render True Peak -1.4 dBTP, and enabled WAV/WebM/ZIP controls.

Sources:
https://www.izotope.com/community/blog/the-dos-and-donts-of-de-essing
https://theproaudiofiles.com/video/rx-6-spectral-de-ess-tutorial/
https://www.reddit.com/r/audioengineering/comments/1qtbfw5/vocal_eq_midrange_harshness_and_deessing/
https://www.soundonsound.com/sound-advice/q-can-use-eq-fix-my-nasal-sounding-vocals

## Hybrid YIN F0 Tracking Loop

The thirteenth production-director pass improves the measurement layer under calibration, source-fit routing, character safety, and prosody review. Character macros are only as good as their source diagnosis: if F0 jumps an octave, kawaii/ikemen guardrails and performance scoring make the wrong decision.

Research decisions:

- The YIN paper improves autocorrelation-style pitch detection with a cumulative mean normalized difference function, reducing common pitch errors while remaining classical DSP.
- Speech pitch tracking practice often adds post-processing such as median, dynamic programming, or octave smoothing to remove isolated octave jumps.
- For this static browser app, the right next step is not a large neural F0 model; it is a lightweight hybrid that preserves the existing autocorrelation fallback while adding YIN confidence and local octave correction.

Implementation response:

- `estimatePitch()` now uses a YIN/autocorrelation hybrid per frame.
- The analyzer exposes `pitchMethod` and `pitchOctaveCorrections` so diagnostics can explain which pitch layer is active.
- Frame candidates are smoothed against the previous voiced frame to reduce octave jumps before median F0 is calculated.
- Offline analysis cards show the active Pitch Tracker so the measurement layer is visible to users and testers.

Verification:

- `npm test` and `npm run quality` passed after switching the analyzer to the hybrid tracker.
- In-app Browser private-fixture Kawaii render showed Source F0 246 Hz, Pitch Tracker yin-autocorr-hybrid, A/B Match Ready / 3 stages at -19.2 LUFS, Render Loudness -19.2 LUFS, Render True Peak -1.4 dBTP, Render F0 115 Hz, and enabled WAV/WebM/ZIP controls.

Sources:
https://pubmed.ncbi.nlm.nih.gov/12002874/
https://docs.rs/pitch-detection/latest/pitch_detection/detector/yin/index.html
https://www.mathworks.com/help/audio/ug/pitch-tracking-using-multiple-pitch-estimations-and-hmm.html
https://dsp.stackexchange.com/questions/17758/pitch-detection-avoiding-frequency-doubling-halving

## LPC Spectral Envelope Loop

The fourteenth production-director pass follows the source-filter map in `docs/koreyare.md`: character voice conversion needs pitch/source features and vocal-tract/filter features to be measured separately. The previous tract layer was parameter-driven; this pass adds an observed LPC envelope so Studio Polish and future formant conversion can see the source's resonant shape.

Research decisions:

- LPC is a classical source-filter speech model: it approximates the smooth vocal-tract spectral envelope and is widely used for formant analysis and speech coding.
- Praat's source-filter and formant documentation treats LPC parameter choices as important; model order and bandwidth assumptions can make formant values inaccurate, so the browser implementation should expose envelope evidence rather than pretend it is definitive formant truth.
- DSP practice distinguishes spectral peaks from spectral-envelope peaks. For vocal tract work, the envelope is often the thing we want, not every harmonic peak.
- LPC is strongest on stable voiced/vowel-like frames and less reliable on nasalized, noisy, or fricative-heavy speech; VoiceForge therefore uses it first as diagnostics and risk evidence, not as destructive resynthesis.

Implementation response:

- `analyzeSpectralVoice()` now computes an LPC autocorrelation envelope on the strongest speech frame.
- Spectral risk scoring can use LPC-envelope prominence for nasal and harsh resonance evidence.
- Export manifests, project snapshots, and the FFT Tone UI card retain/show LPC envelope metadata.

Verification:

- In-app Browser private-fixture Kawaii render showed FFT Tone `616 Hz / 563 Hz / -12.1 dB/oct / LPC 413 Hz`, Pitch Tracker `yin-autocorr-hybrid`, Render Loudness/True Peak cards, A/B Match, and enabled WAV/WebM/ZIP controls.

Sources:
https://support.ircam.fr/docs/AudioSculpt/3.0/co/LPC_1.html
https://www.fon.hum.uva.nl/praat/manual/Source-filter_synthesis_4__Using_existing_sounds.html
https://www.dsprelated.com/freebooks/pasp/Linear_Predictive_Coding_Speech.html
https://dsp.stackexchange.com/questions/34985/understanding-lpc-for-formant-estimation

## Perceptual Tone Map Loop

The fifteenth production-director pass follows the hearing map in `docs/koreyare.md`: raw FFT peaks are useful, but listeners hear grouped critical bands, masking, and cochlear-like frequency resolution. Studio Polish should therefore expose a psychoacoustic map before using stronger dynamic EQ or character tone moves.

Research decisions:

- ERB spacing is a good browser-friendly approximation for auditory filters because it gives narrower low-frequency resolution and wider high-frequency resolution without requiring a heavy gammatone filter bank.
- Bark/critical-band language is still useful for production judgment: if one ear band dominates, the voice can feel boxy, nasal, harsh, or sibilant even when a raw FFT peak list is noisy.
- This pass should remain diagnostic. A static browser product can later use the map for perceptual dynamic EQ, but the first safe move is to report salience and crowding without pretending to be a full cochlear model.

Implementation response:

- `analyzeSpectralVoice()` now computes an `erb-critical-band-tone-map` with 24 bounded perceptual bands, Bark/ERB coordinates, weighted ear center, adjacent contrast, and the most crowded speech band.
- Spectral risk scoring receives a small crowding boost for mud, nasal, presence, or sibilance when the perceptual map shows a dominant neighboring band.
- Export manifests, Project Vault snapshots, and the FFT Tone UI card retain/show the perceptual crowding band as `Ear xxx Hz`.

Verification:

- In-app Browser private-fixture Kawaii render showed `FFT Tone 616 Hz / 563 Hz / -12.1 dB/oct / LPC 413 Hz / Ear 387 Hz`, Pitch Tracker `yin-autocorr-hybrid`, Render Loudness/True Peak cards, A/B Match, no console errors, and enabled WAV/WebM/ZIP controls.

Sources:
https://www.mathworks.com/help/audio/ref/gammatonefilterbank-system-object.html
https://www.dsprelated.com/freebooks/sasp/Equivalent_Rectangular_Bandwidth.html
https://www.dsprelated.com/freebooks/sasp/Bark_Frequency_Scale.html
https://ansyshelp.ansys.com/public/Views/Secured/corp/v251/en/Sound_SAS_UG/Sound/UG_SAS/bark_scale_and_critical_bands_179506.html

## Perceptual Tone Surgery Loop

The sixteenth production-director pass turns the ERB map into action. Professional dynamic EQ workflows do not cut a frequency forever just because a spectrum peak exists; they trigger a narrow tonal move when a band becomes intrusive. For VoiceForge, this means tone surgery should prefer ear-band crowding, then LPC envelope peaks, then raw FFT peaks.

Research decisions:

- FabFilter's Dynamic EQ documentation frames dynamic EQ as level-dependent, subtle, surgical band movement, often triggered by a band-limited signal. That maps directly to the existing browser tone-surgery envelope.
- Critical-band/masking research says nearby dominant energy can obscure perception, so an ERB crowding band is a better first-choice detector than an isolated FFT bin when the goal is comfort and intelligibility.
- Community/pro workflow advice around masking and vocal clarity consistently favors small, targeted, A/B-checked subtractive or dynamic moves rather than broad permanent cuts.
- The safe implementation is not a full spectral-dynamics engine yet: use ERB salience as frequency/evidence for the existing dynamic EQ model, with a salience floor so near-zero bands do not create false surgical moves.

Implementation response:

- `buildToneSurgery()` now chooses tone-band frequency/evidence from ERB crowding first, LPC envelope second, FFT peak third, then target fallback.
- Tone-surgery band metadata now carries `perceptual` evidence (`centerHz`, Bark, ERB rate, salience, weight) into export manifests and Project Vault snapshots.
- Low-salience ERB candidates are ignored unless they are the actual crowded risk band, preventing fake precision in quiet/high bands.

Verification:

- In-app Browser private-fixture Kawaii render showed ERB/LPC-aware FFT Tone evidence plus `Tone Surgery: Low-Mid Mud 387Hz / Nasal Ring 1050Hz / Presence Harshness 3469Hz`, Render Loudness/True Peak cards, A/B Match, no console errors, and enabled WAV/WebM/ZIP controls.

Sources:
https://www.fabfilter.com/help/pro-q/using/dynamic-eq
https://pressbooks.umn.edu/sensationandperception/chapter/critical-bands-and-masking-draft/
https://www.masteringbox.com/learn/frequency-masking
https://www.dsprelated.com/freebooks/sasp/Equivalent_Rectangular_Bandwidth.html

## Pitch-Synchronous Grain Loop

The seventeenth production-director pass starts addressing the user's "macro filters break the voice" complaint at the pitch/formant core. The current shifter was a simple dual delay-line grain effect. It could move pitch, but the grain window was not tied to speech periodicity, so it could flutter or smear on voiced vowels.

Research decisions:

- WSOLA improves time-domain overlap-add by choosing waveform-similar overlap points, and it is known as a practical speech/audio time-scale approach.
- PSOLA is stronger for monophonic speech when reliable pitch marks are available, but a full pitch-mark/resynthesis implementation is larger than this pass.
- For the current static browser engine, the conservative next step is pitch-synchronous grain sizing: estimate F0, make the grain window span a stable number of glottal periods, normalize the two overlap taps, and improve fractional reads with cubic interpolation.
- This remains an interim classical DSP shifter, not Rubber Band, SoundTouch, WORLD, or neural VC. It is designed to reduce obvious breakage while keeping GitHub Pages constraints.

Implementation response:

- `granularShift()` and `prosodyPitchShift()` now choose a pitch-synchronous window when the source has enough voiced F0 confidence.
- The dual delay taps are normalized to reduce amplitude flutter.
- Delay reads now use cubic interpolation instead of linear interpolation to reduce zipper/roughness artifacts at moving fractional delays.

Verification:

- Unit regression confirms generated +4st shift moves F0 upward while preserving length, finite samples, and peak safety.
- `npm run quality` stayed all-pass with preset realtime factor `0.155`, studio polish `0.372`, and director polish `0.933`.
- In-app Browser private-fixture Kawaii render retained Pitch Tracker, Source F0, Render F0, Tone Surgery, A/B Match, Render Loudness/True Peak, no console errors, and enabled WAV/WebM/ZIP controls.

Sources:
https://www.isca-archive.org/eurospeech_1993/roelands93_eurospeech.html
https://speechprocessingbook.aalto.fi/Representations/Pitch-Synchoronous_Overlap-Add_PSOLA.html
https://www.surina.net/soundtouch/README.html
https://github.com/audacity/audacity/discussions/1524

## Realtime Worklet Pitch Sync Loop

The eighteenth production-director pass applies the same anti-breakage idea to live monitoring. The offline renderer can afford YIN/LPC-style analysis; the AudioWorklet cannot. Real-time voice change must keep the render callback short, avoid allocations, and avoid heavy search.

Research decisions:

- AudioWorklet code runs on the audio rendering thread, so pitch quality improvements must be bounded and allocation-light.
- WSOLA/PSOLA principles still matter in real time, but the browser live path should first use cheap voiced-period tracking rather than full pitch marking or FFT search.
- The worklet should preserve continuity first: normalized overlapping delay taps and better interpolation are safer than aggressive retuning.

Implementation response:

- `VoiceForgeProcessor` now tracks positive zero-crossing intervals during voiced segments and smooths them into a live `pitchPeriod`.
- Live pitch and formant windows use the smoothed period when confidence is plausible, falling back to fixed windows otherwise.
- Worklet delay reads now use cubic interpolation and normalized dual-window mixing, matching the offline shifter's artifact-reduction direction.

Verification:

- `node --check src/audio/worklet.js`, `npm test`, and `npm run quality` passed.
- In-app Browser private-fixture page load still showed `DSP ready`, the Live tab, no console errors, and the offline WAV/WebM/ZIP flow intact. Microphone permission was not triggered during this pass.

Sources:
https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process
https://www.isca-archive.org/eurospeech_1993/roelands93_eurospeech.html
https://www.surina.net/soundtouch/README.html

## Spectral Character Guardrail Loop

The nineteenth production-director pass connects the analysis stack to the "super voice changer" safety problem. Kawaii/anime/otome voices should not simply push pitch, formant, air, and presence harder when the source is already nasal, harsh, or sibilant. That is exactly how a voice becomes pinched, lispy, or metallic.

Research decisions:

- Character transformation needs source-adaptive limits. RVC/AI systems solve this with learned speaker/style separation, but this classical browser path must use measurable source evidence.
- LPC envelope peaks are useful for vocal-tract resonance warnings, while ERB crowding is useful for perceived nasal/harsh/sibilant comfort. Both should inform guardrails before a bright character macro stacks more formant, air, or presence.
- The guardrail should remain corrective, not destructive: it clamps only high-risk axes and records the reason in the render review/export evidence.

Implementation response:

- `applyCharacterSafety()` now merges Studio problem scores, spectral risks, LPC envelope peak risk, and ERB crowding into character tone evidence.
- Bright character targets clamp formant/air/presence and raise de-ess/consonant softness when nasal, harsh, or sibilant evidence is high.
- Character safety export manifests and Project Vault snapshots now retain tone evidence and the ERB crowding risk string.

Verification:

- Unit regression confirms spectral/ERB/LPC evidence can trigger guarded formant/de-ess moves and retains `nasal:1050Hz` crowding evidence.
- `npm test` and `npm run quality` passed; character-safety quality cases stayed guarded without fail/warn regressions.
- In-app Browser private-fixture Kawaii render showed `Kawaii Bright / Safety Guarded`, Character Safety moves, Pitch Tracker, Tone Surgery, Render Loudness/True Peak, no console errors, and enabled WAV/WebM/ZIP controls.

Sources:
https://support.ircam.fr/docs/AudioSculpt/3.0/co/LPC_1.html
https://www.dsprelated.com/freebooks/sasp/Equivalent_Rectangular_Bandwidth.html
https://www.fabfilter.com/help/pro-q/using/dynamic-eq

## Identity Coupling Guard Loop

The twenty-first production-director pass addresses a specific listening failure from the private fixture review: some non-AI character transforms can drift toward a news/witness anonymizer instead of an attractive human character. The technical smell is not merely "too much pitch." It is a strong uncoupling between F0 movement and vocal-tract/formant movement, or an unplanned deep-mask stack of low pitch, low formant, and heavy body.

Research decisions:

- MorphVOX exposes pitch and timbre as separate identity controls, which confirms the product axis. But that same separation can also make a voice sound like a disguise when the two axes are pushed in conflicting directions without source adaptation.
- Voicemod's PowerPitch write-up frames pitch shifting as a real-time quality problem where preserving human voice naturalness and avoiding robotic degradation are core engineering goals.
- Speaker de-identification research treats formant modification and F0 trajectory manipulation as privacy/anonymization tools. VoiceForge therefore treats large pitch/formant decoupling as an explicit human-character risk unless the target is intentionally robot/creature/anonymous.

Implementation response:

- `applyCharacterSafety()` now adds an identity-coupling guard before the generic pitch/formant spread limiter.
- Strong opposite-direction pitch/formant shifts on human targets are re-coupled toward the pitch direction and recorded as `opposed-pitch-formant`.
- Unplanned low-pitch/low-formant/heavy-body stacks are recorded as `deep-mask` and body reinforcement is capped unless the target is explicitly a low human voice such as ikemen, deep, narrator, or intimate.
- Export manifests and Project Vault snapshots keep `identityRisk`, so future listening reviews can distinguish "spectral comfort" risks from "anonymous disguise" risks.
- Render Review and ZIP research notes surface identity coupling as `Identity Guard`, so the user can tell whether a clamp was about comfort, clipping, or disguise-like human-character failure.

Verification:

- Unit regression covers both `opposed-pitch-formant` and `deep-mask`, including the exact guard move and retained evidence.
- Review/export regression confirms `Identity Guard` and the human-readable risk label are visible outside internal metadata.

Sources:
https://screamingbee.com/docs/morphvoxpro/morphdocpitchtimbre
https://medium.com/@voicemod/how-we-built-our-new-and-improved-pitch-shifter-5b11c9d7f9a0
https://www.sciencedirect.com/science/article/pii/S0167639322000498

## Spectral Source Fit Loop

The twentieth production-director pass moves spectral risk earlier in the workflow. A user should not discover only after rendering that a kawaii/anime macro was guarded because the source was nasal or sibilant. The Guided Studio source-fit layer should explain that risk before the render button.

Research decisions:

- Professional voice workflows diagnose source suitability before committing to a treatment chain: range, level, tone, texture, and resonant problems all affect which processing is safe.
- For character voices, a bright target makes nasal/harsh/sibilant evidence more dangerous, while body/ikemen targets make mud/darkness more important.
- Source-fit should stay advisory: it does not process audio, but it helps the route planner and UI explain why calibration or guardrails are needed.

Implementation response:

- `sourceFitReport()` now adds a `Spectral Fit` card when studio spectral analysis exists.
- Spectral Fit weights nasal/harsh/sibilance more for kawaii/anime/otome-like targets and mud/darkness more for ikemen/deep/body-like targets.
- The value carries the top spectral risk plus ERB crowding frequency when available, so the Guided Studio can explain risks before render/export.

Verification:

- `npm test` and `npm run quality` passed with the Spectral Fit item included in source-fit reports.
- In-app Browser verification with the private Yamada Taro fixture loaded the kawaii guided render, showed `Spectral Fit: mud 100 / ERB 387Hz`, kept `Kawaii Bright / Safety Guarded`, carried spectral-fit route-card reasons, and exposed WAV/WebM/ZIP download actions without console errors.

Sources:
https://www.izotope.com/en/learn/how-to-eq-vocals.html
https://www.dsprelated.com/freebooks/sasp/Equivalent_Rectangular_Bandwidth.html
https://support.ircam.fr/docs/AudioSculpt/3.0/co/LPC_1.html

## Source-Reactive Control Loop

The twenty-first production-director pass turns Studio Polish from mostly static parameter application into a source-reactive control layer. The goal is not to replace a human mix engineer, but to encode the core studio habit: repair and tone stages react to evidence in the signal, while phrase-level gain rides smooth speech before compression.

Research decisions:

- Vocal riding is a separate production stage from compression. Waves Vocal Rider describes vocal production as recording, comping, mix positioning, sound character work, and gain riding; it automates level moves to avoid over-compression.
- Mouth/click repair must keep detection and processing amount bounded. RX De-click/Mouth De-click expose sensitivity, frequency skew, and click widening, while warning that over-detection can damage original speech or plosives.
- De-essing should be detection-aware and can be split-band. FabFilter Pro-DS documents Single Vocal detection and split-band processing so high-frequency sibilance can be reduced without dragging the whole voice down.
- Podcast production workflows routinely treat EQ, de-essing, compression, gate/expander, and ducking as distinct processors. That supports a layered design instead of a single macro filter.

Implementation response:

- Studio Polish plans now include a `source-reactive-control` plan with a phrase-aware fader ride and event lanes for mouth, plosive, and sibilance pressure.
- The actual render chain now uses `phraseAwareLeveler()` before compression, bounded by boost/cut limits, phrase speed, noise floor, and natural-mode emphasis preservation.
- Verification showed that replacing the existing natural leveler outright increased post-render micro-repair detections. The final design blends the old stable leveler with the new phrase-reactive curve, matching studio practice: preserve the proven tone path and add automation on top.
- Export manifests retain the reactive plan, so a rendered WAV/WebM/ZIP package can explain its fader-ride and event-lane decisions.
- The Guided Studio UI exposes a `Ride` pill so users see the adaptive range without needing to understand every compressor parameter.

Verification:

- `npm test` passed after the blend fix, with the dirty speech fixture moving from 20 to 25 micro-repair events after polish instead of exceeding the safety threshold.
- `npm run quality` passed 44/0/0 with Studio Polish 4/0/0 and Director Polish 4/0/0.
- In-app Browser verification with the private Yamada Taro fixture showed `Kawaii Bright / Safety Guarded`, `Ride`, `Spectral Fit`, WAV/WebM/ZIP export actions, and zero console errors after the first heavy render settled.

Sources:
https://assets.wavescdn.com/pdf/plugins/vocal-rider.pdf
https://downloads.izotope.com/docs/rx6/21-de-click/index.html
https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/mouth-de-click/index.html
https://www.fabfilter.com/help/pro-ds/using/basiccontrols
https://www.fabfilter.com/help/pro-ds/using/advancedcontrols
https://rode.com/en-us/about/news-info/a-guide-to-audio-processing-and-fx-for-podcasting

## Multiscale Micro-Repair Loop

The twenty-second production-director pass upgrades mouth/plosive/sibilance repair from point labels into shaped edit decisions. The guiding idea is that a click, lip smack, plosive, and sibilant edge are not the same defect: they differ in width, spectral focus, rise, decay, and the amount of neighboring speech that must be preserved.

Research decisions:

- RX De-click analyzes amplitude irregularities and smoothes them; RX controls such as frequency skew and click widening imply that click class and repair width should be separate decisions.
- RX Spectral Repair treats selected spectrogram/waveform regions as corrupted audio and repairs them with surrounding information. Browser DSP cannot fully clone spectral inpainting here, but it can at least shape the local repair window from evidence.
- RX De-plosive separates and reduces plosives while preserving fundamental frequency content and harmonics. That maps to a low-band duck rather than a broad high-pass cut.
- Community and post-production practice often zooms into waveform/spectral regions and applies local repair only where the defect lives. The software should make the same distinction automatically and conservatively.

Implementation response:

- `buildMicroRepairTimeline()` now enriches each event with `multiscale-pulse-envelope` shape evidence: width, rise, decay, low/mouth/sibilance focus, and confidence.
- Each event receives a bounded repair decision: `interpolate-impulse`, `attenuate-lip-smack`, `duck-low-burst`, or `split-high-duck`.
- `applyMicroRepairEvents()` now reads those decisions to size the interpolation/ducking window per event instead of using one fixed repair width.
- Export manifests retain pulse shapes and repair decisions, keeping the repair pass auditable.

Verification:

- `npm test` passed with shape and repair-decision assertions for micro events and export manifests.
- `npm run quality` passed 44/0/0 with Studio Polish 4/0/0 and Director Polish 4/0/0.
- In-app Browser verification with the private Yamada Taro fixture showed `Micro Repair`, `Ride`, `Spectral Fit`, `Kawaii Bright / Safety Guarded`, WAV/WebM/ZIP export actions, and zero console errors.

Sources:
https://downloads.izotope.com/docs/rx6/21-de-click/index.html
https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/mouth-de-click/index.html
https://downloads.izotope.com/docs/rx6/35-spectral-repair/index.html
https://s3.amazonaws.com/izotopedownloads/docs/rx700/en/de-plosive/index.html
https://www.izotope.com/community/blog/removing-plosives-from-a-voice-recording

## Listening Comfort Review Loop

The twenty-third production-director pass adds a perceptual review layer to the render deck. The product should not only say "the render did not clip"; it should help users understand whether the voice is comfortable to listen to for a podcast, stream, or character read.

Research decisions:

- Apple Podcasts recommends preconditioning audio around -16 dB LKFS with true peak not exceeding -1 dB FS, because overly compressed/amplified audio can be too loud, lack dynamic range, and introduce distortion.
- Auphonic treats adaptive leveling, loudness normalization, true peak limiting, dynamic range, and segment-aware processing as separate post-production concerns.
- EBU R128/ITU loudness work exists because peak level alone does not predict perceived loudness. Render review should therefore combine loudness, peak, and perceptual/tone risk rather than only peak.
- De-essing guidance frames sibilance as high-frequency fatigue; harshness and excessive micro-event density should affect listening comfort even when the file is technically valid.

Implementation response:

- `renderReview()` now includes a `Comfort` item and a `comfort` object with score, status, target loudness, true peak, dynamic range, micro-event density, and top reasons.
- `listeningComfortReview()` combines loudness target deviation, true peak headroom, sibilance, harshness, dynamic range, micro events, nasal concentration, and mud into a bounded comfort score.
- Overall render score now receives a bounded penalty when comfort falls below the product threshold, so "technically rendered" but fatiguing output is not treated as fully ready.

Verification:

- `npm test` passed with render-review assertions for the comfort item and bounded score.
- `npm run quality` passed 44/0/0 with Studio Polish 4/0/0 and Director Polish 4/0/0.
- In-app Browser verification with the private Yamada Taro fixture showed `Comfort` in the render deck, kept WAV/WebM/ZIP export actions, and had zero console errors. The fixture surfaced low comfort while still remaining comparable in the render deck, which keeps warning and workflow blocking separate.

Sources:
https://podcasters.apple.com/support/893-audio-requirements
https://auphonic.com/help/algorithms/singletrack.html
https://tech.ebu.ch/publications/r128/
https://www.izotope.com/community/blog/the-dos-and-donts-of-de-essing

## Comfort-Aware Stack Guidance Loop

The twenty-fourth production-director pass turns the listening-comfort diagnosis into concrete next moves. A warning without an actionable path feels like a meter, not a studio assistant; the Guided Studio should route comfort failures to the relevant processing stage.

Research decisions:

- Professional mix workflows do not treat fatigue as one processor. Sibilance belongs mostly to de-essing and air/presence control, mouth noise to editing/softening, loudness and true peak to dynamics/mastering, and mud/nasal balance to input/tone cleanup.
- Auphonic-style automatic post-production is useful because analysis and processing are coupled: loudness, true peak, filtering, and noise reduction drive recommended processing, not just charts.
- De-essing guidance emphasizes split-band control and context; therefore a comfort reason should produce bounded de-ess/air moves instead of blindly lowering all brightness.

Implementation response:

- Effect Stack context patches now read `renderReview.comfort.reasons`.
- `sibilance` routes to de-ess and air reduction, `micro` routes to consonant softness and breath/whisper reduction, `mud` routes to input low-cut, `flat`/`jumpy` routes to compression, `true-peak` routes to limiter/output safety, and low comfort adds a guard blend move.
- Tone and texture stages now show `Comfort NN%` notes when comfort evidence is active, keeping the diagnosis visible in the normal guided workflow.

Verification:

- `npm test` passed with a comfort-guidance stack test that converts `micro`/`sibilance` reasons into cleanup patches.
- `npm run quality` passed 44/0/0 with Studio Polish 4/0/0 and Director Polish 4/0/0.
- In-app Browser verification with the private Yamada Taro fixture showed `Comfort 15%` in the signal stack, Tone/Texture comfort notes, comfort-driven De-esser/Soft Consonants candidates, WAV/WebM/ZIP actions, and zero console errors.

Sources:
https://auphonic.com/help/algorithms/singletrack.html
https://www.fabfilter.com/help/pro-ds/using/basiccontrols
https://www.izotope.com/community/blog/the-dos-and-donts-of-de-essing

## Live Comfort Guard Loop

The twenty-fifth production-director pass brings the Studio Polish safety philosophy closer to the real-time AudioWorklet. Offline rendering can afford analysis, optimization, and metadata; live monitoring needs bounded envelope followers and no large allocations.

Research decisions:

- AudioWorklet processing runs on the audio rendering thread, so live safety logic must avoid heavy FFT/STFT work, dynamic allocation, and long windows.
- Real-time de-essing and peak safety are usually envelope/control problems: track high-band pressure, low-band bursts, and output peaks, then apply smooth bounded gain reduction.
- The live path should not try to fully match offline Studio Polish. It should instead share the same intent: reduce fatiguing high-frequency edges, plosive-like low bursts, and peak overload while preserving responsiveness.

Implementation response:

- `worklet.js` now tracks low-band and peak envelopes in addition to the existing high-band envelope.
- A new `comfortGuard` parameter applies bounded high-edge reduction, low-burst ducking, and live peak gain smoothing before output clipping.
- `livePolishedParams()` now exposes a bounded guard amount that scales with Studio Polish intensity and de-ess settings, and is unit-tested.

Verification:

- `npm test` passed with bounded `livePolishedParams()` comfort guard assertions.
- `npm run quality` passed 44/0/0 with Studio Polish 4/0/0 and Director Polish 4/0/0.
- In-app Browser verification with the private Yamada Taro fixture loaded the guided render, exposed the Live tab, retained comfort stack notes and WAV/WebM/ZIP actions, and reported zero console errors. No microphone permission was requested during this verification.

Sources:
https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process
https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
https://www.fabfilter.com/help/pro-ds/using/basiccontrols

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
- Render Performance Observability was verified through the same private-fixture deep link. The render deck exposed `Render Speed RT 2.7x`, WAV/WebM/ZIP controls stayed enabled, Character Safety remained guarded, and the in-app Browser reported zero console errors.
- Render Budget Direction was verified through the same private-fixture deep link after the performance-budget pass. The render deck exposed `83% RISK` and `Render Speed RT 2.3x`, the slow-render recommendation was present in the page text, WAV/WebM/ZIP controls stayed enabled, and the in-app Browser reported zero console errors. The top Studio Plan action remained `Save Project` because project capture has higher workflow precedence than another preview.
- Cue-linked preview recovery was checked in the in-app Browser with the private-fixture deep link. The active preview region remained on the selected short cue (`2.9-5.2s / 7.0s`) after the slow full render, coordinate-clicking the top Studio Plan button advanced the local workflow without console errors, and unit coverage verifies that `preview-region` actions carry the active cue id when they are the next action.
- QC-gated capture was checked in the in-app Browser with the private-fixture deep link. A risk render showed `Render speed risk should be fixed before capturing this voice as reusable memory.`, WAV/WebM/ZIP controls and Render Speed remained visible, and the console reported zero errors. A previously saved local project made `Restore Project` the top action, which is the expected higher-priority restore path.
- Multi-issue Comfort QC was checked in the in-app Browser with the private-fixture deep link. The Effect Stack showed Comfort 15% with `4 next moves`, confirming that more than two ranked comfort issues can now feed repair routing while WAV/WebM/ZIP and Render Speed remained visible and the console reported zero errors.
- Comfort-priority Stack routing was checked in the in-app Browser with the private-fixture deep link. With Comfort 15%, the Effect Stack primary action became `Fix Tone Polish` instead of a performance-motion tweak, while Render Speed and WAV/WebM/ZIP remained visible and the console reported zero errors.

## Render Performance Observability Loop

The next production-director pass treats performance as part of audio quality. A static GitHub Pages studio cannot hide heavy DSP behind a server farm; if micro repair, spectral tone surgery, dynamic riding, and character guardrails are worth doing, the product must show whether the browser can render them comfortably.

Research decisions:

- `performance.now()` is the right browser-side timer for render instrumentation because it returns a high-resolution, monotonic timestamp that is not tied to wall-clock adjustments.
- A raw elapsed millisecond number is not enough for audio work. VoiceForge records rendered seconds and realtime factor, so a 7-second line and a 45-second render deck can be compared as ratios.
- Performance metadata belongs in the same audit trail as loudness, tone, safety, and repair decisions. ZIP exports therefore keep render timing in `analysis.json`, and the render review shows a visible `Render Speed` card.

Implementation response:

- `OfflineRenderer.render()` now records elapsed time, rendered duration, realtime factor, sample rate, mode, and stage for every render.
- `renderReview()` exposes that timing as a user-facing review item, alongside comfort, Studio Polish, and Character Safety.
- `buildExportManifest()` stores compact render performance metadata so later QA can correlate a sound decision with the cost of producing it.

Sources:
https://developer.mozilla.org/en-US/docs/Web/API/Performance/now
https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/High_precision_timing
https://www.w3.org/TR/hr-time-3/

## Render Budget Direction Loop

The follow-up pass turns timing measurement into product direction. The browser verification showed a full private-fixture render at `RT 2.7x`, which is useful audio evidence but a poor interaction loop for exploration. A studio should let the user iterate on short cues, variants, and stack slices before committing to a full keeper render.

Research decisions:

- MDN describes Web Workers as a way to run laborious processing away from the main UI thread, keeping the interface responsive. VoiceForge is not workerized yet, so the current product must steer slow cases toward short previews.
- MDN AudioWorklet guidance exists for real-time custom processing off the main thread, but offline Studio Polish currently runs inside the app flow. That makes render budget visible UI evidence, not just a hidden debug metric.
- `requestIdleCallback()` and off-main-thread guidance support the broader next architecture: schedule non-critical work cooperatively and move heavier render/audition batches away from the UI path where possible.

Implementation response:

- `renderReview()` now builds a `performanceBudget` with status, score, realtime factor, recommendation, and detail.
- Render review status is downgraded when the performance budget is risky, because a take that is too slow to iterate should move back to short-preview work before more full renders. Comfort risk remains visible and still feeds the Effect Stack cleanup route.
- `buildStudioPlan()` uses slow full-render evidence to recommend `Use Short Preview` before additional variants or keeper decisions.
- Preview actions now carry the active/best source cue, so slow-render recovery is not a vague instruction; the Studio Plan can jump directly to the most useful short section before rendering.
- Project and Voice Memory capture are blocked while render speed, listening comfort, or render review status is risky. A project snapshot should be a reusable studio state, not a bookmark to an obviously broken or too-slow take.
- Listening Comfort now keeps up to five ranked QC issues instead of only the two displayed summary reasons. Sibilance, harshness, micro-events, loudness, dynamics, nasal focus, and mud can therefore all feed downstream repair decisions when they coexist.
- Effect Stack priority now boosts Comfort-derived patches, so tone/texture/guard cleanup can outrank performance or target-drift tweaks when the current take is fatiguing.
- `npm run quality` now prints a Comfort column for Studio Polish and Director Polish suites, making fatigue/loudness/micro-event regressions visible in routine CLI verification.
- Export manifests retain the review performance budget so QA can connect a render's audible result with its browser cost.

Sources:
https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback
https://web.dev/articles/off-main-thread
https://web.dev/articles/profiling-web-audio-apps-in-chrome

## Take QC Gate Loop

The next production-director pass separates "best candidate" from "keeper." A render can match the character target and acting script but still be wrong to preserve if it clips, fails comfort review, is too slow to iterate, or violates delivery headroom. Professional audio workflows treat loudness and true peak as measurable QC gates; VoiceForge should not let a high-scoring but broken take become the recommended keeper.

Research decisions:

- Apple Podcasts frames levels as a listener-experience requirement: spoken content should be audible and free from distortion, with overall loudness around -16 dB LKFS and true peak not exceeding -1 dB FS before encoding.
- Netflix's QC guidance treats loudness/true-peak failures as issues to flag, which is the important product pattern: delivery evidence should gate release decisions, not merely annotate them after the fact.
- Transom's podcast loudness workflow separates production level, peak limiting, and final gain. That supports a two-step decision model: pick/repair a candidate first, then call it a keeper only after QC clears.

Implementation response:

- `rankRenderDeckTakes()` now builds a QC gate for every render-deck item. Render risk, comfort risk, slow full-render budget, clipping, tight peaks, and empty audio make a take ineligible for keeper selection.
- The deck can still expose the strongest blocked candidate as `candidate`, so Keeper Refinement can produce repair moves instead of leaving the user with a dead end.
- Guided Studio now routes QC-held candidates to refinement before A/B comparison, and the UI labels such cards as `QC Hold` rather than `Keeper`.
- A single QC-held take now routes to `Fix QC Take` before variant rendering, because multiplying broken takes is not a professional audition workflow.
- The Studio Plan next-action selector now lets QC-held take repair override upstream character-shape tweaks, matching the studio rule that broken audio must be repaired before performance nuance is chased.
- Keeper Refinement now maps Comfort issue IDs to targeted repair moves, so micro-events, sibilance/harshness, nasal focus, mud, loudness, and dynamics do not all receive the same generic safety patch.
- QC-held Keeper Refinement now displays Safety/Comfort repair moves before target/script nuance, so the patch list matches the actual production priority.
- After a QC repair patch is applied, Studio Plan now routes to `Preview QC Fix` instead of variants, because the old render-deck evidence is stale until the repaired settings are heard.
- Take Decision now ranks blocked risk candidates with extra QC-gate weight, so a partially repaired preview can outrank an older but more script-matched broken render.
- Export `analysis.json` and Project Vault snapshots now retain compact Take Decision evidence, including the QC-held candidate, blocker/check lists, and blocked deck count.
- ZIP exports now include `take-decision-notes.md`, so the keeper/QC-hold decision is readable without digging through JSON.
- Unit tests now cover safer-take selection, all-risk candidate hold, QC evidence cards, and Studio Plan routing.

Sources:
https://podcasters.apple.com/support/893-audio-requirements
https://partnerhelp.netflixstudios.com/hc/en-us/articles/360050414014-Loudness-and-True-Peaks-How-to-Measure-and-When-to-Flag
https://transom.org/2016/podcasting-basics-part-5-loudness-podcasts-vs-radio/

Open follow-up:

- CLI-side private WebM decoding is still blocked by the lack of `ffmpeg` or an equivalent local decoder in this workspace. Browser upload should be retried after Chrome extension file access is available, but URL import now provides a working local fixture path without committing the private sample.
- The in-app Browser runtime also blocks page `import()` and `fetch()` inside evaluation, so it cannot currently decode `tests/data/konichiwabokunonamaewayamadatarodesu.webm` through a test-only eval path. A proper local fixture runner or Chrome file-access fix is the next path for private-sample regression.

## Director Brief Loop

The next pass treats workflow comprehension as part of audio quality. A studio can have strong cleanup, character safety, and QC logic but still feel unusable if the user cannot tell whether the next professional move is source repair, short preview, QC repair, A/B comparison, or export.

Research decisions:

- RX-style repair tools are stage-specific: mouth clicks, plosives, steady noise, and dialogue separation should be diagnosed and repaired without pretending one global macro can solve every speech defect. The UI must therefore name the current blocking stage rather than presenting a generic quality score.
- Auphonic-style production thinking is adaptive and segment-aware: leveling, loudness normalization, filtering, noise reduction, and AutoEQ are described as algorithms that respond to signal conditions. VoiceForge should surface source-reactive evidence as an operator brief, not only as hidden metadata.
- Apple/Transom-style podcast delivery treats loudness, true peak, and listener comfort as final approval gates. A character-like take that is fatiguing or QC-blocked should be called a held candidate, not a keeper.
- RODE and common voice workflow guidance frame compression/EQ/de-ess as useful but easy to overdo. The product needs a short "repair first / preview next / compare now" decision layer so users do not keep exaggerating character controls when the audio problem is basic comfort.

Implementation response:

- Added `buildDirectorBrief()` as a pure decision layer above Studio Plan. It summarizes the current studio state into a headline, status, cards, and the same next action used by the guided workflow.
- Added an Offline `Director Brief` panel before Guided Studio so the user sees the current production decision before scanning lower-level repair maps, character-chain cards, or render-deck details.
- The brief treats missing sources, QC-held candidates, listening-comfort risk, ready keepers, and no-render sessions as different states with different action labels.
- Source load and render completion now refresh Studio Plan/Director Brief immediately, so the top decision does not lag behind the rendered evidence.
- Unit tests cover no-source start, QC-held repair routing, and ready-keeper summaries.

Sources:
https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/mouth-de-click/index.html
https://downloads.izotope.com/docs/rx6/26-de-plosive/index.html
https://auphonic.com/help/algorithms/singletrack.html
https://podcasters.apple.com/support/893-audio-requirements
https://transom.org/2015/podcasting-basics-part-3-audio-levels-and-processing/
https://rode.com/en-us/about/news-info/a-guide-to-audio-processing-and-fx-for-podcasting

## Source Reactive Evidence Loop

The follow-up pass makes source-adaptive DSP visible. The restored `docs/koreyare.md` design note reframes VoiceForge as a source/filter/perception/studio workflow, not a static preset bank. The product should show that it is reacting to the uploaded voice's event density, phrase dynamics, room floor, and spectral crowding.

Research decisions:

- Segment-aware processing is a production norm: leveling and repair should react to phrases, noise floors, and local events rather than applying one fixed gain or EQ curve everywhere.
- Mouth clicks, plosives, and sibilance are local time events. They should be surfaced as event lanes so the user can see why a repair was chosen.
- A phrase-aware level ride and downward room-floor control are different from generic compression or hard gating; the UI should not collapse them into a vague "quality" number.

Implementation response:

- Added a `Source Reactive` card row inside Guided Studio with Event Lanes, Phrase Ride, Room Floor, and Tone Surgery cards.
- The cards expose micro event density, adaptive de-ess intensity, phrase-ride range, expander threshold/range, and dynamic tone-band count.
- ZIP `research-notes.md` now records source-reactive control evidence, including phrase ride timing/range and event-lane intensity, so exported packages keep the same rationale visible in the app.
- Diagnostics Quality Matrix now shows LUFS and true peak columns, aligning the in-app regression view with podcast/export QC instead of relying on RMS/peak alone.
- Restored `docs/koreyare.md` into a readable architecture note covering source-filter theory, perceptual tone maps, source-reactive repair, prosody, QC, and AI-after-DSP boundaries.
