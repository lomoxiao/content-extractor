import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExtractInput,
  ExtractedAsset,
  ExtractedContent,
  ExtractorOptions
} from "../types.js";
import { downloadPdfBuffer, extractPdfText } from "../utils/pdf.js";
import { getLogger, resolveAssetKey } from "../utils/options.js";

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

async function loadPdf(
  url: string,
  filename: string,
  options: ExtractorOptions
): Promise<{ data?: Buffer; savedPath?: string }> {
  if (options.assetsDir) {
    const papersDir = path.join(options.assetsDir, "papers");
    const pdfPath = path.join(papersDir, filename);
    if (fs.existsSync(pdfPath)) {
      return { data: fs.readFileSync(pdfPath), savedPath: pdfPath };
    }
    const data = await downloadPdfBuffer(url, options, { requirePdfContentType: true });
    if (!fs.existsSync(papersDir)) fs.mkdirSync(papersDir, { recursive: true });
    fs.writeFileSync(pdfPath, data);
    return { data, savedPath: pdfPath };
  }

  // テキストのみモードでは DL 失敗を致命傷にしない(従来はそもそも DL しなかった)
  try {
    return { data: await downloadPdfBuffer(url, options, { requirePdfContentType: true }) };
  } catch (err) {
    getLogger(options).warn(
      `PDF ダウンロードに失敗(テキストのみモード): ${err instanceof Error ? err.message : String(err)}`
    );
    return {};
  }
}

export async function fetchPdfDocument(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const assetKey = resolveAssetKey(input);
  const filename = derivePdfFilename(input.url, assetKey);
  const domain = hostnameOf(input.url);
  const title = input.hints?.title ?? filename;

  const { data, savedPath } = await loadPdf(input.url, filename, options);
  const assets: ExtractedAsset[] = savedPath
    ? [{ kind: "pdf", path: savedPath, sourceUrl: input.url }]
    : [];
  const bodyText = data ? await extractPdfText(data, options) : undefined;

  const tags = input.hints?.tags ?? [];
  const markdown = [
    `# ${title}`,
    "",
    `- **URL**: ${input.url}`,
    domain ? `- **ドメイン**: ${domain}` : "",
    `- **ファイル**: ${filename}`,
    tags.length ? `- **タグ**: ${tags.join(", ")}` : "",
    input.hints?.excerpt ? `\n## 概要\n\n${input.hints.excerpt}` : "",
    bodyText ? `\n## 本文\n\n${bodyText}` : ""
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
    metadata: { filename, siteName: domain, pdfTextExtracted: Boolean(bodyText) }
  };
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
