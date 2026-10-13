import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "./session";
import { SignOutButton } from "./sign-out-button";

async function UserMenu() {
  const user = await getCurrentUser();
  if (user === null) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted sm:inline">{user.name}</span>
      <SignOutButton />
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <nav className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Link href="/projects" className="font-semibold">
            差旅人天預算工具
          </Link>
          <Link href="/settings/tolerance" className="text-sm text-accent underline-offset-2 hover:underline">
            容許範圍設定
          </Link>
        </nav>
        <Suspense fallback={<span className="text-sm text-muted">&nbsp;</span>}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}
