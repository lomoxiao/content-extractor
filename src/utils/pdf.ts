import axios from "axios";
import type { ExtractorOptions } from "../types.js";
import { httpTimeout, httpUserAgent } from "./http.js";
import { getLogger } from "./options.js";

/** 巨大 PDF で markdown が肥大化しないための上限。超過分は打ち切る。 */
const MAX_TEXT_CHARS = 200_000;

export interface DownloadPdfOptions {
  /** Content-Type が PDF 系でない場合にエラーにする(汎用 URL 向け)。 */
  requirePdfContentType?: boolean;
}

export async function downloadPdfBuffer(
  url: string,
  options: ExtractorOptions = {},
  downloadOptions: DownloadPdfOptions = {}
): Promise<Buffer> {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: Math.max(httpTimeout(options), 60000),
    maxRedirects: 5,
    headers: { "User-Agent": httpUserAgent(options) }
  });

  if (downloadOptions.requirePdfContentType) {
    const contentType = (res.headers["content-type"] as string) ?? "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      throw new Error(`PDF ではないコンテンツタイプ: ${contentType}`);
    }
  }

  return Buffer.from(res.data as ArrayBuffer);
}

/**
 * PDF バイト列から本文テキストを抽出する。
 * 失敗時は undefined を返し、呼び出し元はメタデータのみの markdown で続行する(安全側)。
 */
export async function extractPdfText(
  data: Uint8Array,
  options?: ExtractorOptions
): Promise<string | undefined> {
  const logger = getLogger(options);
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    // pdf.js 側でバッファが転送され得るためコピーを渡す
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: true });
    const normalized = normalizePdfText(text);
    if (!normalized) return undefined;
    if (normalized.length > MAX_TEXT_CHARS) {
      return `${normalized.slice(0, MAX_TEXT_CHARS)}\n\n(以降省略: 全${normalized.length}文字)`;
    }
    return normalized;
  } catch (err) {
    logger.warn(
      `PDF テキスト抽出に失敗: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
