export interface SensitiveTermHit {
  term: string;
  line: number;
}
export function loadSensitiveTerms(root: string): { terms: string[]; sources: string[] };
export function findSensitiveTerms(text: string, terms: readonly string[]): SensitiveTermHit[];
