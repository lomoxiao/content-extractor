import { describe, it, expect, vi, beforeEach, test } from "vitest";
import axios from "axios";
import { extractArxivId, fetchArxivMetadata } from "../src/extractors/arxiv-paper.js";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

const SAMPLE_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query: id_list=2404.01234</title>
  <entry>
    <title>Attention Is All You Need</title>
    <summary>The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.</summary>
    <published>2017-06-12T00:00:00Z</published>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

describe("extractArxivId", () => {
  const cases: [string, string][] = [
    ["https://arxiv.org/abs/2404.01234", "2404.01234"],
    ["https://arxiv.org/abs/2404.01234v2", "2404.01234v2"],
    ["https://arxiv.org/pdf/2404.01234", "2404.01234"],
    ["https://arxiv.org/pdf/2404.01234.pdf", "2404.01234"]
  ];

  test.each(cases)("%s → %s", (url, expected) => {
    expect(extractArxivId(url)).toBe(expected);
  });

  it("arXiv URL でない場合はエラーを投げる", () => {
    expect(() => extractArxivId("https://example.com")).toThrow();
  });
});

describe("fetchArxivMetadata", () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it("フィードタイトルではなく論文タイトルを返す", async () => {
    mockedAxios.get.mockResolvedValue({ data: SAMPLE_ATOM_XML });
    const meta = await fetchArxivMetadata("2404.01234");

    expect(meta.title).toBe("Attention Is All You Need");
    expect(meta.title).not.toContain("ArXiv Query");
  });

  it("著者・Abstract・カテゴリを正しく抽出する", async () => {
    mockedAxios.get.mockResolvedValue({ data: SAMPLE_ATOM_XML });
    const meta = await fetchArxivMetadata("2404.01234");

    expect(meta.authors).toContain("Ashish Vaswani");
    expect(meta.authors).toContain("Noam Shazeer");
    expect(meta.summary).toContain("sequence transduction");
    expect(meta.categories).toContain("cs.CL");
    expect(meta.published).toBe("2017-06-12");
  });
});
