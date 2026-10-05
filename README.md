# Minecraft Skin Editor

Minecraft（Java版）のスキンを描いて、3Dで確認しながら PNG に書き出すエディタです。
React + TypeScript + Vite + Three.js 製で、Electron でデスクトップアプリとして配布できます。

## 機能

- 64×64 スキンの編集（ペン / 消しゴム / 塗りつぶし / スポイト）
- 3Dプレビュー（重ね着レイヤー対応、ドラッグで回転・ホイールでズーム）
- 体型の切り替え：クラシック（Steve、腕4px）/ スリム（Alex、腕3px）
- PNG の読み込み・保存
  - 旧形式の 64×32 スキンは 64×64 に変換して読み込みます（左腕・左脚は右側を反転して生成）
  - 読み込み時に体型を自動判定します
- 元に戻す / やり直す（30手まで）
- 未保存の変更があるときは、閉じる前に確認します

## 操作

| 操作 | キー |
| --- | --- |
| ペン / 消しゴム / 塗りつぶし / スポイト | P / E / F / I |
| 元に戻す / やり直す | Ctrl+Z / Ctrl+Y |
| PNG で保存 | Ctrl+S |
| キャンバスの移動 | Alt+ドラッグ、または中ボタンドラッグ |
| キャンバスのズーム | ホイール |

## 開発

```sh
npm install
npm run dev            # ブラウザで開発（http://localhost:5173）
npm run electron:dev   # Electron で開発
npm run lint
```

## 配布用ビルド

```sh
npm run electron:build:win
```

`release/` にインストーラー版とポータブル版の exe が出力されます。
