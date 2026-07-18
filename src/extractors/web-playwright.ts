import { existsSync } from "node:fs";
import { chromium } from "playwright";
import type { ExtractInput, ExtractedContent, ExtractorOptions } from "../types.js";
import { getLogger } from "../utils/options.js";
import { fetchWebArticle } from "./web-article.js";
import {
  SessionExpiredError,
  hasSessionFile,
  isLoginRequiredDomain,
  looksPaywalled,
  normalizeDomain,
  resolveSessionPath
} from "../utils/playwright-session.js";

const GOTO_TIMEOUT_MS = 30000;
const LOGIN_PATH_PATTERN = /login|signin|sign-in|auth/i;

/**
 * ログイン済みセッション(storageState)でページを開き、web-article と同じ
 * Readability パイプラインで抽出する。ページ送りも fetchPage 注入で共用する。
 * x-playwright と同じ「プロファイル非共有の独立コンテキスト」方式。
 */
export async function fetchWebArticleWithPlaywright(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const log = getLogger(options);
  const domain = normalizeDomain(input.url);
  const sessionPath = resolveSessionPath(domain, options);

  if (!existsSync(sessionPath)) {
    throw new SessionExpiredError(
      domain,
      `${domain} のセッションがありません。npm run session:capture -- ${domain} で取得してください`
    );
  }

  const browser = await chromium.launch({
    channel: options.playwrightSessions?.channel ?? "chrome",
    headless: options.playwrightSessions?.headless ?? true
  });
  const context = await browser.newContext({ storageState: sessionPath });
  const page = await context.newPage();

  const fetchPage = async (url: string): Promise<string> => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await page.waitForLoadState("networkidle").catch(() => {
      /* タイムアウトは無視 */
    });
    const landedPath = new URL(page.url()).pathname;
    if (LOGIN_PATH_PATTERN.test(landedPath)) {
      throw new SessionExpiredError(domain, `${domain} でログインページへリダイレクトされました(セッション失効)`);
    }
    return page.content();
  };

  try {
    const content = await fetchWebArticle(input, { ...options, fetchPage });
    // セッション付きでも触りしか取れない場合は失効相当として扱い、再取得を促す
    if (looksPaywalled(content.markdown)) {
      throw new SessionExpiredError(domain, `${domain} のセッションで本文を取得できませんでした(要再ログイン)`);
    }
    log.info(`Playwrightセッション取得成功: ${domain} (${content.markdown.length}文字)`);
    return {
      ...content,
      metadata: { ...content.metadata, viaPlaywrightSession: true }
    };
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

/**
 * web-article の入口。ログイン必須ドメインは最初からセッション取得、
 * それ以外は通常取得の結果がペイウォール様かつセッションファイルが在る場合のみ再試行する。
 */
export async function fetchWebArticleSmart(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const sessions = options.playwrightSessions;
  const domain = normalizeDomain(input.url);

  if (sessions && isLoginRequiredDomain(domain, options)) {
    return fetchWebArticleWithPlaywright(input, options);
  }

  const result = await fetchWebArticle(input, options);
  if (sessions && looksPaywalled(result.markdown) && hasSessionFile(domain, options)) {
    getLogger(options).info(`本文が薄いためPlaywrightセッションで再試行: ${domain}`);
    return fetchWebArticleWithPlaywright(input, options);
  }
  return result;
}
