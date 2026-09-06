import { describe, expect, it } from "vitest";
import {
  createArticleMarkdown,
  htmlToReaderMarkdown,
  reflowFlatArticleText
} from "../src/utils/article-markdown.js";

describe("htmlToReaderMarkdown", () => {
  it("段落・見出し・リスト・引用・コードを順序どおり保持する", () => {
    const markdown = htmlToReaderMarkdown(
      "<article><h2>概要</h2><p>最初の段落です。<br>改行も残します。</p>" +
      "<ul><li>項目A</li><li>項目B</li></ul>" +
      "<blockquote><p>引用文です。</p></blockquote>" +
      "<pre><code>const value = 1;</code></pre></article>"
    );

    expect(markdown).toBe(
      "## 概要\n\n最初の段落です。\n改行も残します。\n\n" +
      "- 項目A\n- 項目B\n\n> 引用文です。\n\n```\nconst value = 1;\n```"
    );
  });

  it("実行可能HTMLを除去し、本文文字列だけを返す", () => {
    const markdown = htmlToReaderMarkdown(
      "<p>安全な本文<script>alert(\"xss\")</script><img src=x onerror=alert(1)></p>" +
      "<iframe src=\"x\"></iframe>"
    );

    expect(markdown).toBe("安全な本文");
    expect(markdown).not.toContain("script");
    expect(markdown).not.toContain("onerror");
  });

  it("引用要素内の中黒列挙を箇条書きとして復元する", () => {
    const markdown = htmlToReaderMarkdown(
      "<blockquote><p>・項目A<br>・項目B<br>・項目C</p></blockquote>"
    );

    expect(markdown).toBe("- 項目A\n- 項目B\n- 項目C");
  });

  it("入れ子リストの本文も欠落させず平坦化する", () => {
    const markdown = htmlToReaderMarkdown(
      "<ul><li>親A<ul><li>子A-1</li><li>子A-2</li></ul></li><li>親B</li></ul>"
    );

    expect(markdown).toBe("- 親A\n- 子A-1\n- 子A-2\n- 親B");
  });

  it("空白を除けば元の表示テキストと同じ内容・順序を保つ", () => {
    const markdown = htmlToReaderMarkdown(
      "<h2>見出し</h2><p>文章A。<strong>強調B</strong>。</p>" +
      "<ol><li>一番</li><li>二番</li></ol>"
    );
    const visible = markdown.replace(/^(?:#{1,6}|[-*+]|\d+[.)]|>)\s*/gm, "");

    expect(visible.replace(/\s/g, "")).toBe("見出し文章A。強調B。一番二番");
  });
});

describe("reflowFlatArticleText", () => {
  it("長い1行本文を句点単位で複数段落へ分け、文字内容は変えない", () => {
    const source = Array.from(
      { length: 60 },
      (_, index) => "これは" + String(index + 1) + "番目の文章です。"
    ).join("");
    const markdown = reflowFlatArticleText(source);

    expect(markdown.split(/\n{2,}/).length).toBeGreaterThan(1);
    expect(markdown.replace(/\s/g, "")).toBe(source);
  });

  it("短い番号見出しと箇条書きをMarkdown構造へ変換する", () => {
    const markdown = reflowFlatArticleText(
      "1. はじめに\n本文です。\n・重要事項\n第2章 詳細"
    );

    expect(markdown).toContain("## 1. はじめに");
    expect(markdown).toContain("- 重要事項");
    expect(markdown).toContain("## 第2章 詳細");
  });
});

describe("createArticleMarkdown", () => {
  it("十分なHTML構造があればReadability HTMLを優先する", () => {
    const result = createArticleMarkdown(
      "<p>段落1です。</p><p>段落2です。</p>",
      "段落1です。段落2です。"
    );
    expect(result.method).toBe("readability_html");
    expect(result.markdown).toBe("段落1です。\n\n段落2です。");
  });

  it("構造のないHTMLでは平文再段落化へフォールバックする", () => {
    const plain = "長い本文です。".repeat(100);
    const result = createArticleMarkdown("<span>" + plain + "</span>", plain);
    expect(result.method).toBe("sentence_reflow");
    expect(result.markdown.split(/\n{2,}/).length).toBeGreaterThan(1);
  });
});
