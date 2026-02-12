# 👾 Space Invaders - インベーダーゲーム

ブラウザで遊べるクラシックなインベーダーゲーム(Space Invaders風)のWebゲームです。

## 🎮 ゲーム概要

このゲームは、1978年にリリースされた伝説的なアーケードゲーム「スペースインベーダー」にインスパイアされたWebゲームです。プレイヤーは自機を操作して、次々と襲来する敵の隊列を撃破し、地球を守ります。

## 🕹️ 操作方法

### PC
- **← →キー**: 自機を左右に移動
- **Spaceキー**: 弾を発射

### スマートフォン・タブレット
- **画面左側タップ**: 自機を左に移動
- **画面右側タップ**: 自機を右に移動
- **画面中央タップ**: 弾を発射

## 📋 ゲームルール

### 勝利条件
- すべての敵を撃破するとステージクリア

### ゲームオーバー条件
- 自機のライフが0になる(敵弾に3回被弾)
- 敵が自機の位置まで下降してくる

### ゲーム要素
- **自機**: 画面下部の緑色の戦闘機。左右に移動して弾を発射できます
- **敵**: 5行×11列の隊列で配置。左右に移動しながら徐々に下降し、ランダムに弾を発射します
- **バリケード**: 自機と敵の間に配置された4つの遮蔽物。弾を防ぎますが、被弾すると徐々に破壊されます
- **スコア**: 敵を倒すと加算されます。上の行の敵ほど高得点です
- **ライフ**: 初期値は3。敵弾に被弾するとライフが減少します

## 🌐 プレイ方法

### オンラインでプレイ
GitHub Pagesで公開されています:
**[ゲームをプレイする](https://[YOUR_GITHUB_USERNAME].github.io/space-invaders-game/)**

### ローカルで実行
1. このリポジトリをクローン:
```bash
git clone https://github.com/[YOUR_GITHUB_USERNAME]/space-invaders-game.git
cd space-invaders-game
```

2. 簡易HTTPサーバーを起動:
```bash
# Pythonを使う場合
python -m http.server 8000

# Node.jsを使う場合
npx http-server -p 8000
```

3. ブラウザで `http://localhost:8000` を開く

## 🛠️ 技術スタック

- **HTML5**: ページ構造
- **CSS3**: スタイリングとレスポンシブデザイン
- **JavaScript (ES6+)**: ゲームロジックと描画
- **Canvas API**: 2D描画

## 📁 ファイル構成

```
space-invaders-game/
├── index.html      # メインHTMLファイル
├── styles.css      # スタイルシート
├── main.js         # ゲームロジック
└── README.md       # このファイル
```

## 🎯 実装機能

- ✅ プレイヤーの左右移動と弾発射
- ✅ 敵の隊列移動と下降
- ✅ 敵のランダム弾発射
- ✅ バリケード(遮蔽物)システム
- ✅ 当たり判定(AABB)
- ✅ スコアシステム
- ✅ ライフシステム
- ✅ ゲームオーバー・クリア判定
- ✅ リトライ機能
- ✅ レスポンシブデザイン(PC/スマホ対応)

## 📜 ライセンス

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 🙏 謝辞

このゲームは、1978年にタイトーから発売された「スペースインベーダー」(西角友宏氏作)にインスパイアされて作成されました。

---

**Enjoy the game! 🚀👾**
