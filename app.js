/**
 * =============================================================================
 * WebCPT / SART（Sustained Attention to Response Task）— ブラウザ実装
 * =============================================================================
 * index.html … id / DOM。styles.css … 見た目。.hidden / .digit.size-N / .distractor.shape-*
 *
 * 流れ: スタート → 教示 → 練習 → 休憩 → 本試行 → 終了（集計＋CSV）
 * 1試行: 数字 250 ms → マスク 900 ms（SOA 1150 ms）。Space / Enter / クリック / タップ
 * ルール: 1–9、3 だけ押さない（Commission＝3で押した＝主指標）
 * ShapeDistract / IllustDistract: Sync（数字と同時）/ Async（突発）/ Steady（ゆったり出入り）
 * AudioDistract: 同上タイミングで音声（素材は assets/audio/。無くても無音で進行）
 * 保存: 試行ログ→CSV／セッション要約→localStorage（個人内比較）
 * =============================================================================
 */
(() => {
  "use strict";

  // --- CONFIG: 実験パラメータ（文献再現を崩したくない: stimulus/mask/noGo/本試行回数/fontSizes） ---
  const CONFIG = {
    paradigm: "SART", // CSV の paradigm 列。分析側のフィルタ名に使う
    noGoDigit: 3, // 変えると「押さない数字」が変わる（教示・Commission定義も要確認）
    digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    fontSizes: [1, 2, 3, 4, 5], // → HTML class "digit size-N" → styles.css .digit.size-N
    stimulusDurationMs: 250, // 数字の提示。短くすると難易度↑・文献SOAから外れる
    maskDurationMs: 900, // マスク。合計が soaMs。反応受付はこの合計時間
    anticipatoryRtSec: 0.1, // これ未満の RT → CSV anticipatory=1（早押しフラグ）
    practiceRepeatsPerDigit: 2, // 練習: 2×9=18試行。増やすと練習が長くなる
    practiceFeedbackMs: 500, // 練習のみ: 試行後の正解／ミス表示の長さ
    experimentRepeatsPerDigit: 25, // 本試行: 25×9=225。文献比較の No-Go25 前提
    demoRepeatsPerDigit: 4, // デモON時の本試行: 4×9=36。文献比較はスキップされやすい
    shapeDistractRate: 0.2, // Sync: 妨害付き試行の割合 / Async: ブロック内イベント数の目安
    shapeDistractCount: 1, // 1回の出現で同時に出す図形／イラストの個数
    // 形名は styles.css の .distractor.shape-XXX と一致させること
    distractorShapes: ["square", "triangle", "circle", "diamond"],
    // イラスト名は styles.css の .distractor.illust-XXX と assets/illustrations/XXX.png と一致
    distractorIllustrations: ["smartphone", "explosion", "magic_book", "clam"],
    // NotifyDistract: 5種・日本語のみ（CSV distractor_shapes = type id）
    distractorNotifyTypes: ["email", "sns_like", "sns_dm", "calendar", "news"],
    notifyTemplates: {
      email: {
        icon: "✉",
        title: "新着メール",
        previews: ["田中さんから 1件", "佐藤さんから 1件", "事務局から 1件"],
      },
      sns_like: {
        icon: "♥",
        title: "いいねがありました",
        previews: ["あなたの投稿", "先ほどの写真", "共有したリンク"],
      },
      sns_dm: {
        icon: "💬",
        title: "メッセージ",
        previews: ["山田: 今大丈夫？", "鈴木: 後で連絡するね", "グループ: 新着 2件"],
      },
      calendar: {
        icon: "📅",
        title: "予定のリマインダー",
        previews: ["15分後: ミーティング", "30分後: 面談", "1時間後: 提出期限"],
      },
      news: {
        icon: "📰",
        title: "ニュース速報",
        previews: ["国内の最新ニュース", "天気・交通情報", "今日の注目記事"],
      },
    },
    // 音声: ファイルが無くても id だけでスケジュール・CSV 可能。再生は ready なときだけ
    audioClips: [
      {
        id: "notify_soft",
        file: "assets/audio/notify_soft.mp3",
        role: "transient", // Async / Sync
        durationMs: 700,
      },
      {
        id: "email_ping",
        file: "assets/audio/email_ping.mp3",
        role: "transient",
        durationMs: 550,
      },
      {
        id: "sns_pop",
        file: "assets/audio/sns_pop.mp3",
        role: "transient",
        durationMs: 450,
      },
      {
        id: "ambient_hum",
        file: "assets/audio/ambient_hum.mp3",
        role: "ambient", // Steady
        durationMs: 14000,
      },
    ],
    audioDistractRate: 0.2, // Sync: 音付き試行割合 / Async: イベント密度の目安
    audioVolumeMin: 0.28,
    audioVolumeMax: 0.55,
    asyncAudioGapMinMs: 900,
    asyncAudioLeadInMs: 800,
    asyncAudioTailMs: 800,
    steadyAudioEventRate: 0.08,
    steadyAudioMaxConcurrent: 1,
    steadyAudioFadeInMinMs: 4000,
    steadyAudioFadeInMaxMs: 9000,
    steadyAudioHoldMinMs: 8000,
    steadyAudioHoldMaxMs: 20000,
    steadyAudioFadeOutMinMs: 4000,
    steadyAudioFadeOutMaxMs: 9000,
    steadyAudioLeadInMs: 800,
    steadyAudioTailMs: 1500,
    distractorEdgePadPct: 4, // 画面端からの余白%。大きくすると中央寄りに集まる
    distractorSizeMinRem: 1.2, // CSS --size の下限（rem）
    distractorSizeMaxRem: 6.5, // 上限。数字より大きくてよい（Asyncの設計意図）
    blockPreambleMs: 800, // ブロック開始〜最初の数字までの空白
    asyncDurationMinMs: 400, // Async図形の表示時間の下限（数字250msより長く散らす）
    asyncDurationMaxMs: 2800, // 上限。長くすると重なり試行が増えやすい
    asyncGapMinMs: 600, // Asyncイベント同士の最小間隔。小さいと密集しやすい
    asyncLeadInMs: 800, // ブロック先頭この分は図形を置かない
    asyncTailMs: 800, // ブロック末尾この分も置かない
    // --- Steady（ゆったり妨害）: 固定常駐ではなく、ゆっくり出入り。見た目の速さは CSS transition/animation ---
    steadyEventRate: 0.12, // 1イベントが長いので密度は控えめ
    steadyMaxConcurrent: 3, // 同時にいる図形の上限（これ以上は onset をずらす）
    steadySizeMinRem: 8,
    steadySizeMaxRem: 17,
    steadyOpacityMin: 0.2,
    steadyOpacityMax: 0.4,
    steadyMotions: ["rotate", "slide", "fade"], // 出現ごとにランダム割当。CSS .motion-* と対応
    steadyRotatePeriodMinSec: 45, // 1回転（大きいほどゆっくり）
    steadyRotatePeriodMaxSec: 90,
    steadySlidePeriodMinSec: 40, // 往復の片道
    steadySlidePeriodMaxSec: 80,
    steadyFadePeriodMinSec: 22, // 濃淡1周期
    steadyFadePeriodMaxSec: 50,
    steadyFadeInMinMs: 7000, // 入ってくる時間（もっとゆったり）
    steadyFadeInMaxMs: 14000,
    steadyHoldMinMs: 10000, // 見え続けている時間
    steadyHoldMaxMs: 28000,
    steadyFadeOutMinMs: 7000, // 消えていく時間
    steadyFadeOutMaxMs: 14000,
    steadyLeadInMs: 800,
    steadyTailMs: 1500,
    steadyEdgePadPct: 8,
  };

  // stimulus + mask。どちらかを変えると自動で追従（試行テンポ・所要時間に直結）
  CONFIG.soaMs = CONFIG.stimulusDurationMs + CONFIG.maskDurationMs;

  // --- 文献参照値（renderStats / #norm-compare）。数値を変えると比較文が変わる ---
  // 本比較が出る条件: Baseline かつ demo OFF かつ No-Go 試行数 === noGoTrials
  const NORMS = {
    manly2000: {
      commissionMean: 6.36,
      commissionSd: 4.36,
      noGoTrials: 25,
      goRtMeanMs: 375,
    },
    robertson1997: {
      commissionMean: 3.9,
      commissionSd: 2.1,
      noGoTrials: 25,
    },
  };

  // --- 条件メタ → 各試行・CSV列（condition/modality/...）
  // index.html の <option value="..."> と同じキーであること
  const CONDITION_META = {
    Baseline: {
      condition: "Baseline",
      modality: "None",
      meaningfulness: "None",
      temporal: "None",
    },
    ShapeDistract: {
      condition: "ShapeDistract",
      modality: "Visual",
      meaningfulness: "Neutral",
      temporal: "Transient", // Sync/Async。Steady は buildBlock で "Steady" に上書き
    },
    IllustDistract: {
      condition: "IllustDistract",
      modality: "Visual",
      meaningfulness: "Meaningful",
      temporal: "Transient",
    },
    AudioDistract: {
      condition: "AudioDistract",
      modality: "Auditory",
      meaningfulness: "Meaningful",
      temporal: "Transient",
    },
    NotifyDistract: {
      condition: "NotifyDistract",
      modality: "Visual",
      meaningfulness: "Meaningful",
      temporal: "Transient",
    },
  };

  /** タイミング UI（Async/Steady/Sync）を使う妨害条件か */
  function usesDistractTiming(key) {
    return (
      key === "ShapeDistract" ||
      key === "IllustDistract" ||
      key === "AudioDistract" ||
      key === "NotifyDistract"
    );
  }

  /** 視覚妨害（図形／イラスト／通知）か */
  function isVisualDistractCondition(key) {
    return (
      key === "ShapeDistract" ||
      key === "IllustDistract" ||
      key === "NotifyDistract"
    );
  }

  /** 聴覚妨害か */
  function isAudioDistractCondition(key) {
    return key === "AudioDistract";
  }

  /** "shape" | "illust" | "notify" */
  function distractorKindFor(conditionKey) {
    if (conditionKey === "IllustDistract") return "illust";
    if (conditionKey === "NotifyDistract") return "notify";
    return "shape";
  }

  /** 通知トーストの表示位置（右下 70% / 右上 15% / 左下 15%） */
  function pickNotifyCorner(rng) {
    const r = rng();
    if (r < 0.7) return "br";
    if (r < 0.85) return "tr";
    return "bl";
  }

  function notifyCopyFor(typeId, rng) {
    const tpl = CONFIG.notifyTemplates[typeId];
    if (!tpl) {
      return { icon: "●", title: "通知", preview: "" };
    }
    return {
      icon: tpl.icon,
      title: tpl.title,
      preview: pick(tpl.previews, rng),
    };
  }

  function buildNotifyDistractors(rng) {
    const typeId = pick(CONFIG.distractorNotifyTypes, rng);
    const copy = notifyCopyFor(typeId, rng);
    const corner = pickNotifyCorner(rng);
    return [
      {
        kind: "notify",
        shape: typeId,
        corner,
        title: copy.title,
        preview: copy.preview,
        icon: copy.icon,
        xPct: 0,
        yPct: 0,
        sizeRem: 0,
      },
    ];
  }

  function createNotifyToastElement(item, extraClass = "", { embed = false } = {}) {
    const node = document.createElement("div");
    const typeClass = `notify-${item.shape}`;
    const cornerCls = embed ? "" : ` notify-corner-${item.corner}`;
    node.className = `notify-toast ${typeClass}${cornerCls}${extraClass ? ` ${extraClass}` : ""}`;
    node.setAttribute("role", "presentation");
    node.innerHTML = `
      <div class="notify-toast-icon" aria-hidden="true">${item.icon || "●"}</div>
      <div class="notify-toast-body">
        <div class="notify-toast-title">${item.title || ""}</div>
        <div class="notify-toast-preview">${item.preview || ""}</div>
      </div>`;
    return node;
  }

  // --- 試行の結果ラベル（CSV outcome 列・summarize の集計キー） ---
  // 文字列を変えると既存CSV・分析スクリプトとの互換が切れる
  const Outcome = {
    CorrectGo: "CorrectGo", // Go 試行で正しく押した
    CorrectNoGo: "CorrectNoGo", // No-Go（数字3）で正しく押さなかった
    Omission: "Omission", // Go なのに押さなかった（見逃し）
    Commission: "Commission", // No-Go なのに押した（押し間違い＝SART の主要指標）
  };

  // --- 画面セクション（index.html の #screen-*）。キーは show("start") 等の引数 ---
  const screens = {
    start: document.getElementById("screen-start"),
    instruct: document.getElementById("screen-instruct"),
    task: document.getElementById("screen-task"),
    rest: document.getElementById("screen-rest"),
    done: document.getElementById("screen-done"),
    history: document.getElementById("screen-history"),
  };

  // --- 操作対象（id は index.html と1対1）。null になるとクリックや刺激表示が壊れる ---
  const el = {
    participant: document.getElementById("participant-id"),
    condition: document.getElementById("condition-select"),
    timing: document.getElementById("timing-select"),
    shapeOptions: document.getElementById("shape-options"),
    demo: document.getElementById("demo-mode"),
    instructList: document.getElementById("instruct-list"),
    start: document.getElementById("btn-start"),
    historyBtn: document.getElementById("btn-history"),
    historyParticipant: document.getElementById("history-participant"),
    historyList: document.getElementById("history-list"),
    historyRefresh: document.getElementById("btn-history-refresh"),
    historyClear: document.getElementById("btn-history-clear"),
    historyBack: document.getElementById("btn-history-back"),
    begin: document.getElementById("btn-begin"),
    continue: document.getElementById("btn-continue"),
    download: document.getElementById("btn-download"),
    restart: document.getElementById("btn-restart"),
    distractors: document.getElementById("distractor-layer"), // CSS #distractor-layer
    stim: document.getElementById("stimulus"), // CSS .digit
    mask: document.getElementById("mask"), // CSS .mask
    feedback: document.getElementById("trial-feedback"), // 練習の正誤表示
    restText: document.getElementById("rest-text"),
    stats: document.getElementById("stats"),
    selfCompare: document.getElementById("self-compare"),
    normCompare: document.getElementById("norm-compare"),
  };

  // --- 1セッション分の状態。prepareSession / runBlock / renderStats が読み書き ---
  const state = {
    participantId: "anon",
    sessionId: "",
    sessionStart: 0, // performance.now()。CSV の stim_onset_ms の基準
    demo: false,
    conditionKey: "Baseline", // CONDITION_META のキー
    timingMode: "Async", // "Async"|"Sync"|"Steady"|"None"（Baseline時は None）
    running: false, // 二重開始防止
    blockActive: false, // false にすると waitUntil / Async再生が途中終了
    practiceTrials: [],
    expTrials: [],
    practiceAsyncEvents: [],
    expAsyncEvents: [],
    practiceSteadyEvents: [], // Steady: ゆったり出入りのイベント列
    expSteadyEvents: [],
    practiceAudioEvents: [], // Audio Async / Steady イベント
    expAudioEvents: [],
    activeAsyncWindows: [], // Asyncの絶対時刻窓。試行ログの重なり判定用
    activeSteadyWindows: [], // Steadyの可視区間窓（フェードイン開始〜アウト完了）
    activeAudioWindows: [], // 音声イベントの絶対時刻窓
    activeAudioNodes: [], // 再生中 HTMLAudioElement（停止用）
    logs: [], // 全試行（練習+本試行）。CSV・集計の元
    listening: false,
    response: null, // { t: performance.now() } 最初の1回だけ
  };

  // --- 音声バンク（素材なしでもスケジュール・ログは動く） ---
  const AudioBank = {
    byId: Object.create(null),
    unlocked: false,
    preloadStarted: false,

    /** CONFIG.audioClips を読み込み開始。失敗しても課題は続行 */
    preloadAll() {
      if (this.preloadStarted) return;
      this.preloadStarted = true;
      for (const meta of CONFIG.audioClips) {
        const entry = {
          id: meta.id,
          file: meta.file,
          role: meta.role,
          durationMs: meta.durationMs,
          ready: false,
          el: null,
        };
        this.byId[meta.id] = entry;
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = meta.file;
        entry.el = audio;
        const markReady = () => {
          entry.ready = true;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            entry.durationMs = Math.round(audio.duration * 1000);
          }
        };
        audio.addEventListener("canplaythrough", markReady, { once: true });
        audio.addEventListener("loadedmetadata", markReady, { once: true });
        audio.addEventListener(
          "error",
          () => {
            entry.ready = false;
            // 素材未配置時は想定どおり。1回だけ控えめに知らせる
            console.info(`[AudioDistract] 未配置または読込失敗: ${meta.file}`);
          },
          { once: true }
        );
        audio.load();
      }
    },

    /** ユーザ操作内で呼ぶ（ブラウザの自動再生制限解除） */
    unlock() {
      this.unlocked = true;
      this.preloadAll();
      // 無音に近い再生でポリシー解除を試す（失敗しても無視）
      for (const entry of Object.values(this.byId)) {
        if (!entry.el) continue;
        try {
          entry.el.muted = true;
          const p = entry.el.play();
          if (p && typeof p.then === "function") {
            p.then(() => {
              entry.el.pause();
              entry.el.currentTime = 0;
              entry.el.muted = false;
            }).catch(() => {
              entry.el.muted = false;
            });
          }
        } catch (_err) {
          /* ignore */
        }
      }
    },

    clipsForRole(role) {
      return CONFIG.audioClips.filter((c) => c.role === role);
    },

    pickClip(role, rng) {
      const pool = this.clipsForRole(role);
      if (!pool.length) return null;
      return pick(pool, rng);
    },

    /**
     * 1回再生。未配置・未解除でも null を返し、課題は止めない。
     * @returns {{ node: HTMLAudioElement, played: boolean } | null}
     */
    play(id, volume) {
      const entry = this.byId[id];
      if (!entry) return null;
      if (!entry.ready || !entry.el) {
        return { node: null, played: false, id, reason: "not_ready" };
      }
      try {
        const node = entry.el.cloneNode(true);
        node.volume = Math.max(0, Math.min(1, volume));
        state.activeAudioNodes.push(node);
        const cleanup = () => {
          state.activeAudioNodes = state.activeAudioNodes.filter((n) => n !== node);
        };
        node.addEventListener("ended", cleanup, { once: true });
        const p = node.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {
            cleanup();
          });
        }
        return { node, played: true, id };
      } catch (_err) {
        return { node: null, played: false, id, reason: "play_error" };
      }
    },

    /** 再生中ノードをすべて停止 */
    stopAll() {
      for (const node of state.activeAudioNodes.slice()) {
        try {
          node.pause();
          node.currentTime = 0;
        } catch (_err) {
          /* ignore */
        }
      }
      state.activeAudioNodes = [];
    },

    /** Steady 用: 簡易フェード（GainNode なし。素材が無いときは何もしない） */
    async playWithFade(id, volume, fadeInMs, holdMs, fadeOutMs, blockStartAbs, onsetMs) {
      await waitUntil(blockStartAbs + onsetMs);
      if (!state.blockActive) return;
      const started = this.play(id, 0.01);
      if (!started || !started.played || !started.node) return;
      const node = started.node;
      const steps = 12;
      const vol = Math.max(0.01, Math.min(1, volume));
      // fade in
      for (let i = 1; i <= steps; i += 1) {
        if (!state.blockActive) break;
        node.volume = (vol * i) / steps;
        await waitUntil(blockStartAbs + onsetMs + Math.round((fadeInMs * i) / steps));
      }
      node.volume = vol;
      await waitUntil(blockStartAbs + onsetMs + fadeInMs + holdMs);
      if (!state.blockActive) {
        try {
          node.pause();
        } catch (_err) {
          /* ignore */
        }
        return;
      }
      const fadeStart = blockStartAbs + onsetMs + fadeInMs + holdMs;
      for (let i = 1; i <= steps; i += 1) {
        if (!state.blockActive) break;
        node.volume = vol * (1 - i / steps);
        await waitUntil(fadeStart + Math.round((fadeOutMs * i) / steps));
      }
      try {
        node.pause();
        node.currentTime = 0;
      } catch (_err) {
        /* ignore */
      }
      state.activeAudioNodes = state.activeAudioNodes.filter((n) => n !== node);
    },
  };

  /**
   * 指定した画面だけ表示。styles.css の .hidden を付け外し。
   * name は screens のキー（"start"|"instruct"|"task"|"rest"|"done"|"history"）。
   */
  function show(name) {
    Object.values(screens).forEach((node) => node.classList.add("hidden"));
    screens[name].classList.remove("hidden");
  }

  /**
   * スタート画面: 条件セレクト → #shape-options の表示切替。
   * Shape / Illust / Audio のとき表示。
   */
  function syncDistractOptionsUi() {
    const key = el.condition.value;
    const on = usesDistractTiming(key);
    el.shapeOptions.classList.toggle("hidden", !on);
    const label = document.getElementById("timing-label");
    const note = document.getElementById("timing-note");
    const audioNote = document.getElementById("audio-asset-note");
    if (audioNote) audioNote.classList.toggle("hidden", key !== "AudioDistract");
    if (!on || !label || !note) return;
    if (key === "IllustDistract") {
      label.textContent = "イラストのタイミング";
      note.textContent =
        "Async＝突発的にイラストが出現／消失。Steady＝大きなイラストがゆっくり現れ・消え、動きも都度ランダム（変化は常にゆったり）。Sync＝数字と同時の比較用。";
    } else if (key === "AudioDistract") {
      label.textContent = "音声のタイミング";
      note.textContent =
        "Async＝数字と独立して短い音。Steady＝環境音がゆっくり出入り。Sync＝数字と同時に短い音（一部試行）。素材未配置でも無音で進行します。";
    } else if (key === "NotifyDistract") {
      label.textContent = "通知のタイミング";
      note.textContent =
        "Async＝画面の角に通知風の表示が突発的に出る。Steady＝ゆっくり出入り。Sync＝数字と同時（一部試行）。音は鳴りません（日本語テキストのみ）。";
    } else {
      label.textContent = "図形のタイミング";
      note.textContent =
        "Async＝突発的に図形が出現／消失。Steady＝大きな図形がゆっくり現れ・消え、動きも都度ランダム（変化は常にゆったり）。Sync＝数字と同時の比較用。";
    }
  }

  // --- 乱数（同じ seed なら同じ数字列・図形配置＝再現可能） ---
  // seed は prepareSession() が参加者ID・条件などから hashSeed で作る
  /** 決定的乱数ジェネレータ（0〜1）。変えても見た目は同じだが再現性が崩れる */
  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * 複数の整数から 1 つのシード値を合成する簡易ハッシュ。
   * （暗号用途ではなく、ブロックごとに異なる乱数列を得るため）
   */
  function hashSeed(a, b, c) {
    let h = 17;
    h = (h * 31 + a) | 0;
    h = (h * 31 + b) | 0;
    h = (h * 31 + c) | 0;
    return h;
  }

  /** Fisher–Yates シャッフル（in-place） */
  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  /** 配列から1つランダムに取る */
  function pick(list, rng) {
    return list[Math.floor(rng() * list.length)];
  }

  /** min〜max の一様乱数 */
  function randRange(rng, min, max) {
    return min + rng() * (max - min);
  }

  /** 同じ数字が隣り合っていないか確認 */
  function noImmediateRepeats(digits) {
    for (let i = 1; i < digits.length; i += 1) {
      if (digits[i] === digits[i - 1]) return false;
    }
    return true;
  }

  /**
   * 数字列を作る（各数字を repeats 回）。
   * repeats を変える → 試行数・所要時間・No-Go回数が変わる（文献比較条件にも影響）。
   * できるだけ「同じ数字が連続しない」並びにする（失敗時は近傍スワップで緩和）。
   */
  function buildDigitSequence(repeatsPerDigit, rng) {
    const digits = [];
    CONFIG.digits.forEach((d) => {
      for (let i = 0; i < repeatsPerDigit; i += 1) digits.push(d);
    });

    // まず乱択で制約を満たす並びを探す
    for (let attempt = 0; attempt < 400; attempt += 1) {
      shuffle(digits, rng);
      if (noImmediateRepeats(digits)) return digits.slice();
    }

    // フォールバック: 連続している箇所を後ろの別数字と交換
    for (let i = 1; i < digits.length; i += 1) {
      if (digits[i] !== digits[i - 1]) continue;
      for (let j = i + 1; j < digits.length; j += 1) {
        if (digits[j] !== digits[i] && (j === digits.length - 1 || digits[j] !== digits[j + 1])) {
          [digits[i], digits[j]] = [digits[j], digits[i]];
          break;
        }
      }
    }
    return digits;
  }

  /**
   * Sync用: 妨害を載せる試行番号の集合を rate（≈ CONFIG.shapeDistractRate）で選ぶ。
   * rate を上げると hasTransientDistractor=1 の試行が増え、妨害条件の効果が強く出やすい。
   */
  function chooseDistractorTrials(nTrials, rate, rng) {
    const n = Math.max(0, Math.round(nTrials * rate));
    const indices = Array.from({ length: nTrials }, (_, i) => i);
    shuffle(indices, rng);
    return new Set(indices.slice(0, n));
  }

  /**
   * 妨害1セットを作る → showDistractors() → CSS --x/--y/--size + .shape-* / .illust-*。
   * kind: "shape" | "illust"。形／イラスト名は CONFIG と styles.css と一致させること。
   */
  function buildShapeDistractors(rng, kind = "shape") {
    if (kind === "notify") return buildNotifyDistractors(rng);
    const count = CONFIG.shapeDistractCount;
    const pad = CONFIG.distractorEdgePadPct;
    const span = Math.max(1, 100 - pad * 2);
    const pool =
      kind === "illust" ? CONFIG.distractorIllustrations : CONFIG.distractorShapes;
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const sizeRem =
        Math.round(
          randRange(rng, CONFIG.distractorSizeMinRem, CONFIG.distractorSizeMaxRem) * 10
        ) / 10;
      out.push({
        kind,
        shape: pick(pool, rng),
        xPct: Math.round((pad + rng() * span) * 10) / 10,
        yPct: Math.round((pad + rng() * span) * 10) / 10,
        sizeRem,
      });
    }
    return out;
  }

  /** DOM 用クラス名（.shape-* または .illust-distract.illust-*） */
  function distractorClassName(item, extra = "") {
    const kind = item.kind || "shape";
    if (kind === "notify") {
      return extra ? `notify-toast-inner ${extra}` : "notify-toast-inner";
    }
    const base =
      kind === "illust"
        ? `distractor illust-distract illust-${item.shape}`
        : `distractor shape-${item.shape}`;
    return extra ? `${base} ${extra}` : base;
  }

  /** CSV列 distractor_shapes / positions / sizes 用に「|」区切りへ */
  function formatDistractorMeta(distractors) {
    return {
      shapes: distractors.map((d) => d.shape).join("|"),
      positions: distractors
        .map((d) => (d.kind === "notify" ? d.corner : `${d.xPct},${d.yPct}`))
        .join("|"),
      sizes: distractors.map((d) => (d.kind === "notify" ? "toast" : d.sizeRem)).join("|"),
    };
  }

  /**
   * Steady用: ブロック上に「ゆったり出入り」イベントをばらまく。
   * ・図形は常駐しない。フェードイン／スライドイン → 保持 → フェードアウト
   * ・形・動き・位置・周期はイベントごとにランダム（固定3枠ではない）
   * ・同時表示は steadyMaxConcurrent 以下。変化は常に秒単位で遅い
   */
  function buildSteadySchedule(nTrials, seed, kind = "shape") {
    if (kind === "notify") return buildSteadyNotifySchedule(nTrials, seed);
    const rng = mulberry32(seed);
    const pad = CONFIG.steadyEdgePadPct;
    const peripheralZones = [
      { x0: pad, x1: 32, y0: pad, y1: 35 },
      { x0: 68, x1: 100 - pad, y0: pad, y1: 35 },
      { x0: pad, x1: 32, y0: 65, y1: 100 - pad },
      { x0: 68, x1: 100 - pad, y0: 65, y1: 100 - pad },
      { x0: pad, x1: 28, y0: 35, y1: 65 },
      { x0: 72, x1: 100 - pad, y0: 35, y1: 65 },
    ];
    const blockMs = CONFIG.blockPreambleMs + nTrials * CONFIG.soaMs;
    const usableStart = CONFIG.steadyLeadInMs;
    const usableEnd = Math.max(usableStart, blockMs - CONFIG.steadyTailMs);
    const nTarget = Math.max(2, Math.round(nTrials * CONFIG.steadyEventRate));
    const events = [];

    const periodFor = (motion) => {
      if (motion === "rotate") {
        return randRange(rng, CONFIG.steadyRotatePeriodMinSec, CONFIG.steadyRotatePeriodMaxSec);
      }
      if (motion === "slide") {
        return randRange(rng, CONFIG.steadySlidePeriodMinSec, CONFIG.steadySlidePeriodMaxSec);
      }
      return randRange(rng, CONFIG.steadyFadePeriodMinSec, CONFIG.steadyFadePeriodMaxSec);
    };

    const activeCountAt = (t0, t1, list) =>
      list.filter((ev) => intervalsOverlap(t0, t1, ev.onsetMs, ev.endMs, 0)).length;

    for (let attempt = 0; attempt < 1200 && events.length < nTarget; attempt += 1) {
      const fadeInMs = Math.round(randRange(rng, CONFIG.steadyFadeInMinMs, CONFIG.steadyFadeInMaxMs));
      const holdMs = Math.round(randRange(rng, CONFIG.steadyHoldMinMs, CONFIG.steadyHoldMaxMs));
      const fadeOutMs = Math.round(
        randRange(rng, CONFIG.steadyFadeOutMinMs, CONFIG.steadyFadeOutMaxMs)
      );
      const durationMs = fadeInMs + holdMs + fadeOutMs;
      const span = Math.max(0, usableEnd - usableStart - durationMs);
      if (span <= 0) break;
      const onsetMs = Math.round(usableStart + rng() * span);
      const endMs = onsetMs + durationMs;
      if (activeCountAt(onsetMs, endMs, events) >= CONFIG.steadyMaxConcurrent) continue;

      const motion = pick(CONFIG.steadyMotions, rng);
      const zone = pick(peripheralZones, rng);
      const zone2 = pick(peripheralZones, rng);
      const xPct = Math.round(randRange(rng, zone.x0, zone.x1) * 10) / 10;
      const yPct = Math.round(randRange(rng, zone.y0, zone.y1) * 10) / 10;
      const x2Pct = Math.round(randRange(rng, zone2.x0, zone2.x1) * 10) / 10;
      const y2Pct = Math.round(randRange(rng, zone2.y0, zone2.y1) * 10) / 10;
      // 画面外寄りからゆっくり入る開始位置
      const enterX = Math.round((xPct + (rng() < 0.5 ? -18 : 18) + (rng() - 0.5) * 8) * 10) / 10;
      const enterY = Math.round((yPct + (rng() < 0.5 ? -14 : 14) + (rng() - 0.5) * 8) * 10) / 10;
      const sizeRem =
        Math.round(randRange(rng, CONFIG.steadySizeMinRem, CONFIG.steadySizeMaxRem) * 10) / 10;
      const opacity =
        Math.round(randRange(rng, CONFIG.steadyOpacityMin, CONFIG.steadyOpacityMax) * 100) / 100;
      const durationSec = Math.round(periodFor(motion) * 10) / 10;
      const pool =
        kind === "illust" ? CONFIG.distractorIllustrations : CONFIG.distractorShapes;
      const shape = pick(pool, rng);

      events.push({
        onsetMs,
        endMs,
        fadeInMs,
        holdMs,
        fadeOutMs,
        kind,
        shape,
        xPct,
        yPct,
        x2Pct,
        y2Pct,
        enterX,
        enterY,
        sizeRem,
        motion,
        durationSec,
        opacity,
        shapes: shape,
        positions: `${xPct},${yPct}`,
        sizes: String(sizeRem),
      });
    }

    events.sort((a, b) => a.onsetMs - b.onsetMs);
    return events;
  }

  /** Steady 用: 角の通知トースト（回転なし・slide/fade のみ） */
  function buildSteadyNotifySchedule(nTrials, seed) {
    const rng = mulberry32(seed);
    const blockMs = CONFIG.blockPreambleMs + nTrials * CONFIG.soaMs;
    const usableStart = CONFIG.steadyLeadInMs;
    const usableEnd = Math.max(usableStart, blockMs - CONFIG.steadyTailMs);
    const nTarget = Math.max(1, Math.round(nTrials * CONFIG.steadyEventRate * 0.85));
    const events = [];
    const motions = ["slide", "fade"];

    const activeCountAt = (t0, t1, list) =>
      list.filter((ev) => intervalsOverlap(t0, t1, ev.onsetMs, ev.endMs, 0)).length;

    for (let attempt = 0; attempt < 800 && events.length < nTarget; attempt += 1) {
      const fadeInMs = Math.round(randRange(rng, CONFIG.steadyFadeInMinMs, CONFIG.steadyFadeInMaxMs));
      const holdMs = Math.round(randRange(rng, CONFIG.steadyHoldMinMs, CONFIG.steadyHoldMaxMs));
      const fadeOutMs = Math.round(
        randRange(rng, CONFIG.steadyFadeOutMinMs, CONFIG.steadyFadeOutMaxMs)
      );
      const durationMs = fadeInMs + holdMs + fadeOutMs;
      const span = Math.max(0, usableEnd - usableStart - durationMs);
      if (span <= 0) break;
      const onsetMs = Math.round(usableStart + rng() * span);
      const endMs = onsetMs + durationMs;
      if (activeCountAt(onsetMs, endMs, events) >= 2) continue;

      const typeId = pick(CONFIG.distractorNotifyTypes, rng);
      const copy = notifyCopyFor(typeId, rng);
      const corner = pickNotifyCorner(rng);
      const motion = pick(motions, rng);
      const durationSec = Math.round(randRange(rng, 35, 70) * 10) / 10;
      const opacity =
        Math.round(randRange(rng, 0.75, 0.95) * 100) / 100;

      events.push({
        onsetMs,
        endMs,
        fadeInMs,
        holdMs,
        fadeOutMs,
        kind: "notify",
        shape: typeId,
        corner,
        title: copy.title,
        preview: copy.preview,
        icon: copy.icon,
        motion,
        durationSec,
        opacity,
        shapes: typeId,
        positions: corner,
        sizes: "toast",
      });
    }

    events.sort((a, b) => a.onsetMs - b.onsetMs);
    return events;
  }

  /** Steady 1体を DOM に追加。位置は最初から最終位置。動きは内側 .steady-mover に分離 */
  function mountSteadyItem(ev) {
    if (ev.kind === "notify") {
      const wrap = document.createElement("div");
      wrap.className = `steady-item steady-notify notify-corner-${ev.corner}`;
      wrap.style.setProperty("--opacity", String(ev.opacity));
      wrap.style.setProperty("--fade-in", `${ev.fadeInMs}ms`);
      wrap.style.setProperty("--fade-out", `${ev.fadeOutMs}ms`);
      wrap.style.setProperty("--dur", `${ev.durationSec}s`);
      const mover = document.createElement("div");
      mover.className = `steady-mover motion-${ev.motion}`;
      mover.appendChild(createNotifyToastElement(ev, "", { embed: true }));
      wrap.appendChild(mover);
      el.distractors.appendChild(wrap);
      return wrap;
    }

    const wrap = document.createElement("div");
    wrap.className = "steady-item";
    wrap.style.setProperty("--x", `${ev.xPct}%`);
    wrap.style.setProperty("--y", `${ev.yPct}%`);
    wrap.style.setProperty("--size", `${ev.sizeRem}rem`);
    wrap.style.setProperty("--dur", `${ev.durationSec}s`);
    wrap.style.setProperty("--opacity", String(ev.opacity));
    wrap.style.setProperty("--fade-in", `${ev.fadeInMs}ms`);
    wrap.style.setProperty("--fade-out", `${ev.fadeOutMs}ms`);
    // 入場のずれ（vmin）。left/top は動かさないので animation と衝突しない
    wrap.style.setProperty("--enter-dx", `${(ev.enterX - ev.xPct) * 0.55}vmin`);
    wrap.style.setProperty("--enter-dy", `${(ev.enterY - ev.yPct) * 0.55}vmin`);
    // スライド振幅（保持中）。こちらも transform のみ
    wrap.style.setProperty("--slide-x", `${(ev.x2Pct - ev.xPct) * 0.45}vmin`);
    wrap.style.setProperty("--slide-y", `${(ev.y2Pct - ev.yPct) * 0.45}vmin`);

    const mover = document.createElement("div");
    mover.className = `steady-mover motion-${ev.motion}`;

    const node = document.createElement("div");
    node.className = distractorClassName(ev, "distractor-steady-inner");
    mover.appendChild(node);
    wrap.appendChild(mover);
    el.distractors.appendChild(wrap);
    return wrap;
  }

  /**
   * Steady 1イベント: ゆっくり入る → 保持 → ゆっくり消える。
   * 退場時に animation を切らない（途切れの主因だった）。透明度だけ落とす。
   */
  async function playOneSteadyEvent(ev, blockStartAbs) {
    await waitUntil(blockStartAbs + ev.onsetMs);
    if (!state.blockActive) return;

    const wrap = mountSteadyItem(ev);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!state.blockActive) {
      wrap.remove();
      return;
    }
    wrap.classList.add("is-visible");

    await waitUntil(blockStartAbs + ev.onsetMs + ev.fadeInMs + ev.holdMs);
    if (!state.blockActive) {
      wrap.remove();
      return;
    }
    // is-visible は残し、is-leaving で opacity だけ 0 へ（動きは継続）
    wrap.classList.add("is-leaving");

    await waitUntil(blockStartAbs + ev.endMs);
    wrap.remove();
  }

  /**
   * Steady イベント列を試行ループと並行再生（Async と同型だが遷移は常に遅い）。
   * activeSteadyWindows に絶対時刻を残し、試行ログで重なり判定する。
   */
  async function playSteadyDistractors(events, blockStartAbs) {
    state.activeSteadyWindows = events.map((ev) => ({
      startAbs: blockStartAbs + ev.onsetMs,
      endAbs: blockStartAbs + ev.endMs,
      shapes: ev.shapes,
      positions: ev.positions,
      sizes: ev.sizes || "",
    }));
    await Promise.all(events.map((ev) => playOneSteadyEvent(ev, blockStartAbs)));
  }

  /** 2つの時間区間が gap 未満で近すぎる／重なるか */
  function intervalsOverlap(a0, a1, b0, b1, gap) {
    return !(a1 + gap <= b0 || b1 + gap <= a0);
  }

  /**
   * Async用: ブロック全体のタイムライン上に図形イベントをばらまく。
   * 数字の onset とは独立（runBlock が playAsyncDistractors と試行ループを並行実行）。
   * 変えると影響するもの:
   *   shapeDistractRate / asyncDuration* / asyncGap* / asyncLeadIn|Tail
   *   → 出現回数・長さ・密度 → CSV の has_transient_distractor / overlap_ms
   */
  function buildAsyncDistractorEvents(nTrials, seed, kind = "shape") {
    const rng = mulberry32(seed);
    const blockMs = CONFIG.blockPreambleMs + nTrials * CONFIG.soaMs;
    const usableStart = CONFIG.asyncLeadInMs;
    const usableEnd = Math.max(usableStart, blockMs - CONFIG.asyncTailMs);
    const n = Math.max(0, Math.round(nTrials * CONFIG.shapeDistractRate));
    const events = [];

    for (let attempt = 0; attempt < 800 && events.length < n; attempt += 1) {
      const durationMs = Math.round(
        randRange(rng, CONFIG.asyncDurationMinMs, CONFIG.asyncDurationMaxMs)
      );
      const span = Math.max(0, usableEnd - usableStart - durationMs);
      if (span <= 0) break;
      const onsetMs = Math.round(usableStart + rng() * span);
      const endMs = onsetMs + durationMs;
      const clash = events.some((ev) =>
        intervalsOverlap(onsetMs, endMs, ev.onsetMs, ev.onsetMs + ev.durationMs, CONFIG.asyncGapMinMs)
      );
      if (clash) continue;
      const distractors = buildShapeDistractors(rng, kind);
      const meta = formatDistractorMeta(distractors);
      events.push({
        onsetMs,
        durationMs,
        distractors,
        shapes: meta.shapes,
        positions: meta.positions,
        sizes: meta.sizes,
      });
    }

    events.sort((a, b) => a.onsetMs - b.onsetMs);
    return events;
  }

  /**
   * Async 音声イベント列。素材が無くても id / 予定長でログ可能。
   * CSV: distractor_shapes=clipId, positions="audio", sizes=volume
   */
  function buildAsyncAudioEvents(nTrials, seed) {
    const rng = mulberry32(seed);
    const blockMs = CONFIG.blockPreambleMs + nTrials * CONFIG.soaMs;
    const usableStart = CONFIG.asyncAudioLeadInMs;
    const usableEnd = Math.max(usableStart, blockMs - CONFIG.asyncAudioTailMs);
    const n = Math.max(0, Math.round(nTrials * CONFIG.audioDistractRate));
    const events = [];
    const pool = AudioBank.clipsForRole("transient");
    if (!pool.length) return events;

    for (let attempt = 0; attempt < 800 && events.length < n; attempt += 1) {
      const clip = pick(pool, rng);
      const entry = AudioBank.byId[clip.id];
      const durationMs = entry && entry.durationMs ? entry.durationMs : clip.durationMs;
      const span = Math.max(0, usableEnd - usableStart - durationMs);
      if (span <= 0) break;
      const onsetMs = Math.round(usableStart + rng() * span);
      const endMs = onsetMs + durationMs;
      const clash = events.some((ev) =>
        intervalsOverlap(
          onsetMs,
          endMs,
          ev.onsetMs,
          ev.onsetMs + ev.durationMs,
          CONFIG.asyncAudioGapMinMs
        )
      );
      if (clash) continue;
      const volume =
        Math.round(randRange(rng, CONFIG.audioVolumeMin, CONFIG.audioVolumeMax) * 100) / 100;
      events.push({
        onsetMs,
        durationMs,
        clipId: clip.id,
        volume,
        shapes: clip.id,
        positions: "audio",
        sizes: String(volume),
      });
    }

    events.sort((a, b) => a.onsetMs - b.onsetMs);
    return events;
  }

  /** Steady 環境音の出入りスケジュール（同時は steadyAudioMaxConcurrent 以下） */
  function buildSteadyAudioSchedule(nTrials, seed) {
    const rng = mulberry32(seed);
    const blockMs = CONFIG.blockPreambleMs + nTrials * CONFIG.soaMs;
    const usableStart = CONFIG.steadyAudioLeadInMs;
    const usableEnd = Math.max(usableStart, blockMs - CONFIG.steadyAudioTailMs);
    const nTarget = Math.max(1, Math.round(nTrials * CONFIG.steadyAudioEventRate));
    const events = [];
    const pool = AudioBank.clipsForRole("ambient");
    if (!pool.length) return events;

    const activeCountAt = (t0, t1, list) =>
      list.filter((ev) => intervalsOverlap(t0, t1, ev.onsetMs, ev.endMs, 0)).length;

    for (let attempt = 0; attempt < 800 && events.length < nTarget; attempt += 1) {
      const fadeInMs = Math.round(
        randRange(rng, CONFIG.steadyAudioFadeInMinMs, CONFIG.steadyAudioFadeInMaxMs)
      );
      const holdMs = Math.round(
        randRange(rng, CONFIG.steadyAudioHoldMinMs, CONFIG.steadyAudioHoldMaxMs)
      );
      const fadeOutMs = Math.round(
        randRange(rng, CONFIG.steadyAudioFadeOutMinMs, CONFIG.steadyAudioFadeOutMaxMs)
      );
      const durationMs = fadeInMs + holdMs + fadeOutMs;
      const span = Math.max(0, usableEnd - usableStart - durationMs);
      if (span <= 0) break;
      const onsetMs = Math.round(usableStart + rng() * span);
      const endMs = onsetMs + durationMs;
      if (activeCountAt(onsetMs, endMs, events) >= CONFIG.steadyAudioMaxConcurrent) continue;
      const clip = pick(pool, rng);
      const volume =
        Math.round(randRange(rng, CONFIG.audioVolumeMin, CONFIG.audioVolumeMax) * 100) / 100;
      events.push({
        onsetMs,
        endMs,
        fadeInMs,
        holdMs,
        fadeOutMs,
        clipId: clip.id,
        volume,
        shapes: clip.id,
        positions: "audio",
        sizes: String(volume),
      });
    }

    events.sort((a, b) => a.onsetMs - b.onsetMs);
    return events;
  }

  /** Async 音声をブロックと並行再生 */
  async function playAsyncAudioEvents(events, blockStartAbs) {
    state.activeAudioWindows = events.map((ev) => ({
      startAbs: blockStartAbs + ev.onsetMs,
      endAbs: blockStartAbs + ev.onsetMs + ev.durationMs,
      shapes: ev.shapes,
      positions: ev.positions,
      sizes: ev.sizes || "",
    }));

    for (const ev of events) {
      if (!state.blockActive) return;
      await waitUntil(blockStartAbs + ev.onsetMs);
      if (!state.blockActive) return;
      AudioBank.play(ev.clipId, ev.volume);
      await waitUntil(blockStartAbs + ev.onsetMs + ev.durationMs);
    }
  }

  /** Steady 環境音を並行再生（フェード付き） */
  async function playSteadyAudioEvents(events, blockStartAbs) {
    state.activeAudioWindows = events.map((ev) => ({
      startAbs: blockStartAbs + ev.onsetMs,
      endAbs: blockStartAbs + ev.endMs,
      shapes: ev.shapes,
      positions: ev.positions,
      sizes: ev.sizes || "",
    }));
    await Promise.all(
      events.map((ev) =>
        AudioBank.playWithFade(
          ev.clipId,
          ev.volume,
          ev.fadeInMs,
          ev.holdMs,
          ev.fadeOutMs,
          blockStartAbs,
          ev.onsetMs
        )
      )
    );
  }

  /** 試行区間と音声窓の重なり（Async / Steady 共通） */
  function describeAudioOverlap(trialStartAbs, trialEndAbs) {
    const hits = (state.activeAudioWindows || []).filter((w) =>
      intervalsOverlap(trialStartAbs, trialEndAbs, w.startAbs, w.endAbs, 0)
    );
    if (!hits.length) {
      return { has: 0, shapes: "", positions: "", sizes: "", overlap: 0 };
    }
    let overlap = 0;
    for (const w of hits) {
      const a0 = Math.max(trialStartAbs, w.startAbs);
      const a1 = Math.min(trialEndAbs, w.endAbs);
      overlap += Math.max(0, a1 - a0);
    }
    return {
      has: 1,
      shapes: hits.map((w) => w.shapes).join(";"),
      positions: hits.map((w) => w.positions).join(";"),
      sizes: hits.map((w) => w.sizes || "").join(";"),
      overlap: Math.round(overlap),
    };
  }

  /**
   * 1ブロック分の試行列を組み立てる（prepareSession → practiceTrials / expTrials）。
   * Sync+視覚/音声 のとき hasTransientDistractor を試行に付ける。
   * Steady / Async のスケジュールは別関数。混ぜると二重に出るので注意。
   */
  function buildBlock(repeatsPerDigit, seed, conditionKey, timingMode) {
    const rng = mulberry32(seed);
    const digits = buildDigitSequence(repeatsPerDigit, rng);
    const meta = CONDITION_META[conditionKey] || CONDITION_META.Baseline;
    const kind = distractorKindFor(conditionKey);
    const useSyncVisual = isVisualDistractCondition(conditionKey) && timingMode === "Sync";
    const useSyncAudio = isAudioDistractCondition(conditionKey) && timingMode === "Sync";
    const useSteady =
      (isVisualDistractCondition(conditionKey) || isAudioDistractCondition(conditionKey)) &&
      timingMode === "Steady";
    const rate = useSyncAudio ? CONFIG.audioDistractRate : CONFIG.shapeDistractRate;
    const distractorTrials =
      useSyncVisual || useSyncAudio
        ? chooseDistractorTrials(digits.length, rate, rng)
        : new Set();
    const temporal = useSteady ? "Steady" : meta.temporal;

    return digits.map((digit, trialIndex) => {
      const stimulusType = digit === CONFIG.noGoDigit ? "NoGo" : "Go";
      // 5 段階のフォントサイズからランダム（大きさは無視するよう教示）
      const fontSize = CONFIG.fontSizes[Math.floor(rng() * CONFIG.fontSizes.length)];
      const hasDistractor = distractorTrials.has(trialIndex);
      let distractors = [];
      let dMeta = { shapes: "", positions: "", sizes: "" };
      let audioClip = null;

      if (hasDistractor && useSyncVisual) {
        distractors = buildShapeDistractors(rng, kind);
        dMeta = formatDistractorMeta(distractors);
      } else if (hasDistractor && useSyncAudio) {
        const clip = AudioBank.pickClip("transient", rng);
        if (clip) {
          const volume =
            Math.round(randRange(rng, CONFIG.audioVolumeMin, CONFIG.audioVolumeMax) * 100) / 100;
          audioClip = { id: clip.id, volume };
          dMeta = {
            shapes: clip.id,
            positions: "audio",
            sizes: String(volume),
          };
        }
      }

      return {
        trialIndex,
        condition: meta.condition,
        modality: meta.modality,
        meaningfulness: meta.meaningfulness,
        temporal,
        digit,
        fontSize,
        stimulusType,
        soaSec: CONFIG.soaMs / 1000,
        hasTransientDistractor: hasDistractor ? 1 : 0,
        hasSteadyVisual: 0, // Steady は describeSteadyOverlap / describeAudioOverlap で埋める
        distractorShapes: dMeta.shapes,
        distractorPositions: dMeta.positions,
        distractorSizes: dMeta.sizes,
        distractors,
        audioClip,
      };
    });
  }

  // --- タイミング・表示（DOM ↔ styles.css） ---
  /** performance.now() が targetMs になるまで待つ。blockActive=false で即 resolve（中断） */
  function waitUntil(targetMs) {
    return new Promise((resolve) => {
      const tick = () => {
        if (!state.blockActive || performance.now() >= targetMs) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /** #distractor-layer を空にする */
  function clearDistractors() {
    el.distractors.innerHTML = "";
  }

  /**
   * 妨害を DOM に載せる。CSS: .distractor + .shape-* / .illust-* + 変数 --x/--y/--size。
   * styles.css に無い名前を渡すと見え方不定。
   */
  function showDistractors(distractors) {
    clearDistractors();
    for (const item of distractors) {
      if (item.kind === "notify") {
        el.distractors.appendChild(createNotifyToastElement(item, "notify-pop-in"));
        continue;
      }
      const node = document.createElement("div");
      node.className = distractorClassName(item);
      node.style.setProperty("--x", `${item.xPct}%`);
      node.style.setProperty("--y", `${item.yPct}%`);
      node.style.setProperty("--size", `${item.sizeRem}rem`);
      el.distractors.appendChild(node);
    }
  }

  /** 練習用の正誤フィードバックを隠す */
  function hideFeedback() {
    if (!el.feedback) return;
    el.feedback.classList.add("hidden");
    el.feedback.classList.remove("is-correct", "is-error");
    el.feedback.textContent = "";
  }

  /** 数字とマスクを隠す */
  function hideDigitParts() {
    el.stim.classList.add("hidden");
    el.mask.classList.add("hidden");
    hideFeedback();
  }

  /** 数字・マスク・図形を全部消す */
  function hideTaskParts() {
    hideDigitParts();
    clearDistractors();
  }

  /**
   * 練習ブロック専用: 試行結果を画面中央に短く出す。
   * CorrectGo / CorrectNoGo → 「正解」、それ以外（押し忘れ・押し間違い）→ 「ミス」
   */
  async function showPracticeFeedback(outcome) {
    if (!el.feedback) return;
    const ok =
      outcome === Outcome.CorrectGo || outcome === Outcome.CorrectNoGo;
    el.feedback.textContent = ok ? "正解" : "ミス";
    el.feedback.classList.remove("is-correct", "is-error", "hidden");
    el.feedback.classList.add(ok ? "is-correct" : "is-error");
    await waitUntil(performance.now() + CONFIG.practiceFeedbackMs);
    hideFeedback();
  }

  // --- 反応取得（window の keydown / pointerdown。画面は HTML 全体） ---
  /** この試行の反応待ちを開始。runTrial の数字 onset 直前に呼ぶ */
  function armResponse() {
    state.listening = true;
    state.response = null;
  }

  /**
   * 反応を1回だけ記録する。listening 中かつ未反応のときのみ有効。
   * タイムスタンプは performance.now()（高分解能）。
   */
  function captureResponse() {
    if (!state.listening || state.response) return;
    state.response = { t: performance.now() };
    state.listening = false;
  }

  /** Space / Enter。キーを増やすならここ。preventDefault でスペースのスクロール防止 */
  function onKey(e) {
    if (e.code !== "Space" && e.code !== "Enter") return;
    e.preventDefault();
    captureResponse();
  }

  /**
   * クリック／タップで反応。
   * ボタン・入力欄上の操作は「UI操作」なので反応として扱わない。
   */
  function onPointer(e) {
    if (e.target.closest("button, input, label, select")) return;
    captureResponse();
  }

  /**
   * Go/No-Go × 反応有無から outcome を決める。
   *   Go + 押した   → CorrectGo
   *   Go + 押さない → Omission
   *   NoGo + 押した → Commission（主要指標）
   *   NoGo + 押さない → CorrectNoGo
   */
  function classify(trial, responded) {
    if (trial.stimulusType === "Go") {
      return responded ? Outcome.CorrectGo : Outcome.Omission;
    }
    return responded ? Outcome.Commission : Outcome.CorrectNoGo;
  }

  /** 2区間の重なり時間（ms）。重ならなければ 0 */
  function overlapMs(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  }

  /**
   * Async: この試行の時間帯に図形が出ていたか。
   * CSV の has_transient_distractor / distractor_* / distractor_overlap_ms 用。
   * activeAsyncWindows は playAsyncDistractors 開始時に絶対時刻で埋まる。
   */
  function describeAsyncOverlap(trialOnsetAbs, trialEndAbs) {
    const hits = state.activeAsyncWindows.filter(
      (w) => overlapMs(trialOnsetAbs, trialEndAbs, w.startAbs, w.endAbs) > 0
    );
    if (!hits.length) {
      return { has: 0, shapes: "", positions: "", sizes: "", overlap: 0 };
    }
    const overlap = hits.reduce(
      (sum, w) => sum + overlapMs(trialOnsetAbs, trialEndAbs, w.startAbs, w.endAbs),
      0
    );
    return {
      has: 1,
      shapes: hits.map((w) => w.shapes).join(";"),
      positions: hits.map((w) => w.positions).join(";"),
      sizes: hits.map((w) => w.sizes || "").join(";"),
      overlap: Math.round(overlap),
    };
  }

  /**
   * Steady: この試行の時間帯にゆったり図形が見えていたか。
   * CSV の has_steady_visual / distractor_* / distractor_overlap_ms 用。
   */
  function describeSteadyOverlap(trialOnsetAbs, trialEndAbs) {
    const hits = state.activeSteadyWindows.filter(
      (w) => overlapMs(trialOnsetAbs, trialEndAbs, w.startAbs, w.endAbs) > 0
    );
    if (!hits.length) {
      return { has: 0, shapes: "", positions: "", sizes: "", overlap: 0 };
    }
    const overlap = hits.reduce(
      (sum, w) => sum + overlapMs(trialOnsetAbs, trialEndAbs, w.startAbs, w.endAbs),
      0
    );
    return {
      has: 1,
      shapes: hits.map((w) => w.shapes).join(";"),
      positions: hits.map((w) => w.positions).join(";"),
      sizes: hits.map((w) => w.sizes || "").join(";"),
      overlap: Math.round(overlap),
    };
  }

  /**
   * 条件に応じて #instruct-list の文言を差し替え（index.html の初期リストを上書き）。
   * ShapeDistract / IllustDistract のとき妨害無視の一文を挿入（Async / Sync / Steady で文言が違う）。
   */
  function updateInstruct() {
    const base = [
      "画面中央に数字が次々と出ます。大きさは変わります。大きさは無視してください。",
      "数字のあとに、十字の入った円が出ます。円は無視してください。",
      "<strong>3 以外</strong>の数字が出たら、できるだけ早く押してください。",
      "<strong>3</strong> が出たら、押さないでください。",
      "速さも大切ですが、間違いもできるだけ減らしてください。",
      "練習では、各試行のあと画面に<strong>正解</strong>または<strong>ミス</strong>が表示されます。本試行では出ません。",
    ];
    if (state.conditionKey === "ShapeDistract") {
      let timingNote;
      if (state.timingMode === "Async") {
        timingNote =
          "画面のあちこちに四角・三角などの図形が、数字とは独立したタイミング・大きさ・長さで出ることがあります。<strong>図形は無視</strong>し、中央の数字だけに反応してください。";
      } else if (state.timingMode === "Steady") {
        timingNote =
          "画面には大きな図形が、ゆっくり現れたり消えたり、回転・移動・濃さの変化をすることがあります。急に点滅するものではありません。<strong>図形は無視</strong>し、中央の数字だけに反応してください。";
      } else {
        timingNote =
          "画面のあちこちに四角・三角などの図形が、数字と同時に出ることがあります。<strong>図形は無視</strong>し、中央の数字だけに反応してください。";
      }
      base.splice(2, 0, timingNote);
    } else if (state.conditionKey === "IllustDistract") {
      let timingNote;
      if (state.timingMode === "Async") {
        timingNote =
          "画面のあちこちにスマートフォン・爆発・魔導書・貝などのイラストが、数字とは独立したタイミング・大きさ・長さで出ることがあります。<strong>イラストは無視</strong>し、中央の数字だけに反応してください。";
      } else if (state.timingMode === "Steady") {
        timingNote =
          "画面には大きなイラストが、ゆっくり現れたり消えたり、回転・移動・濃さの変化をすることがあります。急に点滅するものではありません。<strong>イラストは無視</strong>し、中央の数字だけに反応してください。";
      } else {
        timingNote =
          "画面のあちこちにスマートフォン・爆発・魔導書・貝などのイラストが、数字と同時に出ることがあります。<strong>イラストは無視</strong>し、中央の数字だけに反応してください。";
      }
      base.splice(2, 0, timingNote);
    } else if (state.conditionKey === "NotifyDistract") {
      let timingNote;
      if (state.timingMode === "Async") {
        timingNote =
          "画面の角（主に右下）に、メール・いいね・メッセージ・予定・ニュース風の<strong>日本語の通知</strong>が、数字とは独立したタイミングで出ることがあります。音は鳴りません。<strong>通知は無視</strong>し、中央の数字だけに反応してください。";
      } else if (state.timingMode === "Steady") {
        timingNote =
          "画面の角に通知風の表示が、ゆっくり現れたり消えたりすることがあります。音は鳴りません。<strong>通知は無視</strong>し、中央の数字だけに反応してください。";
      } else {
        timingNote =
          "一部の試行で、数字と同時に画面の角へ通知風の表示（日本語）が出ます。音は鳴りません。<strong>通知は無視</strong>し、中央の数字だけに反応してください。";
      }
      base.splice(2, 0, timingNote);
    } else if (state.conditionKey === "AudioDistract") {
      let timingNote;
      if (state.timingMode === "Async") {
        timingNote =
          "課題中に、数字とは独立したタイミングで短い音（通知・メール風など）が鳴ることがあります。<strong>音は無視</strong>し、中央の数字だけに反応してください。";
      } else if (state.timingMode === "Steady") {
        timingNote =
          "課題中に、環境音がゆっくり大きくなったり小さくなったりすることがあります。<strong>音は無視</strong>し、中央の数字だけに反応してください。";
      } else {
        timingNote =
          "一部の試行では、数字と同時に短い音が鳴ることがあります。<strong>音は無視</strong>し、中央の数字だけに反応してください。";
      }
      base.splice(2, 0, timingNote);
    }
    el.instructList.innerHTML = base.map((t) => `<li>${t}</li>`).join("");
  }

  /**
   * Async 図形をブロックと並行再生（runBlock から起動）。
   * activeAsyncWindows に絶対時刻を残し、各試行ログで describeAsyncOverlap する。
   * 表示そのものは showDistractors → styles.css。
   */
  async function playAsyncDistractors(events, blockStartAbs) {
    state.activeAsyncWindows = events.map((ev) => ({
      startAbs: blockStartAbs + ev.onsetMs,
      endAbs: blockStartAbs + ev.onsetMs + ev.durationMs,
      shapes: ev.shapes,
      positions: ev.positions,
      sizes: ev.sizes || "",
    }));

    for (const ev of events) {
      if (!state.blockActive) return;
      await waitUntil(blockStartAbs + ev.onsetMs);
      if (!state.blockActive) return;
      showDistractors(ev.distractors);
      await waitUntil(blockStartAbs + ev.onsetMs + ev.durationMs);
      if (!state.blockActive) return;
      clearDistractors();
    }
  }

  /**
   * 1試行: 数字250ms → マスク900ms（CONFIG）。そのあいだ反応を受け付ける。
   * ・見た目: #stimulus / #mask /（Sync時）#distractor-layer ← styles.css
   * ・Async / Steady の図形はブロック側が並行再生（試行ごとに消さない）
   * ・結果: state.logs に1行追加 → 終了時 CSV・summarize の元
   */
  async function runTrial(trial, blockIndex) {
    hideDigitParts();
    // Async / Steady はブロック側で図形を管理。Sync だけ試行ごとに付け外し
    if (state.timingMode === "Sync" || state.timingMode === "None") {
      clearDistractors();
    }

    el.stim.textContent = String(trial.digit);
    // size-N クラスでフォントサイズを切替（styles.css の .digit.size-*）
    el.stim.className = `digit size-${trial.fontSize} hidden`;

    const onset = performance.now(); // 刺激オンセット時刻（RT の基準）
    armResponse();

    const syncVisual =
      isVisualDistractCondition(state.conditionKey) &&
      state.timingMode === "Sync" &&
      trial.hasTransientDistractor;
    const syncAudio =
      isAudioDistractCondition(state.conditionKey) &&
      state.timingMode === "Sync" &&
      trial.hasTransientDistractor &&
      trial.audioClip;
    if (syncVisual) showDistractors(trial.distractors);
    if (syncAudio) AudioBank.play(trial.audioClip.id, trial.audioClip.volume);
    el.stim.classList.remove("hidden");

    // 数字提示終了 → マスク提示
    await waitUntil(onset + CONFIG.stimulusDurationMs);
    el.stim.classList.add("hidden");
    if (state.timingMode === "Sync") clearDistractors();
    el.mask.classList.remove("hidden");

    // SOA 終了まで反応受付（マスク中も押せる）
    await waitUntil(onset + CONFIG.soaMs);
    state.listening = false;
    el.mask.classList.add("hidden");

    const responded = Boolean(state.response);
    // RT = 反応時刻 − 刺激オンセット（秒）。無反応は null
    const rtSec = responded ? (state.response.t - onset) / 1000 : null;
    const outcome = classify(trial, responded);
    // 100 ms 未満は予測的すぎる反応としてフラグ（分析で除外しやすくする）
    const anticipatory = responded && rtSec < CONFIG.anticipatoryRtSec ? 1 : 0;

    // 練習（blockIndex===0）のみ、試行後に正解／ミスを短く表示。本試行では出さない
    if (blockIndex === 0 && state.blockActive) {
      await showPracticeFeedback(outcome);
    }

    let hasTransient = trial.hasTransientDistractor;
    let shapes = trial.distractorShapes;
    let positions = trial.distractorPositions;
    let sizes = trial.distractorSizes || "";
    let overlap = syncVisual || syncAudio ? CONFIG.stimulusDurationMs : 0;
    let hasSteady = trial.hasSteadyVisual;

    if (isVisualDistractCondition(state.conditionKey) && state.timingMode === "Async") {
      const asyncHit = describeAsyncOverlap(onset, onset + CONFIG.soaMs);
      hasTransient = asyncHit.has;
      shapes = asyncHit.shapes;
      positions = asyncHit.positions;
      sizes = asyncHit.sizes;
      overlap = asyncHit.overlap;
    }

    if (isVisualDistractCondition(state.conditionKey) && state.timingMode === "Steady") {
      const steadyHit = describeSteadyOverlap(onset, onset + CONFIG.soaMs);
      hasSteady = steadyHit.has;
      hasTransient = 0;
      shapes = steadyHit.shapes;
      positions = steadyHit.positions;
      sizes = steadyHit.sizes;
      overlap = steadyHit.overlap;
    }

    if (isAudioDistractCondition(state.conditionKey) && state.timingMode === "Async") {
      const audioHit = describeAudioOverlap(onset, onset + CONFIG.soaMs);
      hasTransient = audioHit.has;
      shapes = audioHit.shapes;
      positions = audioHit.positions;
      sizes = audioHit.sizes;
      overlap = audioHit.overlap;
    }

    if (isAudioDistractCondition(state.conditionKey) && state.timingMode === "Steady") {
      const audioHit = describeAudioOverlap(onset, onset + CONFIG.soaMs);
      hasSteady = audioHit.has;
      hasTransient = 0;
      shapes = audioHit.shapes;
      positions = audioHit.positions;
      sizes = audioHit.sizes;
      overlap = audioHit.overlap;
    }

    // 1 行 = 1 試行。列名は VR 版 CSV と揃えやすいスネークケース
    state.logs.push({
      participant_id: state.participantId,
      session_id: state.sessionId,
      paradigm: CONFIG.paradigm,
      block_index: blockIndex, // 0=practice, 1=experiment
      trial_index: trial.trialIndex,
      condition: trial.condition,
      modality: trial.modality,
      meaningfulness: trial.meaningfulness,
      temporal: trial.temporal,
      distractor_timing_mode: usesDistractTiming(state.conditionKey)
        ? state.timingMode
        : "None",
      digit: trial.digit,
      font_size: trial.fontSize,
      stimulus_type: trial.stimulusType,
      soa_sec: trial.soaSec,
      has_transient_distractor: hasTransient,
      has_steady_visual: hasSteady,
      distractor_shapes: shapes,
      distractor_positions: positions,
      distractor_sizes: sizes,
      distractor_overlap_ms: overlap,
      stim_onset_ms: onset - state.sessionStart,
      response_ms: responded ? state.response.t - state.sessionStart : "",
      rt_sec: responded ? rtSec : "",
      responded: responded ? 1 : 0,
      anticipatory,
      outcome,
    });
  }

  /**
   * 1ブロック実行。show("task") で課題画面へ。
   * Async → playAsyncDistractors を並行起動
   * Steady → playSteadyDistractors（ゆったり出入り）を並行起動
   * blockIndex: 0=練習 / 1=本試行（renderStats は block_index===1 だけ集計）
   */
  async function runBlock(trials, blockIndex, asyncEvents, steadyEvents, audioEvents) {
    show("task");
    hideTaskParts();
    state.blockActive = true;
    state.activeAsyncWindows = [];
    state.activeSteadyWindows = [];
    state.activeAudioWindows = [];
    AudioBank.stopAll();

    const blockStartAbs = performance.now();

    const asyncPromise =
      isVisualDistractCondition(state.conditionKey) &&
      state.timingMode === "Async" &&
      asyncEvents.length
        ? playAsyncDistractors(asyncEvents, blockStartAbs)
        : Promise.resolve();

    const steadyPromise =
      isVisualDistractCondition(state.conditionKey) &&
      state.timingMode === "Steady" &&
      steadyEvents &&
      steadyEvents.length
        ? playSteadyDistractors(steadyEvents, blockStartAbs)
        : Promise.resolve();

    const audioPromise =
      isAudioDistractCondition(state.conditionKey) &&
      audioEvents &&
      audioEvents.length
        ? state.timingMode === "Async"
          ? playAsyncAudioEvents(audioEvents, blockStartAbs)
          : state.timingMode === "Steady"
            ? playSteadyAudioEvents(audioEvents, blockStartAbs)
            : Promise.resolve()
        : Promise.resolve();

    await waitUntil(blockStartAbs + CONFIG.blockPreambleMs);
    for (const trial of trials) {
      if (!state.blockActive) break;
      await runTrial(trial, blockIndex);
    }

    state.blockActive = false;
    await Promise.all([asyncPromise, steadyPromise, audioPromise]);
    clearDistractors();
    AudioBank.stopAll();
    state.activeSteadyWindows = [];
    state.activeAudioWindows = [];
  }

  // --- 集計・表示（終了画面 #stats / 比較ボックス） ---

  /**
   * 本試行ログから主要指標を計算する。
   * - omissionRate: Go 試行のうち押し忘れの割合
   * - commissionRate: No-Go 試行のうち押し間違いの割合（SART の主指標）
   * - rtMean / rtSd / rtCv: 正答 Go の反応時間の平均・SD・変動係数
   */
  function summarize(rows) {
    const go = rows.filter((r) => r.stimulus_type === "Go");
    const nogo = rows.filter((r) => r.stimulus_type === "NoGo");
    const correctGoRt = rows
      .filter((r) => r.outcome === Outcome.CorrectGo)
      .map((r) => Number(r.rt_sec));
    const mean = correctGoRt.length
      ? correctGoRt.reduce((a, b) => a + b, 0) / correctGoRt.length
      : NaN;
    // 標本標準偏差（n−1）
    const sd =
      correctGoRt.length > 1
        ? Math.sqrt(
            correctGoRt.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
              (correctGoRt.length - 1)
          )
        : NaN;
    const omit = go.filter((r) => r.outcome === Outcome.Omission).length;
    const comm = nogo.filter((r) => r.outcome === Outcome.Commission).length;
    const withDistract = rows.filter((r) => Number(r.has_transient_distractor) === 1).length;
    const withSteady = rows.filter((r) => Number(r.has_steady_visual) === 1).length;
    return {
      n: rows.length,
      nogo: nogo.length,
      withDistract,
      withSteady,
      commissionCount: comm,
      omissionCount: omit,
      omissionRate: go.length ? omit / go.length : 0,
      commissionRate: nogo.length ? comm / nogo.length : 0,
      rtMean: mean,
      rtSd: sd,
      rtCv: Number.isFinite(mean) && mean > 0 ? sd / mean : NaN, // CV = SD / Mean
    };
  }

  /** 割合 → "12.3%" */
  function fmtPct(x) {
    return `${(x * 100).toFixed(1)}%`;
  }

  /** 秒 → "375 ms"（無効なら —） */
  function fmtMs(x) {
    return Number.isFinite(x) ? `${Math.round(x * 1000)} ms` : "—";
  }

  /** 変動係数（CV）を小数3桁で */
  function fmtCv(x) {
    return Number.isFinite(x) ? x.toFixed(3) : "—";
  }

  /** 割合の差をポイント表示（例: +2.5 pt） */
  function fmtDeltaPct(curr, base) {
    if (!Number.isFinite(curr) || !Number.isFinite(base)) return "—";
    const d = (curr - base) * 100;
    const sign = d > 0 ? "+" : "";
    return `${sign}${d.toFixed(1)} pt`;
  }

  /** RT差を ms 表示（例: -20 ms） */
  function fmtDeltaMs(curr, base) {
    if (!Number.isFinite(curr) || !Number.isFinite(base)) return "—";
    const d = Math.round((curr - base) * 1000);
    const sign = d > 0 ? "+" : "";
    return `${sign}${d} ms`;
  }

  /** 条件＋タイミングの表示ラベル */
  function formatConditionLabel(r) {
    if (!r) return "—";
    let s = r.condition || "—";
    if (r.timingMode && r.timingMode !== "None") s += ` / ${r.timingMode}`;
    if (r.demo) s += " · demo";
    return s;
  }

  /**
   * 差分セル用クラス。higherWorse=true なら増加を悪化色（CE/OE向け）。
   * RT は中立色のまま。
   */
  function deltaClass(curr, base, { higherWorse = false } = {}) {
    if (!Number.isFinite(curr) || !Number.isFinite(base)) return "delta-neutral";
    const d = curr - base;
    if (Math.abs(d) < 1e-12) return "delta-neutral";
    if (!higherWorse) return "delta-neutral";
    return d > 0 ? "delta-pos" : "delta-neg";
  }

  function fmtDeltaCell(text, className) {
    return `<span class="${className}">${text}</span>`;
  }

  // --- localStorage（個人内比較・履歴。サーバなし） ---
  // キー名を変えると既存端末の履歴が見えなくなる（移行なし）
  const STORAGE_KEY = "webcpt_sart_sessions_v1";

  /** 保存済みセッション一覧を読む（壊れていれば空配列） */
  function loadAllSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  /** セッション一覧を上書き保存 */
  function saveAllSessions(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  /** 端末ローカルの YYYY-MM-DD（別日比較用） */
  function localDateString(isoOrDate) {
    const d = isoOrDate ? new Date(isoOrDate) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /** 終了時に localStorage へ入れる要約。フィールドを増やすと履歴表・自己比較も要更新 */
  function buildSessionRecord(summary) {
    return {
      id: state.sessionId,
      participantId: state.participantId,
      savedAt: new Date().toISOString(),
      dateLocal: localDateString(),
      condition: state.conditionKey,
      timingMode: usesDistractTiming(state.conditionKey) ? state.timingMode : "None",
      demo: Boolean(state.demo),
      n: summary.n,
      nogo: summary.nogo,
      withDistract: summary.withDistract,
      withSteady: summary.withSteady,
      commissionCount: summary.commissionCount,
      commissionRate: summary.commissionRate,
      omissionCount: summary.omissionCount,
      omissionRate: summary.omissionRate,
      rtMean: summary.rtMean,
      rtSd: summary.rtSd,
      rtCv: summary.rtCv,
    };
  }

  /** 同じ session id があれば差し替え、なければ追加 */
  function upsertSessionRecord(record) {
    const list = loadAllSessions().filter((r) => r.id !== record.id);
    list.push(record);
    list.sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)));
    saveAllSessions(list);
    return list;
  }

  /** 参加者IDで絞り込み（新しい順）。デモは既定で除外 */
  function sessionsForParticipant(participantId, { includeDemo = false } = {}) {
    const id = (participantId || "").trim() || "anon";
    return loadAllSessions()
      .filter((r) => r.participantId === id)
      .filter((r) => includeDemo || !r.demo)
      .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }

  /** 直近の他セッション Baseline（同日でも可） */
  function findPriorBaseline(participantId, currentId) {
    return sessionsForParticipant(participantId).find(
      (r) => r.condition === "Baseline" && r.id !== currentId
    );
  }

  /** 別日の Baseline（日内変動と分けたいとき用） */
  function findPriorBaselineOtherDay(participantId, currentId, currentDate) {
    return sessionsForParticipant(participantId).find(
      (r) =>
        r.condition === "Baseline" &&
        r.id !== currentId &&
        r.dateLocal !== currentDate
    );
  }

  /**
   * 終了画面 #self-compare: 過去の多様条件セッションを表で並べ、今回との差分を出す。
   * 先頭行＝今回。以降は新しい順（デモ除外、最大12件）。
   */
  function renderSelfCompare(current) {
    if (!el.selfCompare) return;
    const priorBaseline = findPriorBaseline(state.participantId, state.sessionId);
    const past = sessionsForParticipant(state.participantId, { includeDemo: false }).filter(
      (r) => r.id !== current.id
    );
    const shown = past.slice(0, 12);

    if (!shown.length) {
      el.selfCompare.innerHTML = `
        <p>
          まだこの参加者ID（<strong>${state.participantId}</strong>）の過去セッションがありません。
          Baseline や各妨害条件を繰り返すと、ここに条件横断の表が出ます。
        </p>
        <p class="note">保存先: このブラウザの localStorage（サーバなし）。デモは自己比較表から除外します。</p>
      `;
      return;
    }

    const currentRow = `
      <tr class="is-current">
        <td>今回<br /><span class="note">${current.dateLocal}</span></td>
        <td>${formatConditionLabel(current)}</td>
        <td>${fmtPct(current.commissionRate)}<br /><span class="note">${current.commissionCount}/${current.nogo}</span></td>
        <td>${fmtPct(current.omissionRate)}</td>
        <td>${fmtMs(current.rtMean)}</td>
        <td class="delta-neutral">—</td>
        <td class="delta-neutral">—</td>
        <td class="delta-neutral">—</td>
      </tr>`;

    const pastRows = shown
      .map((r) => {
        const dCe = fmtDeltaPct(current.commissionRate, r.commissionRate);
        const dOe = fmtDeltaPct(current.omissionRate, r.omissionRate);
        const dRt = fmtDeltaMs(current.rtMean, r.rtMean);
        const rowClass = r.condition === "Baseline" ? "is-baseline" : "";
        const time = String(r.savedAt || "").slice(11, 19);
        return `
      <tr class="${rowClass}">
        <td>${r.dateLocal}<br /><span class="note">${time || "—"}</span></td>
        <td>${formatConditionLabel(r)}</td>
        <td>${fmtPct(r.commissionRate)}<br /><span class="note">${r.commissionCount}/${r.nogo}</span></td>
        <td>${fmtPct(r.omissionRate)}</td>
        <td>${fmtMs(r.rtMean)}</td>
        <td>${fmtDeltaCell(dCe, deltaClass(current.commissionRate, r.commissionRate, { higherWorse: true }))}</td>
        <td>${fmtDeltaCell(dOe, deltaClass(current.omissionRate, r.omissionRate, { higherWorse: true }))}</td>
        <td>${fmtDeltaCell(dRt, "delta-neutral")}</td>
      </tr>`;
      })
      .join("");

    const baselineHint = priorBaseline
      ? `直近 Baseline: ${priorBaseline.dateLocal} — CE ${fmtPct(priorBaseline.commissionRate)} / OE ${fmtPct(priorBaseline.omissionRate)} / RT ${fmtMs(priorBaseline.rtMean)}（ΔCE ${fmtDeltaPct(current.commissionRate, priorBaseline.commissionRate)}）。`
      : "まだ Baseline がありません。妨害なしを1回取ると個人内の基準がはっきりします。";

    el.selfCompare.innerHTML = `
      <p>
        参加者 <strong>${state.participantId}</strong> の過去セッション（新しい順・最大12・デモ除外）。
        差分列は <strong>今回 − 過去</strong>（CE/OE の増加は赤寄り）。
      </p>
      <p class="note">${baselineHint}</p>
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>日時</th>
              <th>条件</th>
              <th>CE</th>
              <th>OE</th>
              <th>RT平均</th>
              <th>ΔCE</th>
              <th>ΔOE</th>
              <th>ΔRT</th>
            </tr>
          </thead>
          <tbody>
            ${currentRow}
            ${pastRows}
          </tbody>
        </table>
      </div>
      <p class="note">
        診断ではありません。条件・タイミング・試行数が違う行は参考比較です。全件は「保存履歴」から。
      </p>
    `;
  }

  /**
   * 文献（妨害なし健常）との比較表。条件が合わなくても数値は表で見せ、適用可否をバナーで示す。
   */
  function renderLitCompare(summary, { isBaseline, timingLabel }) {
    if (!el.normCompare) return;
    const manly = NORMS.manly2000;
    const rob = NORMS.robertson1997;
    const manlyRate = manly.commissionMean / manly.noGoTrials;
    const robRate = rob.commissionMean / rob.noGoTrials;
    const applicable =
      isBaseline && !state.demo && summary.nogo === manly.noGoTrials;

    let banner;
    if (applicable) {
      banner = `<p class="compare-banner is-ok">本比較対象です（Baseline・デモOFF・No-Go ${manly.noGoTrials}）。下表は健常報告との概算です。</p>`;
    } else if (!isBaseline) {
      banner = `<p class="compare-banner">参考表示のみ。文献値は<strong>妨害なし（Baseline）</strong>前提です。いまは <strong>${state.conditionKey}</strong>（${timingLabel}）のため本比較対象外です。</p>`;
    } else if (state.demo || summary.nogo !== manly.noGoTrials) {
      banner = `<p class="compare-banner">参考表示のみ。文献は No-Go ${manly.noGoTrials} 回前提です。いまは No-Go=${summary.nogo}${state.demo ? "（デモ）" : ""}のため本比較対象外です。</p>`;
    } else {
      banner = `<p class="compare-banner">参考表示のみ。</p>`;
    }

    const z =
      applicable && manly.commissionSd > 0
        ? (summary.commissionCount - manly.commissionMean) / manly.commissionSd
        : NaN;
    const zText = Number.isFinite(z) ? z.toFixed(2) : "—";

    const dCountManly = applicable
      ? (() => {
          const d = summary.commissionCount - manly.commissionMean;
          const sign = d > 0 ? "+" : "";
          return `${sign}${d.toFixed(2)} 件`;
        })()
      : "—";
    const dRateManly = applicable
      ? fmtDeltaPct(summary.commissionRate, manlyRate)
      : "—";
    const dRtManly =
      applicable && Number.isFinite(summary.rtMean)
        ? (() => {
            const d = Math.round(summary.rtMean * 1000 - manly.goRtMeanMs);
            const sign = d > 0 ? "+" : "";
            return `${sign}${d} ms`;
          })()
        : "—";

    const youCeClass = applicable
      ? deltaClass(summary.commissionCount, manly.commissionMean, { higherWorse: true })
      : "delta-neutral";

    el.normCompare.innerHTML = `
      ${banner}
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>指標</th>
              <th>あなた（今回）</th>
              <th>Manly ら 2000<br /><span class="note">健常 N≈109</span></th>
              <th>Robertson ら 1997<br /><span class="note">コントロール</span></th>
              <th>差分（あなた − Manly）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Commission 件数</td>
              <td class="${youCeClass}"><strong>${summary.commissionCount}</strong> / ${summary.nogo}</td>
              <td>${manly.commissionMean} ± ${manly.commissionSd}<br /><span class="note">/ ${manly.noGoTrials}</span></td>
              <td>${rob.commissionMean} ± ${rob.commissionSd}<br /><span class="note">/ ${rob.noGoTrials}</span></td>
              <td>${applicable ? fmtDeltaCell(dCountManly, youCeClass) : "—"}</td>
            </tr>
            <tr>
              <td>Commission 率</td>
              <td>${fmtPct(summary.commissionRate)}</td>
              <td>${fmtPct(manlyRate)}</td>
              <td>${fmtPct(robRate)}</td>
              <td>${applicable ? fmtDeltaCell(dRateManly, deltaClass(summary.commissionRate, manlyRate, { higherWorse: true })) : "—"}</td>
            </tr>
            <tr>
              <td>正答 Go RT 平均</td>
              <td>${fmtMs(summary.rtMean)}</td>
              <td>${manly.goRtMeanMs} ms</td>
              <td>—</td>
              <td>${dRtManly}</td>
            </tr>
            <tr>
              <td>Manly z（件数）</td>
              <td colspan="3">${applicable ? describeVsManly(summary.commissionCount) : "条件不一致のため算出しません"}</td>
              <td><strong>${zText}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">
        診断ではありません。年齢帯別規範は使いません。詳細な前提は下の「この比較の前提」を参照。
      </p>
    `;
  }

  /**
   * 履歴画面 #history-list に表を描画（中身は HTML 生成、見た目は .history-list）。
   * includeDemo:true なのでデモも一覧に出る（自己比較の既定はデモ除外）。
   */
  function renderHistoryList() {
    const pid = (el.historyParticipant.value || el.participant.value || "anon")
      .trim()
      .replace(/[^\w\-]+/g, "_") || "anon";
    el.historyParticipant.value = pid;
    const rows = sessionsForParticipant(pid, { includeDemo: true });
    if (!rows.length) {
      el.historyList.innerHTML = `<p>${pid} の保存セッションはありません。</p>`;
      return;
    }
    const body = rows
      .map(
        (r) => `
      <tr>
        <td>${r.dateLocal}<br /><span class="note">${String(r.savedAt).slice(11, 19)}</span></td>
        <td>${r.condition}${r.timingMode && r.timingMode !== "None" ? `<br /><span class="note">${r.timingMode}</span>` : ""}${r.demo ? "<br /><span class=\"note\">demo</span>" : ""}</td>
        <td>${fmtPct(r.commissionRate)}<br /><span class="note">${r.commissionCount}/${r.nogo}</span></td>
        <td>${fmtPct(r.omissionRate)}</td>
        <td>${fmtMs(r.rtMean)}</td>
      </tr>`
      )
      .join("");
    el.historyList.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>日時</th>
            <th>条件</th>
            <th>CE</th>
            <th>OE</th>
            <th>RT</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  /** Commission 件数を Manly 平均±1SD でざっくり言い換える */
  function describeVsManly(commissionCount) {
    const { commissionMean, commissionSd } = NORMS.manly2000;
    const lo = commissionMean - commissionSd;
    const hi = commissionMean + commissionSd;
    if (commissionCount < lo) {
      return `Manly らの健常平均（${commissionMean}件）より低め（平均−1SD 未満）。抑制は文献平均より良好な側です。`;
    }
    if (commissionCount > hi) {
      return `Manly らの健常平均（${commissionMean}件）より高め（平均＋1SD 超）。速さ優先の可能性もあります。`;
    }
    if (commissionCount < commissionMean) {
      return `Manly らの健常平均（${commissionMean}件）よりやや低め（平均±1SD の範囲内）。`;
    }
    if (commissionCount > commissionMean) {
      return `Manly らの健常平均（${commissionMean}件）よりやや高め（平均±1SD の範囲内）。`;
    }
    return `Manly らの健常平均（${commissionMean}件）と同程度です。`;
  }

  /**
   * 終了画面の本体（runExperiment の最後）:
   * 1) 集計 2) localStorage 保存 3) 文献比較表 4) 自己比較表
   */
  function renderStats() {
    const exp = state.logs.filter((r) => r.block_index === 1);
    const s = summarize(exp);
    const timingLabel = usesDistractTiming(state.conditionKey)
      ? state.timingMode
      : "—";
    const isBaseline = state.conditionKey === "Baseline";
    const record = buildSessionRecord(s);
    upsertSessionRecord(record);
    const distractNoun =
      state.conditionKey === "IllustDistract"
        ? "イラスト"
        : state.conditionKey === "NotifyDistract"
          ? "通知"
          : state.conditionKey === "AudioDistract"
            ? "音声"
            : "図形";

    el.stats.innerHTML = `
      <div><span>条件</span><span>${state.conditionKey}</span></div>
      <div><span>妨害タイミング</span><span>${timingLabel}</span></div>
      <div><span>試行数</span><span>${s.n}（No-Go=${s.nogo}）</span></div>
      <div><span>${distractNoun}と重なった試行（突発）</span><span>${s.withDistract}</span></div>
      <div><span>定常${distractNoun}あり試行</span><span>${s.withSteady}</span></div>
      <div><span>Commission（3で押した）</span><span>${s.commissionCount} / ${s.nogo}（${fmtPct(s.commissionRate)}）</span></div>
      <div><span>Omission（3以外で押さなかった）</span><span>${s.omissionCount}（${fmtPct(s.omissionRate)}）</span></div>
      <div><span>正答Go RT 平均</span><span>${fmtMs(s.rtMean)}</span></div>
      <div><span>正答Go RT SD</span><span>${fmtMs(s.rtSd)}</span></div>
      <div><span>正答Go RT CV</span><span>${fmtCv(s.rtCv)}</span></div>
      <div><span>端末へ保存</span><span>localStorage（${state.participantId}）</span></div>
    `;

    renderLitCompare(s, { isBaseline, timingLabel });
    renderSelfCompare(record);
  }

  // --- CSV ダウンロード（#btn-download） ---
  /** CSVセルのエスケープ（カンマ・改行・引用符） */
  function csvEscape(v) {
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  /**
   * 試行ログ → BOM 付き CSV（Excel向け）。
   * keys の並び＝列順。列を増やすなら runTrial の push オブジェクトも揃える。
   */
  function toCsv(rows) {
    const keys = [
      "participant_id",
      "session_id",
      "paradigm",
      "block_index",
      "trial_index",
      "condition",
      "modality",
      "meaningfulness",
      "temporal",
      "distractor_timing_mode",
      "digit",
      "font_size",
      "stimulus_type",
      "soa_sec",
      "has_transient_distractor",
      "has_steady_visual",
      "distractor_shapes",
      "distractor_positions",
      "distractor_sizes",
      "distractor_overlap_ms",
      "stim_onset_ms",
      "response_ms",
      "rt_sec",
      "responded",
      "anticipatory",
      "outcome",
    ];
    const lines = [keys.join(",")];
    for (const row of rows) {
      lines.push(keys.map((k) => csvEscape(row[k] ?? "")).join(","));
    }
    return `\ufeff${lines.join("\n")}\n`;
  }

  /** ブラウザで CSV ファイルを保存ダイアログへ */
  function downloadCsv() {
    const blob = new Blob([toCsv(state.logs)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const tag = usesDistractTiming(state.conditionKey)
      ? `${state.conditionKey}_${state.timingMode}`
      : state.conditionKey;
    a.download = `sart_${tag}_${state.participantId}_${state.sessionId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // --- 実験フロー（練習 → 休憩 → 本試行 → 終了） ---
  /** 練習ブロック → #screen-rest。rest の文言はここで上書き */
  async function runSession() {
    if (state.running) return; // 連打による二重実行を防ぐ
    state.running = true;
    state.logs = [];
    state.sessionStart = performance.now();
    await runBlock(
      state.practiceTrials,
      0,
      state.practiceAsyncEvents,
      state.practiceSteadyEvents,
      state.practiceAudioEvents
    );
    state.running = false;
    el.restText.textContent =
      "練習が終わりました。本試行ではフィードバックはありません。準備ができたら始めてください。";
    el.continue.textContent = "本試行を始める";
    show("rest");
  }

  /** 本試行 → renderStats → #screen-done */
  async function runExperiment() {
    if (state.running) return;
    state.running = true;
    await runBlock(
      state.expTrials,
      1,
      state.expAsyncEvents,
      state.expSteadyEvents,
      state.expAudioEvents
    );
    state.running = false;
    renderStats();
    show("done");
  }

  /**
   * スタート画面の入力から試行列・Async/Steady を用意し教示へ。
   * demo / ?demo=1 → 短い本試行。timing: Async | Sync | Steady
   */
  function prepareSession() {
    const demo = el.demo.checked || /[?&]demo=1\b/.test(location.search);
    const conditionKey = el.condition.value in CONDITION_META ? el.condition.value : "Baseline";
    const timingRaw = el.timing.value;
    const timingMode =
      timingRaw === "Sync" ? "Sync" : timingRaw === "Steady" ? "Steady" : "Async";
    state.demo = demo;
    state.conditionKey = conditionKey;
    state.timingMode = usesDistractTiming(conditionKey) ? timingMode : "None";
    state.participantId = (el.participant.value || "anon").trim().replace(/[^\w\-]+/g, "_");
    // ISO 時刻の : . を - に置換してファイル名安全にする
    state.sessionId = new Date().toISOString().replace(/[:.]/g, "-");

    if (isAudioDistractCondition(conditionKey)) {
      AudioBank.unlock();
      AudioBank.preloadAll();
    }

    const expRepeats = demo ? CONFIG.demoRepeatsPerDigit : CONFIG.experimentRepeatsPerDigit;
    const seed = hashSeed(
      1997,
      state.participantId.length + conditionKey.length + timingMode.length,
      demo ? 1 : 0
    );
    const kind = distractorKindFor(conditionKey);

    state.practiceTrials = buildBlock(
      CONFIG.practiceRepeatsPerDigit,
      hashSeed(seed, 0, 0),
      conditionKey,
      timingMode
    );
    state.expTrials = buildBlock(expRepeats, hashSeed(seed, 1, 0), conditionKey, timingMode);

    // 視覚 Async
    if (isVisualDistractCondition(conditionKey) && timingMode === "Async") {
      state.practiceAsyncEvents = buildAsyncDistractorEvents(
        state.practiceTrials.length,
        hashSeed(seed, 2, 0),
        kind
      );
      state.expAsyncEvents = buildAsyncDistractorEvents(
        state.expTrials.length,
        hashSeed(seed, 3, 0),
        kind
      );
    } else {
      state.practiceAsyncEvents = [];
      state.expAsyncEvents = [];
    }

    // 視覚 Steady
    if (isVisualDistractCondition(conditionKey) && timingMode === "Steady") {
      state.practiceSteadyEvents = buildSteadySchedule(
        state.practiceTrials.length,
        hashSeed(seed, 4, 0),
        kind
      );
      state.expSteadyEvents = buildSteadySchedule(
        state.expTrials.length,
        hashSeed(seed, 5, 0),
        kind
      );
    } else {
      state.practiceSteadyEvents = [];
      state.expSteadyEvents = [];
    }

    // 音声 Async / Steady（Sync は試行ごとに trial.audioClip）
    if (isAudioDistractCondition(conditionKey) && timingMode === "Async") {
      state.practiceAudioEvents = buildAsyncAudioEvents(
        state.practiceTrials.length,
        hashSeed(seed, 6, 0)
      );
      state.expAudioEvents = buildAsyncAudioEvents(
        state.expTrials.length,
        hashSeed(seed, 7, 0)
      );
    } else if (isAudioDistractCondition(conditionKey) && timingMode === "Steady") {
      state.practiceAudioEvents = buildSteadyAudioSchedule(
        state.practiceTrials.length,
        hashSeed(seed, 8, 0)
      );
      state.expAudioEvents = buildSteadyAudioSchedule(
        state.expTrials.length,
        hashSeed(seed, 9, 0)
      );
    } else {
      state.practiceAudioEvents = [];
      state.expAudioEvents = [];
    }

    updateInstruct();
  }

  // --- UI イベント配線（ボタン id ↔ index.html） ---
  el.condition.addEventListener("change", syncDistractOptionsUi);
  el.start.addEventListener("click", () => {  // 「次へ」→ 教示
    AudioBank.unlock();
    prepareSession();
    show("instruct");
  });
  el.historyBtn.addEventListener("click", () => {  // 保存一覧
    el.historyParticipant.value =
      (el.participant.value || "anon").trim().replace(/[^\w\-]+/g, "_") || "anon";
    renderHistoryList();
    show("history");
  });
  el.historyRefresh.addEventListener("click", renderHistoryList);
  el.historyClear.addEventListener("click", () => {
    const pid =
      (el.historyParticipant.value || "anon").trim().replace(/[^\w\-]+/g, "_") || "anon";
    if (!window.confirm(`${pid} の保存履歴をこのブラウザから削除しますか？`)) return;
    saveAllSessions(loadAllSessions().filter((r) => r.participantId !== pid));
    renderHistoryList();
  });
  el.historyBack.addEventListener("click", () => {
    show("start");
  });
  el.begin.addEventListener("click", () => {  // 教示の次 → 練習開始
    AudioBank.unlock();
    runSession();
  });
  el.continue.addEventListener("click", () => {  // 休憩の次 → 本試行
    AudioBank.unlock();
    runExperiment();
  });
  el.download.addEventListener("click", downloadCsv);  // 試行ログCSV
  el.restart.addEventListener("click", () => {  // 終了→スタート（進行中ブロックも止める）
    state.blockActive = false;
    AudioBank.stopAll();
    hideTaskParts();
    show("start");
  });

  window.addEventListener("keydown", onKey, { passive: false });  // Space / Enter
  window.addEventListener("pointerdown", onPointer);  // 画面タップ（ボタン類は除外）

  // URL クエリで初期UIを上書き（ブックマーク・デモ配布用）
  // 例: ?demo=1&condition=AudioDistract&timing=Async
  if (/[?&]demo=1\b/.test(location.search)) el.demo.checked = true;
  if (/[?&]condition=ShapeDistract\b/i.test(location.search)) {
    el.condition.value = "ShapeDistract";
  }
  if (/[?&]condition=IllustDistract\b/i.test(location.search)) {
    el.condition.value = "IllustDistract";
  }
  if (/[?&]condition=AudioDistract\b/i.test(location.search)) {
    el.condition.value = "AudioDistract";
  }
  if (/[?&]condition=NotifyDistract\b/i.test(location.search)) {
    el.condition.value = "NotifyDistract";
  }
  if (/[?&]timing=Sync\b/i.test(location.search)) el.timing.value = "Sync";
  if (/[?&]timing=Async\b/i.test(location.search)) el.timing.value = "Async";
  if (/[?&]timing=Steady\b/i.test(location.search)) el.timing.value = "Steady";

  AudioBank.preloadAll();
  syncDistractOptionsUi();
  show("start");  // 最初はスタート画面
})();
