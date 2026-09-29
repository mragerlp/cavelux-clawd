# Cavelux Clawd

A retro character studio and 45-second vertical motion film for CAVELUX.
Clawd moves from a ready state to coordinated working swarms and ultracode at
full throughput, with an original electronic score and editable science/code graphics.
The current film is **Engineered to deliver**. Start with the
[FABLE review packet](docs/FABLE-REVIEW.md) for the rendered candidate and review boundaries.

[Charming studio workspace](https://charm.ing/bloodwave/cavelux-clawd-studio)
Â· [Attribution](ATTRIBUTION.md)
Â· [Reproduction notes](docs/reproducibility.md)

## Run locally

Use Node.js 22 or later. From the repository root:

```sh
npm ci
npm run preview
```

Open [the film](http://127.0.0.1:8766/) or
[the character states](http://127.0.0.1:8766/assets.html). The direct start command
is `node motion/server.mjs`. Play begins the film and soundtrack; chapter buttons
and the timeline let you jump to a precise moment.

## Character studio

```sh
node charming/build.mjs
node charming/server.mjs
```

Open [the local studio](http://127.0.0.1:8787/studio). Choose Normal, Working,
or Ultracode; adjust spiral-eye rotation, character scale, background, and code
aura. Play or scrub the ten-second timeline, save named looks, and export a PNG
frame or a preset JSON file. Choose the Transparent background for a cutout PNG.

The private [hosted studio](https://charm.ing/bloodwave/cavelux-clawd-studio)
is deployed at revision 8. Hosted exports are stored as the latest PNG and JSON
in the app's asset storage, with an open link for each result. Save downloaded
exports separately if you want to retain multiple frames or presets.

The local harness stores presets in `charming/.local/presets.json`, which is
excluded from Git. Local presets and hosted Charming presets use separate stores.
`node charming/build.mjs` assembles `charming/dist/source.json` for a hosted app
update; generating that file alone does not publish it.

## Reaction Pack 01

Eight short reactions reuse the canonical character: KitKat handoff, typing,
approval, panic, side-eye, shrug, celebration, and presenting. Open the
[reaction gallery](http://127.0.0.1:8766/reactions/index.html) with the preview
server running. Each reaction includes a transparent 512-square GIF and PNG
poster, plus a carbon-background MP4. The ZIP also contains transparent frame
masters. See [pack notes](motion/reactions/README.md) and the
[production board](motion/reactions/PRODUCTION-BOARD.md).

```sh
npm run render:reactions
npm run test:reactions
```

Rendering and checking the pack also need Python with Pillow. Device-specific
Messages delivery remains a separate verification step.

## Render the film

With FFmpeg and FFprobe available on PATH:

```sh
npm run render
npm run verify:video
```

The output is `motion/output/cavelux-engineered-to-deliver-v6.mp4`: 45 seconds,
1080 Ã— 1920, 30 fps, H.264 with stereo audio. For stills, use
`node motion/render.mjs --stills-only`. `npm run test:motion` checks the local
composition, character behavior, and preview interface.

The browser checks currently use an installed Microsoft Edge browser. With the
local studio running in another terminal, `npm test` runs the backend, motion,
studio, and export suites. The film renderer can use another Chromium executable through
`CAVELUX_BROWSER_PATH`; cross-platform rendering is not yet verified.

## What's inside

| Folder | Contents |
| --- | --- |
| `motion/` | Frame-addressable film, browser player, rendering and verification scripts. |
| `motion/sprites/` | Normal, working, and ultracode character bases, state metadata, and prompts. |
| `motion/graphics/` | Editable orbital, topology, oscilloscope, terminal, and calibration SVGs. |
| `motion/audio/` | Original soundtrack, separate score/SFX stems, generator, and measured audio metadata. |
| `motion/brand/` | Existing CAVELUX identity assets copied for this project. |
| `motion/output/` | Rendered film, covers, stills, and version-specific check results. |
| `charming/` | Character-studio application, preset storage backend, and local harness. |
| `archive/` | Earlier concepts, clean poses, and partial v1/v2/v3 snapshots with shared unchanged assets. |
| `references/` | The original user-supplied Clawd image and visual direction references. |
| `docs/` | Reproduction notes and the SHA-256 inventory of preserved history. |

The archives preserve earlier work without duplicating complete ZIP bundles.
[The inventory](docs/archive-inventory.json) maps each source file and archive
member to its retained repository location. Historical check reports apply to
the source revision that produced them.

This is an internal CAVELUX creative project. Clawd's original Anthropic
provenance and the adaptation context are recorded in [ATTRIBUTION.md](ATTRIBUTION.md).
The v6 film is a review candidate. V4 and v5 remain preserved, and no Instagram publication or hosted studio update is part of this polish pass.
