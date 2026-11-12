# 使い方

## サンプルを開く

Node.js 24 で動作を確認しています。クローンしたディレクトリで実行します。

```sh
node build.mjs --config examples/basic/wiki.json
```

`examples/basic/out/index.html` をブラウザで開きます。サンプルにはホーム、2文書をまとめた「フレーム更新」、1文書の「動作確認」があります。

設定を YAML で書く場合は、PyYAML が利用できる Python を指定します。`python` で起動できる環境では `--python` を省略できます。

```sh
node build.mjs --config examples/basic/wiki.yaml --python python3
```

## 自分の Wiki を作る

1. サンプルの `content/` と設定ファイルを参考に、Markdown と画像を用意します。各 Markdown の先頭見出しを H1 にします。
2. `pages` にページの順序と収録文書を記述します。複数の文書を1ページにまとめる場合は、そのページに `title` を付けます。`home` には最初に開くページの ID を指定します。
3. `nav` に文書へのリンクと開閉の構造を記述します。設定の項目は [wiki.schema.json](wiki.schema.json) を参照してください。
4. `node build.mjs --config path/to/wiki.json` を実行します。`output.path` が生成先です。編集するファイルは Markdown と設定です。

| 項目 | 書き方 |
| --- | --- |
| `root` | 設定ファイルから見た文書ルート。省略時は設定ファイルと同じ場所 |
| `pages[].documents[].source` | 文書ルートからの相対パス |
| `nav` の `heading` | 項目を束ねる小見出し |
| `nav` の `tree` | `fold: open` または `closed` で開閉。省略時はネストした箇条書き |
| `nav` の `link` | `document` に文書 ID を指定。必要に応じて `anchor` に文書内の見出し ID を指定 |
| `output` | `mode: single` と、設定ファイルから見た `.html` の出力パス |

ページ ID と文書 ID は、それぞれ重複しない英小文字・数字・ハイフンで指定します。文書の先頭は `#doc--文書ID` になります。設定で文書 ID を維持すれば、その文書へのリンクを維持できます。

## リンクと図

Markdown 内では `[処理順序](frame-order.md)` や `[入力処理](frame-order.md#入力処理)` のように、編集元の文書からの相対パスで記述します。収録文書へのリンクは Wiki 内のアンカーに変換します。同じ見出しが1つの文書内に複数ある場合、2件目以降は `-1`、`-2` と続きます。

`![入力、更新、描画の順序](diagrams/frame-flow.svg)` のように画像を参照します。文書ルート内の SVG、PNG、JPEG を埋め込めます。SVG は `viewBox` を持つ単独ファイルとして作成し、画像やフォントへの外部参照、スクリプト、イベント属性、`foreignObject` は省きます。画像だけの段落には拡大ボタンが付きます。

収録外のローカルファイルへのリンクは、生成 HTML の位置を基準に変換します。HTML だけを別の場所へコピーした場合、そのリンク先は元のファイル配置に依存します。

## 生成結果の確認

```sh
node build.mjs --config examples/basic/wiki.json --check
```

`--check` は HTML を書き換えずに再計算し、生成済みファイルと照合します。未登録の文書を指定したナビ、収録文書の見出しリンク切れ、画像不足はエラーになります。収録外のローカル参照先が見つからない場合は警告します。

この版の出力は単一 HTML です。ディレクトリ出力、旧 Wiki の URL 互換、配色プリセットの切り替えは今後の対象です。
