import { type Quantity, type Stage } from "@/domain";


/** 由人次與人天組成數量；days 是加權平均，人次為 0 時為 0（對應 Excel 的 IFERROR(人天/人次, 0)）。 */
export function makeQuantity(man: number, manDays: number): Quantity {
  return { man, days: man === 0 ? 0 : manDays / man, manDays };
}

export function sumQuantities(items: readonly Quantity[]): Quantity {
  let man = 0;
  let manDays = 0;
  for (const item of items) {
    man += item.man;
    manDays += item.manDays;
  }
  return makeQuantity(man, manDays);
}

/** 以 8 個 Stage 各呼叫一次 make，得到完整的 Record（不用型別斷言，缺一個 Stage 就編譯失敗）。 */
export function stageRecord<T>(make: (stage: Stage) => T): Record<Stage, T> {
  return {
    RFQ: make("RFQ"),
    "pre A": make("pre A"),
    A: make("A"),
    B: make("B"),
    C: make("C"),
    TLD: make("TLD"),
    "Pre-MP": make("Pre-MP"),
    MP: make("MP"),
  };
}
