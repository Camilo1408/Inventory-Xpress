import { prisma } from "./db";

/** Retención de auditoría: 6 meses. Lo más antiguo se purga. */
export const AUDIT_RETENTION_DAYS = 180;

function retentionCutoff(): Date {
  return new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  userId: string;
  userName: string;
  summary: string;
  result?: "success" | "denied";
}

/**
 * Registra un evento de auditoría liviano. Nunca lanza: la auditoría no debe
 * romper la operación principal. Aplica purga probabilística de retención.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        categoryId: input.categoryId ?? null,
        categoryName: input.categoryName ?? null,
        userId: input.userId,
        userName: input.userName,
        summary: input.summary,
        result: input.result ?? "success",
      },
    });
    // Purga liviana (~5% de las escrituras) para mantener la tabla acotada a 6 meses.
    if (Math.random() < 0.05) {
      await prisma.auditLog.deleteMany({ where: { createdAt: { lt: retentionCutoff() } } });
    }
  } catch (e) {
    console.error("audit error", e);
  }
}

/** Purga determinística de registros con más de 6 meses. Devuelve cuántos eliminó. */
export async function purgeOldAudit(): Promise<number> {
  const res = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: retentionCutoff() } } });
  return res.count;
}
