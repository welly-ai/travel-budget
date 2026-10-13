"use client";

import { useRouter } from "next/navigation";
import { useState, type SyntheticEvent } from "react";
import { createToleranceAction, updateToleranceAction, type ToleranceSaveOutcome } from "./actions";

export interface ProfileView {
  id: string;
  name: string;
  maxIncreasePct: number;
  maxDecreasePct: number;
  version: number;
  isDefault: boolean;
  /** 「最後修改者 · 時間」，已在伺服器端格式化。 */
  updatedText: string;
}

interface FormValues {
  name: string;
  maxIncreasePct: number;
  maxDecreasePct: number;
}

type Notice = { kind: "conflict" | "duplicate" | "error"; text: string } | null;

function noticeFrom(outcome: ToleranceSaveOutcome): Notice {
  if (outcome.ok) return null;
  switch (outcome.kind) {
    case "conflict":
      return { kind: "conflict", text: `已被 ${outcome.byName} 於 ${outcome.atText} 修改，請重新載入` };
    case "duplicate":
      return { kind: "duplicate", text: outcome.message };
    case "error":
      return { kind: "error", text: outcome.message };
  }
}

/** 表單欄位 → 數值；空白或不是數字回 null。 */
function readValues(form: HTMLFormElement): FormValues | null {
  const data = new FormData(form);
  const name = data.get("name");
  const up = data.get("maxIncreasePct");
  const down = data.get("maxDecreasePct");
  if (typeof name !== "string" || typeof up !== "string" || typeof down !== "string") return null;
  if (name.trim() === "" || up.trim() === "" || down.trim() === "") return null;
  const maxIncreasePct = Number(up);
  const maxDecreasePct = Number(down);
  if (!Number.isFinite(maxIncreasePct) || !Number.isFinite(maxDecreasePct)) return null;
  return { name: name.trim(), maxIncreasePct, maxDecreasePct };
}

const INPUT = "w-full rounded border border-line bg-card px-2 py-1.5 text-sm";

function ProfileFields({ idPrefix, initial }: { idPrefix: string; initial: FormValues | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
      <label className="text-sm" htmlFor={`${idPrefix}-name`}>
        <span className="mb-1 block text-muted">名稱</span>
        <input id={`${idPrefix}-name`} name="name" required maxLength={100} defaultValue={initial?.name ?? ""} placeholder="例如：海外廠區" className={INPUT} />
      </label>
      <label className="text-sm" htmlFor={`${idPrefix}-up`}>
        <span className="mb-1 block text-muted">最多增加（%）</span>
        <input id={`${idPrefix}-up`} name="maxIncreasePct" type="number" inputMode="decimal" min={0} max={1000} step="any" required defaultValue={initial?.maxIncreasePct ?? ""} className={`${INPUT} num`} />
      </label>
      <label className="text-sm" htmlFor={`${idPrefix}-down`}>
        <span className="mb-1 block text-muted">最多減少（%）</span>
        <input id={`${idPrefix}-down`} name="maxDecreasePct" type="number" inputMode="decimal" min={0} max={1000} step="any" required defaultValue={initial?.maxDecreasePct ?? ""} className={`${INPUT} num`} />
      </label>
    </div>
  );
}

function NoticeBox({ notice, onReload }: { notice: Notice; onReload: () => void }) {
  if (notice === null) return null;
  return (
    <div role="alert" data-testid={`notice-${notice.kind}`} className="mt-3 flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>{notice.text}</span>
      {notice.kind === "conflict" && (
        <button type="button" onClick={onReload} className="rounded border border-amber-400 bg-card px-2 py-0.5">
          重新載入
        </button>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: ProfileView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = readValues(event.currentTarget);
    if (values === null) {
      setNotice({ kind: "error", text: "名稱與兩個百分比都要填" });
      return;
    }
    setBusy(true);
    setNotice(null);
    const outcome = await updateToleranceAction({ profileId: profile.id, expectedVersion: profile.version, ...values });
    setBusy(false);
    if (outcome.ok) setEditing(false);
    else setNotice(noticeFrom(outcome));
  }

  function reload() {
    setNotice(null);
    setEditing(false);
    router.refresh();
  }

  return (
    <li data-testid="tolerance-profile" className="rounded-lg border border-line bg-card p-4">
      {editing ? (
        <form onSubmit={(event) => { void onSubmit(event); }} aria-label={`編輯「${profile.name}」`}>
          <ProfileFields idPrefix={`edit-${profile.id}`} initial={profile} />
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy} className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {busy ? "儲存中…" : "儲存"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setNotice(null); }} className="rounded border border-line px-3 py-1.5 text-sm">
              取消
            </button>
          </div>
          <NoticeBox notice={notice} onReload={reload} />
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium" data-testid="profile-name">{profile.name}</span>
              {profile.isDefault && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-900">預設</span>}
            </div>
            <div className="num mt-1 text-sm" data-testid="profile-limits">
              上限 +{profile.maxIncreasePct}% · 下限 −{profile.maxDecreasePct}%
            </div>
            <div className="mt-1 text-xs text-muted">最後修改：{profile.updatedText}</div>
          </div>
          <button type="button" onClick={() => { setEditing(true); }} className="rounded border border-line px-3 py-1.5 text-sm" aria-label={`編輯「${profile.name}」`}>
            編輯
          </button>
        </div>
      )}
    </li>
  );
}

function CreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [formKey, setFormKey] = useState(0);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = readValues(event.currentTarget);
    if (values === null) {
      setNotice({ kind: "error", text: "名稱與兩個百分比都要填" });
      return;
    }
    setBusy(true);
    setNotice(null);
    const outcome = await createToleranceAction(values);
    setBusy(false);
    if (outcome.ok) setFormKey((key) => key + 1); // 清空表單
    else setNotice(noticeFrom(outcome));
  }

  return (
    <form key={formKey} onSubmit={(event) => { void onSubmit(event); }} aria-label="新增一組" className="rounded-lg border border-dashed border-line bg-card p-4">
      <h2 className="mb-3 font-medium">新增一組</h2>
      <ProfileFields idPrefix="new" initial={null} />
      <button type="submit" disabled={busy} className="mt-3 rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-60">
        {busy ? "新增中…" : "新增"}
      </button>
      <NoticeBox notice={notice} onReload={() => { router.refresh(); }} />
    </form>
  );
}

export function ToleranceEditor({ profiles }: { profiles: ProfileView[] }) {
  return (
    <div className="mt-6 space-y-6">
      <ul className="space-y-3">
        {profiles.map((profile) => (
          // key 帶 version：重新載入後版本變了，卡片重建、表單回到最新值。
          <ProfileCard key={`${profile.id}:${profile.version}`} profile={profile} />
        ))}
      </ul>
      <CreateForm />
    </div>
  );
}
