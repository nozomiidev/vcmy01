# Development Rules

## Static Site Rule

This project must run on GitHub Pages as static files.

Allowed:

- multiple HTML files
- CSS files
- JavaScript modules
- Web Workers and AudioWorklets
- WASM assets
- static audio assets
- optional static model files
- a build step, if documented and committed output/deployment behavior remains
  clear

Not allowed for the core product:

- required backend server
- required database server
- required private API
- required cloud audio processing
- hidden upload of user audio

## Product Quality Rule

Demo quality is forbidden. Do not ship work that feels like an MVP, template,
sample page, thin wrapper, or feature checklist. The target is product-level
capability and craft.

Do not interpret "quality" narrowly as visual polish, clean code, passing tests,
or less clipping. The core issue is often that the product design and feature
set are insufficient. A change is only aligned when it makes the character voice
studio more capable, not merely cleaner.

Required posture:

- maintainable structure
- fast rendering
- smooth animation
- memory leak prevention
- high-quality DSP implementation
- error tolerance
- graceful recovery
- extensible architecture
- clear future paths for plugins, workflows, offline render steps, and new
  effects
- concrete user-facing capabilities for live voice, recorded takes, uploaded
  audio, character direction, preview, comparison, render, and export

Do not let visible guide text, onboarding, docs, or demo presets stand in for
real functionality. Explanations can support the workflow, but the capability
must exist.

## Research-In-Implementation Rule

Research is part of the Studio Polish First implementation, not a separate
document-only phase. Major audio workflow changes must connect research,
engineering judgment, and shipped behavior.

For professional voice polish, consult and compare:

- official or primary documentation for the target technique
- pro studio, podcast, radio, or dialogue-editing practice
- community and practitioner reports when they expose practical failure modes
- browser API and OSS/library constraints

Do not copy community advice blindly. Use it to identify common workflow,
failure modes, and vocabulary, then verify against DSP principles, official
docs, and local test audio.

Each major polish block should answer:

- what sound it repairs or adds
- what it can damage when pushed too hard
- where it belongs in the processing order
- how the UI keeps a non-expert from breaking the voice

The first production chain is Studio Polish before Character Transform:

1. Import or record.
2. Analyze.
3. Clean.
4. Polish.
5. Character.
6. Export.

Character presets must not be tuned by amplifying an unpolished, clicky, noisy,
boomy, nasal, or harsh source.

## External Asset And OSS Rule

Do not treat building everything from scratch as a virtue. Also do not cling to
standard browser APIs when a proven library, WASM module, CDN asset, static
model asset, or OSS project would produce a better result.

Community assets are encouraged when they improve quality and satisfy:

- GitHub Pages static deployment
- license compatibility
- privacy requirements
- acceptable bundle/model size
- reasonable loading strategy
- graceful fallback behavior

Heavy assets, rich UI, and ambitious features are allowed when they materially
raise product quality. Prefer lazy loading, workers, caching, streaming,
profiling, cleanup, and careful optimization over avoiding hard features.

When the direction is clear, do not pause to ask for routine design approval.
Make the best product decision and keep building toward the finished experience.

## Audio Privacy

- Keep microphone, recording, uploaded audio, presets, and takes local by
  default.
- Ask before sending audio, logs, files, or account data to any external
  service.
- Be explicit in UI and docs about what stays local.

## Browser Testing

Use browser testing proactively for UI and audio workflow changes.

Suggested checks:

- page loads from GitHub Pages or local static server
- no console errors on first load
- home screen renders
- studio screen opens
- theme/accent state behaves and can be restored
- microphone permission flow is understandable
- monitor flow warns about headphones
- recording captures processed output
- takes can be played, renamed, deleted, and downloaded
- offline post-processing works once implemented

## Chrome GUI Account Safety

Chrome GUI work can be dangerous because multiple accounts/windows may be open.
When Chrome GUI is required:

1. Connect to Chrome.
2. Inspect the browser/profile metadata if available.
3. Open a new temporary tab to `https://myaccount.google.com/`.
4. Confirm the visible email is exactly `nozomidevbusin@gmail.com`.
5. Continue only in that confirmed account/window.
6. Do not touch other accounts, profiles, or unconfirmed windows.
7. Prefer new temporary tabs. Avoid changing existing user tabs.
8. Restore test-changed state such as theme, accent, local storage, and settings
   when practical.
9. Close only the temporary tabs created for the task.
10. Report the account confirmation and any state changes in the final summary.

Ask before:

- microphone permission
- camera permission
- location permission
- downloads or uploads
- posting comments/messages
- GitHub settings changes
- login/account changes
- purchases or subscriptions
- deleting nontrivial user data

## GitHub Work

- Keep local git state clean and understandable.
- Do not revert unrelated user changes.
- Prefer small, purposeful commits when asked to commit.
- Commit and push at appropriate milestones when the user has asked for ongoing
  product work, keeping each commit coherent and reviewable.
- Do not bundle unrelated changes into one commit merely because they happened
  in the same session.
- Do not leave a large useful milestone uncommitted once it is tested and ready
  to share.
- Do not open a PR unless the user asks or the workflow has already established
  that PRs are expected.
- If GitHub Pages behavior is relevant, test the deployed URL or a local static
  equivalent.

## Documentation Updates

Update docs when changing:

- static deployment assumptions
- audio engine architecture
- preset schema
- DSP/AI boundaries
- privacy behavior
- browser testing requirements
- Chrome account safety rules

## Product Honesty

Avoid overclaiming. If a feature is an approximation, say so:

- "formant-like" is acceptable for approximate behavior.
- "true formant/spectral envelope" requires actual envelope analysis/shaping.
- "AI voice conversion" should only be used for model-based voice conversion.
- "character preset" can describe DSP macro chains, but should not imply a
  cloned or target speaker identity.
