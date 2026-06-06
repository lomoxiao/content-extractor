import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import type {
  ExtractInput,
  ExtractedAsset,
  ExtractedContent,
  ExtractorOptions
} from "../types.js";
import { httpTimeout, httpUserAgent } from "../utils/http.js";
import { resolveAssetKey } from "../utils/options.js";

function derivePdfFilename(url: string, assetKey: string): string {
  try {
    const pathname = new URL(url).pathname;
    const raw = pathname.split("/").pop() ?? "";
    // 英数字・ハイフン・アンダースコア・ドット以外を除去
    const sanitized = raw.replace(/[^a-zA-Z0-9\-_.]/g, "_");
    if (sanitized.toLowerCase().endsWith(".pdf") && sanitized.length > 4) {
      return sanitized;
    }
  } catch {
    // URL パース失敗はフォールバックへ
  }
  return `pdf_${assetKey}.pdf`;
}

async function downloadPdf(
  url: string,
  filename: string,
  assetsDir: string,
  options: ExtractorOptions
): Promise<string> {
  const papersDir = path.join(assetsDir, "papers");
  if (!fs.existsSync(papersDir)) fs.mkdirSync(papersDir, { recursive: true });

  const pdfPath = path.join(papersDir, filename);
  if (fs.existsSync(pdfPath)) return pdfPath;

  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: Math.max(httpTimeout(options), 60000),
    maxRedirects: 5,
    headers: { "User-Agent": httpUserAgent(options) }
  });

  const contentType = (res.headers["content-type"] as string) ?? "";
  if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
    throw new Error(`PDF ではないコンテンツタイプ: ${contentType}`);
  }

  fs.writeFileSync(pdfPath, Buffer.from(res.data as ArrayBuffer));
  return pdfPath;
}

export async function fetchPdfDocument(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const assetKey = resolveAssetKey(input);
  const filename = derivePdfFilename(input.url, assetKey);
  const domain = hostnameOf(input.url);
  const title = input.hints?.title ?? filename;

  const assets: ExtractedAsset[] = [];
  if (options.assetsDir) {
    const pdfPath = await downloadPdf(input.url, filename, options.assetsDir, options);
    assets.push({ kind: "pdf", path: pdfPath, sourceUrl: input.url });
  }

  const tags = input.hints?.tags ?? [];
  const markdown = [
    `# ${title}`,
    "",
    `- **URL**: ${input.url}`,
    domain ? `- **ドメイン**: ${domain}` : "",
    `- **ファイル**: ${filename}`,
    tags.length ? `- **タグ**: ${tags.join(", ")}` : "",
    input.hints?.excerpt ? `\n## 概要\n\n${input.hints.excerpt}` : ""
  ]
    .filter((l) => l !== "")
    .join("\n");

  return {
    url: input.url,
    sourceType: "pdf-document",
    title,
    markdown,
    references: [],
    assets,
    metadata: { filename, siteName: domain }
  };
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
