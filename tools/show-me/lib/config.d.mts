export const DEFAULT_BASE_URL: string;
export interface CaptureStep { action: "click" | "fill" | "press" | "wait"; selector?: string; value?: string; ms?: number }
export interface CaptureItem {
  id: string; title: string; description: string; route: string; viewport: { width: number; height: number };
  waitFor: string | undefined; steps: CaptureStep[]; fullPage: boolean; reference: { abs: string; ext: string } | undefined;
}
export function assertLocalBaseUrl(baseUrl: string): string;
export function parseConfig(raw: unknown, root: string): { baseUrl: string; items: CaptureItem[] };
export function loadConfig(root: string, file?: string): { baseUrl: string; items: CaptureItem[] };
