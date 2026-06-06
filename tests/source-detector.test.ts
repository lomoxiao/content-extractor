import { describe, it, expect, test } from "vitest";
import { detectSourceType } from "../src/source-detector.js";

describe("detectSourceType", () => {
  describe("URL ベース判定", () => {
    const cases: [string, string][] = [
      ["https://arxiv.org/abs/2404.01234", "arxiv"],
      ["https://arxiv.org/pdf/2404.01234.pdf", "arxiv"],
      ["https://twitter.com/user/status/123", "x-post"],
      ["https://x.com/user/status/123", "x-post"],
      ["https://www.youtube.com/watch?v=abc123", "youtube"],
      ["https://youtu.be/abc123", "youtube"],
      ["https://example.com/article/foo-bar", "web-article"],
      ["https://github.com/anthropics/claude", "web-article"]
    ];
    test.each(cases)("%s → %s", (url, expected) => {
      expect(detectSourceType(url)).toBe(expected);
    });
  });

  describe("PDF URL 判定", () => {
    const cases: [string][] = [
      ["https://example.com/report.pdf"],
      ["https://proceedings.example.org/papers/2026/paper123.pdf"],
      ["https://docs.example.com/white-paper_v2.pdf"]
    ];
    test.each(cases)("%s → pdf-document", (url) => {
      expect(detectSourceType(url)).toBe("pdf-document");
    });

    it("クエリ文字列付き PDF URL もパス判定する", () => {
      expect(detectSourceType("https://example.com/doc.pdf?v=2")).toBe("pdf-document");
    });

    it("arxiv.org の PDF は arxiv を返す(arxiv が優先)", () => {
      expect(detectSourceType("https://arxiv.org/pdf/2404.01234.pdf")).toBe("arxiv");
    });
  });

  describe("タグによる上書き", () => {
    it("pdf タグがある場合は pdf-document を返す", () => {
      expect(detectSourceType("https://example.com/page", ["pdf"])).toBe("pdf-document");
    });

    it("arxiv タグがある場合は arxiv を返す", () => {
      expect(detectSourceType("https://example.com/paper", ["arxiv"])).toBe("arxiv");
    });

    it("URL 判定の方がタグより優先される", () => {
      expect(detectSourceType("https://arxiv.org/abs/1234", ["web"])).toBe("arxiv");
    });
  });
});
