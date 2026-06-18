import { Router, type IRouter } from "express";
import { eq, isNull, sql } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  packagingSpecsTable,
  complianceFlagsTable,
  clientsTable,
  suppliersTable,
  warehousesTable,
} from "@workspace/db";
import { requireUser } from "../lib/auth";
import { inventoryScopeForUser } from "../lib/visibility";

const router: IRouter = Router();

const COLUMNS = [
  "sku",
  "part_number",
  "description",
  "warehouse",
  "warehouse_location",
  "supplier",
  "client",
  "status",
  "priority",
  "quarter",
  "year",
  "qty_on_hand",
  "qty_requested",
  "reorder_point",
  "below_reorder",
  "package_l_w_h",
  "package_weight",
  "pallet_l_w_h",
  "pallet_weight",
  "units_per_case",
  "cases_per_pallet",
  "carrier",
  "dock",
  "freight_class",
  "fragile",
  "hazmat",
  "restricted",
  "temp_control",
  "barcode_required",
  "asn_required",
  "open_exception_count",
  "last_updated",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/export/inventory.csv", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  const scope = inventoryScopeForUser(user);

  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(scope ?? sql`true`)
    .orderBy(inventoryItemsTable.sku);
  const itemIds = items.map(i => i.id);
  const specs = itemIds.length > 0
    ? await db.select().from(packagingSpecsTable)
        .where(sql`${packagingSpecsTable.itemId} = ANY(ARRAY[${sql.join(itemIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
    : [];
  const specMap = new Map(specs.map((s) => [s.itemId, s]));
  const flagCounts = await db
    .select({
      itemId: complianceFlagsTable.itemId,
      count: sql<number>`count(*)::int`,
    })
    .from(complianceFlagsTable)
    .where(isNull(complianceFlagsTable.resolvedAt))
    .groupBy(complianceFlagsTable.itemId);
  const flagMap = new Map(flagCounts.map((f) => [f.itemId, f.count]));

  const clients = await db.select().from(clientsTable);
  const suppliers = await db.select().from(suppliersTable);
  const warehouses = await db.select().from(warehousesTable);
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]));

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="warehouse-inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  res.write(COLUMNS.join(",") + "\n");

  for (const it of items) {
    const spec = specMap.get(it.id);
    const row = [
      it.sku,
      it.partNumber,
      it.description,
      warehouseMap.get(it.warehouseId) ?? "",
      it.warehouseLocation,
      it.supplierId ? supplierMap.get(it.supplierId) ?? "" : "",
      it.clientId ? clientMap.get(it.clientId) ?? "" : "",
      it.status,
      it.priority,
      it.quarter,
      it.year,
      it.quantityOnHand,
      it.quantityRequested,
      it.reorderPoint,
      it.quantityOnHand <= it.reorderPoint ? "yes" : "no",
      spec
        ? [spec.packageLength, spec.packageWidth, spec.packageHeight]
            .map((n) => (n == null ? "?" : n))
            .join("x")
        : "",
      spec?.packageWeight ?? "",
      spec
        ? [spec.palletLength, spec.palletWidth, spec.palletHeight]
            .map((n) => (n == null ? "?" : n))
            .join("x")
        : "",
      spec?.palletWeight ?? "",
      spec?.unitsPerCase ?? "",
      spec?.casesPerPallet ?? "",
      spec?.carrierRequirement ?? "",
      spec?.dockAssignment ?? "",
      spec?.freightClass ?? "",
      spec?.fragile ? "yes" : "no",
      spec?.hazmatFlag ? "yes" : "no",
      spec?.restrictedMaterialFlag ? "yes" : "no",
      spec?.temperatureControlRequired ? "yes" : "no",
      spec?.barcodeRequired ? "yes" : "no",
      spec?.asnRequired ? "yes" : "no",
      flagMap.get(it.id) ?? 0,
      it.lastUpdated.toISOString(),
    ];
    res.write(row.map(csvEscape).join(",") + "\n");
  }
  res.end();
});

export default router;
