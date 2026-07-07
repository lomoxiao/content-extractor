import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import type {
  ExtractInput,
  ExtractedAsset,
  ExtractedContent,
  ExtractorOptions
} from "../types.js";
import { httpTimeout } from "../utils/http.js";
import { downloadPdfBuffer, extractPdfText } from "../utils/pdf.js";
import { getLogger } from "../utils/options.js";

export function extractArxivId(url: string): string {
  const match = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/);
  if (!match) throw new Error(`arXiv ID を抽出できません: ${url}`);
  return match[1];
}

export interface ArxivMeta {
  title: string;
  summary: string;
  authors: string;
  arxivId: string;
  categories: string;
  published: string;
}

export async function fetchArxivMetadata(
  arxivId: string,
  options: ExtractorOptions = {}
): Promise<ArxivMeta> {
  const res = await axios.get<string>(
    `https://export.arxiv.org/api/query?id_list=${arxivId}`,
    { responseType: "text", timeout: httpTimeout(options) }
  );
  const xml = res.data;

  // <entry> 内のフィールドを抽出(フィード全体の <title> とは別)
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  const entry = entryMatch?.[1] ?? xml;

  const title = entry.match(/<title[^>]*>([^<]+)<\/title>/)?.[1]?.trim() ?? "";
  const summary = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]?.trim() ?? "";
  const published = entry.match(/<published>([^<]+)<\/published>/)?.[1]?.slice(0, 10) ?? "";
  const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/g)]
    .map((m) => m[1].trim())
    .join(", ");
  const categories = [...entry.matchAll(/<category[^>]+term="([^"]+)"/g)]
    .map((m) => m[1])
    .join(", ");

  return { title, summary, authors, arxivId, categories, published };
}

async function loadArxivPdf(
  arxivId: string,
  options: ExtractorOptions
): Promise<{ data?: Buffer; savedPath?: string }> {
  const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;

  if (options.assetsDir) {
    const papersDir = path.join(options.assetsDir, "papers");
    const pdfPath = path.join(papersDir, `${arxivId}.pdf`);
    if (fs.existsSync(pdfPath)) {
      return { data: fs.readFileSync(pdfPath), savedPath: pdfPath };
    }
    const data = await downloadPdfBuffer(pdfUrl, options);
    if (!fs.existsSync(papersDir)) fs.mkdirSync(papersDir, { recursive: true });
    fs.writeFileSync(pdfPath, data);
    return { data, savedPath: pdfPath };
  }

  // テキストのみモードでは DL 失敗を致命傷にしない(メタデータ+Abstract で続行)
  try {
    return { data: await downloadPdfBuffer(pdfUrl, options) };
  } catch (err) {
    getLogger(options).warn(
      `arXiv PDF ダウンロードに失敗(テキストのみモード): ${err instanceof Error ? err.message : String(err)}`
    );
    return {};
  }
}

export async function fetchArxivPaper(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const arxivId = extractArxivId(input.url);
  const meta = await fetchArxivMetadata(arxivId, options);

  const { data, savedPath } = await loadArxivPdf(arxivId, options);
  const assets: ExtractedAsset[] = savedPath
    ? [
        {
          kind: "pdf",
          path: savedPath,
          sourceUrl: `https://arxiv.org/pdf/${arxivId}.pdf`
        }
      ]
    : [];
  const bodyText = data ? await extractPdfText(data, options) : undefined;

  const sections = [
    `# ${meta.title}`,
    "",
    `- **著者**: ${meta.authors}`,
    `- **公開日**: ${meta.published}`,
    `- **カテゴリ**: ${meta.categories}`,
    `- **arXiv ID**: ${arxivId}`,
    `- **URL**: ${input.url}`,
    "",
    "## Abstract",
    "",
    meta.summary
  ];
  if (bodyText) {
    sections.push("", "## 本文", "", bodyText);
  }
  const markdown = sections.join("\n");

  return {
    url: input.url,
    sourceType: "arxiv",
    title: meta.title || input.hints?.title || input.url,
    markdown,
    references: [],
    assets,
    metadata: {
      author: meta.authors,
      publishedAt: meta.published,
      title: meta.title,
      categories: meta.categories,
      arxivId,
      pdfTextExtracted: Boolean(bodyText)
    }
  };
}
