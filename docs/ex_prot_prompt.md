Create a browser-based web service called VoiceForge as a single HTML file with at least 2,000 lines of code.



The final deliverable must be exactly one self-contained HTML file. This single-file requirement is non-negotiable. Other than that, there are no restrictions on implementation approach, libraries, frameworks, CDNs, Assets, APIs, open-source assets, browser capabilities, or architectural techniques. Use whatever is appropriate to achieve the best product quality. Do not treat building everything from scratch as a virtue. Stand on the shoulders of existing technology where it improves the final result.



VoiceForge is not a simple demo, toy, or MVP voice effect page. It should feel like a polished, production-ready voice changer and recording studio that can be used for streaming, content creation, voice acting, podcasting, narration, online meetings, game voice chat preparation, character voice experimentation, and high-quality processed audio recording.



Core Product Concept



The user should be able to open the app, choose or design a voice, monitor the transformed voice in real time, record the processed result, review the recording, compare takes, adjust the sound, and export a usable audio file without leaving the browser.



The product should prioritize low-latency real-time monitoring, stable recording, clear controls, beautiful visual feedback, reliable state recovery, and a premium creative-tool experience. The user should immediately feel that this is a serious audio product rather than a technical experiment.



Implementation Autonomy



Do not over-specify or rigidly follow any particular implementation method unless it directly improves the result. You may decide the internal architecture, audio graph, data structures, UI framework or lack thereof, state management, persistence strategy, rendering approach, recording method, export method, optimization strategy, and any other engineering details.



The requirements below are the minimum bar. If additional features, screens, user flows, safety checks, architectural improvements, edge-case handling, UI/UX refinements, accessibility support, performance optimizations, or quality enhancements are necessary to reach a true product-level standard, proactively identify and add them at your own discretion.



Do not add features merely for the sake of feature count. Prioritize real-world usefulness, sound quality, low latency, recording reliability, ease of control, visual clarity, mobile usability, and a refined professional feel.



Primary User Experience



A user should be able to:



Open the app and understand what to do immediately.



Grant microphone access with clear guidance and graceful error handling.



Select an input device when possible.



Select an output/monitoring configuration when possible.



Turn real-time monitoring on and off safely.



Choose a voice preset and hear the result quickly.



Adjust pitch, formant-like character, tone, timbre, brightness, depth, gender-like character, robot/creature/monster/radio/telephone effects, ambience, and other useful sound-shaping parameters.



Apply practical audio cleanup and enhancement.



Record the transformed voice, not just the raw microphone input.



Play back the processed recording inside the app.



Save/export the result in practical formats, including WAV.



Keep working after reloads whenever possible.



Use the app comfortably on desktop, tablet, and smartphone.



Core Screens and User Flows



Home / Studio Dashboard



Create a polished starting screen that presents the app as a real product. It should include the main studio entry point, quick preset selection, microphone readiness status, recent recordings if available, saved voice presets if available, theme controls, device/status indicators, and clear recovery options if a previous session exists.



The user should never be dropped into a confusing blank technical interface. Empty states, first-use guidance, and permission guidance should be handled gracefully.



Main Studio Screen



This is the central workspace. It should provide real-time voice monitoring, preset selection, detailed parameter editing, input/output level meters, recording controls, playback controls, visualization panels, and export actions.



The main controls should be immediately understandable. Advanced controls should be available without overwhelming the first-time user. The design should support both fast preset-based use and detailed expert editing.



Voice Preset Browser



Provide a rich set of polished presets, not just a few trivial examples. Include presets such as clean studio voice, deep narrator, bright presenter, character voice, robotic voice, alien, monster, radio, telephone, whisper-like texture, wide cinematic voice, lo-fi effect, podcast-ready voice, and other useful creative styles.



Each preset should have a clear name, short description, and sensible parameter values. Presets should be editable, duplicable, resettable, and usable as starting points for custom voices.



Detailed Voice Editor



Provide detailed parameter editing for pitch, formant-like shaping where feasible, timbre, tone, EQ, compression, reverb, delay or ambience, saturation or drive, modulation-style effects, stereo width where appropriate, noise suppression, gate/expander behavior, de-essing or harshness reduction where feasible, limiter/output gain, dry/wet balance, and monitoring level.



Controls should feel premium and responsive. Sliders, knobs, switches, segmented controls, value readouts, reset buttons, and grouped panels should be designed for real use.



Recording and Review Screen or Panel



The user must be able to record the voice-changed output, stop recording, play it back, inspect it visually, rename the take, delete it, export it, and record again. The app should make it clear whether the recording contains the processed voice.



Support high-quality recording and practical export. WAV export is required. Other practical formats may be added if feasible. The export flow should include file naming, duration display, format indication, and clear success/error feedback.



Visualization and Analysis



Include real-time waveform visualization.



Include real-time spectrum visualization.



Include pitch or pitch-like tracking visualization where feasible.



Include input level meters.



Include output/processed level meters.



Include clipping warnings.



Include noise floor or signal-quality indicators where feasible.



Visualizations should be smooth, performant, and useful, not decorative only. They should help the user understand whether the microphone is working, whether the voice is too loud, whether noise is present, and how the processed sound behaves.



Audio Processing Requirements



The app must provide a high-quality real-time voice changer.



The app must support real-time monitoring of the processed voice.



The app must record the processed voice changer output.



The app must allow playback, review, saving, and confirmation of the processed recording.



The app must include noise removal or noise suppression functionality.



The app must include practical audio effects such as EQ, compression, reverb, and limiter-style protection.



The app must allow free adjustment of pitch, formant-like character where feasible, timbre, and tone.



The app must provide rich presets and detailed parameter editing.



The app must include real-time visualization of waveform, spectrum, and pitch or pitch-like behavior.



The app must include acoustic analysis such as input and output level metering.



The app must support WAV export.



The app should avoid obvious artifacts, uncontrolled feedback, painful volume spikes, excessive latency, and unstable recording behavior as much as possible within browser constraints.



Real-Time Monitoring and Safety



Monitoring should be easy to turn on and off.



The app should warn about headphones when appropriate to reduce feedback or echo.



The app should include output gain control and limiter-style protection to reduce sudden loudness.



The UI should clearly show whether monitoring is active, whether recording is active, and whether the microphone is connected.



The app should handle microphone permission denial, missing microphone, unsupported browser features, suspended audio context, device changes, background tab behavior, and mobile browser limitations gracefully.



Recording Quality and Reliability



Recording should capture the processed signal, not merely the dry microphone signal.



The app should provide visible recording duration, take status, and file size or estimated size where useful.



The app should prevent accidental loss of recordings where feasible.



The app should allow users to review takes before saving.



The app should support exporting at least WAV in a practical, usable way.



The app should handle long recordings reasonably, with appropriate warnings or graceful degradation if memory limits are approached.



State, Persistence, and Recovery



The app should persist useful settings locally, including theme, accent color, selected preset, custom parameters, and recent session state where feasible.



Reloading the page should not unnecessarily destroy the user's setup.



If the browser or tab is refreshed during work, the app should recover what it reasonably can and clearly explain what cannot be recovered.



Custom presets should be saveable locally.



Import/export of preset data is desirable if it improves product completeness.



UI / UX / Design Direction



The app should look and feel like a premium modern creative audio tool.



Design priorities: clarity, elegance, speed, confidence, audio professionalism, smooth interaction, strong visual hierarchy, and immediate readability.



The UI must be responsive and optimized for desktop PCs, tablets, and smartphones.



On desktop, take advantage of wider layouts with panels, meters, visualizers, and detailed editing.



On mobile, prioritize one-handed use, large touch targets, clear recording controls, simplified navigation, and safe monitoring behavior.



Include dark theme, light theme, and customizable accent colors.



Provide several polished visual theme presets if useful.



Use smooth, modern animations, transitions, hover states, pressed states, active recording states, metering animations, and visual feedback. The animations should make the product feel high-end without harming performance or usability.



Controls should be visually satisfying but not obscure. The product should remain usable in real recording situations where the user wants speed and confidence.



Suggested Product-Level Additions



Add onboarding or first-run guidance if it improves clarity.



Add a microphone setup check.



Add a monitoring safety notice.



Add sample presets and recommended starting points.



Add empty states for recordings and presets.



Add error messages that explain what happened and what the user can do.



Add undo/reset behavior where useful.



Add preset duplication, rename, delete, and restore defaults where useful.



Add before/after or bypass comparison.



Add input calibration or gain setup guidance if feasible.



Add a recording checklist before first use if useful.



Add keyboard shortcuts for desktop if useful.



Add touch-optimized controls for mobile.



Add fullscreen or focus mode if it improves recording usability.



Add accessibility support such as keyboard navigation, ARIA labels, reduced-motion awareness, and high-contrast readability.



Add performance safeguards for low-power devices.



Add graceful fallback behavior when advanced audio APIs are unavailable.



Add diagnostics or status indicators for sample rate, latency estimate, recording mode, and browser support where useful.



Do not overcomplicate the app unnecessarily, but add anything that makes it feel complete, trustworthy, and product-ready.



Minimum Complete State



The final HTML file must run directly in a browser and include, at minimum:



A polished home or studio entry screen.



A main voice changer studio.



Microphone permission handling.



Real-time processed voice monitoring.



A clear monitoring on/off control.



A rich preset system.



Detailed voice parameter editing.



Pitch control.



Formant-like or voice-character control where feasible.



Timbre and tone controls.



Noise suppression or noise reduction.



EQ.



Compressor.



Reverb.



Limiter or output protection.



Input gain and output gain controls.



Input level meter.



Output level meter.



Waveform visualization.



Spectrum visualization.



Pitch or pitch-like visualization where feasible.



Recording of the processed voice output.



Playback of recorded takes.



WAV export.



Recording review and deletion.



Dark theme.



Light theme.



Accent color customization.



Responsive desktop, tablet, and smartphone layouts.



Smooth modern UI animation.



Clear error handling.



Local persistence of settings and custom presets where feasible.



A code structure that is maintainable, extensible, performant, and not unnecessarily tangled, despite being contained in a single HTML file.



Special Emphasis



The app should not feel like a sample project.



It should not be a thin UI around a few basic filters.



It should not merely record raw microphone input.



It should not ignore mobile usability.



It should not fail silently when browser audio permissions or APIs are unavailable.



It should not create dangerous loudness spikes.



It should not look generic or unfinished.

It should feel like a real product from the first interaction: beautiful, stable, responsive, useful, understandable, and technically serious.

Build VoiceForge as a product-level, stylish, intelligent, browser-based voice changer and recording studio that creators would actually want to use.
