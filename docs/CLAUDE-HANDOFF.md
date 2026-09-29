# Cavelux Clawd — final editorial handoff

## Start here

This is an existing, editable Cavelux motion project. Make a final polish pass
on the current film; preserve the approved character and its three states.

- Repository: https://github.com/mragerlp/cavelux-clawd (private).
- Current film: `motion/output/cavelux-engineered-to-deliver-v4.mp4`.
- Current delivery metadata and video SHA-256: `motion/DELIVERY.json`.
- Previous approved picture and calmer score: `archive/motion-v3/`.
- Hosted character studio: https://charm.ing/bloodwave/cavelux-clawd-studio.
- Same-machine checkout:
  `C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd`.

Start Claude Code in this checkout, or clone the private repository on another
machine with the owner's GitHub access. A Charming preview link alone does not
provide the editable project. Read the repository state before making changes;
retain unrelated work and coordinate if another agent is still editing it.

## User direction

The user's latest request:

> revert it, old swirly looks better

Use the original large, animated counter-rotating spirals. The simplified-eye
v5 iteration was rejected and remains in Git history; v4 is the current film.
Do not simplify or shrink the chosen spiral design. Keep the engineering copy
and electronic score, and use v6 for the next polish export to avoid reusing v5.

The earlier editorial and audio direction remains:

> Frame the context and wording more as a professional business, not just
> curiosity. Replace "spectrum" in "Full spectrum" with something more
> engineering-oriented. The audio is too calm; make it more tech and electronic.

Implemented direction: **Engineered to deliver.** and **Full throughput.**
This presents Cavelux as a team that defines, builds, coordinates, integrates,
and delivers work. Keep the writing precise and confident. Do not invent client
names, revenue, performance benchmarks, integration support, or launch results.
Terminal screens and swarms are illustrative process graphics.

The reel is 45 seconds, 1080 × 1920, 30 fps, with music and typography.
No voiceover. The intended feel is minimal, retro, scientific, and code-oriented,
with stronger visual and musical energy in the throughput sequence.

## Locked character direction

- Normal: regular rectangular black eyes, friendly expression, no aura.
- Working: visibly rotating hypnotic spiral eyes and a green code aura.
- Ultracode: rotating spiral eyes and an animated rainbow wave through the body.
- Keep crisp pixel geometry. No chains, angry brows, or half-lidded angry eyes.
- Preserve the source sprites and original large counter-rotating spirals;
  do not simplify or shrink the eyes.
- Keep existing user presets and app privacy. Stored preset names and internal
  identifiers containing "spectrum" are compatibility data, not editorial copy.

## Current edit

| Time | Chapter | Main typography |
| --- | --- | --- |
| 0–7.5s | Define | CLEAR / INTENT. |
| 7.5–15s | Build | SYSTEMS, / BUILT RIGHT. |
| 15–22.5s | Orchestrate | ONE BRIEF. / MANY AGENTS. |
| 22.5–30s | Integrate | COMPLEXITY. / UNDER CONTROL. |
| 30–37.5s | Throughput | FULL / THROUGHPUT. |
| 37.5–45s | Deliver | cavelux.ai / ENGINEERED TO DELIVER. |

The new score keeps 128 BPM, 24 bars, and the same six four-bar chapters. It uses
original synthesized electronic percussion, bass and sequencer parts. Stems,
generator, cue sheet and measured loudness are included. Listen to the new
master and the archived v3 master before deciding whether further changes help.
Audio measurements verify technical properties; they do not establish taste.

## Files to edit

| Area | Source |
| --- | --- |
| Composition, typography, character animation | `motion/film.js` |
| Film preview, inline styles and controls | `motion/index.html`, `motion/player.js` |
| Storyboard and intended timing | `motion/STORYBOARD.md` |
| Sound generation and stems | `motion/audio/generate_audio.py`, `motion/audio/*.wav` |
| Sound cue and mastering evidence | `motion/audio/README.md`, `motion/audio/manifest.json` |
| Character bases and state contract | `motion/sprites/` |
| Existing Cavelux brand and editable vectors | `motion/brand/`, `motion/graphics/` |
| Reusable studio UI, backend, build | `charming/ui.js`, `charming/backend.mjs`, `charming/build.mjs` |
| Eight reaction animations | `motion/reactions/renderer.js`, `motion/reactions/catalog.json` |

Check actual filenames in the checkout before editing. `film.js` is shared
with the studio and reaction pack. After changing it, rebuild the studio and
re-render reactions so their source manifests and exported assets remain current.
The studio's generated `charming/dist/` files are build output, not primary source.
Hosted deployment is a separate step from building.

## Run and verify

Requirements: Node.js 22+, the pinned npm dependencies, Python with NumPy and
Pillow, FFmpeg, FFprobe, and Microsoft Edge for the existing browser tests.
Bahnschrift and Consolas are the authored Windows fonts; fallback fonts may
change text geometry. See `docs/reproducibility.md` for platform limitations.

From the repository root:

```powershell
npm ci
node motion/server.mjs
```

Open http://127.0.0.1:8766/ for the film and
http://127.0.0.1:8766/assets.html for the character library.
In a second terminal, build and start the studio:

```powershell
node charming/build.mjs
node charming/server.mjs
```

Open http://127.0.0.1:8787/studio. The local and hosted preset stores are separate.
To regenerate audio after editing its generator, render, and verify:

```powershell
python motion/audio/generate_audio.py
python motion/validate-audio.py
node motion/render.mjs
node motion/verify.mjs
node motion/reactions/render.mjs
npm test
git diff --check
```

Keep the v4 video before rendering later revisions. Change the output name
consistently in `motion/render.mjs`, `motion/verify.mjs`,
`motion/index.html`, and delivery documentation for a v6 final.
The renderer atomically replaces its configured output only after encoding.

This Windows host has an unusually long inherited PATH. If npm's command shell
cannot resolve node, use this process-only PATH before `npm test`:

```powershell
$taskToolDirs = @(
  (Split-Path (Get-Command node.exe).Source),
  (Split-Path (Get-Command python.exe).Source),
  (Split-Path (Get-Command ffmpeg.exe).Source),
  (Split-Path (Get-Command ffprobe.exe).Source),
  (Split-Path (Get-Command git.exe).Source),
  (Split-Path (Get-Process -Id $PID).Path),
  "$env:SystemRoot\System32",
  "$env:SystemRoot"
) | Select-Object -Unique
$env:Path = $taskToolDirs -join ';'
npm test
```

Do not modify the user's system environment to work around that limitation.

## Final pass and acceptance

1. Watch and listen to v4 first, including at phone scale.
2. Refine typography spacing, transition continuity and musical accents while
   preserving the six timed movements and approved Clawd states.
3. Keep the professional business framing; make any proposed copy changes
   specific and defensible.
4. Export the next numbered MP4, retain source/stems, and update delivery hashes.
5. Run the relevant checks after edits. Inspect fresh stills and the encoded
   video; a passing source test does not prove a good final presentation.
6. If updating the hosted studio, read its latest revision, publish the rebuilt
   source with that revision guard, and verify source readback and actual UI.
   Do not put signed asset URLs or write tokens in the repository.
7. Report changed files, exact checks and remaining limitations to the user.

Existing evidence lives in `motion/output/`, `charming/e2e-evidence/`, and
`motion/reactions/e2e-evidence/`. Historical reports apply only to their
recorded source hashes. `motion/DELIVERY.json` records this delivery's checks.

Still requiring human or external review: subjective full-length audiovisual
approval, physical-phone playback, and Instagram upload/transcoding. No public
posting or website change has been requested.

## Paste into Claude Code

> Read docs/CLAUDE-HANDOFF.md and review the v4 film before editing. Make the
> final polish pass for Cavelux: professional engineering language, tasteful
> retro science/code motion, and a driving electronic score. Preserve the
> approved Clawd states and original large spiral eyes, 45-second format and
> six timed movements. Do not simplify or shrink the eyes. Work from
> the editable source, retain v4, deliver a numbered v6 MP4, and report the
> changes, fresh checks and any remaining review limitations.
