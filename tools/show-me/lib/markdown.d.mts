import type { Annotation, FeedbackPayload, Round } from "./validate.mjs";
export function describeGeometry(a: Annotation): string;
export function annotatedName(itemId: string): string;
export function renderFeedbackMd(round: Round, feedback: FeedbackPayload, opts?: { annotated?: Set<string>; submittedAt?: string }): string;
