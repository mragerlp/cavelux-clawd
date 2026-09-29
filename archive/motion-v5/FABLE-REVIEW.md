# FABLE review return — Cavelux Clawd v5

**State:** Rendered review candidate. **Author:** Codex. **Reviewer:** FABLE for non-character claims, never-list, delivery contract and hashes. **Approval:** Bloodwave. No implementation, mascot specification or rendering is requested from FABLE.

Checkout: `C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd`

## Review decisions

1. Grade the on-screen business wording. “Engineered to deliver” is brand positioning; “Full throughput” labels the illustrative Ultracode sequence. Neither is offered as a measured benchmark, production telemetry, client result or service guarantee.
2. Independently re-hash the files and inspect the raw ffprobe report and render log. The reported contract is 45.000 seconds, 1080 x 1920, 30 fps, 1,350 frames, H.264 yuv420p limited BT.709, and AAC 48 kHz stereo.
3. Route visual/audio approval and any release decision to Bloodwave. The user still needs to watch and listen to this v5. No public posting or hosted studio update occurred.

## What changed

- Outgoing image retained through an eighth-note chapter wipe; no blank cut frame.
- Throughput bars moved below captions.
- Closing business line increased to 32 px at 90% opacity.
- Secondary labels and frame furniture fade from 42.0 to 42.9 seconds for a 2.1-second clean closing hold.
- Generic agent identifier replaced with READY TO BUILD.

The original large spirals, normal rectangular eyes, body wave and audio are preserved. V4 remains in motion/output; archive/motion-v4 contains pinned source/stills. The previous rejected simplified-eye v5 is only historical. Use this return’s hash to distinguish the new film.

## Evidence and exact checks

- `node motion/render.mjs`: exit 0; 1,350 frames, 24 actual chapter-boundary samples. Render log: `motion/output/v5-render.txt`.
- `npm test`: exit 0; 172 passed, 0 failed. Full transcript: `motion/output/v5-tests.txt`.
- `node scripts/check-polish.mjs --candidate`: exit 0; 11 passed, 0 failed. All five cut boundaries retain the outgoing pixels, progress and repeat exactly.
- Canvas text corpus: 1,350 frames, 19,722 draw calls, 146 unique entries, 0 matches for internal names, filesystem paths, UUIDs or long hashes. `performance-evidence/text-corpus.json` preserves the actual drawn strings, including typewriter prefixes.
- `node motion/verify.mjs`: exit 0; ffprobe and complete audio/video decode exit 0. Raw metadata: `motion/output/v5-ffprobe.json`.
- `motion/output/v5-preservation-check.json`: exit 0; original v4 hash, character source blocks, seven character-preview PNGs and v4/v5 encoded AAC identity confirmed.
- Synchronous Canvas workload: one warm-up and 147 timed samples per accepted run. Control p50/p95 = 2.20/4.10 ms; candidate = 2.10/4.20 ms. Same environment/workload; no optimization claim. Initial candidate regression was fixed; its failed report is retained.
- Final whitespace and pin-integrity validation recorded before commit.

The renderer’s FFmpeg log includes a deprecated JPEG pixel-format warning. It explicitly converts full-range BT.601 input to limited BT.709; the encoded video metadata and full decode were checked. No claim of warning-free tooling is made.

## Independent commands

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'motion/output/cavelux-engineered-to-deliver-v5.mp4'
Get-FileHash -Algorithm SHA256 -LiteralPath 'motion/output/cavelux-engineered-to-deliver-v4.mp4'
ffprobe -v error -count_frames -show_streams -show_format -of json motion/output/cavelux-engineered-to-deliver-v5.mp4
ffmpeg -hide_banner -v error -xerror -i motion/output/cavelux-engineered-to-deliver-v5.mp4 -map 0:v:0 -map 0:a:0 -f null -
```

These commands are review-only. Do not render, edit, commit, push or publish as part of grading. A different machine must obtain these exact repository bytes before using the listed relative paths.

## Pins

Full machine-readable inventory: `motion/output/v5-review-pins.json`. Paths below are absolute on the authoring host.

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\output\cavelux-engineered-to-deliver-v5.mp4`
`SHA256 011e5dd04333fff6e4350ec899b2b752f8896021e58fa1683e98ce15905496f6` · 11447110 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\output\cavelux-engineered-to-deliver-v4.mp4`
`SHA256 0111552b96da60f815871c95127058816933edf5a8147549501cf5f0d070b807` · 11249888 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\film.js`
`SHA256 65b01474358fe7aa08b9155dc0d3cc9f4ce562b5f42ee8e5598f0e01048eb286` · 28196 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\audio\master.wav`
`SHA256 a54be14ec09fe572801451f23689c9b18e2361b272e40bfed55f34ff20c69f62` · 12960102 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\audio\score.wav`
`SHA256 efd73aa3ec134feb41b4c2751da416e0a759ea95ede05a62cbc340b92ebb9b2e` · 12960044 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\audio\sfx.wav`
`SHA256 0b36604696eecb8e371d5816f7582da5d7b1ed4f82ba8e3a5331874ed7a0b21e` · 12960044 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\DELIVERY.json`
`SHA256 8c2a05f0135ac121fa90b93194ba9a50e559c68e57e7895f08c072ef1b7fbbbf` · 5035 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\output\v5-render.txt`
`SHA256 2c3f7c4f4d358b7af6a4b8d5bdf8743e24de19d3acb2dbd58bf841d57cca57e5` · 1141 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\output\v5-ffprobe.json`
`SHA256 6bd22f00e37876000f710c25ea0b75117a7ffd1cb0ff8f611a258a6b6b26f17d` · 4772 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\output\v5-verify.json`
`SHA256 2621100c1f3c925cb489405baee6550022cf2880e35441ffe31836bcac163cb1` · 634 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\output\v5-tests.txt`
`SHA256 489081c7b3b4f7d967fc41a2d22cdc30a1bd86296b39a3a6d5f947a3fda57598` · 15653 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\output\v5-preservation-check.json`
`SHA256 f4327eb6058df36552557f416e5797cf85ae3a1cec7f78da9c908a9e2c0e1ae5` · 888 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\performance-evidence\candidate.json`
`SHA256 727617d8d93a03244edaff194476a1b3c97d51ed88c89775a774a4f5d5e319b6` · 34510 bytes

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\performance-evidence\text-corpus.json`
`SHA256 a848bfde16485f46cfcb66863d5c4f1b48d2955d94edede141bc89b5aac66210` · 19904 bytes

## Unverified / decisions reserved

- User approval of the full film and soundtrack.
- Physical-phone readability/playback, Instagram interface placement and transcoding.
- Other OS/browser/font combinations, encoded playback performance and peak process memory.
- The automated text scan covers Canvas text calls; source brand images were visually reviewed, not OCR-proven across all frames.
- No FABLE grading, BOARD write, message to another seat or external publication has been performed.

## Paste to FABLE

> Codex has authored and rendered the new Cavelux Clawd v5 review candidate. Read docs/FABLE-REVIEW.md and motion/output/v5-review-pins.json. Grade only non-character claims, the never-list, delivery contract and hashes; independently re-hash the MP4 and cross-check the raw ffprobe/render evidence. Do not implement, render or write mascot specs. V4 is preserved. Return any rulings as a numbered list for Bloodwave. User audiovisual approval and release remain pending.
