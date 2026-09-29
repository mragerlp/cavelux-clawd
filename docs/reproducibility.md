# Reproducing the motion film

Run commands from the repository root. The preview serves local files and does
not require a build step:

```sh
node motion/server.mjs
```

Open [the film preview](http://127.0.0.1:8766/) or
[the character library](http://127.0.0.1:8766/assets.html). Stop the server with
Ctrl+C. The server binds to loopback only. Port 8766 must belong to this checkout;
the renderer checks the server's project root before reusing that port.

## Rendering and verification

Rendering needs Node.js 22 or later, an installed Chromium browser, and FFmpeg on
PATH. Video verification also needs FFprobe. Install the pinned JavaScript
dependencies with `npm ci`. The current browser checks use Microsoft Edge; the
renderer also accepts an explicit executable through `CAVELUX_BROWSER_PATH`.
Browser installation is separate from copying the source files. Playwright is
pinned in `package.json` and `package-lock.json`.

The original film was built on Windows with Codex's bundled Node/Python
runtimes. Current active scripts resolve the repository's local Playwright
dependency; historical scripts in `archive/` may contain original host paths.

```sh
node motion/render.mjs --check-only
node motion/render.mjs --stills-only
node motion/render.mjs
node motion/verify.mjs
node motion/validate-ui.mjs
node motion/validate-character-states.mjs
node motion/validate-hypnosis.mjs
node motion/validate-editorial.mjs
python motion/validate-audio.py
```

The full renderer writes `motion/output/cavelux-engineered-to-deliver-v4.mp4`:
1080 by 1920 pixels, 30 frames per second, 1,350 frames, and 45 seconds. It uses
the local `motion/audio/master.wav`. Rendering replaces the current output;
earlier revisions are represented in the archive inventory.

The composition uses Bahnschrift and Consolas, with Arial/sans-serif and
monospace fallbacks. Fonts are not bundled. A different host, font fallback,
browser version, or graphics implementation can change text metrics and pixels.
Repeated-frame checks on one host do not establish cross-platform pixel parity.

## Character studio

```sh
node charming/build.mjs
node charming/server.mjs
```

The local harness serves [the studio](http://127.0.0.1:8787/studio) on loopback
port 8787. It runs the backend's preset routes against local disk storage in
`charming/.local/presets.json`. It does not connect local presets to Charming's
hosted storage. Start the server before the browser checks:

```sh
node --test charming/backend.test.mjs
node charming/verify-ui.mjs
node charming/verify-export.mjs
```

The build combines the backend module, interface, styles, and character renderer
into `charming/dist/source.json`. A hosted update and a local build are separate
steps. Confirm the deployed revision and hosted save/load behavior before
claiming that the hosted studio matches the local source.

## Recreating the soundtrack

Use Python with NumPy, and FFmpeg on PATH:

```sh
python motion/audio/generate_audio.py
```

This regenerates the stereo 48 kHz, 24-bit WAV files, loudness evidence, and cue
manifest in `motion/audio/`. It uses a fixed random seed and a 128 BPM, 24-bar
composition. NumPy and FFmpeg versions can affect exact output bytes; the
measured sample count and audio checks are recorded by the generator.

## Preserved files and evidence

`docs/archive-inventory.json` maps original sibling files and historical ZIP
entries to matching repository files by SHA-256. Ignored frame scratch directories
and local preset storage are excluded. Repeated assets share one
stored copy. The historical ZIP files themselves are not duplicated in this
repository. `archive/motion-v1/`, `archive/motion-v2/`, and `archive/motion-v3/` are partial snapshots;
unchanged assets live in shared locations recorded in the inventory. They are
historical material, not independently runnable copies of the application.
To rebuild the core migration snapshot while those source folders and
ZIPs are still present beside the checkout:

```sh
python docs/audit_migration.py
```

Use `--generated-root PATH` to include the original image-generation directory
and `--reference PATH` to include the user-supplied Clawd PNG. Those optional
sources were included in the full initial migration audit.

`.gitattributes` prevents automatic line-ending conversion so archived bytes
survive a checkout. Existing `DELIVERY.json` files and checks under `output/`
describe the version that produced them. Re-run the relevant checks after an
edit; an older passing report does not validate new source.

Local rendering and browser checks do not verify Instagram upload or transcoding,
playback on another device, or subjective music and motion quality. Repository
publication and a Charming-hosted deployment require their own confirmed results.
