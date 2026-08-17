# Structure: 月影防衛線 — KAGEKIRI PROTOCOL

## 方針

現在の単一ファイルMVPを、外部フレームワークなしでも保守できるES Modules構成へ移行する。描画・入力・音響・UI・ゲームルールを分離し、ゲーム固有の処理はDOMに直接依存させない。Canvas APIは描画面、HTML/CSSは画面遷移・設定・モバイル操作UIの担当とする。

```text
space-invaders-game/
├── index.html
├── styles.css
├── main.js                     # 起動・画面遷移・依存関係の組立
├── src/
│   ├── config.js               # 定数、色、難易度、ステージ定義
│   ├── game.js                 # GameWorld、状態遷移、ゲームループ
│   ├── entities.js             # Player、Enemy、Boss、Projectile、Barrier、Pickup
│   ├── systems.js              # Input、Collision、Spawner、Particle、Audio、Storage
│   ├── renderer.js             # CanvasRenderer、背景、HUD、エフェクト
│   └── ui.js                   # タイトル、結果、設定、モバイル操作UI
├── assets/
│   └── audio/                  # 将来追加する軽量音源
├── PLAN.md
├── STRUCTURE.md
├── MEMORY.md
└── ASSETS.md
```

## 主要オブジェクト

| 要素 | 責務 |
|---|---|
| `GameWorld` | 明示的なゲーム状態、時間管理、更新順序、ステージ進行、勝敗判定を所有する。 |
| `Player` | 位置、HP、通常射撃、無敵時間、霊力、結界解放を管理する。 |
| `Enemy` / `Boss` | 敵固有の移動、攻撃、HP、撃破時の報酬を持つ。敵種の設定はデータで与える。 |
| `Projectile` | 速度、陣営、ダメージ、寿命、当たり判定用の矩形を保持する。 |
| `Barrier` | 結界障子の耐久値、破損の視覚状態、当たり判定を持つ。 |
| `Spawner` | ウェーブのタイムラインを読み、隊列・ダイブ・ボスの出現を指揮する。 |
| `CollisionSystem` | AABBでプレイヤー弾、敵弾、敵、障害物、アイテムを判定する。 |
| `InputManager` | キーボード・タッチ・仮想ボタンを意味論的アクションへ統合する。 |
| `AudioManager` | ユーザー操作後にAudioContextを有効化し、Web Audioで効果音を合成する。 |
| `StorageManager` | ハイスコア、音量、画面揺れの設定を`localStorage`に保存する。 |
| `CanvasRenderer` | 画面内の背景、ゲームオブジェクト、弾、粒子、画面揺れ、HUDを一貫して描く。 |
| `UIController` | HTML画面のタイトル、設定、結果、操作説明を制御する。 |

## 更新順序

1. 入力アクションを更新する。
2. 状態に応じてプレイヤー、敵、弾、障害物、出現管理を`deltaTime`で更新する。
3. 当たり判定とダメージ、撃破、霊力、コンボ、勝敗を解決する。
4. 無効化済みのオブジェクトを回収し、必要なら粒子を追加する。
5. 背景、オブジェクト、発光演出、HUDの順にCanvasへ描画する。

## ステージ状態

`title`、`settings`、`intro`、`playing`、`bossWarning`、`boss`、`clear`、`gameOver`、`paused`を状態として明示する。`playing`と`boss`だけがゲーム時間を更新し、`paused`は描画を維持して更新を停止する。タイトル・設定・結果はHTML UI、ゲーム内HUDはCanvas描画を原則とする。

## 互換性上の原則

ECMAScript Modules、Canvas 2D、Pointer Events、Web Audio、`localStorage`のみを利用し、サーバーAPI、ログイン、広告、追跡コードは導入しない。ブラウザが効果音を開始する前にユーザーの操作を要求する点を考慮し、音は開始ボタンまたは最初の入力後にのみ有効にする。
