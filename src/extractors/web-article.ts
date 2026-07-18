import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import type { ExtractInput, ExtractedContent, ExtractorOptions } from "../types.js";
import { fetchText } from "../utils/http.js";
import { getLogger } from "../utils/options.js";
import {
  discoverNextUrl,
  normalizeDomain,
  orderPatternIds,
  stripHash,
  type PaginationPatternId
} from "../utils/pagination.js";

const DEFAULT_MAX_PAGES = 20;
const DEFAULT_PAGE_DELAY_MS = 500;

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

type ParsedArticlePage = {
  title?: string;
  text: string;
  siteName?: string;
  byline?: string;
  publishedTime?: string;
};

function parseArticlePage(html: string, url: string): ParsedArticlePage {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  return {
    title: article?.title ?? undefined,
    text: article?.textContent?.trim() ?? "",
    siteName: article?.siteName ?? undefined,
    byline: article?.byline ?? undefined,
    publishedTime: article?.publishedTime ?? undefined
  };
}

/** 2ページ目以降の冒頭に繰り返されるタイトル/1ページ目の先頭行を落とす。 */
function stripRepeatedLead(text: string, firstPage: ParsedArticlePage): string {
  const leads = [firstPage.title, firstPage.text.split("\n")[0]]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  // 「タイトル（2/2 ページ）」のようにページ表記が付いた繰り返しも落とす。
  // 本文が1行に連結されるケースを誤削除しないよう、見出し相当の長さの行に限る
  const isRepeatedLead = (line: string) =>
    leads.some((lead) => line === lead || (line.startsWith(lead) && line.length <= lead.length + 20));
  const lines = text.split("\n");
  let start = 0;
  while (start < Math.min(lines.length, 2) && isRepeatedLead(lines[start].trim())) {
    start += 1;
  }
  return lines.slice(start).join("\n").trim();
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export async function fetchWebArticle(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const loadPage = options.fetchPage ?? ((url: string) => fetchText(url, options.http));
  const log = getLogger(options);

  const firstHtml = await loadPage(input.url);
  const firstPage = parseArticlePage(firstHtml, input.url);

  const bodies = [firstPage.text];
  let pagesFetched = 1;

  const pagination = options.pagination;
  if (pagination && firstPage.text) {
    const maxPages = Math.max(1, pagination.maxPages ?? DEFAULT_MAX_PAGES);
    const pageDelayMs = pagination.pageDelayMs ?? DEFAULT_PAGE_DELAY_MS;
    const domain = normalizeDomain(input.url);
    const patternIds = orderPatternIds(domain, pagination.domainRules);
    const visited = new Set([stripHash(input.url)]);
    let currentUrl = input.url;
    let currentHtml = firstHtml;
    let successPattern: PaginationPatternId | undefined;

    while (pagesFetched < maxPages) {
      const next = discoverNextUrl(currentHtml, currentUrl, input.url, patternIds);
      if (!next || visited.has(next.url)) break;
      visited.add(next.url);

      await sleep(pageDelayMs);
      let nextHtml: string;
      try {
        nextHtml = await loadPage(next.url);
      } catch (error) {
        // ページ単位の失敗は全体失敗にせず、取得済みページまでで打ち切る
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`次ページ取得に失敗したため${pagesFetched}ページで打ち切り: ${next.url} (${message})`);
        break;
      }

      const page = parseArticlePage(nextHtml, next.url);
      const text = stripRepeatedLead(page.text, firstPage);
      if (!text) break;

      bodies.push(text);
      pagesFetched += 1;
      currentUrl = next.url;
      currentHtml = nextHtml;
      successPattern = next.patternId;
    }

    if (pagesFetched > 1 && successPattern) {
      log.info(`複数ページ記事を統合: ${pagesFetched}ページ (pattern=${successPattern})`);
      pagination.onPatternSuccess?.(domain, successPattern);
    }
  }

  const title = firstPage.title ?? input.hints?.title ?? input.url;
  const text = bodies.join("\n\n---\n\n").trim() || (input.hints?.excerpt ?? "");
  const references =
    options.fetchReferences === false ? [] : extractReferenceUrls(firstHtml, input.url);

  return {
    url: input.url,
    sourceType: "web-article",
    title,
    markdown: text,
    references,
    assets: [],
    metadata: {
      siteName: firstPage.siteName ?? hostnameOf(input.url),
      author: firstPage.byline,
      publishedAt: firstPage.publishedTime,
      ...(pagesFetched > 1 ? { pagesFetched } : {})
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
