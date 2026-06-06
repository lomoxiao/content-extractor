export type SourceType =
  | "web-article"
  | "arxiv"
  | "youtube"
  | "x-post"
  | "pdf-document";

/** 呼び出し元が既に持っている補助情報。抽出失敗時のフォールバックや種別判定に使う。 */
export interface ExtractInputHints {
  title?: string;
  excerpt?: string;
  tags?: string[];
}

/** 取得入力(中立)。Raindrop 等のソース固有情報には依存しない。 */
export interface ExtractInput {
  url: string;
  /** 明示指定。省略時は detectSourceType による自動判定。 */
  sourceType?: SourceType;
  hints?: ExtractInputHints;
  /** DL 資産のファイル命名キー。省略時は URL ハッシュ。 */
  assetKey?: string;
}

/** DL した資産(PDF・画像)。assetsDir 未指定時は生成されない。 */
export interface ExtractedAsset {
  kind: "pdf" | "image";
  path: string;
  sourceUrl?: string;
}

export interface ExtractedMetadata {
  author?: string;
  publishedAt?: string;
  siteName?: string;
  [key: string]: unknown;
}

/** 取得出力(中立)。各アプリはこれを自前の型へアダプトする。 */
export interface ExtractedContent {
  url: string;
  sourceType: SourceType;
  title: string;
  /** 種別別に構造化済みの本文(Markdown 寄り)。 */
  markdown: string;
  /** 本文から抽出した外部参照リンク(無ければ空配列)。 */
  references: string[];
  /** DL した資産(無ければ空配列)。 */
  assets: ExtractedAsset[];
  metadata: ExtractedMetadata;
}

export interface ExtractorLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * 抽出器の外部依存を全て注入で受け取るオプション。
 * これにより共有パッケージは各アプリの config に依存しない。
 */
export interface ExtractorOptions {
  /** PDF / 画像の保存先。未指定なら資産 DL をスキップ(= テキストのみモード)。 */
  assetsDir?: string;
  /** YouTube Data API キー。未指定なら字幕のみ取得しメタデータは空。 */
  youtubeApiKey?: string;
  x?: {
    /** Playwright storageState(ログイン済みセッション)の JSON パス。 */
    sessionStatePath?: string;
    headless?: boolean;
    /** chromium channel。既定 'chrome'。 */
    channel?: string;
  };
  http?: {
    timeoutMs?: number;
    userAgent?: string;
  };
  /** Web 記事の外部リンク抽出 ON/OFF。既定 true。 */
  fetchReferences?: boolean;
  logger?: ExtractorLogger;
}
