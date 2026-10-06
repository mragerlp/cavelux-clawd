# REASON reel

A 30.00 s, 1080 x 1920, 30 fps vertical reel built on the same pipeline as the v6 film.
Nothing in `motion/` outside this folder is changed; the v6 renderer, verifier, validators
and stems are untouched.

- `register.json` - the only text the page may draw: claim lines C1-C8 and labels L1-L14.
  `reel.js` throws at draw time on any other string.
- `timeline.json` - beats, caption typing windows, the door choreography, eye blinks.
- `reel.js` + `index.html` - the scene module. The Clawd is drawn only through
  `renderCharacterPreview` from `../film.js` in character-only mode; no sprite pixel is
  read or edited here. The pixel labels use an original 5x7 block alphabet drawn in code.
- `render.mjs` - `--cues` writes `cues.json` (beats, transitions, scans, one click per glyph
  at the frame the glyph first shows); `--out DIR --audio WAV` renders `reason-reel_v1.mp4`.
- `generate_reason_audio.py` - synthesised bed, key clicks and scan sfx from `cues.json`;
  writes `bed.wav`, `clicks.wav`, `sfx.wav`, `premaster.wav`, `master.wav`, the cue sheet
  and a loudness manifest. No samples, recordings or vocals.
- `verify.mjs` - delivery checks: format, frames, decode, loudness, safe zone, eye on screen.

```sh
node motion/reason/render.mjs --cues
python motion/reason/generate_reason_audio.py --out OUT/audio
node motion/reason/render.mjs --out OUT --audio OUT/audio/master.wav
node motion/reason/verify.mjs OUT/reason-reel_v1.mp4
```

Needs Node 22, the pinned Playwright, Microsoft Edge (or `CAVELUX_BROWSER_PATH`), Python
with NumPy, and FFmpeg/FFprobe. Fonts are the host's Bahnschrift and Consolas, as in v6.
Signal checks do not establish listening quality, phone readability or platform re-encode.
