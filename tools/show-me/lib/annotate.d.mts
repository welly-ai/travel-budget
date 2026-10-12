import type { FeedbackPayload, Round } from "./validate.mjs";
export const INSTALL_HINT: string;
export function launchChromium(): Promise<import("playwright").Browser>;
export function annotateRound(root: string, round: Round, feedback: FeedbackPayload, origin: string): Promise<{ done: string[]; warnings: string[] }>;
