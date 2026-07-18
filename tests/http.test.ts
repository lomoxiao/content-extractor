import { describe, it, expect } from "vitest";
import { decodeHtmlBytes } from "../src/utils/http.js";

// "日本" の Shift_JIS バイト列
const NIHON_SJIS = new Uint8Array([0x93, 0xfa, 0x96, 0x7b]);

function sjisPage(): Uint8Array {
  const head = '<html><head><meta charset="shift_jis"></head><body>';
  const tail = "</body></html>";
  const encoder = new TextEncoder();
  return new Uint8Array([...encoder.encode(head), ...NIHON_SJIS, ...encoder.encode(tail)]);
}

describe("decodeHtmlBytes", () => {
  it("Content-Typeヘッダのcharsetで復号する", () => {
    const html = decodeHtmlBytes(sjisPage(), "text/html; charset=Shift_JIS");
    expect(html).toContain("日本");
  });

  it("ヘッダに無ければmetaタグのcharset宣言を読む", () => {
    const html = decodeHtmlBytes(sjisPage(), "text/html");
    expect(html).toContain("日本");
  });

  it("http-equiv形式のmeta宣言も読む", () => {
    const head = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=shift_jis"></head><body>';
    const encoder = new TextEncoder();
    const bytes = new Uint8Array([...encoder.encode(head), ...NIHON_SJIS]);
    expect(decodeHtmlBytes(bytes, "")).toContain("日本");
  });

  it("宣言が無ければUTF-8として復号する", () => {
    const bytes = new TextEncoder().encode("<html><body>日本</body></html>");
    expect(decodeHtmlBytes(bytes, "")).toContain("日本");
  });

  it("不明なcharsetラベルはUTF-8へフォールバックする", () => {
    const bytes = new TextEncoder().encode("<html><body>ok</body></html>");
    expect(decodeHtmlBytes(bytes, "text/html; charset=bogus-enc")).toContain("ok");
  });
});
