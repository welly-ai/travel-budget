"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  GATE_KEYS,
  STAGES,
  type CellOverride,
  type FunctionName,
  type GateKey,
  type Phase,
  type ProjectClass,
  type ProjectResult,
  type ProjectSettings,
  type ProjectStatus,
  type Stage,
  type ToleranceProfile,
} from "@/domain";
import { formatNumber } from "../../format";
import { recalculateAction, reviewOverridesAction, saveAction, type ReviewOutcome } from "./actions";
import { CellOverrideDialog } from "./cell-override-dialog";
import { Matrix } from "./matrix";
import { findCell } from "./overrides";

const GATE_LABEL: Record<GateKey, string> = {
  adsp: "ADSP",
  hapticTp2: "Haptic TP2",
  id: "ID",
  dqaItm: "DQA ITM",
  dqaRel: "DQA REL",
  mePlastic: "ME Plastic",
  thm: "THM",
  secondPcb: "2nd PCB（4 列）",
  gpu: "GPU",
};
const ADDER_KEYS: readonly GateKey[] = ["adsp", "hapticTp2", "id", "dqaItm", "dqaRel", "mePlastic", "thm"];
const OPTION_KEYS: readonly GateKey[] = ["secondPcb", "gpu"];
const PHASES: readonly Phase[] = [2, 3];
const CLASSES: readonly ProjectClass[] = [4, 3.5, 3, 2];
const RECALC_DELAY_MS = 250;

type Review = Extract<ReviewOutcome, { ok: true }>;

/** 頁面上可以改、要一起存的東西：左側設定、格子覆寫、選用的容許範圍設定。 */
interface Draft {
  settings: ProjectSettings;
  cellOverrides: CellOverride[];
  toleranceProfileId: string | null;
}

/** 固定欄位順序的字串，用來判斷有沒有未儲存的修改。 */
function fingerprint(draft: Draft): string {
  const { settings } = draft;
  return JSON.stringify([
    settings.phase,
    settings.projectClass,
    settings.includePreA,
    settings.includeTld,
    GATE_KEYS.map((key) => settings.gates[key]),
    STAGES.map((stage) => settings.buildDates[stage] ?? ""),
    STAGES.flatMap((stage) =>
      draft.cellOverrides
        .filter((item) => item.stage === stage)
        .map((item) => [item.function, item.man, item.days, item.reason])
        .sort(),
    ),
    draft.toleranceProfileId,
  ]);
}

function signed(value: number): string {
  return value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : "±0";
}

function profileLabel(profile: ToleranceProfile): string {
  const range =
    profile.maxIncreasePct === profile.maxDecreasePct
      ? `±${formatNumber(profile.maxIncreasePct)}%`
      : `+${formatNumber(profile.maxIncreasePct)}%／−${formatNumber(profile.maxDecreasePct)}%`;
  return profile.name.includes(range) ? profile.name : `${profile.name}（${range}）`;
}

type Notice =
  | { kind: "saved"; text: string }
  | { kind: "conflict"; text: string }
  | { kind: "reasonRequired"; text: string }
  | { kind: "error"; text: string }
  | null;

interface Props {
  projectCode: string;
  projectName: string;
  lob: string;
  status: ProjectStatus;
  version: number;
  initialSettings: ProjectSettings;
  initialResult: ProjectResult;
  initialReview: Omit<Review, "ok">;
  initialCellOverrides: CellOverride[];
  initialToleranceProfileId: string | null;
  profiles: ToleranceProfile[];
}

export function ProjectEditor(props: Props) {
  const router = useRouter();
  const initialDraft: Draft = {
    settings: props.initialSettings,
    cellOverrides: props.initialCellOverrides,
    toleranceProfileId: props.initialToleranceProfileId,
  };
  const [draft, setDraft] = useState(initialDraft);
  const [saved, setSaved] = useState(initialDraft);
  const [version, setVersion] = useState(props.version);
  /** 衝突時從伺服器得知的最新版號；頁首顯示它。 */
  const [latestVersion, setLatestVersion] = useState<number | null>(null);
  const [result, setResult] = useState(props.initialResult);
  const [savedResult, setSavedResult] = useState(props.initialResult);
  const [review, setReview] = useState(props.initialReview);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [openCell, setOpenCell] = useState<{ stage: Stage; fn: FunctionName } | null>(null);
  const latestRequest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowLeave = useRef(false);

  const dirty = fingerprint(draft) !== fingerprint(saved);
  const settings = draft.settings;

  // 有未存的修改時，關分頁或重新整理要提醒。
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  /** 改草稿：先更新畫面，稍等一下再請伺服器重算與檢查；只採用最後一次請求的結果。 */
  function change(next: Draft) {
    setDraft(next);
    if (notice?.kind !== "conflict") setNotice(null);
    setChecking(true);
    const requestId = ++latestRequest.current;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const input = { projectCode: props.projectCode, settings: next.settings, cellOverrides: next.cellOverrides };
      void Promise.all([recalculateAction(input), reviewOverridesAction({ ...input, toleranceProfileId: next.toleranceProfileId })]).then(
        ([calculated, reviewed]) => {
          if (requestId !== latestRequest.current) return;
          setChecking(false);
          if (calculated.ok) setResult(calculated.result);
          else setNotice({ kind: "error", text: calculated.message });
          if (reviewed.ok) setReview(reviewed);
          else setNotice({ kind: "error", text: reviewed.message });
        },
      );
    }, RECALC_DELAY_MS);
  }

  function changeSettings(next: ProjectSettings) {
    change({ ...draft, settings: next });
  }

  function revert() {
    change(saved);
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    const outcome = await saveAction({
      projectCode: props.projectCode,
      expectedVersion: version,
      settings: draft.settings,
      cellOverrides: draft.cellOverrides,
      toleranceProfileId: draft.toleranceProfileId,
    });
    setSaving(false);
    if (outcome.ok) {
      setVersion(outcome.version);
      setSaved(draft);
      setSavedResult(result);
      setNotice({ kind: "saved", text: `已儲存，現在是第 ${outcome.version} 版` });
      router.refresh();
    } else if (outcome.kind === "conflict") {
      setLatestVersion(outcome.currentVersion);
      setNotice({
        kind: "conflict",
        text: `這個專案已被 ${outcome.byName} 於 ${outcome.atText} 修改，現在是第 ${outcome.currentVersion} 版，你的修改沒有存進去。按「重新載入」會載入最新版，你這次的修改會消失。`,
      });
    } else if (outcome.kind === "reasonRequired") {
      const cells = outcome.cells.map((cell) => `${cell.function} × ${cell.stage}`).join("、");
      setNotice({ kind: "reasonRequired", text: `沒有存檔：${cells} 超出容許範圍，需要填理由。點紅框的格子填寫後再存。` });
    } else {
      setNotice({ kind: "error", text: outcome.message });
    }
  }

  function toggleGate(key: GateKey, value: boolean) {
    changeSettings({ ...settings, gates: { ...settings.gates, [key]: value } });
  }

  function setBuildDate(stage: Stage, value: string) {
    const rest = Object.fromEntries(Object.entries(settings.buildDates).filter(([key]) => key !== stage));
    changeSettings({ ...settings, buildDates: value === "" ? rest : { ...rest, [stage]: value } });
  }

  function setCellOverride(stage: Stage, fn: FunctionName, next: CellOverride | null) {
    const others = draft.cellOverrides.filter((item) => !(item.stage === stage && item.function === fn));
    change({ ...draft, cellOverrides: next === null ? others : [...others, next] });
  }

  const closeDialog = useCallback(() => {
    setOpenCell(null);
  }, []);

  const input = "rounded-md border border-line bg-white px-2 py-1.5 text-sm";
  const savedTotal = savedResult.total.manDays;
  const draftTotal = result.total.manDays;
  const skippedStages = STAGES.filter((stage) => (stage === "pre A" && !settings.includePreA) || (stage === "TLD" && !settings.includeTld));
  const defaultProfile = props.profiles.find((profile) => profile.isDefault);
  const missingCount = review.missingReasons.length;

  return (
    <div className="mt-3">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold">{props.projectCode}</h1>
        <span>{props.projectName}</span>
        <span className="text-sm text-muted">LOB：{props.lob}</span>
        <span className="text-sm text-muted">{props.status === "draft" ? "草稿" : "生效中"}</span>
        <span className="num text-sm text-muted" data-testid="version">
          第 {latestVersion ?? version} 版
        </span>
        {latestVersion !== null && <span className="text-sm text-amber-800">（你畫面上是第 {version} 版的內容）</span>}
      </div>

      <div
        className="sticky top-0 z-30 -mx-4 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line bg-card/95 px-4 py-2 backdrop-blur"
        data-testid="diff-bar"
      >
        <div className="num flex flex-wrap items-baseline gap-x-2">
          {dirty ? (
            <>
              <span className="text-sm text-muted">已存 {formatNumber(savedTotal)} 人天 →</span>
              <span className="text-sm text-muted">試算</span>
              <span className="text-2xl font-semibold" data-testid="total-man-days">
                {formatNumber(draftTotal)}
              </span>
              <span className="text-sm text-muted">人天</span>
              <span className={`text-sm font-medium ${draftTotal > savedTotal ? "text-amber-700" : draftTotal < savedTotal ? "text-sky-700" : "text-muted"}`} data-testid="total-delta">
                （{signed(draftTotal - savedTotal)}）
              </span>
            </>
          ) : (
            <>
              <span className="text-sm text-muted">總人天</span>
              <span className="text-2xl font-semibold" data-testid="total-man-days">
                {formatNumber(draftTotal)}
              </span>
              <span className="text-sm text-muted">· {formatNumber(result.total.man)} 人次 · 已存</span>
            </>
          )}
          {checking && <span className="text-xs text-muted">試算中…</span>}
        </div>
        {missingCount > 0 && (
          <span className="text-sm text-red-700" data-testid="missing-reasons">
            {missingCount} 格超出容許範圍，還沒填理由
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a
            href={`/api/projects/${encodeURIComponent(props.projectCode)}/export`}
            className="hidden rounded-md border border-line bg-card px-3 py-2 text-sm hover:bg-background sm:inline-block"
            title="匯出的是已儲存的版本"
          >
            匯出 Excel（舊版面）
          </a>
          {dirty && (
            <button type="button" onClick={revert} className="rounded-md border border-line bg-card px-3 py-2 text-sm hover:bg-background">
              還原
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void save();
            }}
            disabled={saving || checking || !dirty || latestVersion !== null}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            {saving ? "儲存中…" : dirty ? "儲存修改" : "沒有要儲存的修改"}
          </button>
        </div>
      </div>

      {notice !== null && <NoticeBar
          notice={notice}
          onReload={() => {
            allowLeave.current = true; // 提示已經講清楚會丟掉修改，不再跳離開提醒
            window.location.reload();
          }}
        />}

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5 rounded-lg border border-line bg-card p-4 text-sm lg:self-start">
          <div>
            <h2 className="text-base font-semibold">設定</h2>
            <p className="text-muted">改左邊或點右邊格子，表格會重算。按「儲存修改」才會存。</p>
          </div>

          <SettingGroup title="① 專案分類" hint="決定套用哪一組 Guidance。">
            <div className="flex items-center gap-4">
              <span className="w-12 text-muted">Phase</span>
              {PHASES.map((phase) => (
                <label key={phase} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="phase"
                    checked={settings.phase === phase}
                    onChange={() => {
                      changeSettings({ ...settings, phase });
                    }}
                  />
                  {phase}
                </label>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-4">
              <span className="w-12 text-muted">Class</span>
              <select
                aria-label="Class"
                className={`${input} flex-1`}
                value={String(settings.projectClass)}
                onChange={(event) => {
                  const next = CLASSES.find((value) => String(value) === event.target.value);
                  if (next !== undefined) changeSettings({ ...settings, projectClass: next });
                }}
              >
                {CLASSES.map((value) => (
                  <option key={value} value={String(value)}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </SettingGroup>

          <SettingGroup title="② 追加項目" hint="勾選後，對應的 Adder／Option 列才會計入。">
            <div className="text-xs text-muted">Adder</div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
              {ADDER_KEYS.map((key) => (
                <GateCheckbox
                  key={key}
                  label={GATE_LABEL[key]}
                  checked={settings.gates[key]}
                  onChange={(value) => {
                    toggleGate(key, value);
                  }}
                />
              ))}
            </div>
            <div className="mt-2 text-xs text-muted">Option</div>
            <div className="mt-1 space-y-1">
              {OPTION_KEYS.map((key) => (
                <GateCheckbox
                  key={key}
                  label={GATE_LABEL[key]}
                  checked={settings.gates[key]}
                  onChange={(value) => {
                    toggleGate(key, value);
                  }}
                />
              ))}
            </div>
          </SettingGroup>

          <SettingGroup title="③ 選配 Stage" hint="沒勾的 Stage 不計入 Guidance，表格中以斜線標示。">
            <div className="space-y-1">
              <GateCheckbox
                label="計入 pre A"
                checked={settings.includePreA}
                onChange={(value) => {
                  changeSettings({ ...settings, includePreA: value });
                }}
              />
              <GateCheckbox
                label="計入 TLD"
                checked={settings.includeTld}
                onChange={(value) => {
                  changeSettings({ ...settings, includeTld: value });
                }}
              />
            </div>
          </SettingGroup>

          <SettingGroup title="容許範圍" hint="手動覆寫可以偏離 Guidance 多少；超過就要填理由。">
            <select
              aria-label="容許範圍"
              className={`${input} w-full`}
              value={draft.toleranceProfileId ?? defaultProfile?.id ?? ""}
              onChange={(event) => {
                const picked = props.profiles.find((profile) => profile.id === event.target.value);
                if (picked !== undefined) change({ ...draft, toleranceProfileId: picked.isDefault ? null : picked.id });
              }}
            >
              {props.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profileLabel(profile)}
                </option>
              ))}
            </select>
          </SettingGroup>

          <SettingGroup title="④ build 日期" hint="只影響 OA 上傳的月份，不會改變人天表。">
            <div className="space-y-1.5">
              {STAGES.map((stage) => (
                <label key={stage} className="flex items-center justify-between gap-2">
                  <span className="w-16 text-muted">{stage}</span>
                  <input
                    type="date"
                    aria-label={`${stage} build 日期`}
                    className={`${input} flex-1`}
                    value={settings.buildDates[stage] ?? ""}
                    onChange={(event) => {
                      setBuildDate(stage, event.target.value);
                    }}
                  />
                </label>
              ))}
            </div>
          </SettingGroup>
        </aside>

        <section className="min-w-0">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-base font-semibold">人天表</h2>
            <p className="text-sm text-muted">點 Function 列的格子可以手動覆寫。</p>
            <ul className="flex flex-wrap gap-x-3 text-xs text-muted sm:ml-auto">
              <li className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm border border-amber-200 bg-amber-50" />
                和已存不同
              </li>
              <li className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-inset ring-accent/50" />
                手動覆寫
              </li>
              <li className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-inset ring-red-500" />
                缺理由
              </li>
              <li className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-line"
                  style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 2px, rgba(101,109,118,0.35) 2px 3px)" }}
                />
                Stage 未計入
              </li>
            </ul>
          </div>

          <Matrix
            result={result}
            savedResult={savedResult}
            guidance={review.guidance}
            cellOverrides={draft.cellOverrides}
            warnings={review.warnings}
            skippedStages={skippedStages}
            onCellClick={(stage, fn) => {
              setOpenCell({ stage, fn });
            }}
          />
        </section>
      </div>

      {openCell !== null && (
        <CellOverrideDialog
          key={`${openCell.stage}-${openCell.fn}`}
          stage={openCell.stage}
          fn={openCell.fn}
          guidance={findCell(review.guidance, openCell.stage, openCell.fn)}
          override={findCell(draft.cellOverrides, openCell.stage, openCell.fn)}
          warning={findCell(review.warnings, openCell.stage, openCell.fn)}
          checking={checking}
          onChange={(next) => {
            setCellOverride(openCell.stage, openCell.fn, next);
          }}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

function SettingGroup({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-3">
      <legend className="pr-2 font-medium">{title}</legend>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      {children}
    </fieldset>
  );
}

function GateCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      {label}
    </label>
  );
}

function NoticeBar({ notice, onReload }: { notice: NonNullable<Notice>; onReload: () => void }) {
  const tone =
    notice.kind === "saved"
      ? "bg-green-50 text-green-900"
      : notice.kind === "conflict" || notice.kind === "reasonRequired"
        ? "bg-amber-50 text-amber-900"
        : "bg-red-50 text-red-800";
  return (
    <div role="status" data-testid={`notice-${notice.kind}`} className={`mb-3 flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-sm ${tone}`}>
      <span>{notice.text}</span>
      {notice.kind === "conflict" && (
        <button
          type="button"
          className="rounded-md border border-amber-400 bg-white px-2 py-1"
          onClick={() => {
            onReload();
          }}
        >
          重新載入
        </button>
      )}
    </div>
  );
}
