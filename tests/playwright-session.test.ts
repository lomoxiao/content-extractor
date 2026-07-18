import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  DEFAULT_SESSIONS_DIR,
  SessionExpiredError,
  isLoginRequiredDomain,
  looksPaywalled,
  resolveSessionPath
} from "../src/utils/playwright-session.js";

describe("resolveSessionPath", () => {
  it("既定は ~/.content-extractor/sessions/{domain}.json", () => {
    expect(resolveSessionPath("nikkei.com")).toBe(join(DEFAULT_SESSIONS_DIR, "nikkei.com.json"));
  });

  it("dir 指定を優先する", () => {
    const path = resolveSessionPath("nikkei.com", { playwrightSessions: { dir: "D:/sessions" } });
    expect(path).toBe(join("D:/sessions", "nikkei.com.json"));
  });
});

describe("isLoginRequiredDomain", () => {
  const options = { playwrightSessions: { loginRequiredDomains: ["Nikkei.com", "www.example.co.jp", " "] } };

  it("大文字小文字・www. を吸収して一致させる", () => {
    expect(isLoginRequiredDomain("nikkei.com", options)).toBe(true);
    expect(isLoginRequiredDomain("example.co.jp", options)).toBe(true);
  });

  it("サブドメインも一致する", () => {
    expect(isLoginRequiredDomain("business.nikkei.com", options)).toBe(true);
  });

  it("無関係ドメイン・部分文字列は一致しない", () => {
    expect(isLoginRequiredDomain("itmedia.co.jp", options)).toBe(false);
    expect(isLoginRequiredDomain("fakenikkei.com", options)).toBe(false);
    expect(isLoginRequiredDomain("nikkei.com", {})).toBe(false);
  });
});

describe("looksPaywalled", () => {
  it("短い本文はペイウォール疑いとする", () => {
    expect(looksPaywalled("この記事は有料会員限定です。")).toBe(true);
    expect(looksPaywalled("短い触りだけの本文。")).toBe(true);
  });

  it("中程度の長さでもマーカー語があれば疑いとする", () => {
    const teaser = `${"本文の導入部分です。".repeat(60)}続きを読むには有料会員登録が必要です。`;
    expect(looksPaywalled(teaser)).toBe(true);
  });

  it("十分に長い本文はマーカー語を含んでいても全文とみなす", () => {
    const full = `${"十分に長い本文が続きます。".repeat(300)}なお一部コンテンツは会員限定です。`;
    expect(looksPaywalled(full)).toBe(false);
  });

  it("マーカー語なしの通常本文は全文とみなす", () => {
    expect(looksPaywalled("通常の記事本文です。".repeat(60))).toBe(false);
  });
});

describe("SessionExpiredError", () => {
  it("domain と name を持ち、既定メッセージが再取得を促す", () => {
    const error = new SessionExpiredError("nikkei.com");
    expect(error.name).toBe("SessionExpiredError");
    expect(error.domain).toBe("nikkei.com");
    expect(error.message).toContain("nikkei.com");
    expect(error.message).toContain("セッション再取得");
  });
});
