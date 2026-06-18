import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  packagingSpecsTable,
  complianceFlagsTable,
  type InventoryItem,
  type PackagingSpec,
} from "@workspace/db";

interface FlagDef {
  code: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
}

function deriveFlags(
  item: InventoryItem,
  spec: PackagingSpec | null,
): FlagDef[] {
  const out: FlagDef[] = [];

  if (item.quantityOnHand <= item.reorderPoint) {
    out.push({
      code: "below_reorder_point",
      message: `Stock (${item.quantityOnHand}) is at or below reorder point (${item.reorderPoint}).`,
      severity: item.quantityOnHand === 0 ? "critical" : "high",
      category: "inventory",
    });
  }

  if (item.status === "Backordered") {
    out.push({
      code: "status_backordered",
      message: "Item is backordered — supplier action required.",
      severity: "high",
      category: "supply",
    });
  }

  if (item.status === "Delayed") {
    out.push({
      code: "status_delayed",
      message: "Item is flagged as delayed — review with carrier.",
      severity: "high",
      category: "logistics",
    });
  }

  if (item.status === "PendingSupplier") {
    out.push({
      code: "pending_supplier_action",
      message: "Awaiting supplier response on this item.",
      severity: "medium",
      category: "supply",
    });
  }

  if (item.status === "PendingClient") {
    out.push({
      code: "pending_client_action",
      message: "Awaiting client confirmation on this item.",
      severity: "medium",
      category: "client",
    });
  }

  if (!spec) {
    out.push({
      code: "missing_packaging_spec",
      message: "No packaging specification recorded for this item.",
      severity: "high",
      category: "packaging",
    });
    return out;
  }

  if (
    spec.packageLength == null ||
    spec.packageWidth == null ||
    spec.packageHeight == null
  ) {
    out.push({
      code: "missing_package_dimensions",
      message: "Package dimensions (L/W/H) are incomplete.",
      severity: "high",
      category: "packaging",
    });
  }

  if (spec.packageWeight == null) {
    out.push({
      code: "missing_package_weight",
      message: "Package weight is not recorded.",
      severity: "high",
      category: "packaging",
    });
  }

  if (
    spec.palletLength == null ||
    spec.palletWidth == null ||
    spec.palletHeight == null
  ) {
    out.push({
      code: "missing_pallet_dimensions",
      message: "Pallet dimensions are incomplete — loading plan blocked.",
      severity: "medium",
      category: "loading",
    });
  }

  if (spec.unitsPerCase == null || spec.casesPerPallet == null) {
    out.push({
      code: "missing_pack_ratio",
      message: "Units-per-case or cases-per-pallet not configured.",
      severity: "medium",
      category: "packaging",
    });
  }

  if (spec.fragile && !spec.warehouseHandlingNotes) {
    out.push({
      code: "fragile_no_handling",
      message: "Item is fragile but has no handling notes for warehouse staff.",
      severity: "high",
      category: "handling",
    });
  }

  if (spec.hazmatFlag && !spec.supplierComplianceNotes) {
    out.push({
      code: "hazmat_no_compliance",
      message: "Hazmat item is missing supplier compliance documentation.",
      severity: "critical",
      category: "compliance",
    });
  }

  if (spec.restrictedMaterialFlag && !spec.clientPackagingNotes) {
    out.push({
      code: "restricted_no_client_notes",
      message: "Restricted material has no client packaging instructions.",
      severity: "high",
      category: "compliance",
    });
  }

  if (spec.temperatureControlRequired && !spec.carrierRequirement) {
    out.push({
      code: "temp_no_carrier",
      message:
        "Temperature-controlled item has no carrier requirement specified.",
      severity: "high",
      category: "logistics",
    });
  }

  if (
    (item.status === "ReadyForLoading" || item.status === "ReadyForShipment") &&
    !spec.carrierRequirement
  ) {
    out.push({
      code: "ready_no_carrier",
      message: "Ready-to-load item has no carrier assigned.",
      severity: "high",
      category: "logistics",
    });
  }

  if (
    (item.status === "ReadyForLoading" || item.status === "ReadyForStaging") &&
    !spec.dockAssignment
  ) {
    out.push({
      code: "ready_no_dock",
      message: "Ready-to-stage/load item has no dock assignment.",
      severity: "medium",
      category: "loading",
    });
  }

  if (spec.barcodeRequired && !spec.labelingRequirements) {
    out.push({
      code: "barcode_no_labeling_spec",
      message:
        "Barcode is required but no labeling requirements have been documented.",
      severity: "medium",
      category: "packaging",
    });
  }

  if (spec.asnRequired && !item.asnNumber) {
    out.push({
      code: "asn_required_missing",
      message: "ASN is required but no ASN number is recorded on the item.",
      severity: "high",
      category: "logistics",
    });
  }

  if (
    !spec.lastVerifiedDate ||
    daysSince(new Date(spec.lastVerifiedDate)) > 90
  ) {
    out.push({
      code: "spec_unverified",
      message:
        "Packaging spec has not been verified in the last 90 days.",
      severity: "low",
      category: "compliance",
    });
  }

  return out;
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export async function recomputeFlagsForItem(itemId: number): Promise<number> {
  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, itemId));
  if (!item) return 0;

  const [spec] = await db
    .select()
    .from(packagingSpecsTable)
    .where(eq(packagingSpecsTable.itemId, itemId));

  const wanted = deriveFlags(item, spec ?? null);
  const wantedCodes = new Set(wanted.map((f) => f.code));

  const existing = await db
    .select()
    .from(complianceFlagsTable)
    .where(
      and(
        eq(complianceFlagsTable.itemId, itemId),
        isNull(complianceFlagsTable.resolvedAt),
      ),
    );

  // Resolve flags that are no longer wanted
  for (const e of existing) {
    if (!wantedCodes.has(e.code)) {
      await db
        .update(complianceFlagsTable)
        .set({ resolvedAt: new Date() })
        .where(eq(complianceFlagsTable.id, e.id));
    }
  }

  // Insert any new wanted flags (skipping ones already open)
  const existingCodes = new Set(existing.map((e) => e.code));
  for (const f of wanted) {
    if (existingCodes.has(f.code)) continue;
    await db
      .insert(complianceFlagsTable)
      .values({
        itemId,
        code: f.code,
        message: f.message,
        severity: f.severity,
        category: f.category,
      })
      .onConflictDoUpdate({
        target: [complianceFlagsTable.itemId, complianceFlagsTable.code],
        set: {
          message: f.message,
          severity: f.severity,
          category: f.category,
          resolvedAt: null,
          detectedAt: new Date(),
        },
      });
  }

  return wanted.length;
}

export async function recomputeAllFlags(): Promise<{ scanned: number; openCount: number }> {
  const items = await db
    .select({ id: inventoryItemsTable.id })
    .from(inventoryItemsTable);
  for (const it of items) {
    await recomputeFlagsForItem(it.id);
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(complianceFlagsTable)
    .where(isNull(complianceFlagsTable.resolvedAt));
  return { scanned: items.length, openCount: count };
}
