import { describe, it, expect } from "vitest";
import {
  PAGINATION_PATTERN_IDS,
  discoverNextUrl,
  normalizeDomain,
  orderPatternIds
} from "../src/utils/pagination.js";

const BASE = "https://example.com/articles/foo";

function page(links: string): string {
  return `<!DOCTYPE html><html><head></head><body><p>本文</p>${links}</body></html>`;
}

describe("normalizeDomain", () => {
  it("小文字化して www. を除去する", () => {
    expect(normalizeDomain("https://WWW.Example.COM/a")).toBe("example.com");
    expect(normalizeDomain("not a url")).toBe("");
  });
});

describe("orderPatternIds", () => {
  it("学習済みパターンを先頭に並べ替える", () => {
    const ordered = orderPatternIds("example.com", { "example.com": ["query-page", "next-text"] });
    expect(ordered.slice(0, 2)).toEqual(["query-page", "next-text"]);
    expect(ordered).toHaveLength(PAGINATION_PATTERN_IDS.length);
  });

  it("不明なidは無視し、学習なしなら既定順を返す", () => {
    expect(orderPatternIds("example.com", { "example.com": ["bogus"] })).toEqual(PAGINATION_PATTERN_IDS);
    expect(orderPatternIds("example.com", undefined)).toEqual(PAGINATION_PATTERN_IDS);
  });
});

describe("discoverNextUrl", () => {
  it("link[rel=next] を検出する", () => {
    const html = `<html><head><link rel="next" href="${BASE}?page=2"></head><body></body></html>`;
    const next = discoverNextUrl(html, BASE, BASE, PAGINATION_PATTERN_IDS);
    expect(next).toEqual({ url: `${BASE}?page=2`, patternId: "rel-next-link" });
  });

  it("a[rel=next] と「次のページ」テキストを検出する", () => {
    const relNext = page(`<a rel="next" href="${BASE}/2">2</a>`);
    expect(discoverNextUrl(relNext, BASE, BASE, PAGINATION_PATTERN_IDS)?.patternId).toBe("rel-next-anchor");

    const nextText = page(`<a href="${BASE}?page=2">次のページ</a>`);
    expect(discoverNextUrl(nextText, BASE, BASE, PAGINATION_PATTERN_IDS)?.patternId).toBe("next-text");
  });

  it("query-page: DOM上に実在する page=N+1 リンクだけ採用する", () => {
    const html = page(`<a href="${BASE}?page=3">3</a><a href="${BASE}?page=2">2</a>`);
    const next = discoverNextUrl(html, BASE, BASE, ["query-page"]);
    expect(next?.url).toBe(`${BASE}?page=2`);

    // 現在が page=2 のときは page=3 を選ぶ
    const fromPage2 = discoverNextUrl(html, `${BASE}?page=2`, BASE, ["query-page"]);
    expect(fromPage2?.url).toBe(`${BASE}?page=3`);
  });

  it("path-page: /2 形式と /page/2 形式を検出する", () => {
    const slash = page(`<a href="${BASE}/2">2</a>`);
    expect(discoverNextUrl(slash, BASE, BASE, ["path-page"])?.url).toBe(`${BASE}/2`);

    const paged = page(`<a href="${BASE}/page/2">2</a>`);
    expect(discoverNextUrl(paged, BASE, BASE, ["path-page"])?.url).toBe(`${BASE}/page/2`);

    // 2ページ目からは3ページ目のみ
    const from2 = page(`<a href="${BASE}/page/3">3</a><a href="${BASE}/page/1">1</a>`);
    expect(discoverNextUrl(from2, `${BASE}/page/2`, BASE, ["path-page"])?.url).toBe(`${BASE}/page/3`);
  });

  it("view-all: 全文表示リンクを最優先で検出する", () => {
    const html = page(`<a href="${BASE}?page=2">次のページ</a><a href="${BASE}?view=all">全文表示</a>`);
    const next = discoverNextUrl(html, BASE, BASE, PAGINATION_PATTERN_IDS);
    expect(next).toEqual({ url: `${BASE}?view=all`, patternId: "view-all" });
  });

  it("ガード: 別オリジン・現在URL・pathプレフィックス外を除外する", () => {
    const crossOrigin = page(`<a rel="next" href="https://other.com/articles/foo/2">next</a>`);
    expect(discoverNextUrl(crossOrigin, BASE, BASE, PAGINATION_PATTERN_IDS)).toBeUndefined();

    const self = page(`<a href="${BASE}">次のページ</a>`);
    expect(discoverNextUrl(self, BASE, BASE, PAGINATION_PATTERN_IDS)).toBeUndefined();

    // サイト内ナビの「次へ」(記事pathと無関係)は拾わない
    const nav = page(`<a href="https://example.com/ranking?page=2">次へ</a>`);
    expect(discoverNextUrl(nav, BASE, BASE, PAGINATION_PATTERN_IDS)).toBeUndefined();
  });

  it("拡張子付きパスの _2.html 形式もプレフィックスガードを通す", () => {
    const first = "https://example.com/news/articles/2607/18/news123.html";
    const html = page(`<a href="https://example.com/news/articles/2607/18/news123_2.html">次のページ</a>`);
    const next = discoverNextUrl(html, first, first, PAGINATION_PATTERN_IDS);
    expect(next?.url).toBe("https://example.com/news/articles/2607/18/news123_2.html");
    expect(next?.patternId).toBe("next-text");
  });

  it("学習順が既定順より優先される", () => {
    const html = page(
      `<a rel="next" href="${BASE}/page/2">rel</a><a href="${BASE}?page=2">次のページ</a>`
    );
    const learned = orderPatternIds("example.com", { "example.com": ["next-text"] });
    expect(discoverNextUrl(html, BASE, BASE, learned)?.patternId).toBe("next-text");
  });
});
