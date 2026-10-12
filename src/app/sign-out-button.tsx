"use client";

import { useRouter } from "next/navigation";
import { authClient } from "./auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-md border border-line px-2 py-1 hover:bg-background"
      onClick={() => {
        void authClient.signOut().then(() => {
          router.push("/login");
          router.refresh();
        });
      }}
    >
      登出
    </button>
  );
}
