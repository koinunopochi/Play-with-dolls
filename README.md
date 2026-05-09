# Play with Dolls

AIにサムネ画像のイメージをサクッと伝えるための、ブラウザだけで動く構図ラフツール。

3Dマネキン(人型)と □/円柱/球 を配置して、PNGで出力 → AIに「こういう構図で」と渡す用。

## 使い方

ローカルで開くだけ:

```sh
# 何でもいいので静的サーバを立てる(importmap使用のためfile://だと動かないことあり)
npx serve .
# あるいは
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開く。

### UI

画面中央の **黄色い枠が16:9の出力範囲**。枠内に見えてる絵 = PNGに出る絵。

### 操作

- **追加** - 人形 / □ / ●柱 / ○球
- **操作モード** - 移動 / 回転 / スケール (G / R / S)
- **スナップ** - 移動0.25 / 回転15° / スケール0.1
- **クリック** - パーツ or プリミティブを選択 (青く光る)
- **Shift+クリック** - 複数選択(トップレベル単位)。ギズモが重心に出て一括移動/回転/スケール
- **Ctrl+Z** - Undo (追加 / 削除 / 移動・回転・スケール / ポーズ適用が対象)
- **親へ** - 関節選択を人形ルートへ昇格(全身を動かしたい時)
- **削除** - 選択中を削除 (Del / Backspace)
- **解除 / Esc** - 選択解除
- **ポーズ** - 立ち / Tポーズ / Aポーズ / バンザイ / 歩き / 座り
  - 人形を選択中ならその人形に適用、未選択ならシーン中の全人形に適用
- **カメラ** - 正面 / 斜め / 横 / 後 / 俯瞰 / 煽り
- **PNG出力** - 1920×1080 で書き出し (ギズモ非表示で出力)
- **右ドラッグ / ホイール** - カメラ視点 (OrbitControls)

## 技術スタック

- Pure HTML + JS (ビルドツールなし)
- [Three.js](https://threejs.org/) v0.160 (CDN, importmap 経由)
- OrbitControls / TransformControls (three.js examples)

## デプロイ

静的ファイルだけなので、好きな静的ホスティングに置けばOK。

### Cloudflare Pages

```sh
npx wrangler pages deploy .
```

### Cloudflare Workers (Static Assets)

`wrangler.toml`:

```toml
name = "play-with-dolls"
compatibility_date = "2024-09-01"

[assets]
directory = "."
```

```sh
npx wrangler deploy
```
