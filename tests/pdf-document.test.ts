import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { fetchPdfDocument } from "../src/extractors/pdf-document.js";
import { fetchArxivPaper } from "../src/extractors/arxiv-paper.js";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

vi.mock("unpdf", () => ({
  getDocumentProxy: vi.fn(async () => ({})),
  extractText: vi.fn(async () => ({ totalPages: 1, text: "抽出された本文テキスト" }))
}));

const PDF_RESPONSE = {
  data: new TextEncoder().encode("%PDF-1.4 dummy").buffer,
  headers: { "content-type": "application/pdf" }
};

const SAMPLE_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Sample Paper</title>
    <summary>Sample abstract.</summary>
    <published>2026-01-01T00:00:00Z</published>
    <author><name>Alice</name></author>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

describe("fetchPdfDocument (テキストのみモード)", () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it("本文テキストを markdown の ## 本文 に含める", async () => {
    mockedAxios.get.mockResolvedValue(PDF_RESPONSE);
    const result = await fetchPdfDocument({ url: "https://example.com/paper.pdf" });

    expect(result.markdown).toContain("## 本文");
    expect(result.markdown).toContain("抽出された本文テキスト");
    expect(result.metadata.pdfTextExtracted).toBe(true);
    expect(result.assets).toEqual([]);
  });

  it("DL 失敗時はメタデータのみで続行する(throw しない)", async () => {
    mockedAxios.get.mockRejectedValue(new Error("network down"));
    const result = await fetchPdfDocument({ url: "https://example.com/paper.pdf" });

    expect(result.title).toBe("paper.pdf");
    expect(result.markdown).not.toContain("## 本文");
    expect(result.metadata.pdfTextExtracted).toBe(false);
  });

  it("PDF でないコンテンツタイプは本文なしで続行する", async () => {
    mockedAxios.get.mockResolvedValue({
      data: new ArrayBuffer(8),
      headers: { "content-type": "text/html" }
    });
    const result = await fetchPdfDocument({ url: "https://example.com/paper.pdf" });

    expect(result.markdown).not.toContain("## 本文");
  });
});

describe("fetchArxivPaper (テキストのみモード)", () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it("Abstract の後に ## 本文 を追加する", async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: SAMPLE_ATOM_XML })
      .mockResolvedValueOnce(PDF_RESPONSE);
    const result = await fetchArxivPaper({ url: "https://arxiv.org/abs/2404.01234" });

    expect(result.markdown).toContain("## Abstract");
    expect(result.markdown.indexOf("## 本文")).toBeGreaterThan(
      result.markdown.indexOf("## Abstract")
    );
    expect(result.markdown).toContain("抽出された本文テキスト");
    expect(result.metadata.pdfTextExtracted).toBe(true);
  });

  it("PDF DL 失敗でもメタデータ+Abstract を返す", async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: SAMPLE_ATOM_XML })
      .mockRejectedValueOnce(new Error("network down"));
    const result = await fetchArxivPaper({ url: "https://arxiv.org/abs/2404.01234" });

    expect(result.title).toBe("Sample Paper");
    expect(result.markdown).toContain("Sample abstract.");
    expect(result.markdown).not.toContain("## 本文");
    expect(result.metadata.pdfTextExtracted).toBe(false);
  });
});
