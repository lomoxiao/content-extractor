# @local/content-extractor

URL を受け取り、ソース種別(Web記事 / arXiv / YouTube / X投稿 / PDF)を判定して
本文・メタデータ・参照リンク・付随資産を抽出する共有ライブラリ。

`bookmark-curator` と `article-to-slides-automation` の両方が利用する。
要約・ジョブ管理・Drive/Slides 連携など各アプリ固有のロジックは含まない(抽出層のみ)。

## API

```ts
import { extractContent, detectSourceType } from "@local/content-extractor";

const content = await extractContent(
  { url: "https://arxiv.org/abs/2404.01234" },
  { assetsDir: "./data", youtubeApiKey: process.env.YOUTUBE_API_KEY }
);
```

### `extractContent(input, options?)`

| 引数 | 説明 |
|---|---|
| `input.url` | 取得対象 URL(必須) |
| `input.sourceType?` | 種別を明示指定(省略時は `detectSourceType` で自動判定) |
| `input.hints?` | 呼び出し元が持つ補助情報 `{ title, excerpt, tags }`(フォールバック用) |
| `input.assetKey?` | DL 資産のファイル命名キー(省略時は URL ハッシュ) |

### `ExtractorOptions`(依存注入)

| オプション | 未指定時の挙動 |
|---|---|
| `assetsDir` | **資産DLをスキップ**(arxiv/pdf の PDF・X の画像を保存しない=テキストのみ) |
| `youtubeApiKey` | 字幕のみ取得、動画メタデータは空 |
| `x.sessionStatePath` | X は取得失敗→ `hints.excerpt` にフォールバック |
| `http.{timeoutMs,userAgent}` | 既定 15s / 既定 UA |
| `fetchReferences` | 既定 true(Web記事の外部リンク抽出) |
| `logger` | no-op |

`assetsDir` の有無だけで「フル機能(資産DLあり)」と「テキストのみ(副作用なし)」を切り替えられる。

## Web記事のReader向け本文

Web記事の`markdown`は、ReadabilityのHTMLから見出し、段落、リスト、引用、コード、区切り線を保持した安全なMarkdownサブセットへ変換する。HTML構造が得られない場合は、原文の語句と順番を維持したまま句点境界で段落を補う。

使用した変換方式は`metadata.readerFormatMethod`、形式世代は`metadata.readerFormatVersion`に入り、現在の構造化形式はversion 2である。

## ビルド

```bash
npm install
npm run build      # tsup で ESM + CJS dual build
npm test           # vitest
npm run typecheck
```

`playwright` は optional peer dependency。X投稿の取得を使う場合のみ必要。
