import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import type { ExtractInput, ExtractedContent, ExtractorOptions } from "../types.js";
import { fetchText } from "../utils/http.js";

export function extractReferenceUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;
  const seen = new Set<string>();
  const result: string[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const url = new URL(href, baseUrl);
      if (url.origin === origin || !url.href.startsWith("http")) return;
      const normalized = url.href.split("#")[0];
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    } catch {
      // 無効な URL はスキップ
    }
  });

  return result;
}

export async function fetchWebArticle(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const html = await fetchText(input.url, options.http);
  const dom = new JSDOM(html, { url: input.url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const title = article?.title ?? input.hints?.title ?? input.url;
  const text = article?.textContent?.trim() ?? input.hints?.excerpt ?? "";
  const references =
    options.fetchReferences === false ? [] : extractReferenceUrls(html, input.url);

  return {
    url: input.url,
    sourceType: "web-article",
    title,
    markdown: text,
    references,
    assets: [],
    metadata: {
      siteName: article?.siteName ?? hostnameOf(input.url),
      author: article?.byline ?? undefined,
      publishedAt: article?.publishedTime ?? undefined
    }
  };
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
