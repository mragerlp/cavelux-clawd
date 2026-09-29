# FABLE review return — Cavelux Clawd v6

**State:** Rendered review candidate. **Author:** Codex. **Review:** FABLE may grade non-character claims, never-list, delivery contract and hashes. **Approval:** Bloodwave. No implementation, render or mascot specification is requested from FABLE.

## Current film

`C:\Users\jared\.codex\visualizations\2026\09\29\01a0ea97-8016-7c91-8112-655302cb1db6\cavelux-clawd\motion\output\cavelux-engineered-to-deliver-v6.mp4`

SHA256: `6780061750e7e8684d6aa9bfd36ec65aaf6129ec9e78b0ccc56ad8899b12790f`

Size: 9,990,342 bytes. Format verified: 45.000 seconds, 1080 x 1920, 30 fps, 1,350 frames, H.264 yuv420p and AAC 48 kHz stereo.

## Latest user direction

Spiral eyes appear only while agents are actively working. Ready and completed beats use the approved regular eyes. The rainbow body can continue moving after execution ends. Original artwork and electronic soundtrack are unchanged. V5 and V4 remain preserved.

Active intervals include the start and exclude the end:

| Chapter | Active work, film seconds |
| --- | --- |
| Build | 9.5–13.0 |
| Orchestrate | 16.5–20.5 |
| Integrate | 23.5–28.0 |
| Ultracode | 30.5–34.5 |

## Exact checks

- `npm test`: exit 0; 187 passed, 0 failed, including 15 new activity-eye checks.
- Focused red/green evidence: 12 failures before implementation; 15 checks pass afterward. Actual inactive eye pixels are rectangular and stable, while default active previews retain their original pixels.
- `node scripts/check-polish.mjs --candidate`: exit 0; 11 passed. Five exact cut checks and the full 1,350-frame Canvas text scan pass. Zero matches for internal names, filesystem paths, UUIDs or long hashes.
- `node motion/render.mjs`: exit 0; 1,350 frames and 24 chapter-boundary samples.
- `node motion/verify.mjs`: exit 0; ffprobe and complete video/audio decode exit 0.
- Architecture/reuse and preservation evidence: `architecture-conformance/activity-eyes.json`. Original sprites, stems and v5 video are unchanged; encoded v5/v6 AAC is byte-identical.
- Independent code and PNG review found no concrete eye-gating defects. Encoded working and completed rainbow frames were visually inspected.
- Final documentation whitespace and all current delivery pins are checked before commit.

## Review inputs

The complete SHA-256 inventory is `motion/output/v6-review-pins.json`. Render log, test transcript, raw ffprobe metadata and decode result are respectively `v6-render.txt`, `v6-tests.txt`, `v6-ffprobe.json` and `v6-verify.json` in `motion/output/`. Those are review artifacts; paths and hashes do not appear on screen.

The wording remains **Engineered to deliver** and **Full throughput**. These are business positioning and a label for an illustrative process, not measured performance, live telemetry, a client result or a service guarantee. The actual drawn text corpus is `performance-evidence/text-corpus.json`.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'motion/output/cavelux-engineered-to-deliver-v6.mp4'
ffprobe -v error -count_frames -show_streams -show_format -of json motion/output/cavelux-engineered-to-deliver-v6.mp4
ffmpeg -hide_banner -v error -xerror -i motion/output/cavelux-engineered-to-deliver-v6.mp4 -map 0:v:0 -map 0:a:0 -f null -
```

FFmpeg retains the known deprecated JPEG-format warning during rendering. The renderer explicitly converts range/color space; the final file passes metadata and full-decode checks. This is not a warning-free-tooling claim.

## Unverified and reserved decisions

User approval of the full film and soundtrack, physical-phone playback/readability and Instagram placement/transcoding remain pending. Other hosts, fonts and browser engines are not proven. The Canvas text scan does not OCR image assets; those received visual review. Hosted studio revision 8 remains unchanged. No public posting, message to FABLE or BOARD write occurred.

## Paste to FABLE

> Codex has rendered Cavelux Clawd v6. Read docs/FABLE-REVIEW.md and motion/output/v6-review-pins.json. Grade only non-character claims, never-list, delivery contract and hashes; independently re-hash the MP4 and cross-check the render/ffprobe evidence. Do not implement, render or write mascot specs. V5 and V4 are preserved. Route rulings as a numbered list to Bloodwave; audiovisual approval and release remain pending.
