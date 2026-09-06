import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { Cheerio, CheerioAPI } from "cheerio";

const BLOCK_SELECTOR =
  "h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,pre,hr,figcaption,table";
const REMOVE_SELECTOR =
  "script,style,noscript,template,svg,canvas,iframe,form,button,input,select,textarea";

export type ArticleMarkdownMethod = "readability_html" | "sentence_reflow";

export type ArticleMarkdownResult = {
  markdown: string;
  method: ArticleMarkdownMethod;
};

/**
 * Readabilityの構造化HTMLをReader向けMarkdown subsetへ変換する。
 * HTMLや属性は出力せず、見出し・段落・リスト・引用などのブロック構造だけを保持する。
 */
export function createArticleMarkdown(
  readabilityHtml: string | undefined,
  plainText: string
): ArticleMarkdownResult {
  const structured = readabilityHtml ? htmlToReaderMarkdown(readabilityHtml) : "";
  if (hasUsefulBlockStructure(structured)) {
    return { markdown: structured, method: "readability_html" };
  }
  return {
    markdown: reflowFlatArticleText(plainText || structured),
    method: "sentence_reflow"
  };
}

export function htmlToReaderMarkdown(html: string): string {
  const $ = cheerio.load(html, undefined, false);
  $(REMOVE_SELECTOR).remove();
  const blocks: string[] = [];

  $(BLOCK_SELECTOR).each((_, element) => {
    const node = $(element);
    if (node.parents(BLOCK_SELECTOR).length > 0) return;
    const tag = element.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      const text = textWithBreaks($, node);
      if (text) blocks.push("#".repeat(Number(tag[1])) + " " + singleLine(text));
      return;
    }

    if (tag === "p" || tag === "figcaption") {
      const text = textWithBreaks($, node);
      if (text) blocks.push(text);
      return;
    }

    if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      const items: string[] = [];
      // 入れ子リストも文章を落とさず、Readerでは一段のリストとして読みやすく並べる。
      node.find("li").each((index, item) => {
        const clone = $(item).clone();
        clone.children("ul,ol").remove();
        const text = singleLine(textWithBreaks($, clone));
        if (text) items.push((ordered ? String(index + 1) + "." : "-") + " " + text);
      });
      if (items.length) blocks.push(items.join("\n"));
      return;
    }

    if (tag === "blockquote") {
      const clone = node.clone();
      clone.find("p,div").append("\n");
      const text = textWithBreaks($, clone);
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length && lines.every((line) => /^(?:[-*+・•])\s*/.test(line))) {
        blocks.push(
          lines
            .map((line) => "- " + line.replace(/^(?:[-*+・•])\s*/, "").trim())
            .join("\n")
        );
      } else if (lines.length) {
        blocks.push(lines.map((line) => "> " + line).join("\n"));
      }
      return;
    }

    if (tag === "pre") {
      const text = normalizeText(node.text(), { preserveNewlines: true });
      if (text) blocks.push("```\n" + text + "\n```");
      return;
    }

    if (tag === "hr") {
      blocks.push("---");
      return;
    }

    if (tag === "table") {
      const rows: string[] = [];
      node.find("tr").each((_, row) => {
        const cells = $(row)
          .children("th,td")
          .map((_, cell) => singleLine(textWithBreaks($, $(cell))))
          .get()
          .filter(Boolean);
        if (cells.length) rows.push(cells.join(" ｜ "));
      });
      if (rows.length) blocks.push(rows.join("\n"));
    }
  });

  return normalizeMarkdown(blocks.join("\n\n"));
}

/**
 * 構造が取れない平文だけを対象に、文字を言い換えず段落境界を追加する。
 * 既存の空行・短い見出し・箇条書きは優先して保持する。
 */
export function reflowFlatArticleText(text: string): string {
  const normalized = normalizeText(text, { preserveNewlines: true });
  if (!normalized) return "";

  const sourceBlocks = normalized
    .split(/\n{2,}/)
    .flatMap((block) => block.split("\n").map((line) => line.trim()).filter(Boolean));
  const output: string[] = [];

  for (const line of sourceBlocks) {
    if (isHeadingLike(line)) {
      output.push("## " + line.replace(/^#{1,6}\s+/, ""));
      continue;
    }
    if (/^(?:[-*+・•]|※)\s*/.test(line)) {
      output.push("- " + line.replace(/^(?:[-*+・•]|※)\s*/, "").trim());
      continue;
    }
    output.push(...packJapaneseSentences(line));
  }

  return normalizeMarkdown(output.join("\n\n"));
}

function textWithBreaks<T extends AnyNode>(
  $: CheerioAPI,
  selection: Cheerio<T>
): string {
  const clone = selection.clone();
  clone.find(REMOVE_SELECTOR).remove();
  clone.find("br").replaceWith("\n");
  return normalizeText(clone.text(), { preserveNewlines: true });
}

function normalizeText(
  value: string,
  options: { preserveNewlines?: boolean } = {}
): string {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .join("\n");
  return options.preserveNewlines
    ? normalized.replace(/\n{3,}/g, "\n\n").trim()
    : normalized.replace(/\s+/g, " ").trim();
}

function singleLine(value: string): string {
  return value.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasUsefulBlockStructure(markdown: string): boolean {
  if (!markdown) return false;
  const blocks = markdown.split(/\n{2,}/).filter((block) => block.trim());
  return blocks.length >= 2 || /^(?:#{1,6}|[-*+] |\d+[.)] |> |```)/m.test(markdown);
}

function isHeadingLike(line: string): boolean {
  if (/^#{1,6}\s+/.test(line)) return true;
  if (line.length > 80 || /[。！？!?]$/.test(line)) return false;
  return /^(?:第[一二三四五六七八九十百0-9]+[章節部]|[0-9]+(?:[-.][0-9]+)*[.)．]\s*\S+)/.test(line);
}

function packJapaneseSentences(line: string): string[] {
  const minParagraphLength = 180;
  const maxParagraphLength = 420;
  if (line.length <= maxParagraphLength) return [line];

  const sentences =
    line.match(/.*?(?:[。！？!?]+[」』】）)]*|$)/g)?.filter(Boolean) ?? [line];
  const paragraphs: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (
      current &&
      current.length >= minParagraphLength &&
      current.length + sentence.length > maxParagraphLength
    ) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}
