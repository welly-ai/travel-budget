import { Suspense } from "react";
import { services } from "@/server";
import { formatTime } from "../../format";
import { requireUser } from "../../session";
import { ToleranceEditor, type ProfileView } from "./tolerance-editor";

async function ToleranceContent() {
  await requireUser();
  const profiles: ProfileView[] = services()
    .listToleranceProfiles()
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      maxIncreasePct: profile.maxIncreasePct,
      maxDecreasePct: profile.maxDecreasePct,
      version: profile.version,
      isDefault: profile.isDefault,
      updatedText: `${profile.updatedByName ?? "（系統建立）"} · ${formatTime(profile.updatedAt)}`,
    }));
  return <ToleranceEditor profiles={profiles} />;
}

export default function TolerancePage() {
  return (
    <main className="max-w-3xl">
      <h1 className="text-xl font-semibold">容許範圍設定</h1>
      <p className="mt-2 text-sm text-muted">
        專案的手動覆寫偏離 Guidance 超過這裡的比例時會跳警告，要填理由才能儲存。不同廠區或專案可以用不同組。
      </p>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">載入中…</p>}>
        <ToleranceContent />
      </Suspense>
    </main>
  );
}
