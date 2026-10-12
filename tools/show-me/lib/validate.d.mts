export type Status = "pending" | "ok" | "change" | "question";
export type Annotation =
  | { id: string; n: number; text: string; type: "rect"; x: number; y: number; w: number; h: number }
  | { id: string; n: number; text: string; type: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { id: string; n: number; text: string; type: "pin"; x: number; y: number }
  | { id: string; n: number; text: string; type: "path"; points: [number, number][] };
export interface FeedbackEntry { status: Status; comment: string; annotations: Annotation[] }
export interface FeedbackPayload { schemaVersion: 1; items: Record<string, FeedbackEntry> }
export interface FeedbackFile extends FeedbackPayload { roundId: string; status: "draft" | "submitted"; updatedAt: string; submittedAt?: string }
export interface RoundItem {
  id: string; title: string; description?: string; screenshot: string; route: string;
  viewport: { width: number; height: number }; previousItemId?: string; reference?: string;
}
export interface Round {
  schemaVersion: 1; id: string; createdAt: string; gitSha: string; summary: string;
  status: "open" | "submitted" | "resolved"; baseUrl?: string; submittedAt?: string; resolvedAt?: string; items: RoundItem[];
}
export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
export const REF_FILE: RegExp;
export const STATUSES: Status[];
export const ANNOTATION_TYPES: string[];
export const LIMITS: { comment: number; annotationText: number; annotations: number; pathPoints: number; coord: number };
export function validateFeedback(input: unknown, opts?: { itemIds?: string[] }): Result<FeedbackPayload>;
export function validateRound(input: unknown): Result<Round>;
