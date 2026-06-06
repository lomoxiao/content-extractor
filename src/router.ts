import type { ExtractInput, ExtractedContent, ExtractorOptions } from "./types.js";
import { detectSourceType } from "./source-detector.js";
import { fetchWebArticle } from "./extractors/web-article.js";
import { fetchArxivPaper } from "./extractors/arxiv-paper.js";
import { fetchXPost } from "./extractors/x-post.js";
import { fetchYoutubeVideo } from "./extractors/youtube-video.js";
import { fetchPdfDocument } from "./extractors/pdf-document.js";

export async function routeExtraction(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const sourceType = input.sourceType ?? detectSourceType(input.url, input.hints?.tags);
  const resolved: ExtractInput = { ...input, sourceType };

  switch (sourceType) {
    case "arxiv":
      return fetchArxivPaper(resolved, options);
    case "x-post":
      return fetchXPost(resolved, options);
    case "youtube":
      return fetchYoutubeVideo(resolved, options);
    case "pdf-document":
      return fetchPdfDocument(resolved, options);
    case "web-article":
    default:
      return fetchWebArticle(resolved, options);
  }
}
