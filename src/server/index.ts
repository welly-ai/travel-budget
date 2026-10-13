import { getDb } from "@/db";
import { defaultExportLayout } from "./context";
import { createServices, type Services } from "./projects";

export { getAuth } from "./auth";
export { defaultExportLayout, type ServerContext } from "./context";
export { ConflictError, DuplicateNameError, NotFoundError, OverrideReasonRequiredError } from "./errors";
export { applyOverrides, createServices, type CalculatedProject, type ExportedWorkbook, type OverrideReview, type Services } from "./projects";

declare global {
  var __travelBudgetServices: Services | undefined;
}

/** 應用程式用的服務（頁面、API、MCP 共用同一個）。 */
export function services(): Services {
  globalThis.__travelBudgetServices ??= createServices({
    db: getDb(),
    now: () => new Date(),
    exportLayout: defaultExportLayout,
  });
  return globalThis.__travelBudgetServices;
}
export { clearAllData, createGuidanceVersion, createProject, createUser, ensureDefaultToleranceProfile } from "./admin";
