import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  auditLogsTable,
  inventoryItemsTable,
} from "@workspace/db";
import { requireUser } from "../lib/auth";
import { combineFilters, inventoryScopeForUser } from "../lib/visibility";

const router: IRouter = Router();

router.get("/audit", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  const limit = Math.min(
    Number(req.query["limit"] ?? 200) || 200,
    500,
  );
  const scope = inventoryScopeForUser(user);

  const rowsRaw = scope
    ? await db
        .select({ log: auditLogsTable, itemSku: inventoryItemsTable.sku })
        .from(auditLogsTable)
        .leftJoin(
          inventoryItemsTable,
          eq(auditLogsTable.itemId, inventoryItemsTable.id),
        )
        .where(
          combineFilters(
            // include logs with no item, only if admin/manager/auditor (handled by scope being undefined)
            scope,
          ) ?? sql`true`,
        )
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(limit)
    : await db
        .select({ log: auditLogsTable, itemSku: inventoryItemsTable.sku })
        .from(auditLogsTable)
        .leftJoin(
          inventoryItemsTable,
          eq(auditLogsTable.itemId, inventoryItemsTable.id),
        )
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(limit);

  res.json(
    rowsRaw.map((row) => ({
      id: row.log.id,
      recordType: row.log.recordType,
      recordId: row.log.recordId,
      itemId: row.log.itemId,
      itemSku: row.itemSku ?? null,
      action: row.log.action,
      field: row.log.field,
      oldValue: row.log.oldValue,
      newValue: row.log.newValue,
      category: row.log.category,
      actorName: row.log.actorName,
      actorRole: row.log.actorRole,
      createdAt: row.log.createdAt.toISOString(),
    })),
  );
});

export default router;
