import { describe, it, expect } from "vitest";
import { extractPdfText } from "../src/utils/pdf.js";

// 実 unpdf を使う(モックなし)。壊れた入力で undefined フォールバックすることを保証する。
describe("extractPdfText", () => {
  it("PDF でないバイト列は undefined を返す(throw しない)", async () => {
    const warnings: string[] = [];
    const result = await extractPdfText(Buffer.from("これは PDF ではない"), {
      logger: {
        info() {},
        warn(message) {
          warnings.push(message);
        },
        error() {}
      }
    });

    expect(result).toBeUndefined();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("空バッファも undefined を返す", async () => {
    expect(await extractPdfText(Buffer.alloc(0))).toBeUndefined();
  });
});
