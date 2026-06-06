import type { ExtractInput, ExtractedContent, ExtractorOptions } from "../types.js";
import { fetchXPostWithPlaywright } from "./x-playwright.js";
import { getLogger } from "../utils/options.js";

export async function fetchXPost(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  try {
    return await fetchXPostWithPlaywright(input, options);
  } catch (err) {
    getLogger(options).warn(
      `Playwright 失敗、excerpt にフォールバック: ${(err as Error).message}`
    );
    return {
      url: input.url,
      sourceType: "x-post",
      title: input.hints?.title ?? input.url,
      markdown: input.hints?.excerpt || "(X 投稿のテキストを取得できませんでした)",
      references: [],
      assets: [],
      metadata: { playwrightError: (err as Error).message }
    };
  }
}
