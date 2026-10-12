import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "./session";
import { SignOutButton } from "./sign-out-button";

async function UserMenu() {
  const user = await getCurrentUser();
  if (user === null) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted">{user.name}</span>
      <SignOutButton />
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/projects" className="font-semibold">
          差旅人天預算工具
        </Link>
        <Suspense fallback={<span className="text-sm text-muted">&nbsp;</span>}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}
