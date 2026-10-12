import type { Server } from "node:http";
import type { FeedbackPayload, Round } from "./lib/validate.mjs";
export function startServer(opts?: {
  root?: string; port?: number;
  annotator?: (root: string, round: Round, feedback: FeedbackPayload, origin: string) => Promise<{ done: string[]; warnings: string[] }>;
}): Promise<{ server: Server; port: number; url: string; close: () => Promise<void> }>;
