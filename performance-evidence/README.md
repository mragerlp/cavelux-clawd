# Final-polish verification

From the repository root, with `node motion/server.mjs` serving this checkout:

```sh
node scripts/check-polish.mjs --control
node scripts/check-polish.mjs --candidate
```

Control loads the frozen `archive/motion-v4/film.js` through a browser route.
Candidate loads `motion/film.js` the same way. Asset URLs and the 1080 × 1920
canvas remain identical. The harness verifies the server root and records the
source, dependency, workload, and environment hashes plus Node, Edge, and host
details. The initial control was captured from the identical live source before
editing; its environment digest was added from the recorded metadata afterward.

The fixed workload has 21 frames: one representative frame in each of six
scenes, and the preceding, first, and eighth following frame at every 225-frame
cut. One untimed warmup precedes seven timed replays. Timing includes a
synchronous one-pixel readback after each Canvas render to flush drawing.
Reports retain every sample and the overall and per-frame p50/p95 values.

Candidate flags an overall p50 or p95 regression above 25%, or a p95 above
33.333 ms overall or for any sampled frame. A threshold breach triggers two
more complete attempts; the final comparison includes all attempts, not the
best one. The control and candidate must share the workload and toolchain.
These checks measure this host and workload, not an optimization claim or
encoded playback performance. The Canvas timing ceiling does not measure or
prove a peak process-memory bound. Avoid running unrelated renders concurrently.

Candidate also compares actual full-canvas pixels at every cut: the first
frame must equal the preceding frame, the eighth following frame must differ,
and a repeated first frame must be identical. All 1,350 frames are rendered
with `fillText` and `strokeText` instrumentation. The resulting text corpus is
checked for private names, filesystem paths, UUIDs, and long hexadecimal
hashes, including draws with low or zero opacity. Image-embedded text needs
separate visual review. Control deliberately skips the new candidate assertions.

`control.json`, `candidate.json`, and `text-corpus.json` describe the source
hashes that produced them. A fresh source change requires a fresh candidate
run. Exit zero requires every applicable check to pass.

The first candidate's p95 regression failed the 25% limit and is retained in
`candidate-before-cut-optimization.json`. It is historical failure evidence,
not the current candidate report. The source change that followed skipped the
fully occluded incoming scene on the first frame of each transition.
