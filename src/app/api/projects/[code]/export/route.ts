import { NotFoundError, services } from "@/server";
import { getCurrentUser } from "@/app/session";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[code]/export">): Promise<Response> {
  if ((await getCurrentUser()) === null) return Response.json({ error: "未登入" }, { status: 401 });
  const { code } = await ctx.params;
  try {
    const { filename, buffer } = await services().exportProjectWorkbook({ projectCode: decodeURIComponent(code) });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
