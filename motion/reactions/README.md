# Cavelux Clawd — Reaction Pack 01

Eight textless reactions for sharing in chats: a small cast of clear gestures,
designed to read at 128 pixels. The [production board](PRODUCTION-BOARD.md) is
the creative and export specification; it is not a completed-render report.

## Preview and export

From the [repository root](../../README.md), run:

```sh
npm run preview
```

Open [the reaction gallery](http://127.0.0.1:8766/reactions/index.html).
To create and check the pack:

```sh
npm run render:reactions
npm run test:reactions
```

Each reaction targets a 512 × 512 canvas at 20 fps. Seven run for 2.4 seconds
(48 frames); `approved` runs for 2.0 seconds (40 frames).

| Output | Purpose |
| --- | --- |
| `output/{id}.gif` | Transparent, looping chat version. |
| `output/{id}.png` | Transparent poster frame. |
| `output/{id}.mp4` | Carbon-background fallback when a client handles transparency poorly. |
| `output/cavelux-clawd-pack-01.zip` | Complete pack, including transparent PNG masters. |

The checked-in outputs include all eight reactions. See
[the export manifest](output/manifest.json) for file sizes and source hashes,
and [the export checks](e2e-evidence/assets-results.json) for measured durations,
transparency, motion, and loop results. The ZIP retains 376 transparent frame
masters under `masters/{id}/0000.png`, with subsequent frames numbered in order.

## Character and motion

The pack reuses [the canonical renderer](../film.js) through
`renderCharacterPreview` and the existing [state definitions](../sprites/states.json).
`renderer.js` adds reaction gestures and props. Normal keeps the regular black
rectangular eyes; Working uses rotating spirals and a green code aura; Ultracode
adds the rainbow wave. Retired angry-expression poses are excluded.

Keep one readable gesture per loop, generous space around the silhouette, and
quiet holds that make the response recognizable. There are no action captions.
Props support the gesture without covering the face. Small previews matter more
than details that are visible only at export size.

## Share in Messages

Download the ZIP to Files, extract it, then share a GIF through Messages. Use the
MP4 fallback if needed. Physical iMessage delivery, device playback, and any
service-side transcoding remain unverified until checked on the receiving
devices. These files are a media pack, not an App Store sticker application.

## Provenance

This pack continues the CAVELUX adaptation of the user-supplied Clawd character;
see [repository attribution](../../ATTRIBUTION.md). `share-break` uses a stylized
KitKat wrapper as a small handoff prop. That depiction does not imply endorsement.
The existing private app and original assets remain the source references;
the pack does not require making the app public.
