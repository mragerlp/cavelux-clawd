# CAVELUX / Signal to Spectrum

Original 45.000-second instrumental cue: 128 BPM, 24 bars, 4/4, D minor.
All sounds are synthesized in `generate_audio.py`; no external samples or vocals.

Use `master.wav` for the finished film. `score.wav` and `sfx.wav` are pre-master
stems with a shared gain for alternate editorial mixes. `premaster.wav` is their sum.
All WAV files are stereo, 48 kHz, 24-bit PCM.

| Time | Movement | Sound and intended picture |
| --- | --- | --- |
| 0.000-7.500 | Wake | Soft boot signal, warm pad, sparse identity motif; mascot wakes. |
| 7.500-15.000 | Build | Tight drums, warm bass, precision micro-clicks; code and work states. |
| 15.000-22.500 | Swarm | Interlocking arpeggios, wide data ticks; agents multiply. |
| 22.500-30.000 | Synchronize | Reduced backbeat, spatial detail, restrained rising tone. |
| 30.000-37.500 | Spectrum | Harmonic bloom, fuller drums and melody; rainbow transformation. |
| 37.500-45.000 | Reveal | Elements fall away; D-A-D sonic mark at 41.96-42.31, clean fade. |

The final 100 ms is silence in the source mix. Mastering uses a two-pass FFmpeg
loudness target of -16 LUFS with a -1.5 dBTP ceiling. Actual results and all cue
times are in `manifest.json`; detailed FFmpeg output is in `mastering-log.txt`.

Regenerate with the bundled Python runtime and `python generate_audio.py`.
Dependency: NumPy; `ffmpeg` on PATH. The random source uses a fixed seed.

Verified: exact sample count and duration, stereo sample format, clipping,
sample peaks, channel correlation, and independent FFmpeg loudness measurement.
Unverified: human listening assessment and synchronization to the final rendered film.
