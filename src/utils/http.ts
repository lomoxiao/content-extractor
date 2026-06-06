import axios from "axios";
import type { ExtractorOptions } from "../types.js";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_USER_AGENT =
  "content-extractor/0.1 (+https://github.com/lomoxiao/content-extractor)";

export type HttpOptions = NonNullable<ExtractorOptions["http"]>;

export async function fetchText(url: string, options: HttpOptions = {}): Promise<string> {
  const res = await axios.get<string>(url, {
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    responseType: "text",
    headers: { "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT }
  });
  return res.data;
}

export function httpTimeout(options?: ExtractorOptions): number {
  return options?.http?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

export function httpUserAgent(options?: ExtractorOptions): string {
  return options?.http?.userAgent ?? DEFAULT_USER_AGENT;
}
