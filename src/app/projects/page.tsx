import Link from "next/link";
import { Suspense } from "react";
import { services } from "@/server";
import { formatNumber, formatTime } from "../format";
import { requireUser } from "../session";

async function ProjectTable() {
  await requireUser();
  const projects = services().listProjects();
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-line bg-background text-left text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">代碼</th>
            <th className="px-3 py-2 font-medium">名稱</th>
            <th className="px-3 py-2 font-medium">LOB</th>
            <th className="px-3 py-2 font-medium">Phase</th>
            <th className="px-3 py-2 font-medium">Class</th>
            <th className="px-3 py-2 text-right font-medium">總人天</th>
            <th className="px-3 py-2 font-medium">最後修改</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.code} className="border-b border-line last:border-0 hover:bg-background">
              <td className="px-3 py-2 font-medium">
                <Link href={`/projects/${encodeURIComponent(project.code)}`} className="text-accent underline-offset-2 hover:underline">
                  {project.code}
                </Link>
              </td>
              <td className="px-3 py-2">
                {project.name}
                {project.status === "draft" && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">草稿</span>
                )}
              </td>
              <td className="px-3 py-2">{project.lob}</td>
              <td className="num px-3 py-2">{project.phase}</td>
              <td className="num px-3 py-2">{project.projectClass}</td>
              <td className="num px-3 py-2 text-right font-medium">{formatNumber(project.totalManDays)}</td>
              <td className="px-3 py-2 text-muted">
                {project.updatedByName ?? "（匯入）"} · {formatTime(project.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">專案列表</h1>
      <Suspense fallback={<p className="text-sm text-muted">載入中…</p>}>
        <ProjectTable />
      </Suspense>
    </main>
  );
}
