import {
  GROUPS,
  hasReason,
  STAGES,
  type CellOverride,
  type FunctionName,
  type GuidanceCell,
  type OverrideWarning,
  type ProjectResult,
  type Quantity,
  type Stage,
} from "@/domain";
import { formatNumber } from "../../format";
import { findCell, warningText } from "./overrides";

const EPSILON = 1e-9;

/** 未計入的 Stage：淡灰斜線底。 */
const SKIPPED_STAGE_STYLE = {
  backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, rgba(101,109,118,0.10) 6px 7px)",
};

function changed(now: Quantity, before: Quantity | undefined): boolean {
  const base = before ?? { man: 0, days: 0, manDays: 0 };
  return Math.abs(now.manDays - base.manDays) > EPSILON || Math.abs(now.man - base.man) > EPSILON;
}

function Delta({ now, before }: { now: Quantity; before: Quantity | undefined }) {
  const diff = now.manDays - (before?.manDays ?? 0);
  if (Math.abs(diff) <= EPSILON) return null;
  return (
    <span className={`ml-1 text-xs ${diff > 0 ? "text-amber-700" : "text-sky-700"}`}>
      {diff > 0 ? "▲" : "▼"}
      {formatNumber(Math.abs(diff))}
    </span>
  );
}

function Value({ quantity, before, strong }: { quantity: Quantity; before: Quantity | undefined; strong: boolean }) {
  const empty = quantity.man === 0 && quantity.manDays === 0;
  if (empty && !changed(quantity, before)) return <span className="text-muted">–</span>;
  return (
    <>
      <div className="whitespace-nowrap">
        <span className={strong ? "font-semibold" : "font-medium"}>{formatNumber(quantity.manDays)}</span>
        <Delta now={quantity} before={before} />
      </div>
      <div className="whitespace-nowrap text-xs text-muted">
        {formatNumber(quantity.man)} 人次 · {formatNumber(quantity.days)} 天
      </div>
    </>
  );
}

/** 彙總格（小計、合計、總計）：唯讀。 */
function SumCell({ quantity, before, strong = false, skipped = false }: { quantity: Quantity; before: Quantity | undefined; strong?: boolean; skipped?: boolean }) {
  const isChanged = changed(quantity, before);
  return (
    <td
      className={`num min-w-[92px] px-2 py-1.5 text-right align-top ${isChanged ? "bg-amber-50" : ""}`}
      style={skipped && !isChanged ? SKIPPED_STAGE_STYLE : undefined}
    >
      <Value quantity={quantity} before={before} strong={strong} />
    </td>
  );
}

export interface MatrixProps {
  result: ProjectResult;
  savedResult: ProjectResult;
  guidance: readonly GuidanceCell[];
  cellOverrides: readonly CellOverride[];
  warnings: readonly OverrideWarning[];
  skippedStages: readonly Stage[];
  onCellClick: (stage: Stage, fn: FunctionName) => void;
}

/** Stage × Function 人天矩陣。格子：上面是人天，下面是人次與天數；和已存結果不同的格子加底色與 ▲▼。 */
export function Matrix(props: MatrixProps) {
  const { result, savedResult, skippedStages } = props;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[900px] text-sm" data-testid="matrix">
        <thead className="border-b border-line bg-background text-muted">
          <tr>
            <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">Function</th>
            {STAGES.map((stage) => (
              <th key={stage} className="whitespace-nowrap px-2 py-2 text-right font-medium" style={skippedStages.includes(stage) ? SKIPPED_STAGE_STYLE : undefined}>
                {stage}
                {skippedStages.includes(stage) && <div className="text-xs font-normal">未計入</div>}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">合計</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => {
            const rows = result.functions.filter((fn) => fn.group === group);
            const subtotal = result.groups.find((g) => g.group === group);
            const savedSubtotal = savedResult.groups.find((g) => g.group === group);
            if (rows.length === 0) return null;
            return (
              <GroupRows key={group} group={group} rows={rows} subtotal={subtotal} savedSubtotal={savedSubtotal} {...props} />
            );
          })}
          <tr className="border-t-2 border-line bg-background font-semibold">
            <td className="sticky left-0 z-10 bg-background px-3 py-2">總計</td>
            {STAGES.map((stage) => (
              <SumCell key={stage} quantity={result.byStage[stage]} before={savedResult.byStage[stage]} strong skipped={skippedStages.includes(stage)} />
            ))}
            <SumCell quantity={result.total} before={savedResult.total} strong />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  rows,
  subtotal,
  savedSubtotal,
  savedResult,
  guidance,
  cellOverrides,
  warnings,
  skippedStages,
  onCellClick,
}: MatrixProps & {
  group: string;
  rows: ProjectResult["functions"];
  subtotal: ProjectResult["groups"][number] | undefined;
  savedSubtotal: ProjectResult["groups"][number] | undefined;
}) {
  return (
    <>
      <tr className="bg-background">
        <td className="sticky left-0 z-10 bg-background px-3 py-1 text-xs font-semibold text-muted">{group}</td>
        <td colSpan={STAGES.length + 1} />
      </tr>
      {rows.map((fn) => {
        const savedFn = savedResult.functions.find((item) => item.function === fn.function);
        return (
          <tr key={fn.function} className={`border-t border-line ${fn.total.man === 0 && fn.total.manDays === 0 ? "text-muted" : ""}`}>
            <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 align-top">{fn.function}</td>
            {STAGES.map((stage) => (
              <EditableCell
                key={stage}
                stage={stage}
                fn={fn.function}
                quantity={fn.byStage[stage]}
                before={savedFn?.byStage[stage]}
                guidance={findCell(guidance, stage, fn.function)}
                override={findCell(cellOverrides, stage, fn.function)}
                warning={findCell(warnings, stage, fn.function)}
                skipped={skippedStages.includes(stage)}
                onClick={() => {
                  onCellClick(stage, fn.function);
                }}
              />
            ))}
            <SumCell quantity={fn.total} before={savedFn?.total} strong />
          </tr>
        );
      })}
      {subtotal !== undefined && (
        <tr className="border-t border-line bg-background font-medium">
          <td className="sticky left-0 z-10 bg-background px-3 py-1.5">{group} 小計</td>
          {STAGES.map((stage) => (
            <SumCell key={stage} quantity={subtotal.byStage[stage]} before={savedSubtotal?.byStage[stage]} skipped={skippedStages.includes(stage)} />
          ))}
          <SumCell quantity={subtotal.total} before={savedSubtotal?.total} strong />
        </tr>
      )}
    </>
  );
}

function EditableCell(props: {
  stage: Stage;
  fn: FunctionName;
  quantity: Quantity;
  before: Quantity | undefined;
  guidance: GuidanceCell | undefined;
  override: CellOverride | undefined;
  warning: OverrideWarning | undefined;
  skipped: boolean;
  onClick: () => void;
}) {
  const { quantity, before, guidance, override, warning, skipped } = props;
  const isChanged = changed(quantity, before);
  const missingReason = warning !== undefined && !hasReason(warning.reason);
  const ring = missingReason ? "ring-2 ring-inset ring-red-500" : override !== undefined ? "ring-2 ring-inset ring-accent/50" : "";
  const title =
    override === undefined
      ? `${props.fn} × ${props.stage}：點一下可以手動覆寫`
      : [
          `Guidance ${formatNumber(guidance?.manDays ?? 0)} → 手動 ${formatNumber(override.man * override.days)}`,
          !hasReason(override.reason) ? "沒有填理由" : `理由：${override.reason}`,
          warning === undefined ? "" : warningText(warning),
        ]
          .filter((part) => part !== "")
          .join("，");
  return (
    <td
      className={`num relative min-w-[92px] p-0 align-top ${isChanged ? "bg-amber-50" : ""} ${ring}`}
      style={skipped && !isChanged && override === undefined ? SKIPPED_STAGE_STYLE : undefined}
      data-testid={`cell-${props.fn}-${props.stage}`}
      data-override={override === undefined ? undefined : "true"}
      data-warning={warning === undefined ? undefined : missingReason ? "missing-reason" : "with-reason"}
    >
      {override !== undefined && (
        <span
          aria-hidden
          className={`absolute right-0 top-0 h-0 w-0 border-l-[10px] border-t-[10px] border-l-transparent ${missingReason ? "border-t-red-500" : warning !== undefined ? "border-t-amber-500" : "border-t-accent"}`}
        />
      )}
      <button
        type="button"
        title={title}
        aria-label={`${props.fn} × ${props.stage}，${formatNumber(quantity.manDays)} 人天${override === undefined ? "" : "，手動覆寫"}`}
        onClick={props.onClick}
        className="block w-full px-2 py-1.5 text-right hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Value quantity={quantity} before={before} strong={false} />
      </button>
    </td>
  );
}
