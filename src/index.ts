import type { ExtractInput, ExtractedContent, ExtractorOptions } from "./types.js";
import { routeExtraction } from "./router.js";

/**
 * URL からソース種別を判定し、種別別の抽出器で本文・メタデータ・参照・資産を取得する。
 *
 * @param input  取得対象(url 必須、sourceType/hints/assetKey は任意)
 * @param options 外部依存の注入(assetsDir/youtubeApiKey/x/http/fetchReferences/logger)
 */
export async function extractContent(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  return routeExtraction(input, options);
}

export { detectSourceType } from "./source-detector.js";
export { extractReferenceUrls } from "./extractors/web-article.js";
export {
  DEFAULT_SESSIONS_DIR,
  SessionExpiredError,
  normalizeDomain,
  resolveSessionPath
} from "./utils/playwright-session.js";

export type {
  SourceType,
  ExtractInput,
  ExtractInputHints,
  ExtractedContent,
  ExtractedAsset,
  ExtractedMetadata,
  ExtractorOptions,
  ExtractorLogger
} from "./types.js";
