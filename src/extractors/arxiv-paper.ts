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

async function downloadPdf(
  arxivId: string,
  assetsDir: string,
  options: ExtractorOptions
): Promise<string> {
  const papersDir = path.join(assetsDir, "papers");
  if (!fs.existsSync(papersDir)) fs.mkdirSync(papersDir, { recursive: true });

  const pdfPath = path.join(papersDir, `${arxivId}.pdf`);
  if (fs.existsSync(pdfPath)) return pdfPath;

  const res = await axios.get(`https://arxiv.org/pdf/${arxivId}.pdf`, {
    responseType: "arraybuffer",
    timeout: Math.max(httpTimeout(options), 60000),
    maxRedirects: 5
  });
  fs.writeFileSync(pdfPath, Buffer.from(res.data as ArrayBuffer));
  return pdfPath;
}

export async function fetchArxivPaper(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const arxivId = extractArxivId(input.url);
  const meta = await fetchArxivMetadata(arxivId, options);

  const assets: ExtractedAsset[] = [];
  if (options.assetsDir) {
    const pdfPath = await downloadPdf(arxivId, options.assetsDir, options);
    assets.push({
      kind: "pdf",
      path: pdfPath,
      sourceUrl: `https://arxiv.org/pdf/${arxivId}.pdf`
    });
  }

  const markdown = [
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
  ].join("\n");

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
      arxivId
    }
  };
}
