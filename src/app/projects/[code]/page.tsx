import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NotFoundError, services } from "@/server";
import { formatTime } from "../../format";
import { requireUser } from "../../session";
import { ProjectEditor } from "./project-editor";

async function ProjectContent({ params }: { params: PageProps<"/projects/[code]">["params"] }) {
  await requireUser();
  const { code } = await params;
  const projectCode = decodeURIComponent(code);
  let data;
  try {
    data = {
      record: services().getProject({ projectCode }),
      result: services().calculateProject({ projectCode }).result,
      revisions: services().listRevisions({ projectCode, limit: 5 }),
      review: services().reviewOverrides({ projectCode }),
      profiles: services().listToleranceProfiles(),
    };
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { record, result, revisions, review, profiles } = data;
  return (
      <>
        <ProjectEditor
          projectCode={record.code}
          projectName={record.config.projectName}
          lob={record.config.lob}
          status={record.status}
          version={record.version}
          initialResult={result}
          initialReview={review}
          profiles={profiles}
          initialCellOverrides={record.config.cellOverrides}
          initialToleranceProfileId={record.config.toleranceProfileId}
          initialSettings={{
            phase: record.config.phase,
            projectClass: record.config.projectClass,
            gates: record.config.gates,
            includePreA: record.config.includePreA,
            includeTld: record.config.includeTld,
            buildDates: record.config.buildDates,
          }}
        />
        <section className="mt-8">
          <h2 className="mb-2 text-base font-semibold">最近 5 筆修訂</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-card text-sm">
            {revisions.map((revision) => (
              <li key={revision.version} className="flex flex-wrap gap-x-4 px-3 py-2">
                <span className="num font-medium">v{revision.version}</span>
                <span>{revision.byName ?? "（匯入）"}</span>
                <span className="text-muted">{formatTime(revision.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </>
  );
}

export default function ProjectPage(props: PageProps<"/projects/[code]">) {
  return (
    <main>
      <Link href="/projects" className="text-sm text-accent hover:underline">
        ← 專案列表
      </Link>
      <Suspense fallback={<p className="mt-4 text-sm text-muted">載入中…</p>}>
        <ProjectContent params={props.params} />
      </Suspense>
    </main>
  );
}
