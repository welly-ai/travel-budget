import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeTermsFile, findSensitiveTerms, loadSensitiveTerms } from "../../../scripts/hooks/leak-check.mjs";

// 一律使用虛構的詞：真實敏感詞只能存在本機清單裡。
const TERMS = ["Acmecorp", "Globex", "@ZZQ", "QXP", "虛構電子"];

function hitTerms(text: string): string[] {
  return findSensitiveTerms(text, TERMS).map((hit) => hit.term);
}

describe("防外洩：findSensitiveTerms", () => {
  it("整個詞比對、不分大小寫", () => {
    expect(hitTerms("made by ACMECORP plant")).toEqual(["Acmecorp"]);
    expect(hitTerms("Globex Pro Max")).toEqual(["Globex"]);
  });

  it("不命中較長單字中的子字串", () => {
    expect(hitTerms("workspaceQXPx")).toEqual([]);
    expect(hitTerms("acmecorporation")).toEqual([]);
  });

  it("符號開頭的詞不需要前方邊界", () => {
    expect(hitTerms("Adder_X (comp @ZZQ)")).toEqual(["@ZZQ"]);
  });

  it("中文詞用子字串比對（中文沒有詞界）", () => {
    expect(hitTerms("客戶：虛構電子股份有限公司")).toEqual(["虛構電子"]);
    expect(hitTerms("虛構電子")).toEqual(["虛構電子"]);
  });

  it("英數詞緊接中文時仍算邊界", () => {
    expect(hitTerms("廠區QXP旁的飯店")).toEqual(["QXP"]);
  });

  it("回報詞在清單中的位置，供訊息使用而不印出詞", () => {
    expect(findSensitiveTerms("Globex", TERMS).map((hit) => hit.termIndex)).toEqual([2]);
  });

  it("回報行號", () => {
    expect(findSensitiveTerms("ok\nok\nqxp hotel", TERMS).map((hit) => hit.line)).toEqual([3]);
  });
});

describe("防外洩：loadSensitiveTerms", () => {
  it("沒有清單時回傳空來源（不擋）", () => {
    const root = mkdtempSync(join(tmpdir(), "leak-"));
    expect(loadSensitiveTerms(root)).toEqual({ terms: [], sources: [] });
  });

  it("略過空行與註解", () => {
    const root = mkdtempSync(join(tmpdir(), "leak-"));
    mkdirSync(join(root, "local-data"));
    writeFileSync(join(root, "local-data", "sensitive-terms.txt"), "# 註解\n\nAcmecorp\r\n  Globex  \n");
    expect(loadSensitiveTerms(root).terms).toEqual(["Acmecorp", "Globex"]);
  });
});

describe("防外洩：清單編碼", () => {
  const list = "# 註解\r\nAcmecorp\r\n虛構電子\r\n";

  function rootWith(bytes: Buffer): string {
    const root = mkdtempSync(join(tmpdir(), "leak-enc-"));
    mkdirSync(join(root, "local-data"));
    writeFileSync(join(root, "local-data", "sensitive-terms.txt"), bytes);
    return root;
  }

  it("UTF-16LE（PowerShell 5.1 的 > 預設）照樣讀得到", () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(list, "utf16le")]);
    expect(loadSensitiveTerms(rootWith(bytes)).terms).toEqual(["Acmecorp", "虛構電子"]);
  });

  it("UTF-16BE 照樣讀得到", () => {
    const le = Buffer.from(list, "utf16le");
    const be = Buffer.from(le);
    be.swap16();
    expect(loadSensitiveTerms(rootWith(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).terms).toEqual(["Acmecorp", "虛構電子"]);
  });

  it("UTF-8 含 BOM 照樣讀得到", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(list, "utf8")]);
    expect(loadSensitiveTerms(rootWith(bytes)).terms).toEqual(["Acmecorp", "虛構電子"]);
  });

  it("沒有 BOM 卻含 NUL 時明確報錯，不靜默放行", () => {
    expect(() => decodeTermsFile(Buffer.from(list, "utf16le"))).toThrow(/NUL/);
  });
});
