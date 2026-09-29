# Cavelux Clawd — implementation and review ownership

Codex owns the final polish and render. FABLE is a review seat for claims, the never-list, delivery specs and file hashes; this document does not dispatch implementation or mascot work to FABLE.

The current review candidate is `motion/output/cavelux-engineered-to-deliver-v5.mp4`. Read [FABLE-REVIEW.md](FABLE-REVIEW.md) for exact file pins and evidence. V4 remains at `motion/output/cavelux-engineered-to-deliver-v4.mp4`, with a partial source/stills snapshot in `archive/motion-v4/` and the complete prior Git revision pinned there.

The earlier simplified-eye v5 was rejected and reverted. It remains in Git history at `5d0ec852b969d793135108ba31e492810a895780`; its hash does not identify this new v5. Use the new delivery hash, not the filename alone.

## Locked direction for an implementation seat

- Keep the original large, animated counter-rotating spirals. The latest eye decision was: "revert it, old swirly looks better". Do not simplify or shrink them.
- Normal has regular rectangular eyes and no aura. Working has a green code aura. Ultracode has the animated rainbow body wave.
- Preserve the professional engineering copy, stronger 128 BPM electronic score, 45 seconds, 1080 x 1920 and 30 fps. No voiceover.
- The film is an illustrative process, not live telemetry or evidence of measured performance or client results.
- Preserve V4, source sprites, stems, presets and hosted app privacy.
- A future revision after this review candidate should use v6 consistently in the renderer, verifier, player and metadata.

## Reproduce and verify

With the pinned npm dependencies, Python with NumPy/Pillow, FFmpeg/FFprobe and Windows Edge installed:

```powershell
node motion/server.mjs
node charming/build.mjs
node charming/server.mjs
```

The film preview uses port 8766; the local studio uses 8787. With those services available:

```powershell
node motion/render.mjs
node motion/verify.mjs
node motion/reactions/render.mjs
npm test
node scripts/check-polish.mjs --candidate
git diff --check
```

The performance harness uses the frozen v4 source for `--control`, one warm-up replay and seven timed replays. Run it without competing render work. See `performance-evidence/` for environment and workload hashes and scope limits. On this host the inherited PATH is unusually long; use a process-only PATH containing Node, Python, FFmpeg, Git and Windows System32 if npm cannot resolve Node. Do not change the system environment.

Building the local studio bundle does not publish it. Hosted revision 8 retains the same approved character. The film-only changes are not a request to deploy a studio update.

User visual/audio approval, physical-phone playback and Instagram upload/transcoding remain separate from technical checks. Nothing is posted externally by this handoff.
