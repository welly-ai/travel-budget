export interface SensitiveTermHit {
  term: string;
  /** 詞在清單中的位置（從 1 起算）；對外訊息用這個，不要印 term。 */
  termIndex: number;
  line: number;
}
export function loadSensitiveTerms(root: string): { terms: string[]; sources: string[] };
export function findSensitiveTerms(text: string, terms: readonly string[]): SensitiveTermHit[];
export function decodeTermsFile(buffer: Buffer): string;
