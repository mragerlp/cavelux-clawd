# REASON reel

A 30.00 s, 1080 x 1920, 30 fps vertical reel built on the same pipeline as the v6 film.
Nothing in `motion/` outside this folder is changed; the v6 renderer, verifier, validators
and stems are untouched.

- `register.json` - the only text the page may draw: claim lines C1-C8 and labels L1-L14.
  `reel.js` throws at draw time on any other string. Curly quotes and a hair space after
  "Higher" are applied after that check, at draw time; the registered words never change.
- `timeline.json` - beats, caption typing windows, hand-set row breaks (`rowBreaks`, which
  must rebuild each register line exactly), the door choreography and the eye blinks.
- `reel.js` + `index.html` - the scene module. The Clawd is drawn only through
  `renderCharacterPreview` from `../film.js` in character-only mode; no sprite pixel is
  read or edited here. Pixel labels use an original 5x7 block alphabet drawn in code.
  Every caption row must stay inside the Reels caption band (y 250-1490) and left of the
  right-side action rail (x 936, cursor included), or the page throws.
- `render.mjs` - `--cues` writes `cues.json` (beats, transitions, scans, one click per glyph
  at the frame the glyph first shows). `--out DIR --audio WAV [--name FILE]` renders the
  Instagram delivery master: lossless PNG frames, BT.709 limited range with full chroma
  interpolation, x264 High 4.1 at CRF 14 / preset slower / tune animation with a 1 s GOP,
  and AAC 320 kb/s 48 kHz stereo.
- `generate_reason_audio.py` - synthesised bed, key clicks and scan sfx from `cues.json`;
  writes `bed.wav`, `clicks.wav`, `sfx.wav`, `premaster.wav`, `master.wav`, the cue sheet
  and a manifest. The run fails unless the master is -14 LUFS (+/- 0.5) with true peak at
  or under -1.5 dBTP, the bed is mono-safe (L/R correlation >= 0.5), loudness after a
  300 Hz high-pass is within 4.5 LU of full band (phone speakers), and the key clicks keep
  a median of at least 8 dB over the bed in 1-8 kHz. No samples, recordings or vocals.
- `verify.mjs` - delivery checks: format, frames, full decode, loudness, safe zone, the eye
  on screen from frame 0, mono safety, and caption clearance of the action rail.

```sh
node motion/reason/render.mjs --cues
python motion/reason/generate_reason_audio.py --out OUT/audio
node motion/reason/render.mjs --out OUT --audio OUT/audio/master.wav --name reason-reel_v2.mp4
node motion/reason/verify.mjs OUT/reason-reel_v2.mp4
```

Needs Node 22, the pinned Playwright, Microsoft Edge (or `CAVELUX_BROWSER_PATH`), Python
with NumPy, and FFmpeg/FFprobe. Fonts are the host's Bahnschrift and Consolas, as in v6.
Signal checks do not establish listening quality, phone readability or platform re-encode.
