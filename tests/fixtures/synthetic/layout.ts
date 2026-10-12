import { excelLayoutSchema } from "@/domain";
import raw from "./excel-layout.json";

/** 虛構標籤的版面設定（結構與真實版面相同，文字全部虛構）。 */
export const syntheticLayout = excelLayoutSchema.parse(raw);
