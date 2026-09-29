# CAVELUX motion film

A local, editable 45-second vertical film and asset pack.

## Preview

Run `node server.mjs`, then open http://127.0.0.1:8766/ in a browser. Press Play to start the film and original soundtrack. Chapter buttons and the timeline allow precise review. Playback is paused by default and pauses when the browser tab is hidden.

## Render

Run `node render.mjs --stills-only` for storyboard captures, or `node render.mjs` for the full video. Run `node verify.mjs` to check the resulting MP4.

The renderer uses the bundled Playwright installation and ffmpeg available on this host. The composition uses the installed Bahnschrift and Consolas fonts with sans-serif and monospace fallbacks; rendering on a different host without these fonts can change typography.

## Files

- index.html, film.js, player.js: interactive preview and frame-addressable composition.
- sprites/: four lime Clawd poses and one rainbow body state.
- brand/: copies of existing Cavelux identity assets.
- graphics/: six editable native SVG motion assets and a manifest.
- audio/: original score, sound effects, mixed master, generator, and measured audio evidence.
- STORYBOARD.md: six movements, timing, copy, and intended transitions.
- output/: final film, cover, storyboard captures, and verification evidence after rendering.

Image-generation prompts are recorded in IMAGEGEN-PROMPTS.md. The four lime poses were generated earlier in this chat; their full prompts are copied to sprites/POSE-PROMPTS.md. Open assets.html for the visual asset library.

## Limits

This is an authored motion-design study, not footage or telemetry from live Cavelux operations. The exported MP4 can be verified locally. Platform upload, Instagram interface placement, and playback on external devices require a separate review.
