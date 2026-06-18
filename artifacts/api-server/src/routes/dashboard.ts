import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  complianceFlagsTable,
  auditLogsTable,
  integrationsTable,
} from "@workspace/db";
import { requireUser } from "../lib/auth";
import { combineFilters, inventoryScopeForUser } from "../lib/visibility";

const router: IRouter = Router();

router.get("/dashboard/overview", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  const scope = inventoryScopeForUser(user);

  const totalItemsRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItemsTable)
    .where(scope ?? sql`true`);
  const totalItems = totalItemsRow[0]?.count ?? 0;

  const belowReorderRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItemsTable)
    .where(
      combineFilters(
        scope,
        sql`${inventoryItemsTable.quantityOnHand} <= ${inventoryItemsTable.reorderPoint}`,
      ) ?? sql`true`,
    );

  const byStatusRows = await db
    .select({
      status: inventoryItemsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryItemsTable)
    .where(scope ?? sql`true`)
    .groupBy(inventoryItemsTable.status);

  const flagJoin = combineFilters(
    scope,
    isNull(complianceFlagsTable.resolvedAt),
  );

  const openFlagsRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(complianceFlagsTable)
    .innerJoin(
      inventoryItemsTable,
      eq(inventoryItemsTable.id, complianceFlagsTable.itemId),
    )
    .where(flagJoin ?? sql`true`);

  const criticalFlagsRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(complianceFlagsTable)
    .innerJoin(
      inventoryItemsTable,
      eq(inventoryItemsTable.id, complianceFlagsTable.itemId),
    )
    .where(
      combineFilters(
        scope,
        isNull(complianceFlagsTable.resolvedAt),
        eq(complianceFlagsTable.severity, "critical"),
      ) ?? sql`true`,
    );

  const supplierActions = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItemsTable)
    .where(
      combineFilters(
        scope,
        eq(inventoryItemsTable.status, "PendingSupplier"),
      ) ?? sql`true`,
    );

  const clientActions = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItemsTable)
    .where(
      combineFilters(
        scope,
        eq(inventoryItemsTable.status, "PendingClient"),
      ) ?? sql`true`,
    );

  const integrations = await db.select().from(integrationsTable);
  const lastSync = integrations
    .map((i) => i.lastSyncAt?.toISOString())
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1) ?? null;
  const nextSync = integrations
    .map((i) => i.nextSyncAt?.toISOString())
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(0) ?? null;

  const recent = scope
    ? await db
        .select({ log: auditLogsTable })
        .from(auditLogsTable)
        .leftJoin(inventoryItemsTable, eq(auditLogsTable.itemId, inventoryItemsTable.id))
        .where(scope)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(20)
        .then(rows => rows.map(r => r.log))
    : await db
        .select()
        .from(auditLogsTable)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(20);

  const statusCounts = new Map(byStatusRows.map((r) => [r.status, r.count]));
  const sc = (s: string) => statusCounts.get(s) ?? 0;

  res.json({
    totalItems,
    belowReorder: belowReorderRow[0]?.count ?? 0,
    openExceptions: openFlagsRow[0]?.count ?? 0,
    criticalExceptions: criticalFlagsRow[0]?.count ?? 0,
    pendingSupplier: supplierActions[0]?.count ?? 0,
    pendingClient: clientActions[0]?.count ?? 0,
    backordered: sc("Backordered"),
    delayed: sc("Delayed"),
    readyForPicking: sc("ReadyForPicking"),
    readyForPacking: sc("ReadyForPacking"),
    readyForStaging: sc("ReadyForStaging"),
    readyForLoading: sc("ReadyForLoading"),
    readyForShipment: sc("ReadyForShipment"),
    statusBreakdown: byStatusRows,
    lastSync,
    nextSync,
    recentActivity: recent.map((r) => ({
      id: r.id,
      action: r.action,
      recordType: r.recordType,
      field: r.field,
      itemId: r.itemId,
      actorName: r.actorName,
      actorRole: r.actorRole,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

router.get("/dashboard/quarterly-board", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  const scope = inventoryScopeForUser(user);

  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(scope ?? sql`true`)
    .orderBy(inventoryItemsTable.year, inventoryItemsTable.quarter);

  const exceptionRows = await db
    .select({
      itemId: complianceFlagsTable.itemId,
      count: sql<number>`count(*)::int`,
    })
    .from(complianceFlagsTable)
    .where(isNull(complianceFlagsTable.resolvedAt))
    .groupBy(complianceFlagsTable.itemId);
  const exceptionMap = new Map(exceptionRows.map((r) => [r.itemId, r.count]));

  const groups = new Map<
    string,
    {
      quarter: string;
      year: number;
      totalItems: number;
      clientRequested: number;
      supplierPending: number;
      warehouseApproved: number;
      packagingReady: number;
      loadingReady: number;
      shipmentReady: number;
      exceptions: number;
      items: Array<unknown>;
    }
  >();

  for (const item of items) {
    const key = `${item.year}-${item.quarter}`;
    if (!groups.has(key)) {
      groups.set(key, {
        quarter: item.quarter,
        year: item.year,
        totalItems: 0,
        clientRequested: 0,
        supplierPending: 0,
        warehouseApproved: 0,
        packagingReady: 0,
        loadingReady: 0,
        shipmentReady: 0,
        exceptions: 0,
        items: [],
      });
    }
    const g = groups.get(key)!;
    g.totalItems += 1;
    if (item.status === "PendingClient") g.clientRequested += 1;
    if (item.status === "PendingSupplier") g.supplierPending += 1;
    if (item.status === "PendingWarehouse") g.warehouseApproved += 1;
    if (item.status === "ReadyForPacking") g.packagingReady += 1;
    if (item.status === "ReadyForLoading" || item.status === "ReadyForStaging")
      g.loadingReady += 1;
    if (item.status === "ReadyForShipment" || item.status === "Shipped")
      g.shipmentReady += 1;
    g.exceptions += exceptionMap.get(item.id) ?? 0;
    g.items.push({
      id: item.id,
      sku: item.sku,
      description: item.description,
      status: item.status,
      quantityOnHand: item.quantityOnHand,
      quantityRequested: item.quantityRequested,
      openExceptionCount: exceptionMap.get(item.id) ?? 0,
    });
  }

  res.json(Array.from(groups.values()));
});

export default router;
