# Wiki Generator

Markdown とナビゲーション設定から、オフラインで読める静的 Wiki を生成します。複数の文書を1ページにまとめ、文書間のリンクとローカルの図を単一 HTML に収録できます。

```sh
node build.mjs --config examples/basic/wiki.json
```

`examples/basic/out/index.html` をブラウザで開いてください。設定の書き方、YAML での実行、再生成の確認は [USAGE.md](USAGE.md) にあります。Markdown の変換には [Marked と同梱ライセンス](vendor/LICENSE) を使用しています。
