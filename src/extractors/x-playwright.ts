import { chromium } from "playwright";
import type { Page } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs";
import axios from "axios";
import type {
  ExtractInput,
  ExtractedAsset,
  ExtractedContent,
  ExtractorOptions
} from "../types.js";
import { getLogger, resolveAssetKey } from "../utils/options.js";

interface TweetData {
  text: string;
  imageUrls: string[];
  linkUrls: string[];
}

export async function fetchXPostWithPlaywright(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const log = getLogger(options);
  const sessionFile = options.x?.sessionStatePath;

  if (!sessionFile) {
    throw new Error(
      "X セッションが未設定です。options.x.sessionStatePath に storageState の JSON パスを指定してください。"
    );
  }
  if (!fs.existsSync(sessionFile)) {
    throw new Error(`X セッションファイルが見つかりません。\nパス: ${sessionFile}`);
  }

  // プロファイルを共有しない独立コンテキスト → Chrome ロック競合なし
  const browser = await chromium.launch({
    channel: options.x?.channel ?? "chrome",
    headless: options.x?.headless ?? true
  });
  const context = await browser.newContext({ storageState: sessionFile });
  const page = await context.newPage();

  try {
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const isLoginPage = (await page.$('[data-testid="loginButton"]')) !== null;
    if (isLoginPage) {
      throw new Error('X セッションの有効期限が切れています。セッションを再取得してください。');
    }

    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
    // スレッドの遅延読み込みを待つ
    await page.waitForLoadState("networkidle").catch(() => {
      /* タイムアウトは無視 */
    });
    await page.waitForTimeout(1000);

    const tweets = await extractTweets(page);
    const assets = await downloadImages(tweets, input, options);
    const markdown = buildMarkdownText(tweets);
    const references = collectLinkUrls(tweets);

    log.info(
      `X取得完了: ${tweets.length}ツイート, 画像${assets.length}枚, リンク${references.length}件`
    );

    return {
      url: input.url,
      sourceType: "x-post",
      title: input.hints?.title ?? input.url,
      markdown: markdown || input.hints?.excerpt || "(テキストを取得できませんでした)",
      references,
      assets,
      metadata: { threadLength: tweets.length }
    };
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

async function extractTweets(page: Page): Promise<TweetData[]> {
  return page.$$eval('article[data-testid="tweet"]', (articles) =>
    articles.map((article) => {
      // 通常ツイート
      let text = article.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? "";

      // X Article(ロングフォーム): span[data-text="true"] を結合
      if (!text) {
        const longform = article.querySelector('[data-testid="longformRichTextComponent"]');
        if (longform) {
          text = Array.from(longform.querySelectorAll('span[data-text="true"]'))
            .map((s) => s.textContent ?? "")
            .join("");
        }
      }

      // リンク: 通常ツイートと longform の両方から収集
      const linkSelectors = [
        '[data-testid="tweetText"] a[href]',
        '[data-testid="longformRichTextComponent"] a[href]'
      ];
      const linkUrls = linkSelectors.flatMap((sel) =>
        Array.from(article.querySelectorAll(sel))
          .map((a) => (a as HTMLAnchorElement).href)
          .filter(
            (href) =>
              href.startsWith("http") &&
              !href.includes("x.com") &&
              !href.includes("twitter.com") &&
              !href.includes("t.co")
          )
      );

      const imageUrls = Array.from(
        article.querySelectorAll(
          '[data-testid="tweetPhoto"] img, [data-testid="card.layoutLarge.media"] img'
        )
      )
        .map((img) => (img as HTMLImageElement).src)
        .filter((src) => src.includes("pbs.twimg.com"))
        .map((src) => {
          try {
            const url = new URL(src);
            url.searchParams.set("name", "large");
            return url.toString();
          } catch {
            return src;
          }
        });

      return { text, imageUrls, linkUrls };
    })
  );
}

async function downloadImages(
  tweets: TweetData[],
  input: ExtractInput,
  options: ExtractorOptions
): Promise<ExtractedAsset[]> {
  // assetsDir 未指定なら画像 DL をスキップ(テキストのみモード)
  if (!options.assetsDir) return [];

  const log = getLogger(options);
  const imgDir = path.join(options.assetsDir, "images", resolveAssetKey(input));
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  const assets: ExtractedAsset[] = [];

  for (const tweet of tweets) {
    for (const imgUrl of tweet.imageUrls) {
      try {
        const urlObj = new URL(imgUrl);
        const mediaName = urlObj.pathname.split("/").pop() ?? "image";
        const ext = urlObj.searchParams.get("format") ?? "jpg";
        const filename = `${mediaName}.${ext}`;
        const destPath = path.join(imgDir, filename);

        if (fs.existsSync(destPath)) {
          assets.push({ kind: "image", path: destPath, sourceUrl: imgUrl });
          continue;
        }

        const res = await axios.get<ArrayBuffer>(imgUrl, {
          responseType: "arraybuffer",
          timeout: 15000
        });
        fs.writeFileSync(destPath, Buffer.from(res.data));
        assets.push({ kind: "image", path: destPath, sourceUrl: imgUrl });
        log.info(`  画像保存: ${filename}`);
      } catch (err) {
        log.warn(`  画像DL失敗: ${imgUrl} — ${(err as Error).message}`);
      }
    }
  }

  return assets;
}

// 画像は assets で別管理するため markdown には含めない
function buildMarkdownText(tweets: TweetData[]): string {
  const isThread = tweets.length > 1;
  return tweets
    .map((t, i) => {
      const prefix = isThread ? `**[${i + 1}/${tweets.length}]** ` : "";
      return t.text ? prefix + t.text : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function collectLinkUrls(tweets: TweetData[]): string[] {
  const seen = new Set<string>();
  for (const tweet of tweets) {
    for (const url of tweet.linkUrls) seen.add(url);
  }
  return Array.from(seen);
}
