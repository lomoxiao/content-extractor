import { describe, it, expect, vi } from "vitest";
import { extractReferenceUrls, fetchWebArticle } from "../src/extractors/web-article.js";

const SAMPLE_HTML = `<!DOCTYPE html><html><body>
  <p>Article content here.</p>
  <a href="https://other.com/ref1">Reference 1</a>
  <a href="https://other.com/ref2">Reference 2</a>
  <a href="https://example.com/same-domain">Same domain</a>
  <a href="#section">Fragment</a>
  <a href="https://other.com/ref1">Duplicate</a>
</body></html>`;

describe("extractReferenceUrls", () => {
  it("外部ドメインの URL を抽出する", () => {
    const urls = extractReferenceUrls(SAMPLE_HTML, "https://example.com/article");
    expect(urls).toContain("https://other.com/ref1");
    expect(urls).toContain("https://other.com/ref2");
  });

  it("同一ドメインと断片リンクを除外する", () => {
    const urls = extractReferenceUrls(SAMPLE_HTML, "https://example.com/article");
    expect(urls).not.toContain("https://example.com/same-domain");
    expect(urls.some((u) => u.includes("#"))).toBe(false);
  });

  it("重複 URL を除去する", () => {
    const urls = extractReferenceUrls(SAMPLE_HTML, "https://example.com/article");
    const count = urls.filter((u) => u === "https://other.com/ref1").length;
    expect(count).toBe(1);
  });

  it("HTML にリンクがない場合は空配列を返す", () => {
    const urls = extractReferenceUrls("<html><body><p>No links</p></body></html>", "https://example.com");
    expect(urls).toEqual([]);
  });
});

// Readability が本文と認識するよう十分な長さの段落を作る
function longParagraphs(marker: string): string {
  return Array.from({ length: 6 }, (_, i) => `<p>${marker} 段落${i + 1}。これは複数ページ記事のテスト本文です。十分な文字数を確保するために同じ趣旨の文章を繰り返し記述しています。</p>`).join("");
}

function articlePage(marker: string, nextLink = ""): string {
  return `<!DOCTYPE html><html><head><title>テスト記事</title></head><body><article><h1>テスト記事</h1>${longParagraphs(marker)}${nextLink}</article></body></html>`;
}

describe("fetchWebArticle (複数ページ巡回)", () => {
  const BASE = "https://example.com/articles/foo";

  it("rel=next を辿って全ページを統合し pagesFetched を記録する", async () => {
    const pages: Record<string, string> = {
      [BASE]: articlePage("PAGE1", `<a rel="next" href="${BASE}?page=2">次</a>`),
      [`${BASE}?page=2`]: articlePage("PAGE2", `<a rel="next" href="${BASE}?page=3">次</a>`),
      [`${BASE}?page=3`]: articlePage("PAGE3")
    };
    const fetchPage = vi.fn(async (url: string) => {
      if (!pages[url]) throw new Error(`unexpected fetch: ${url}`);
      return pages[url];
    });
    const onPatternSuccess = vi.fn();

    const content = await fetchWebArticle(
      { url: BASE },
      { fetchPage, pagination: { pageDelayMs: 0, onPatternSuccess } }
    );

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(content.markdown).toContain("PAGE1");
    expect(content.markdown).toContain("PAGE2");
    expect(content.markdown).toContain("PAGE3");
    expect(content.metadata.pagesFetched).toBe(3);
    expect(onPatternSuccess).toHaveBeenCalledWith("example.com", "rel-next-anchor");
  });

  it("循環リンクは visited で停止する", async () => {
    const pages: Record<string, string> = {
      [BASE]: articlePage("PAGE1", `<a rel="next" href="${BASE}?page=2">次</a>`),
      [`${BASE}?page=2`]: articlePage("PAGE2", `<a rel="next" href="${BASE}">戻る</a>`)
    };
    const content = await fetchWebArticle(
      { url: BASE },
      { fetchPage: async (url) => pages[url], pagination: { pageDelayMs: 0 } }
    );
    expect(content.metadata.pagesFetched).toBe(2);
  });

  it("maxPages で打ち切る", async () => {
    const fetchPage = async (url: string) => {
      const n = Number(new URL(url).searchParams.get("page") ?? "1");
      return articlePage(`PAGE${n}`, `<a rel="next" href="${BASE}?page=${n + 1}">次</a>`);
    };
    const content = await fetchWebArticle(
      { url: BASE },
      { fetchPage, pagination: { pageDelayMs: 0, maxPages: 4 } }
    );
    expect(content.metadata.pagesFetched).toBe(4);
  });

  it("途中ページの取得失敗は取得済みページまでで成功として返す", async () => {
    const pages: Record<string, string> = {
      [BASE]: articlePage("PAGE1", `<a rel="next" href="${BASE}?page=2">次</a>`),
      [`${BASE}?page=2`]: articlePage("PAGE2", `<a rel="next" href="${BASE}?page=3">次</a>`)
    };
    const fetchPage = async (url: string) => {
      if (!pages[url]) throw new Error("HTTP 500");
      return pages[url];
    };
    const content = await fetchWebArticle(
      { url: BASE },
      { fetchPage, pagination: { pageDelayMs: 0 } }
    );
    expect(content.metadata.pagesFetched).toBe(2);
    expect(content.markdown).toContain("PAGE2");
  });

  it("pagination 未指定なら1ページのみ取得する(従来動作)", async () => {
    const fetchPage = vi.fn(async () =>
      articlePage("PAGE1", `<a rel="next" href="${BASE}?page=2">次</a>`)
    );
    const content = await fetchWebArticle({ url: BASE }, { fetchPage });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(content.metadata.pagesFetched).toBeUndefined();
  });
});
