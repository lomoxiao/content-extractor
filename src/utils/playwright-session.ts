import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeDomain } from "./pagination.js";
import type { ExtractorOptions } from "../types.js";

// セッションJSON(storageState)はCookie実体を含む。既定保存先はリポジトリ外に固定し、
// コミット・ログ出力は厳禁。CAPTCHAが出た場合は突破せず action_required に落とす方針。
export const DEFAULT_SESSIONS_DIR = join(homedir(), ".content-extractor", "sessions");

/**
 * ログインセッションの失効・不在を表す型付きエラー。
 * 呼び出し側(automation)はこれを viewer の action_required 状態へマッピングする。
 */
export class SessionExpiredError extends Error {
  readonly domain: string;

  constructor(domain: string, message?: string) {
    super(message ?? `${domain} のセッション再取得が必要です`);
    this.name = "SessionExpiredError";
    this.domain = domain;
  }
}

export function resolveSessionPath(domain: string, options?: ExtractorOptions): string {
  const dir = options?.playwrightSessions?.dir || DEFAULT_SESSIONS_DIR;
  return join(dir, `${domain}.json`);
}

export function hasSessionFile(domain: string, options?: ExtractorOptions): boolean {
  return Boolean(domain) && existsSync(resolveSessionPath(domain, options));
}

export function isLoginRequiredDomain(domain: string, options?: ExtractorOptions): boolean {
  const configured = options?.playwrightSessions?.loginRequiredDomains ?? [];
  return configured.some((entry) => {
    const normalized = entry.trim().toLowerCase().replace(/^www\./, "");
    return Boolean(normalized) && (domain === normalized || domain.endsWith(`.${normalized}`));
  });
}

const PAYWALL_MARKERS = /有料会員限定|会員限定|続きを読むには|ログイン(して|が必要)|残り\d+文字/;
const MIN_FULL_TEXT_LENGTH = 500;
const MARKER_CHECK_MAX_LENGTH = 3000;

/**
 * 抽出結果がペイウォール/未ログインの触りだけになっている疑いの判定。
 * 十分に長い本文はマーカー語を含んでいても全文とみなす(誤検出防止)。
 */
export function looksPaywalled(markdown: string): boolean {
  const text = markdown.trim();
  if (text.length < MIN_FULL_TEXT_LENGTH) return true;
  if (text.length >= MARKER_CHECK_MAX_LENGTH) return false;
  return PAYWALL_MARKERS.test(text);
}

export { normalizeDomain };
