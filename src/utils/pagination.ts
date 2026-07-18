import * as cheerio from "cheerio";

export type PaginationPatternId =
  | "view-all"
  | "rel-next-link"
  | "rel-next-anchor"
  | "next-text"
  | "query-page"
  | "path-page";

/** 既定の試行順。domainRules の学習結果があればその順を先頭に並べ替える。 */
export const PAGINATION_PATTERN_IDS: PaginationPatternId[] = [
  "view-all",
  "rel-next-link",
  "rel-next-anchor",
  "next-text",
  "query-page",
  "path-page"
];

export type NextPageCandidate = {
  url: string;
  patternId: PaginationPatternId;
};

const VIEW_ALL_TEXT = /全文表示|すべて表示|1ページで(表示|読む)|view\s*all/i;
const NEXT_TEXT = /^(次のページへ?|次へ|次ページ|next(\s*page)?|»|›)$/i;
const PAGE_QUERY_KEYS = ["page", "p", "paged"];

export function normalizeDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function orderPatternIds(
  domain: string,
  domainRules?: Record<string, string[]>
): PaginationPatternId[] {
  const learned = (domainRules?.[domain] ?? []).filter(isPatternId);
  const rest = PAGINATION_PATTERN_IDS.filter((id) => !learned.includes(id));
  return [...learned, ...rest];
}

function isPatternId(value: string): value is PaginationPatternId {
  return (PAGINATION_PATTERN_IDS as string[]).includes(value);
}

/**
 * 現在ページのHTMLから「次のページ」URLを探す。
 * 誤巡回防止のガード: 同一オリジン限定 / 現在URLと同一は除外 /
 * DOM上にリンクが実在するものだけ採用(page=N+1 の盲目的生成はしない) /
 * テキスト系パターンは記事1ページ目とのpathプレフィックス共有を要求
 * (サイト内ナビやコメント欄ページネーションの誤検出対策)。
 */
export function discoverNextUrl(
  html: string,
  currentUrl: string,
  firstPageUrl: string,
  patternIds: PaginationPatternId[]
): NextPageCandidate | undefined {
  let current: URL;
  let first: URL;
  try {
    current = new URL(currentUrl);
    first = new URL(firstPageUrl);
  } catch {
    return undefined;
  }

  const $ = cheerio.load(html);
  // 拡張子は除いてプレフィックス比較する(例: news123.html -> news123_2.html 形式を許容)
  const basePathPrefix = first.pathname
    .replace(/\/page\/\d+\/?$/, "")
    .replace(/\/$/, "")
    .replace(/\.[a-z0-9]+$/i, "");

  const resolve = (href: string | undefined): URL | undefined => {
    if (!href) return undefined;
    try {
      const url = new URL(href, currentUrl);
      url.hash = "";
      return url;
    } catch {
      return undefined;
    }
  };

  const passesGuard = (url: URL | undefined, requirePathPrefix: boolean): url is URL => {
    if (!url) return false;
    if (url.origin !== first.origin) return false;
    if (url.toString() === stripHash(currentUrl)) return false;
    if (requirePathPrefix && basePathPrefix && !url.pathname.startsWith(basePathPrefix)) return false;
    return true;
  };

  const anchors = $("a[href]").toArray();

  const finders: Record<PaginationPatternId, () => URL | undefined> = {
    "view-all": () => {
      for (const el of anchors) {
        const text = $(el).text().trim();
        if (!VIEW_ALL_TEXT.test(text)) continue;
        const url = resolve($(el).attr("href"));
        if (passesGuard(url, true)) return url;
      }
      return undefined;
    },

    "rel-next-link": () => {
      for (const el of $("link[rel][href]").toArray()) {
        if (!relIncludesNext($(el).attr("rel"))) continue;
        const url = resolve($(el).attr("href"));
        if (passesGuard(url, false)) return url;
      }
      return undefined;
    },

    "rel-next-anchor": () => {
      for (const el of anchors) {
        if (!relIncludesNext($(el).attr("rel"))) continue;
        const url = resolve($(el).attr("href"));
        if (passesGuard(url, false)) return url;
      }
      return undefined;
    },

    "next-text": () => {
      for (const el of anchors) {
        const text = $(el).text().trim();
        if (!NEXT_TEXT.test(text)) continue;
        const url = resolve($(el).attr("href"));
        if (passesGuard(url, true)) return url;
      }
      return undefined;
    },

    "query-page": () => {
      for (const key of PAGE_QUERY_KEYS) {
        const currentPage = parsePositiveInt(current.searchParams.get(key)) ?? 1;
        for (const el of anchors) {
          const url = resolve($(el).attr("href"));
          if (!passesGuard(url, true)) continue;
          if (url.pathname !== current.pathname) continue;
          if (parsePositiveInt(url.searchParams.get(key)) !== currentPage + 1) continue;
          return url;
        }
      }
      return undefined;
    },

    "path-page": () => {
      const match = current.pathname.match(/^(.*?)(?:\/page\/(\d+)|\/(\d+))\/?$/);
      const base = match ? match[1] : current.pathname.replace(/\/$/, "");
      const currentPage = match ? parsePositiveInt(match[2] ?? match[3]) ?? 1 : 1;
      const expected = new Set([
        `${base}/page/${currentPage + 1}`,
        `${base}/${currentPage + 1}`
      ]);
      for (const el of anchors) {
        const url = resolve($(el).attr("href"));
        if (!passesGuard(url, true)) continue;
        if (expected.has(url.pathname.replace(/\/$/, ""))) return url;
      }
      return undefined;
    }
  };

  for (const patternId of patternIds) {
    const url = finders[patternId]();
    if (url) return { url: url.toString(), patternId };
  }
  return undefined;
}

export function stripHash(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function relIncludesNext(rel: string | undefined): boolean {
  return Boolean(rel && rel.toLowerCase().split(/\s+/).includes("next"));
}

function parsePositiveInt(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : undefined;
}
