"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  GATE_KEYS,
  STAGES,
  type GateKey,
  type Phase,
  type ProjectClass,
  type ProjectResult,
  type ProjectSettings,
  type ProjectStatus,
  type Stage,
} from "@/domain";
import { formatNumber } from "../../format";
import { recalculateAction, saveAction } from "./actions";
import { Matrix } from "./matrix";

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

/** 固定欄位順序的字串，用來判斷有沒有未儲存的修改。 */
function fingerprint(settings: ProjectSettings): string {
  return JSON.stringify([
    settings.phase,
    settings.projectClass,
    settings.includePreA,
    settings.includeTld,
    GATE_KEYS.map((key) => settings.gates[key]),
    STAGES.map((stage) => settings.buildDates[stage] ?? ""),
  ]);
}

type Notice =
  | { kind: "saved"; text: string }
  | { kind: "conflict"; text: string }
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
}

export function ProjectEditor(props: Props) {
  const router = useRouter();
  const [settings, setSettings] = useState(props.initialSettings);
  const [savedSettings, setSavedSettings] = useState(props.initialSettings);
  const [version, setVersion] = useState(props.version);
  const [result, setResult] = useState(props.initialResult);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const latestRequest = useRef(0);

  const dirty = fingerprint(settings) !== fingerprint(savedSettings);

  /** 改設定：先更新畫面，再請伺服器重算；只採用最後一次請求的結果。 */
  function change(next: ProjectSettings) {
    setSettings(next);
    setNotice(null);
    const requestId = ++latestRequest.current;
    void recalculateAction({ projectCode: props.projectCode, settings: next }).then((outcome) => {
      if (requestId !== latestRequest.current) return;
      if (outcome.ok) setResult(outcome.result);
      else setNotice({ kind: "error", text: outcome.message });
    });
  }

  async function save() {
    setSaving(true);
    const outcome = await saveAction({ projectCode: props.projectCode, expectedVersion: version, settings });
    setSaving(false);
    if (outcome.ok) {
      setVersion(outcome.version);
      setSavedSettings(settings);
      setNotice({ kind: "saved", text: `已儲存，現在是第 ${outcome.version} 版` });
      router.refresh();
    } else if (outcome.kind === "conflict") {
      setNotice({ kind: "conflict", text: `已被 ${outcome.byName} 於 ${outcome.atText} 修改（現在是第 ${outcome.currentVersion} 版）` });
    } else {
      setNotice({ kind: "error", text: outcome.message });
    }
  }

  function toggleGate(key: GateKey, value: boolean) {
    change({ ...settings, gates: { ...settings.gates, [key]: value } });
  }

  function setBuildDate(stage: Stage, value: string) {
    const rest = Object.fromEntries(Object.entries(settings.buildDates).filter(([key]) => key !== stage));
    change({ ...settings, buildDates: value === "" ? rest : { ...rest, [stage]: value } });
  }

  const input = "rounded-md border border-line bg-white px-2 py-1.5 text-sm";

  return (
    <div className="mt-3">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold">{props.projectCode}</h1>
        <span>{props.projectName}</span>
        <span className="text-sm text-muted">LOB：{props.lob}</span>
        <span className="text-sm text-muted">{props.status === "draft" ? "草稿" : "生效中"}</span>
        <span className="num text-sm text-muted" data-testid="version">
          第 {version} 版
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5 rounded-lg border border-line bg-card p-4 text-sm lg:self-start">
          <fieldset>
            <legend className="mb-1 font-medium">Phase</legend>
            <div className="flex gap-4">
              {PHASES.map((phase) => (
                <label key={phase} className="flex items-center gap-1.5">
                  <input type="radio" name="phase" checked={settings.phase === phase} onChange={() => {
                      change({ ...settings, phase });
                    }} />
                  {phase}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1 block font-medium">Class</span>
            <select
              aria-label="Class"
              className={`${input} w-full`}
              value={String(settings.projectClass)}
              onChange={(event) => {
                const next = CLASSES.find((value) => String(value) === event.target.value);
                if (next !== undefined) change({ ...settings, projectClass: next });
              }}
            >
              {CLASSES.map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="mb-1 font-medium">Adder</legend>
            <div className="space-y-1">
              {ADDER_KEYS.map((key) => (
                <GateCheckbox key={key} label={GATE_LABEL[key]} checked={settings.gates[key]} onChange={(value) => {
                    toggleGate(key, value);
                  }} />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 font-medium">Option</legend>
            <div className="space-y-1">
              {OPTION_KEYS.map((key) => (
                <GateCheckbox key={key} label={GATE_LABEL[key]} checked={settings.gates[key]} onChange={(value) => {
                    toggleGate(key, value);
                  }} />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 font-medium">選配 Stage</legend>
            <div className="space-y-1">
              <GateCheckbox label="計入 pre A" checked={settings.includePreA} onChange={(value) => {
                  change({ ...settings, includePreA: value });
                }} />
              <GateCheckbox label="計入 TLD" checked={settings.includeTld} onChange={(value) => {
                  change({ ...settings, includeTld: value });
                }} />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 font-medium">build 日期</legend>
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
          </fieldset>
        </aside>

        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-line bg-card px-4 py-2">
              <div className="text-xs text-muted">總人天</div>
              <div className="num text-2xl font-semibold" data-testid="total-man-days">
                {formatNumber(result.total.manDays)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card px-4 py-2">
              <div className="text-xs text-muted">總人次</div>
              <div className="num text-2xl font-semibold">{formatNumber(result.total.man)}</div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <a
                href={`/api/projects/${encodeURIComponent(props.projectCode)}/export`}
                className="rounded-md border border-line bg-card px-3 py-2 text-sm hover:bg-background"
                title="匯出的是已儲存的版本"
              >
                匯出 Excel（舊版面）
              </a>
              <button
                type="button"
                onClick={() => {
                  void save();
                }}
                disabled={saving || !dirty}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </div>

          {notice !== null && <NoticeBar notice={notice} />}
          {dirty && notice === null && <p className="mb-3 text-sm text-muted">有尚未儲存的修改</p>}

          <Matrix result={result} />
        </section>
      </div>
    </div>
  );
}

function GateCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => {
          onChange(event.target.checked);
        }} />
      {label}
    </label>
  );
}

function NoticeBar({ notice }: { notice: NonNullable<Notice> }) {
  const tone =
    notice.kind === "saved" ? "bg-green-50 text-green-900" : notice.kind === "conflict" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800";
  return (
    <div role="status" data-testid={`notice-${notice.kind}`} className={`mb-3 flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-sm ${tone}`}>
      <span>{notice.text}</span>
      {notice.kind === "conflict" && (
        <button type="button" className="rounded-md border border-amber-400 bg-white px-2 py-1" onClick={() => {
            window.location.reload();
          }}>
          重新載入
        </button>
      )}
    </div>
  );
}
