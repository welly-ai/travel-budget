import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server";

// 第一次請求才建立 auth（建置階段不開資料庫）。
export function GET(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(request);
}

export function POST(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(request);
}
