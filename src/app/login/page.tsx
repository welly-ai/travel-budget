import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-line bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">差旅人天預算工具</h1>
        <p className="mt-1 text-sm text-muted">請登入後使用</p>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">載入中…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
