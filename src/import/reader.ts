import ExcelJS from "exceljs";
import { z } from "zod";
import type { ImportIssue } from "./issues";

/** 把 exceljs 的儲存格值攤平成純值：公式取快取結果、rich text 取文字、空字串視為空白。 */
function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "object") {
    if ("result" in value) return normalize(value.result);
    if ("richText" in value && Array.isArray(value.richText)) {
      const parts: unknown[] = value.richText;
      return normalize(parts.map((part) => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : "")).join(""));
    }
    if ("error" in value) return String(value.error);
    if ("text" in value) return normalize(value.text);
  }
  return value;
}

export function columnLetter(column: number): string {
  return String.fromCharCode(64 + column);
}

export function addressOf(row: number, column: number): string {
  return `${columnLetter(column)}${row}`;
}

function show(raw: unknown): string {
  if (raw === undefined) return "空白";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return JSON.stringify(raw);
}

/** 數字儲存格轉文字（例如以數字存放的專案代碼）。 */
export const textSchema = z.preprocess((value) => (typeof value === "number" ? String(value) : value), z.string().min(1));
export const optionalTextSchema = z.preprocess((value) => (typeof value === "number" ? String(value) : value), z.string().optional());

/** 以文字存放的數字（例如 "3.5"）也接受，與 Excel 以文字串接比對鍵時的行為一致。 */
export function numeric<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return value;
  }, schema);
}

/** Y／N 旗標：Excel 的字串比較不分大小寫；空白視為 N（Excel 以 ="Y" 判斷）。 */
export const flagSchema = z
  .preprocess((value) => (typeof value === "string" ? value.toUpperCase() : value), z.enum(["Y", "N"]).optional())
  .transform((value) => value === "Y");

export const dateSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.iso.date().optional(),
);

/** 讀取單一工作表並記錄問題。所有值都經過 Zod 驗證，失敗時指出 sheet 與儲存格。 */
export class SheetReader {
  constructor(
    readonly sheet: string,
    readonly worksheet: ExcelJS.Worksheet,
    private readonly issues: ImportIssue[],
  ) {}

  get issueCount(): number {
    return this.issues.length;
  }

  get rowCount(): number {
    return this.worksheet.rowCount;
  }

  raw(row: number, column: number): unknown {
    const cell = this.worksheet.getCell(row, column);
    // exceljs 的 cell.value 會在公式結果為 0 或空字串時丟掉 result，所以公式一律改讀 cell.result。
    return normalize(cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value);
  }

  text(row: number, column: number): string | undefined {
    const value = this.raw(row, column);
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return undefined;
  }

  report(cell: string, message: string): void {
    this.issues.push({ sheet: this.sheet, cell, message });
  }

  /** 以 schema 驗證儲存格；失敗時記錄問題並回傳 undefined。 */
  read<S extends z.ZodType>(row: number, column: number, schema: S, label: string): z.output<S> | undefined {
    const raw = this.raw(row, column);
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    const detail = parsed.error.issues[0]?.message ?? "格式不符";
    this.report(addressOf(row, column), `${label}不合法：${detail}（讀到：${show(raw)}）`);
    return undefined;
  }
}
