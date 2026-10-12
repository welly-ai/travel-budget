"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type SyntheticEvent } from "react";
import { authClient } from "../auth-client";

/** 只允許站內路徑，避免登入後被導到外部網站。 */
function safeNext(value: string | null): string {
  if (value !== null && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/projects";
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string") return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.email({ email, password });
    if (signInError) {
      setError("帳號或密碼不正確");
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form
      method="post"
      onSubmit={(event) => {
        void onSubmit(event);
      }} className="mt-6 space-y-4">
      <label className="block text-sm">
        <span className="font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-base"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">密碼</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-base"
        />
      </label>
      {error !== null && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-accent px-3 py-2 text-base font-medium text-white disabled:opacity-60"
      >
        {busy ? "登入中…" : "登入"}
      </button>
    </form>
  );
}
