import { db, auditLogsTable, type InsertAuditLog, type User } from "@workspace/db";

export interface AuditWriteInput {
  recordType: string;
  recordId: number;
  itemId?: number | null;
  action: string;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  category?: string;
  actor?: User | null;
}

function stringify(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export async function writeAudit(input: AuditWriteInput): Promise<void> {
  const row: InsertAuditLog = {
    recordType: input.recordType,
    recordId: input.recordId,
    itemId: input.itemId ?? null,
    action: input.action,
    field: input.field ?? null,
    oldValue: stringify(input.oldValue),
    newValue: stringify(input.newValue),
    category: input.category ?? "general",
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.displayName ?? null,
    actorRole: input.actor?.role ?? null,
  };
  await db.insert(auditLogsTable).values(row);
}

export async function diffAndAudit<
  T extends Record<string, unknown>,
>(args: {
  recordType: string;
  recordId: number;
  itemId?: number;
  category: string;
  before: T;
  after: T;
  actor?: User | null;
  fields: Array<keyof T>;
}): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const f of args.fields) {
    const oldV = args.before[f];
    const newV = args.after[f];
    if (stringify(oldV) === stringify(newV)) continue;
    writes.push(
      writeAudit({
        recordType: args.recordType,
        recordId: args.recordId,
        itemId: args.itemId ?? null,
        action: "updated",
        field: String(f),
        oldValue: oldV,
        newValue: newV,
        category: args.category,
        actor: args.actor ?? null,
      }),
    );
  }
  await Promise.all(writes);
}
