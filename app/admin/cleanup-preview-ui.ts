export type AdminLocale = "en" | "zh" | "es";

export type CleanupPreviewPayload = {
  readOnly: true;
  incomplete: boolean;
  warnings: string[];
  schema: {
    missingExpectedTables: string[];
    otherUserAssociatedTables: Array<{table:string;total:number;nonAdminOwned:number}>;
  };
  records: Record<string,{total:number;nonAdminOwned:number;affected:number}>;
  crossUser: {
    adminResponsesOnNonAdminIdeas: number;
    nonAdminResponsesOnAdminIdeas: number;
    affectedAnalyses: number;
    affectedPointsLedger: number;
    potentialOrphans: number;
  };
  r2: {
    adminObjects: number;
    nonAdminObjects: number;
    metadataMissingObject: number;
    objectsWithoutOwnership: number;
  };
};

export const cleanupPreviewCopy = {
  en: {
    eyebrow:"READ-ONLY OPERATIONS", title:"User cleanup preview",
    description:"Review anonymous D1 and R2 counts before a separate, explicitly authorized cleanup.",
    safety:"This tool does not modify or delete any data.", run:"Run read-only scan", rescan:"Rescan", scanning:"Scanning…",
    success:"Read-only scan complete", relogin:"Your session is no longer valid. Sign in again to continue.",
    forbidden:"This account does not have administrator permission.", serverError:"The scan could not be completed. Try again.",
    incomplete:"The scan is incomplete. These counts must not be treated as safe for deletion.",
    drift:"Production schema drift was detected. Review the warning before any cleanup.",
    profiles:"Profiles to delete", ideas:"Ideas to delete", responses:"Feedback to delete", analyses:"Analyses affected",
    points:"Points records affected", adminOnOther:"Admin feedback on non-Admin ideas",
    otherOnAdmin:"Non-Admin feedback on Admin ideas", orphans:"Potential orphan records",
    adminObjects:"Admin R2 objects", otherObjects:"Non-Admin R2 objects", unresolvedObjects:"Missing or unowned R2 objects",
  },
  zh: {
    eyebrow:"只读操作", title:"用户清理预览", description:"在另行明确授权清理前，仅查看匿名化的 D1 与 R2 数量。",
    safety:"此工具不会修改或删除任何数据。", run:"运行只读扫描", rescan:"重新扫描", scanning:"正在扫描…",
    success:"只读扫描已完成", relogin:"当前会话已失效，请重新登录后继续。", forbidden:"当前账户没有管理员权限。",
    serverError:"扫描未能完成，请重试。", incomplete:"扫描不完整，不得将这些数量视为可安全删除的依据。",
    drift:"检测到生产数据库结构漂移，清理前必须检查此警告。", profiles:"待删除 Profile 数量", ideas:"待删除 Idea 数量",
    responses:"待删除反馈数量", analyses:"受影响分析数量", points:"受影响积分记录数量",
    adminOnOther:"Admin 对非 Admin Idea 的反馈数量", otherOnAdmin:"非 Admin 对 Admin Idea 的反馈数量",
    orphans:"潜在孤儿记录数量", adminObjects:"Admin R2 对象数量", otherObjects:"非 Admin R2 对象数量",
    unresolvedObjects:"缺失或无法归属的 R2 对象数量",
  },
  es: {
    eyebrow:"OPERACIÓN DE SOLO LECTURA", title:"Vista previa de limpieza",
    description:"Revisa recuentos anónimos de D1 y R2 antes de una limpieza autorizada por separado.",
    safety:"Esta herramienta no modifica ni elimina ningún dato.", run:"Ejecutar análisis de solo lectura", rescan:"Volver a analizar",
    scanning:"Analizando…", success:"Análisis de solo lectura completado",
    relogin:"La sesión ya no es válida. Inicia sesión de nuevo para continuar.",
    forbidden:"Esta cuenta no tiene permisos de administración.", serverError:"No se pudo completar el análisis. Inténtalo de nuevo.",
    incomplete:"El análisis está incompleto. Estos recuentos no indican que sea seguro eliminar datos.",
    drift:"Se detectó una diferencia en el esquema de producción. Revísala antes de cualquier limpieza.",
    profiles:"Perfiles por eliminar", ideas:"Ideas por eliminar", responses:"Respuestas por eliminar", analyses:"Análisis afectados",
    points:"Registros de puntos afectados", adminOnOther:"Respuestas Admin en ideas no Admin",
    otherOnAdmin:"Respuestas no Admin en ideas Admin", orphans:"Registros huérfanos potenciales",
    adminObjects:"Objetos R2 del Admin", otherObjects:"Objetos R2 no Admin", unresolvedObjects:"Objetos R2 ausentes o sin propietario",
  },
} as const;

export class CleanupPreviewRequestError extends Error {
  readonly status:number;
  constructor(status:number) {
    super(`Cleanup preview request failed with status ${status}`);
    this.status=status;
  }
}

export async function requestCleanupPreview(apiFetch:typeof fetch) {
  const response=await apiFetch("/api/admin/cleanup-preview",{method:"GET"});
  if(!response.ok)throw new CleanupPreviewRequestError(response.status);
  return await response.json() as CleanupPreviewPayload;
}
