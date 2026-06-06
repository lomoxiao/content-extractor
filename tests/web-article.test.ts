import { describe, it, expect } from "vitest";
import { extractReferenceUrls } from "../src/extractors/web-article.js";

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
