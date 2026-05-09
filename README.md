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

### 操作

- **追加** - 人形/箱/円柱/球を追加
- **操作モード** - 移動 / 回転 / スケール (キー: G / R / S)
- **クリック** - パーツを選択 (関節1個 or プリミティブ)
- **親へ** - 関節 → 人形ルートに選択を移す(全身を動かしたい時)
- **削除** - 選択中のオブジェクト(人形ごと)を削除 (キー: Delete)
- **PNG出力** - 現在のビューを画像として保存
- **右ドラッグ / ホイール** - カメラ視点

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
