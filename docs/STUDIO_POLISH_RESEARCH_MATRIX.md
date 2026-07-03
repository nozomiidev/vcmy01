# Studio Polish Research Matrix

This matrix is the research spine for the Studio Polish First overhaul. It
keeps research, product judgment, and implementation connected instead of
treating "research first" as a separate project.

## Product Thesis

VoiceForge should first make the source voice sound like it belongs in a
professional voice, podcast, talk-radio, or music studio session, then apply
character transformation. A broken, nasal, clicky, boomy, harsh, or uneven
source should not be pushed directly into kawaii, anime, otome, or ikemen
macros.

The first production flow is:

1. Import or record.
2. Analyze the source.
3. Clean repair problems.
4. Polish tone, level, and space.
5. Apply character direction.
6. Export WAV, compressed WebM Opus, and a ZIP session package.

## Processing Order

The initial static-browser chain should follow this order:

1. Input trim and gain safety.
2. De-plosive before high-pass filtering.
3. Mouth de-click and lip-smack reduction.
4. Noise and room reduction.
5. Adaptive high-pass filtering.
6. Tonal cleanup for mud, nasal, honk, and harshness.
7. De-ess and dynamic high-frequency control.
8. Leveler and compressor.
9. Presence, air, and light saturation.
10. Limiter and podcast-style loudness target.

This order matters. RX De-plosive notes that detection can fail after the audio
has already been high-pass filtered. Auphonic also warns that gain control,
gates, and excessive compression before noise analysis can make noise reduction
harder.

## Research Matrix

| Area | Sources | Studio Lesson | Over-Processing Risk | Implementation Target |
| --- | --- | --- | --- | --- |
| Mouth clicks and lip smacks | iZotope RX Mouth De-click | Detect short, bright mouth events and reduce them without touching plosives. Multiple lighter passes can be safer than one aggressive pass. | High sensitivity can damage speech transients and plosives. | Add mouth-click density analysis, conservative transient smoothing, and a visible click risk item. |
| Plosives | iZotope RX De-plosive, Auphonic AutoEQ notes | Plosives are low-frequency pressure bursts and should be handled before high-pass filtering. | Strong reduction can remove useful low speech energy. | Add low-burst detection, pre-high-pass low-band attenuation, and stage metadata. |
| Voice noise | iZotope RX Voice De-noise, Auphonic denoisers, OBS noise suppression | Speech noise work should be adaptive and gentle; stationary noise and speech-isolation cases are different. | Noise pumping, watery artifacts, or removed room feel. | Add noise-floor estimate, VAD-like active ratio, light broadband downward expansion, and "noise reduction is approximate" docs. |
| Dialogue isolation | iZotope RX Dialogue Isolate, Adobe Podcast Enhance Speech | Modern tools increasingly separate dialogue from complex backgrounds using ML. This is outside the current DSP-first implementation. | Strong isolation can introduce artifacts and reduce clarity. | Document as an AI/VC escalation gap; do not claim true isolation. |
| Leveling and loudness | Auphonic Adaptive Leveler, Apple Podcasts audio requirements, Transom podcast loudness articles | Speech production needs segment leveling, compression, true-peak safety, and podcast loudness targets. | Over-compression makes speech flat, noisy, and fatiguing. | Add loudness proxy, RMS target, peak guard, limiter target, and export metadata. |
| Tonal AutoEQ | Auphonic Voice AutoEQ, professional vocal chain practice | Voice tone needs source-adaptive cleanup: mud, nasal, harshness, brightness, and warmth. | Too much EQ sounds hollow, lisping, or unnatural. | Add mud/nasal/harshness indicators and bounded biquad corrections. |
| De-essing | RX De-ess, FabFilter/Waves-style vocal workflows | Sibilance should be controlled dynamically, not just darkened globally. | Too much de-ess removes clarity and makes speech dull. | Keep dynamic high-band attenuation and expose sibilance risk in review. |
| Studio polish before character | Podcast/radio workflows, MorphVOX/Voicemod product positioning | Users expect a clean voice first, then character direction. | Character transforms amplify source flaws. | Make Studio Polish the first guided offline step and feed polished audio into character rendering. |
| Real-time voice changer expectations | Voicemod, MorphVOX, w-okada VCClient | Real-time users expect low-latency presets, virtual-mic style routing, and recognizable voice identities. | DSP-only pitch/formant can sound fake when marketed as identity conversion. | Keep live DSP useful but label identity conversion as future AI/VC. |
| Browser export | MDN MediaRecorder, MDN OfflineAudioContext, JSZip | Static sites can render locally and export compressed audio/session packages without a backend. | MIME support varies; ZIP is not audio compression. | Add WebM Opus support detection and ZIP with WAV, WebM, settings, analysis, and research notes. |

## Implementation Principles

- Studio Polish must be a real signal path, not a help card.
- Character presets should use polished audio as their input in offline renders.
- Every strong repair control needs a safety bound and review signal.
- Browser-only DSP should stay honest about AI gaps.
- Local voice samples remain local and ignored unless the user explicitly asks
  to commit them.

## Source Links

- iZotope RX Mouth De-click:
  https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/mouth-de-click/index.html
- iZotope RX Voice De-noise:
  https://downloads.izotope.com/docs/rx6/36-voice-de-noise/index.html
- iZotope RX De-plosive:
  https://downloads.izotope.com/docs/rx6/26-de-plosive/index.html
- iZotope RX Dialogue Isolate:
  https://s3.amazonaws.com/izotopedownloads/docs/rx9/en/dialogue-isolate/index.html
- Auphonic singletrack algorithms:
  https://auphonic.com/help/algorithms/singletrack.html
- Apple Podcasts audio requirements:
  https://podcasters.apple.com/support/893-audio-requirements
- Transom podcast levels and processing:
  https://transom.org/2015/podcasting-basics-part-3-audio-levels-and-processing/
- Transom podcast loudness:
  https://transom.org/2016/podcasting-basics-part-5-loudness-podcasts-vs-radio/
- MDN MediaRecorder:
  https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- MDN OfflineAudioContext:
  https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext
- JSZip generateAsync:
  https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html
- w-okada VCClient:
  https://github.com/w-okada/voice-changer/blob/master/README_en.md
