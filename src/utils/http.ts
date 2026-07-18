import axios from "axios";
import type { ExtractorOptions } from "../types.js";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_USER_AGENT =
  "content-extractor/0.1 (+https://github.com/lomoxiao/content-extractor)";

export type HttpOptions = NonNullable<ExtractorOptions["http"]>;

export async function fetchText(url: string, options: HttpOptions = {}): Promise<string> {
  // Shift_JIS等の非UTF-8サイト対応のためバイト列で受けてcharsetを判定して復号する
  const res = await axios.get<ArrayBuffer>(url, {
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    responseType: "arraybuffer",
    headers: { "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT }
  });
  return decodeHtmlBytes(new Uint8Array(res.data), String(res.headers["content-type"] ?? ""));
}

export function decodeHtmlBytes(bytes: Uint8Array, contentTypeHeader = ""): string {
  const charset = charsetFromContentType(contentTypeHeader) ?? sniffMetaCharset(bytes) ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function charsetFromContentType(header: string): string | undefined {
  const match = header.match(/charset=["']?([\w.-]+)/i);
  return match?.[1].toLowerCase();
}

function sniffMetaCharset(bytes: Uint8Array): string | undefined {
  // meta宣言はASCII互換で書かれる前提で先頭だけをlatin1として覗く
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const match =
    head.match(/<meta[^>]+charset=["']?([\w.-]+)/i) ??
    head.match(/<meta[^>]+content=["'][^"']*charset=([\w.-]+)/i);
  return match?.[1].toLowerCase();
}

export function httpTimeout(options?: ExtractorOptions): number {
  return options?.http?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

export function httpUserAgent(options?: ExtractorOptions): string {
  return options?.http?.userAgent ?? DEFAULT_USER_AGENT;
}
