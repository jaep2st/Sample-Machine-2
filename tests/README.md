# Test lab

Generated songs where the exact beat and bar-line times are known, used to check the app's beat engine.

```
node tests/lab.js            # every test set (a few minutes)
node tests/lab.js main       # the 16 hand-made songs only
node tests/lab.js --verbose  # a row for every song
```

No installs needed, only Node.js 18 or newer. The lab reads the analysis code straight out of `index.html`, so it always tests what the site actually ships.

## Flip-mode checks

```
node tests/flips.js
```

Renders every flip mode on a generated 90 BPM song with a drum-only break and checks exact loop lengths, no clipping or bad samples, that flips really re-sequence the slices, that filters remove what they should, that the stab kit finds a real hit, and that the break finder lands on the break.

## What a song must get right

- **Tempo:** the BPM shown is within 1 of the truth. Exactly half or double also counts, since loops still line up.
- **Beats:** at least 90% of detected beats land within 70 ms of a real beat.
- **Bar starts:** at least 90% of 2-bar chops start within 30 ms of a real bar line.
- **Loops:** each chop renders to exactly 8 beats at the BPM in its file name, to the sample.

## Test sets

| Set | Songs | Must pass |
|---|---|---|
| main | 16 hand-made: boom-bap, trap, house, dembow, drum & bass, lo-fi swing, live-feel soul, no drums, piano only, tempo jump, ambient intro, 48 kHz stereo, 12 s clip, quiet master, vinyl crackle, 7 min track | 16 |
| main-48k | the same songs at 48 kHz, like a phone browser | 16 |
| random-1000, random-5000 | 30 randomized songs each: tempo, pattern, swing, loose timing, key, chord rhythm, intro, loudness, sample rate | 30 each |
| random-9000 | 30 more randomized songs | 28 |

Known hard cases in random-9000: #1 slips a 16th note for a few bars on a syncopated kick pattern, and #17 reads a half-time trap beat at double speed so its chops start mid-bar.

## Adding a real-world case

When a user reports a song that loops wrong, describe its tempo, drum pattern and feel as a new entry in `SONGS` in `songs.js`, fix the engine until it passes, and keep the entry so it never breaks again.
