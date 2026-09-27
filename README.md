# WebCPT — Browser SART

A browser-based **SART** (Sustained Attention to Response Task) aligned with Robertson et al. (1997) timing (digit 250 ms + mask 900 ms).

Optional **ShapeDistract** condition adds neutral on-screen shapes (Async / Steady / Sync). No server required.

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
| Go | Press for any digit **except 3** |
| No-Go | **Do not** press for **3** |
| Main metric | Commission errors (press on 3) |

Response: Space / Enter / tap the screen.

## Conditions

- **Baseline** — no distractors (rough literature comparison on the results screen)
- **ShapeDistract** — ignore shapes; respond only to the central digit
  - Async (default), Steady, or Sync timing

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
```

## Citation anchors

- Robertson, I. H., et al. (1997). *Neuropsychologia*.
- Manly, T., et al. (2000). healthy-adult Commission reference used on the results screen (Baseline, full No-Go count).

## License note

This is research software. Not a clinical or diagnostic tool.
