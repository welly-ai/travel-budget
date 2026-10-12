import { z } from "zod";

// 有限集合一律用字面型別，讓 switch 可以窮舉（見 AGENTS.md「型別規則」）。

/** Phase：2 或 3。 */
export const phaseSchema = z.literal([2, 3]);
export type Phase = z.infer<typeof phaseSchema>;

/** Class：4、3.5、3、2（guidance 沒有 Class 1 的資料）。 */
export const projectClassSchema = z.literal([4, 3.5, 3, 2]);
export type ProjectClass = z.infer<typeof projectClassSchema>;

/** Stage：出差所屬的 build 階段，順序即原 Excel 的欄位順序。 */
export const STAGES = ["RFQ", "pre A", "A", "B", "C", "TLD", "Pre-MP", "MP"] as const;
export const stageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof stageSchema>;

/** Function 的分組：Core、Support 恆計入；Adder、Option 要看開關。 */
export const GROUPS = ["Core", "Support", "Adder", "Option"] as const;
export const groupSchema = z.enum(GROUPS);
export type Group = z.infer<typeof groupSchema>;

/**
 * Adder／Option 的開關。原 Excel 的 2nd PCB 四列共用一個開關（secondPcb），GPU 一列一個開關。
 * 這是有限集合：新增開關代表計算規則改變，必須同時改引擎與測試，所以用字面型別而不是資料。
 */
export const GATE_KEYS = [
  "adsp",
  "hapticTp2",
  "id",
  "dqaItm",
  "dqaRel",
  "mePlastic",
  "thm",
  "secondPcb",
  "gpu",
] as const;
export const gateKeySchema = z.enum(GATE_KEYS);
export type GateKey = z.infer<typeof gateKeySchema>;

/**
 * Function 名稱：品牌字串，不是 union。
 * 理由：Function 清單屬於參考資料（Mapping），guidance 改版或新增 Function 時只改資料、不改程式；
 * 若把 32 個名稱寫死成 union，每次參考資料更新都要改程式並重新部署。
 * 品牌型別（brand）只擋「隨手塞字串」；執行期是否屬於某份參考資料，由 validateProjectAgainstReference 檢查。
 */
export const functionNameSchema = z.string().trim().min(1).brand<"FunctionName">();
export type FunctionName = z.infer<typeof functionNameSchema>;

/** 日期一律存 ISO 日期字串（YYYY-MM-DD），避免時區造成的偏移。 */
export const isoDateSchema = z.iso.date();

/** Budgeted Period：YYYY-MM。 */
export const budgetedPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** 人次（man）、天數（days）、人天（manDays）。人天 = Σ(人次 × 天數)，days 是加權平均。 */
export const quantitySchema = z.object({
  man: z.number(),
  days: z.number(),
  manDays: z.number(),
});
export type Quantity = z.infer<typeof quantitySchema>;
