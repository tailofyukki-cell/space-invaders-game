# 月影防衛線 — KAGEKIRI PROTOCOL

> **月都の結界を守る、ネオン和風サイバーSF・アーケードシューティング。**

[![Play on GitHub Pages](https://img.shields.io/badge/PLAY-GitHub%20Pages-7ff7ff?style=for-the-badge&logo=github&logoColor=061226)](https://tailofyukki-cell.github.io/space-invaders-game/)

**[ゲームを遊ぶ](https://tailofyukki-cell.github.io/space-invaders-game/)** ｜ **[開発設計](PLAN.md)** ｜ **[テスト結果](TEST_RESULTS.md)**

## 概要

月都の結界を侵食する妖怪型ドローン《穢機》を、結界機《カグラ》で迎撃するブラウザ向けアーケードシューティングです。朱の鬼面、白い狐面、提灯、蛇霊をサイバー意匠として再解釈した敵編隊を突破し、鬼面ボス《紅月ノヲロチ》を浄化してください。

MVP版のインベーダーゲームを、**3ウェーブ・ボス戦・結界解放・コンボ・ハイスコア・効果音・設定・モバイル操作UI**を備えた同人ゲーム品質の初回強化版へ刷新しました。

## 対応環境

HTML5 CanvasとWeb Audioを利用する静的ブラウザゲームです。インストールやアカウント登録は不要で、以下の環境の現行ブラウザを主対象とします。

| プラットフォーム | 対象ブラウザ | 操作 |
|---|---|---|
| Windows / macOS / Linux | Chrome、Edge、Firefox、Safari（macOS） | キーボード |
| Android | Chromeほかの現行Chromium系ブラウザ | 仮想ボタン |
| iOS / iPadOS | Safariほかの現行WebKit系ブラウザ | 仮想ボタン |

> 初回のユーザー操作後に効果音が有効になります。これはモバイル・デスクトップを問わず、ブラウザの自動再生制限に配慮するための仕様です。

## 操作方法

| 操作 | PC | スマートフォン / タブレット |
|---|---|---|
| 移動 | `←` / `→` または `A` / `D` | 画面下部の `◀` / `▶` を長押し |
| 通常射撃 | `Space` または `Z` | `射` を長押し |
| 結界解放 | `Shift` または `X` | `結` をタップ |
| 一時停止 / 再開 | `Esc` または `P` | 画面右上の一時停止ボタン |

## 遊び方

プレイヤーは、式札ショットで敵を倒し、連続撃破によってコンボ倍率を伸ばします。敵を倒すと霊力が蓄積され、満タン時に**結界解放**を使えます。結界解放は敵弾を消去し、広範囲の敵とボスへ大きなダメージを与える切り札です。

第1ステージは3ウェーブ構成です。各ウェーブを撃破すると大型ボス《紅月ノヲロチ》が出現します。プレイヤーHPが0になるか、敵が防衛ラインへ侵入するとゲームオーバーです。ボスを撃破するとクリアとなり、スコア・ハイスコア・最大コンボを確認できます。

## 主な実装内容

| 分類 | 内容 |
|---|---|
| コアゲーム | `requestAnimationFrame`と`deltaTime`を利用したゲームループ、AABB当たり判定、3ウェーブ、ボス戦、ゲーム状態遷移。 |
| アクション | 通常ショット、敵弾、破壊可能な結界障子、無敵時間、霊力ゲージ、弾消しを伴う結界解放。 |
| 演出 | 月都の背景、鳥居、ネオングリッド、デジタル雨、粒子、発光、画面揺れ、警告表示、ボスHPバー。 |
| 音響 | 発射、被弾、撃破、結界解放、ボス警告、クリアのWeb Audio効果音。 |
| 継続性 | ハイスコア、効果音音量、画面揺れ設定を`localStorage`へ保存。 |
| 端末対応 | キーボードとPointer Eventsを統合し、デスクトップ・モバイルで同じゲームロジックを利用。 |

## ローカルでの実行

ソースを取得した後、任意の静的HTTPサーバーで公開してください。ES Modulesを用いるため、`file://`で直接開くのではなくHTTPサーバー経由での起動が必要です。

```bash
git clone https://github.com/tailofyukki-cell/space-invaders-game.git
cd space-invaders-game
python3 -m http.server 8080
```

起動後、`http://localhost:8080/`を開きます。

## プロジェクト構成

```text
space-invaders-game/
├── index.html             # 画面構成
├── styles.css             # レスポンシブUI・世界観表現
├── main.js                # UI制御、設定保存、仮想ボタン接続
├── src/
│   ├── config.js          # 色、定数、敵・ステージ定義
│   ├── entities.js        # プレイヤー、敵、ボス、弾、障害物、粒子
│   └── game.js            # 入力、音響、ゲーム状態、描画、当たり判定
├── PLAN.md                # 実装計画と品質基準
├── STRUCTURE.md           # アーキテクチャ
├── ASSETS.md              # アートディレクションとアセット台帳
├── TEST_RESULTS.md        # 視覚・機能テスト結果
└── LICENSE                # MIT License
```

## 開発・品質資料

| 資料 | 内容 |
|---|---|
| [PLAN.md](PLAN.md) | 初回強化版のゲームデザイン、実装範囲、品質基準、今後の拡張候補。 |
| [STRUCTURE.md](STRUCTURE.md) | ゲームロジック、描画、入力、音響、状態遷移の分離方針。 |
| [ASSETS.md](ASSETS.md) | ネオン和風サイバーSFのアートディレクションと生成済み視覚基準。 |
| [TEST_RESULTS.md](TEST_RESULTS.md) | タイトル、戦闘、ウェーブ、ボス、結果、設定の確認結果。 |

## 今後のロードマップ

初回強化版の次には、第2・第3ステージ、ボスの複数フェーズ、ストーリー会話、敵図鑑、実績・チャレンジ、PWA対応、itch.io向けの配布ページとキービジュアルを予定しています。詳細は[PLAN.md](PLAN.md)を参照してください。

## ライセンス

本プロジェクトは[MIT License](LICENSE)のもとで公開しています。

---

© 2026 tailofyukki-cell. **Protect the moonlit city.**
