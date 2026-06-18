import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  packagingSpecsTable,
  itemNotesTable,
  complianceFlagsTable,
  auditLogsTable,
  usersTable,
  warehousesTable,
  suppliersTable,
  clientsTable,
  type InventoryItem,
} from "@workspace/db";
import { requireUser, isWritableRole } from "../lib/auth";
import {
  canSeeItem,
  combineFilters,
  inventoryScopeForUser,
  noteVisibilityScopeForUser,
} from "../lib/visibility";
import { writeAudit, diffAndAudit } from "../lib/audit";
import { recomputeFlagsForItem } from "../lib/exceptions";

const router: IRouter = Router();

router.get("/inventory", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  const scope = inventoryScopeForUser(user);

  const filters = [scope];
  const status = req.query["status"];
  if (typeof status === "string" && status.length > 0) {
    filters.push(eq(inventoryItemsTable.status, status));
  }
  const quarter = req.query["quarter"];
  if (typeof quarter === "string" && quarter.length > 0) {
    filters.push(eq(inventoryItemsTable.quarter, quarter));
  }
  const warehouseId = numParam(req.query["warehouseId"]);
  if (warehouseId != null) {
    filters.push(eq(inventoryItemsTable.warehouseId, warehouseId));
  }
  const clientId = numParam(req.query["clientId"]);
  if (clientId != null) {
    filters.push(eq(inventoryItemsTable.clientId, clientId));
  }
  const supplierId = numParam(req.query["supplierId"]);
  if (supplierId != null) {
    filters.push(eq(inventoryItemsTable.supplierId, supplierId));
  }
  const search = req.query["search"];
  if (typeof search === "string" && search.trim().length > 0) {
    const pattern = `%${search.trim()}%`;
    filters.push(
      or(
        ilike(inventoryItemsTable.sku, pattern),
        ilike(inventoryItemsTable.description, pattern),
        ilike(inventoryItemsTable.partNumber, pattern),
      ),
    );
  }

  const limit = Math.min(numParam(req.query["limit"]) ?? 100, 500);
  const offset = numParam(req.query["offset"]) ?? 0;
  const whereClause = combineFilters(...filters) ?? sql`true`;

  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(inventoryItemsTable)
      .where(whereClause)
      .orderBy(inventoryItemsTable.sku)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryItemsTable)
      .where(whereClause),
  ]);
  const total = totalRow[0]?.count ?? 0;

  const flagCounts = await db
    .select({
      itemId: complianceFlagsTable.itemId,
      count: sql<number>`count(*)::int`,
    })
    .from(complianceFlagsTable)
    .where(isNull(complianceFlagsTable.resolvedAt))
    .groupBy(complianceFlagsTable.itemId);
  const flagMap = new Map(flagCounts.map((f) => [f.itemId, f.count]));

  res.json({
    items: items.map((it) => serializeListItem(it, flagMap.get(it.id) ?? 0)),
    total,
    limit,
    offset,
  });
});

router.get("/inventory/:id", requireUser(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const user = req.currentUser!;
  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canSeeItem(user, item)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [[packaging], [warehouseRow], [supplierRow], [clientRow]] = await Promise.all([
    db.select().from(packagingSpecsTable).where(eq(packagingSpecsTable.itemId, id)),
    db.select().from(warehousesTable).where(eq(warehousesTable.id, item.warehouseId)),
    item.supplierId != null
      ? db.select().from(suppliersTable).where(eq(suppliersTable.id, item.supplierId))
      : Promise.resolve([undefined]),
    item.clientId != null
      ? db.select().from(clientsTable).where(eq(clientsTable.id, item.clientId))
      : Promise.resolve([undefined]),
  ]);

  const noteScope = noteVisibilityScopeForUser(user);
  const notes = await db
    .select({
      note: itemNotesTable,
      authorName: usersTable.displayName,
      authorRole: usersTable.role,
    })
    .from(itemNotesTable)
    .leftJoin(usersTable, eq(usersTable.id, itemNotesTable.authorId))
    .where(and(eq(itemNotesTable.itemId, id), noteScope))
    .orderBy(desc(itemNotesTable.createdAt));

  const exceptions = await db
    .select()
    .from(complianceFlagsTable)
    .where(
      and(
        eq(complianceFlagsTable.itemId, id),
        isNull(complianceFlagsTable.resolvedAt),
      ),
    )
    .orderBy(desc(complianceFlagsTable.detectedAt));

  const history = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.itemId, id))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(100);

  const serializedItem = {
    ...serializeFullItem(item),
    warehouseName: warehouseRow?.name ?? null,
    supplierName: supplierRow?.name ?? null,
    clientName: clientRow?.name ?? null,
  };

  res.json({
    item: serializedItem,
    packaging: packaging ? serializePackaging(packaging) : null,
    notes: notes.map((row) => serializeNote(row.note, row.authorName, row.authorRole)),
    exceptions: exceptions.map(serializeException),
    history: history.map(serializeAudit),
  });
});

router.patch("/inventory/:id", requireUser(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const user = req.currentUser!;
  if (!isWritableRole(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const editable = [
    "status",
    "priority",
    "quantityOnHand",
    "quantityRequested",
    "reorderPoint",
    "warehouseLocation",
    "carrierRef",
    "shipmentRef",
    "asnNumber",
    "partNumber",
    "serialNumber",
    "stockNumber",
    "poNumber",
    "workOrderNumber",
    "supplierRef",
    "quarter",
    "year",
    "description",
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const field of editable) {
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, field)) {
      patch[field] = (req.body as Record<string, unknown>)[field];
    }
  }
  if (Object.keys(patch).length === 0) {
    res.json({ item: serializeFullItem(item) });
    return;
  }

  const [updated] = await db
    .update(inventoryItemsTable)
    .set(patch)
    .where(eq(inventoryItemsTable.id, id))
    .returning();

  await diffAndAudit({
    recordType: "inventory_item",
    recordId: id,
    itemId: id,
    category: "inventory",
    before: item as Record<string, unknown>,
    after: updated as Record<string, unknown>,
    actor: user,
    fields: editable as unknown as Array<keyof Record<string, unknown>>,
  });

  await recomputeFlagsForItem(id);

  res.json({ item: serializeFullItem(updated) });
});

function numParam(v: unknown): number | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function serializeListItem(it: InventoryItem, openExceptionCount: number) {
  return {
    id: it.id,
    sku: it.sku,
    partNumber: it.partNumber,
    description: it.description,
    quantityOnHand: it.quantityOnHand,
    quantityRequested: it.quantityRequested,
    reorderPoint: it.reorderPoint,
    status: it.status,
    priority: it.priority,
    quarter: it.quarter,
    year: it.year,
    supplierId: it.supplierId,
    clientId: it.clientId,
    warehouseId: it.warehouseId,
    warehouseLocation: it.warehouseLocation,
    openExceptionCount,
    lastUpdated: it.lastUpdated.toISOString(),
  };
}

function serializeFullItem(it: InventoryItem) {
  return {
    id: it.id,
    sku: it.sku,
    partNumber: it.partNumber,
    serialNumber: it.serialNumber,
    stockNumber: it.stockNumber,
    poNumber: it.poNumber,
    workOrderNumber: it.workOrderNumber,
    supplierRef: it.supplierRef,
    carrierRef: it.carrierRef,
    shipmentRef: it.shipmentRef,
    asnNumber: it.asnNumber,
    description: it.description,
    quantityOnHand: it.quantityOnHand,
    quantityRequested: it.quantityRequested,
    reorderPoint: it.reorderPoint,
    warehouseLocation: it.warehouseLocation,
    warehouseId: it.warehouseId,
    supplierId: it.supplierId,
    clientId: it.clientId,
    status: it.status,
    priority: it.priority,
    quarter: it.quarter,
    year: it.year,
    nextReviewDate: it.nextReviewDate,
    lastUpdated: it.lastUpdated.toISOString(),
    createdAt: it.createdAt.toISOString(),
  };
}

function serializePackaging(p: typeof packagingSpecsTable.$inferSelect) {
  return {
    itemId: p.itemId,
    packageLength: p.packageLength,
    packageWidth: p.packageWidth,
    packageHeight: p.packageHeight,
    packageWeight: p.packageWeight,
    palletLength: p.palletLength,
    palletWidth: p.palletWidth,
    palletHeight: p.palletHeight,
    palletWeight: p.palletWeight,
    unitsPerCase: p.unitsPerCase,
    casesPerPallet: p.casesPerPallet,
    unitOfMeasure: p.unitOfMeasure,
    maxStackHeight: p.maxStackHeight,
    stackable: p.stackable,
    fragile: p.fragile,
    hazmatFlag: p.hazmatFlag,
    restrictedMaterialFlag: p.restrictedMaterialFlag,
    temperatureControlRequired: p.temperatureControlRequired,
    orientationRequirement: p.orientationRequirement,
    carrierRequirement: p.carrierRequirement,
    dockAssignment: p.dockAssignment,
    loadSequence: p.loadSequence,
    freightClass: p.freightClass,
    packagingMaterials: p.packagingMaterials,
    labelingRequirements: p.labelingRequirements,
    barcodeRequired: p.barcodeRequired,
    qrCodeRequired: p.qrCodeRequired,
    asnRequired: p.asnRequired,
    clientPackagingNotes: p.clientPackagingNotes,
    supplierComplianceNotes: p.supplierComplianceNotes,
    warehouseHandlingNotes: p.warehouseHandlingNotes,
    lastVerifiedDate: p.lastVerifiedDate,
    verifiedBy: p.verifiedBy,
    updatedAt: p.updatedAt.toISOString(),
  };
}

function serializeNote(
  n: typeof itemNotesTable.$inferSelect,
  authorName: string | null,
  authorRole: string | null,
) {
  return {
    id: n.id,
    itemId: n.itemId,
    body: n.body,
    visibility: n.visibility,
    category: n.category,
    authorId: n.authorId,
    authorName,
    authorRole,
    createdAt: n.createdAt.toISOString(),
  };
}

function serializeException(e: typeof complianceFlagsTable.$inferSelect) {
  return {
    id: e.id,
    itemId: e.itemId,
    code: e.code,
    message: e.message,
    severity: e.severity,
    category: e.category,
    detectedAt: e.detectedAt.toISOString(),
  };
}

function serializeAudit(a: typeof auditLogsTable.$inferSelect) {
  return {
    id: a.id,
    recordType: a.recordType,
    recordId: a.recordId,
    itemId: a.itemId,
    action: a.action,
    field: a.field,
    oldValue: a.oldValue,
    newValue: a.newValue,
    category: a.category,
    actorName: a.actorName,
    actorRole: a.actorRole,
    createdAt: a.createdAt.toISOString(),
  };
}

export default router;
export {
  serializeListItem,
  serializeFullItem,
  serializePackaging,
  serializeNote,
  serializeException,
  serializeAudit,
};
