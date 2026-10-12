import { GROUPS, STAGES, type Group, type ProjectResult, type Quantity } from "@/domain";
import { formatNumber } from "../../format";

function Cell({ quantity, strong = false }: { quantity: Quantity; strong?: boolean }) {
  const empty = quantity.man === 0 && quantity.manDays === 0;
  return (
    <td className="num min-w-[84px] px-2 py-1.5 text-right align-top">
      {empty ? (
        <span className="text-muted">–</span>
      ) : (
        <>
          <div className={strong ? "font-semibold" : "font-medium"}>{formatNumber(quantity.manDays)}</div>
          <div className="text-xs text-muted">
            {formatNumber(quantity.man)} 人次 · {formatNumber(quantity.days)} 天
          </div>
        </>
      )}
    </td>
  );
}

const GROUP_LABEL: Record<Group, string> = {
  Core: "Core",
  Support: "Support",
  Adder: "Adder",
  Option: "Option",
};

/** Stage × Function 人天矩陣。格子：上面是人天，下面是人次與天數。 */
export function Matrix({ result }: { result: ProjectResult }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[900px] text-sm" data-testid="matrix">
        <thead className="border-b border-line bg-background text-muted">
          <tr>
            <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">Function</th>
            {STAGES.map((stage) => (
              <th key={stage} className="px-2 py-2 text-right font-medium">
                {stage}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">合計</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => {
            const rows = result.functions.filter((fn) => fn.group === group);
            const subtotal = result.groups.find((g) => g.group === group);
            if (rows.length === 0) return null;
            return (
              <GroupRows key={group} group={group} rows={rows} subtotal={subtotal} />
            );
          })}
          <tr className="border-t-2 border-line bg-background font-semibold">
            <td className="sticky left-0 bg-background px-3 py-2">總計</td>
            {STAGES.map((stage) => (
              <Cell key={stage} quantity={result.byStage[stage]} strong />
            ))}
            <Cell quantity={result.total} strong />
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
}: {
  group: Group;
  rows: ProjectResult["functions"];
  subtotal: ProjectResult["groups"][number] | undefined;
}) {
  return (
    <>
      <tr className="bg-background/60">
        <td colSpan={STAGES.length + 2} className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {GROUP_LABEL[group]}
        </td>
      </tr>
      {rows.map((fn) => (
        <tr key={fn.function} className={`border-t border-line ${fn.total.man === 0 && fn.total.manDays === 0 ? "text-muted" : ""}`}>
          <td className="sticky left-0 bg-card px-3 py-1.5 align-top">{fn.function}</td>
          {STAGES.map((stage) => (
            <Cell key={stage} quantity={fn.byStage[stage]} />
          ))}
          <Cell quantity={fn.total} strong />
        </tr>
      ))}
      {subtotal !== undefined && (
        <tr className="border-t border-line bg-background/60 font-medium">
          <td className="sticky left-0 bg-background px-3 py-1.5">{group} 小計</td>
          {STAGES.map((stage) => (
            <Cell key={stage} quantity={subtotal.byStage[stage]} />
          ))}
          <Cell quantity={subtotal.total} strong />
        </tr>
      )}
    </>
  );
}
