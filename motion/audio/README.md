# CAVELUX / Engineered Momentum

Original electro music for a professional engineering showreel: a driving
kick/snare groove, articulated sixteenth-note hats and arpeggios, syncopated
FM/saw bass, and short chord stabs. The previous sustained pad bed is replaced
by rhythmic instruments and compact transitions.

Use [master.wav](master.wav) in the film. `score.wav` and `sfx.wav` are separate
pre-master stems; their sum is `premaster.wav`. All four files are stereo,
48 kHz, 24-bit PCM, and exactly 45.000 seconds. The composition is 128 BPM,
4/4, and 24 bars, preserving the six 7.5-second picture chapters.

| Time | Chapter | Arrangement |
| --- | --- | --- |
| 0.0-7.5 | INITIALIZE | Immediate electronic downbeat; bass and percussion layers open. |
| 7.5-15.0 | BUILD | Full precision groove, gated harmonic stabs, tight sixteenths. |
| 15.0-22.5 | PARALLEL | Denser bass rhythm and interlocking sequence. |
| 22.5-30.0 | SYNCHRONIZE | Controlled tension, rising tom run, restrained transition. |
| 30.0-37.5 | THROUGHPUT | Strongest bass and drums, open harmony, sustained momentum. |
| 37.5-45.0 | DELIVER | Resolve into the electronic D-A-D identity at 41.94-42.28s. |

Every sound is synthesized in `generate_audio.py`; there are no external
samples, recordings, or vocals. The final 100 ms is silent. Mastering targets
-14 LUFS with a -1.5 dBTP limiter target; the delivered master measures
**-13.99 LUFS and -1.45 dBTP**, below the -1 dBTP delivery ceiling.

From the repository root, with Python, NumPy, and FFmpeg available:

```sh
python motion/audio/generate_audio.py
python motion/validate-audio.py
```

The [validator](../validate-audio.py) checks actual WAV samples and compares
them with the [archived soundtrack](../../archive/motion-v3/audio/README.md).
The [current report](../output/audio-checks/audio-results.json) records ten
passing checks. The separate pre-change report retains the expected failures.

The measured core groove adds high-band attacks at all 128 off-eighth
sixteenth-note positions from 7.5 to 37.5 seconds; the old cue registered zero.
This count is normalized to each track's energy, so turning up the old cue
cannot satisfy it. Normalized waveform correlation is -0.028, confirming the
new samples are not simply a gain-adjusted copy. All exports have 2,160,000
stereo frames and no clipped samples. See `manifest.json` for file hashes and
`mastering-log.txt` for FFmpeg measurements.

These checks establish timing, signal behavior, and a substantive rhythmic
change. Subjective listening quality, physical-device playback, and the final
video's picture synchronization require their own review.
