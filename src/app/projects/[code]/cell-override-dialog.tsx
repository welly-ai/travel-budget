"use client";

import { useEffect, useState } from "react";
import { hasReason, type CellOverride, type FunctionName, type GuidanceCell, type OverrideWarning, type Stage } from "@/domain";
import { formatNumber } from "../../format";
import { warningText } from "./overrides";

interface Props {
  stage: Stage;
  fn: FunctionName;
  guidance: GuidanceCell | undefined;
  override: CellOverride | undefined;
  warning: OverrideWarning | undefined;
  /** 警告還在重新檢查中。 */
  checking: boolean;
  onChange: (override: CellOverride | null) => void;
  onClose: () => void;
}

function parseNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** 單一格子的手動覆寫：輸入人次、天數、理由；也可以恢復 Guidance。每次輸入都直接更新草稿，由頁面重新試算與檢查。 */
export function CellOverrideDialog({ stage, fn, guidance, override, warning, checking, onChange, onClose }: Props) {
  const [manText, setManText] = useState(String(override?.man ?? guidance?.man ?? 0));
  const [daysText, setDaysText] = useState(String(override?.days ?? guidance?.days ?? 0));
  const [reason, setReason] = useState(override?.reason ?? "");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function update(nextMan: string, nextDays: string, nextReason: string) {
    setManText(nextMan);
    setDaysText(nextDays);
    setReason(nextReason);
    const man = parseNumber(nextMan);
    const days = parseNumber(nextDays);
    if (man === null || days === null) return;
    onChange({ stage, function: fn, man, days, reason: nextReason });
  }

  const man = parseNumber(manText);
  const days = parseNumber(daysText);
  const needsReason = warning !== undefined && !hasReason(reason);
  const input = "w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm num";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="override-title"
        className="w-full max-w-sm rounded-lg border border-line bg-card p-4 text-sm shadow-lg"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <h2 id="override-title" className="text-base font-semibold">
          {fn} × {stage}
        </h2>
        <p className="mt-1 text-muted" data-testid="override-guidance">
          Guidance 有效值：{formatNumber(guidance?.man ?? 0)} 人次 × {formatNumber(guidance?.days ?? 0)} 天 = {formatNumber(guidance?.manDays ?? 0)} 人天
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block font-medium">人次</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              autoFocus
              className={input}
              value={manText}
              onChange={(event) => {
                update(event.target.value, daysText, reason);
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">天數</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              className={input}
              value={daysText}
              onChange={(event) => {
                update(manText, event.target.value, reason);
              }}
            />
          </label>
        </div>
        <p className="mt-2 num">
          {man === null || days === null ? (
            <span className="text-red-700">人次和天數都要填數字</span>
          ) : (
            <>
              手動：{formatNumber(man)} × {formatNumber(days)} = <span className="font-semibold">{formatNumber(man * days)} 人天</span>
            </>
          )}
        </p>

        {warning !== undefined && (
          <p role="alert" data-testid="override-warning" className={`mt-3 rounded-md px-3 py-2 ${needsReason ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
            {warningText({ ...warning, reason })}
          </p>
        )}
        {checking && warning === undefined && <p className="mt-3 text-xs text-muted">檢查容許範圍中…</p>}

        <label className="mt-3 block">
          <span className="mb-1 block font-medium">
            理由{needsReason ? <span className="text-red-700">（必填）</span> : <span className="font-normal text-muted">（超出容許範圍時必填）</span>}
          </span>
          <textarea
            rows={2}
            aria-label="理由"
            aria-invalid={needsReason}
            className={`w-full rounded-md border bg-white px-2 py-1.5 text-sm ${needsReason ? "border-red-500" : "border-line"}`}
            value={reason}
            placeholder="例如：客戶要求加做一次驗證"
            onChange={(event) => {
              update(manText, daysText, event.target.value);
            }}
          />
        </label>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-md border border-line px-3 py-2 hover:bg-background disabled:opacity-50"
            disabled={override === undefined}
            onClick={() => {
              onChange(null);
              onClose();
            }}
          >
            恢復 Guidance
          </button>
          <button type="button" className="rounded-md bg-accent px-4 py-2 font-medium text-white" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
