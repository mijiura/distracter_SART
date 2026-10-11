# WebCPT — Browser SART

A browser-based **SART** (Sustained Attention to Response Task) aligned with Robertson et al. (1997) timing (digit 250 ms + mask 900 ms).

Optional distractor conditions:

- **ShapeDistract** — neutral on-screen shapes (Async / Steady / Sync)
- **IllustDistract** — random illustrations (smartphone / explosion / magic book / clam), same timing modes
- **AudioDistract** — auditory distractors (same timing modes). Place mp3/ogg under `assets/audio/` when ready; without files the task still runs (silent + logs)
- **NotifyDistract** — Japanese-only toast notifications (email / like / DM / calendar / news) at screen corners; no sound

No server required.

## Try it

Open `index.html` in a browser, or:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

After GitHub Pages is enabled: `https://<user>.github.io/<repo>/`

## Task

| | |
|--|--|
| Digits | 1–9 (size varies; ignore size) |
| Go | Press for any digit **except the No-Go digit** |
| No-Go | **Do not** press for the chosen non-target (default **3**; selectable 1–9) |
| Main metric | Commission errors (press on the No-Go digit) |

Response: Space / Enter / tap the screen.

## Conditions

- **Baseline** — no distractors (rough literature comparison on the results screen)
- **ShapeDistract** — ignore shapes; respond only to the central digit
  - Async (default), Steady, or Sync timing
- **IllustDistract** — ignore illustrations; same timing modes as ShapeDistract
- **AudioDistract** — ignore sounds; same timing modes (files optional until you add them)
- **NotifyDistract** — ignore on-screen notifications (Japanese text, 5 types)

Demo mode shortens the experimental block.

## Data (stays on the user’s device)

1. **CSV** — optional download of trial-level log  
2. **localStorage** — session summaries for history / personal Baseline compare (`webcpt_sart_sessions_v1`)

Nothing is uploaded to GitHub or any server.

## Files

```
index.html
styles.css
app.js
assets/illustrations/   (IllustDistract PNGs)
assets/audio/           (AudioDistract clips; see README there)
```

## Citation anchors

- Robertson, I. H., et al. (1997). *Neuropsychologia*.
- Manly, T., et al. (2000). healthy-adult Commission reference used on the results screen (Baseline, full No-Go count).

## License note

This is research software. Not a clinical or diagnostic tool.
