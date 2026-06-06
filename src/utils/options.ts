import { createHash } from "node:crypto";
import type { ExtractInput, ExtractorLogger, ExtractorOptions } from "../types.js";

const NOOP_LOGGER: ExtractorLogger = {
  info() {},
  warn() {},
  error() {}
};

export function getLogger(options?: ExtractorOptions): ExtractorLogger {
  return options?.logger ?? NOOP_LOGGER;
}

/** DL 資産のファイル命名キー。input.assetKey が無ければ URL から安定ハッシュを生成。 */
export function resolveAssetKey(input: ExtractInput): string {
  if (input.assetKey && input.assetKey.trim()) {
    return sanitizeKey(input.assetKey.trim());
  }
  return createHash("sha1").update(input.url).digest("hex").slice(0, 12);
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9\-_.]/g, "_");
}
