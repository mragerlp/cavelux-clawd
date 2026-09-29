# Reaction Pack 01 — Production board

**Status: approved production specification.** Export completion is established
by the current renderer and verification results, not by this board.
Every reaction is textless, square, and built from the existing canonical Clawd.
Aim for a recognizable silhouette and one gesture that still reads at 128 pixels.

| ID | State | Gesture and composition | Duration / frames | Loop direction |
| --- | --- | --- | --- | --- |
| `share-break` | Normal | Offer a stylized red KitKat-wrapped bar toward the viewer; keep the wrapper beside the face, with a clear sharing hold. | 2.4 s / 48 | Reach, hold, and return to the same relaxed pose. |
| `typing` | Working | Small alternating tentacle taps over a compact retro keyboard; spiral eyes and a restrained green code aura convey concentration. | 2.4 s / 48 | Repeat an even typing rhythm; eye and aura phases close with the gesture. |
| `approved` | Normal | One satisfied nod with a single clean checkmark accent; leave the rectangular eyes unobstructed. | 2.0 s / 40 | Nod, settle briefly, and return without a second nod. |
| `panic` | Normal | A contained startled wobble with two small sweat accents; keep the face friendly and the motion readable. | 2.4 s / 48 | Wobble, recover, and return to neutral; no angry-face substitution. |
| `side-eye` | Normal | A slow sideways lean and glance, followed by a deliberate still hold; preserve the rectangular eye shapes. | 2.4 s / 48 | Lean, hold the reaction, and ease back. |
| `shrug` | Normal | Lift both side tentacles in a compact, balanced shrug; keep the central body calm. | 2.4 s / 48 | Lift, hold, and lower together. |
| `celebrate` | Ultracode | A buoyant upward bounce with raised tentacles; the rainbow wave provides the main color release. | 2.4 s / 48 | Bounce and settle; body color and eye rotation must also wrap cleanly. |
| `presenting` | Normal | Sweep one tentacle toward a small blank presentation panel; give the panel room and keep the face dominant. | 2.4 s / 48 | Present, hold, and draw the arm and panel back. |

## Shared production settings

- 512 × 512 pixels, 20 fps; transparent GIF and transparent PNG masters.
- A representative transparent poster PNG and a carbon-background MP4 fallback
  for every ID.
- The GIF palette must retain the lime body, black eye geometry, clean outline,
  and distinct rainbow colors without a solid background or a stray matte.
- Use the same apparent character scale and baseline across the pack, leaving
  enough padding for each gesture and prop.
- No speech bubbles or action captions. Avoid visual clutter around the eyes.
- The pose and effect state at time zero and at the duration boundary must join.
  Export the half-open frame range so the final frame is not a duplicate hold.

## Reuse and verification

Reuse [film.js](../film.js), its `renderCharacterPreview` entry point, and
[canonical state assets](../sprites/states.json). The reaction renderer adds
props and gestures; it does not reintroduce retired expression candidates.

Before calling the pack complete, inspect all eight reactions at both 512 and
128 pixels. Check the joins in repeated playback, transparent edges, eye shapes,
rainbow palette, framing, frame counts, durations, and actual export sizes.
Check that each poster and MP4 matches its GIF, and that the ZIP contains the
expected transparent masters and delivery files.

Renderer and gallery checks establish local export behavior. Physical Messages
delivery and transcoding on the recipient's device require separate observation.
See [delivery notes](README.md) for the output paths and sharing workflow.
