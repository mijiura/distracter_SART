# AudioDistract 用音声素材

このフォルダに音声を置くと `AudioDistract` 条件で再生されます。  
**ファイルが無くても課題は進行します**（無音・ログのみ）。

## 期待するファイル名（app.js `CONFIG.audioClips` と一致）

| ファイル | id | 用途 |
|--|--|--|
| `notify_soft.mp3` | `notify_soft` | 短い通知音（Async / Sync） |
| `email_ping.mp3` | `email_ping` | メール風ピン（Async / Sync） |
| `sns_pop.mp3` | `sns_pop` | SNS風ポップ（Async / Sync） |
| `ambient_hum.mp3` | `ambient_hum` | 環境音（Steady） |

同じ basename の `.ogg` でも可（`CONFIG` の `file` を合わせる）。

## 推奨仕様

- 長さ: 通知系 0.3–1.5 s、環境音 8–20 s（ループ可）
- ピークを避けた控えめな音量で書き出し（アプリ側でも減衰）
- 実在ブランドの着信音は避ける

置き方を変える場合は `app.js` の `CONFIG.audioClips` を編集してください。
