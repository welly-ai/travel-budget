import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

/** 讀取目前登入者；沒登入回 null。會讀 request，所以呼叫端必須在 Suspense 裡。 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // 先讀 request：建置時在這裡停下（改成請求時才執行），不會去建立 auth 或開資料庫。
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (session === null) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

/** 頁面、server action、API 的第二道防線（proxy 只做 cookie 的快速檢查）。 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user === null) redirect("/login");
  return user;
}
