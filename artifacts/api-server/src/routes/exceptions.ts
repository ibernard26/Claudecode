import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  complianceFlagsTable,
  inventoryItemsTable,
} from "@workspace/db";
import { requireUser, requireRole } from "../lib/auth";
import { combineFilters, inventoryScopeForUser } from "../lib/visibility";
import { recomputeAllFlags } from "../lib/exceptions";

const router: IRouter = Router();

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

router.get("/exceptions", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  const scope = inventoryScopeForUser(user);

  const rows = await db
    .select({
      flag: complianceFlagsTable,
      sku: inventoryItemsTable.sku,
      description: inventoryItemsTable.description,
    })
    .from(complianceFlagsTable)
    .innerJoin(
      inventoryItemsTable,
      eq(complianceFlagsTable.itemId, inventoryItemsTable.id),
    )
    .where(
      combineFilters(
        scope,
        isNull(complianceFlagsTable.resolvedAt),
      ) ?? sql`true`,
    )
    .orderBy(desc(complianceFlagsTable.detectedAt));

  rows.sort((a, b) => {
    const sa = SEVERITY_RANK[a.flag.severity] ?? 9;
    const sb = SEVERITY_RANK[b.flag.severity] ?? 9;
    return sa - sb;
  });

  res.json(
    rows.map(({ flag, sku, description }) => ({
      id: flag.id,
      itemId: flag.itemId,
      sku,
      description,
      code: flag.code,
      message: flag.message,
      severity: flag.severity,
      category: flag.category,
      detectedAt: flag.detectedAt.toISOString(),
    })),
  );
});

router.post("/exceptions/recompute", requireUser(), requireRole("admin", "warehouse_manager"), async (_req, res) => {
  const result = await recomputeAllFlags();
  res.json(result);
});

export default router;
