# Research Notes

These notes keep the product direction grounded in current voice conversion and
browser audio work. They are not a commitment to ship every cited technique.

## Core Product Premise

The target is a browser character voice studio, not a basic pitch/EQ voice
changer.

Simple DSP can polish and stylize a voice, but it does not truly separate:

- linguistic content
- F0 and pitch contour
- speaker/timbre identity
- prosody and performance style
- target voice conditioning

Modern voice conversion and expressive voice systems are useful reference
points because they explicitly model some of those axes. The app should borrow
their product thinking even when the current implementation stays non-AI.

## Why Preset Names Are Not Enough

"Kawaii", "anime", "otome", and "ikemen" must not be mere labels over pitch
and EQ.

The implementation should progressively model:

- F0 range, pitch motion, and pitch stability
- spectral envelope / voice-tract impression
- brightness, breath, whisper, and frication shaping
- low-mid body, proximity, compression, and saturation
- consonant softness and de-essing
- phrase-level delivery cues, even if only approximated by DSP
- source-voice calibration

Prosody is especially important. OpenVoice describes style control beyond tone
color, including emotion, accent, rhythm, pauses, and intonation:
https://github.com/myshell-ai/OpenVoice

## DSP-First Path

The non-AI path should first make the best possible local browser DSP studio:

- better F0 estimation and VAD
- pitch-curve smoothing instead of only global semitone shifts
- WSOLA/PSOLA/phase-vocoder or WASM-backed pitch/time processing
- spectral envelope analysis and formant-like shaping that is clearly labeled
- harmonic exciter, de-esser, dynamic EQ, and multiband compression
- breath/whisper synthesis and close-mic/proximity shaping
- live and offline render paths that share the same character model

Rubber Band is a strong pitch/time-stretch reference, but its GPL/commercial
licensing must be handled deliberately:
https://breakfastquay.com/rubberband/license.html

Essentia.js is a browser/Node WebAssembly analysis candidate for richer feature
extraction:
https://mtg.github.io/essentia.js/

## Voice Conversion Escalation Path

True "different speaker" conversion needs a VC model, not only DSP. RVC-style
systems reference content and pitch extraction components such as ContentVec and
RMVPE:
https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI

Low-latency VC research is relevant but must be tested against static GitHub
Pages constraints:

- LLVC reports under 20 ms latency at 16 kHz and faster-than-real-time CPU
  inference:
  https://arxiv.org/abs/2311.00873
- StreamVC targets low-latency streaming conversion while preserving content
  and prosody and matching target timbre:
  https://arxiv.org/abs/2401.03078
- MeanVC 2 reports 40 ms chunking and 110 ms end-to-end latency in the paper:
  https://arxiv.org/abs/2606.09050

These are not drop-in browser features. Model size, license, WebGPU/WASM
coverage, startup cost, latency, privacy, and fallback behavior all matter.

## Browser AI Delivery Candidates

If the DSP ceiling is reached, the static browser AI path should evaluate:

- ONNX Runtime Web and its WebGPU execution provider:
  https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- Transformers.js WebGPU support:
  https://huggingface.co/docs/transformers.js/en/guides/webgpu
- static model hosting through GitHub Releases, Hugging Face, or a CDN
- model cache, lazy loading, quantization, feature flags, and no-required-server
  fallback behavior

## Web Audio Grounding

The current browser-native foundation remains valid:

- `AudioWorkletProcessor.process()` is the right low-latency custom DSP hook,
  called in render-sized blocks:
  https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor
- `OfflineAudioContext.startRendering()` is the standard way to render a Web
  Audio graph offline:
  https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext/startRendering

The product should continue to use browser standards where they are strong, and
bring in OSS/WASM/model assets where standards alone are not enough.
