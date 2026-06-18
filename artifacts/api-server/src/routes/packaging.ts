import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  packagingSpecsTable,
} from "@workspace/db";
import { requireUser, isWritableRole } from "../lib/auth";
import { canSeeItem } from "../lib/visibility";
import { diffAndAudit } from "../lib/audit";
import { recomputeFlagsForItem } from "../lib/exceptions";
import { serializePackaging } from "./inventory";

const router: IRouter = Router();

const editableFields = [
  "packageLength",
  "packageWidth",
  "packageHeight",
  "packageWeight",
  "palletLength",
  "palletWidth",
  "palletHeight",
  "palletWeight",
  "unitsPerCase",
  "casesPerPallet",
  "unitOfMeasure",
  "maxStackHeight",
  "stackable",
  "fragile",
  "hazmatFlag",
  "restrictedMaterialFlag",
  "temperatureControlRequired",
  "orientationRequirement",
  "carrierRequirement",
  "dockAssignment",
  "loadSequence",
  "freightClass",
  "packagingMaterials",
  "labelingRequirements",
  "barcodeRequired",
  "qrCodeRequired",
  "asnRequired",
  "clientPackagingNotes",
  "supplierComplianceNotes",
  "warehouseHandlingNotes",
  "lastVerifiedDate",
  "verifiedBy",
] as const;

router.get("/packaging/:id", requireUser(), async (req, res) => {
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
  const [spec] = await db
    .select()
    .from(packagingSpecsTable)
    .where(eq(packagingSpecsTable.itemId, id));
  res.json({ packaging: spec ? serializePackaging(spec) : null });
});

router.patch("/packaging/:id", requireUser(), async (req, res) => {
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

  const patch: Record<string, unknown> = {};
  for (const field of editableFields) {
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, field)) {
      patch[field] = (req.body as Record<string, unknown>)[field];
    }
  }

  const [existing] = await db
    .select()
    .from(packagingSpecsTable)
    .where(eq(packagingSpecsTable.itemId, id));

  let updated;
  if (existing) {
    if (Object.keys(patch).length === 0) {
      res.json({ packaging: serializePackaging(existing) });
      return;
    }
    [updated] = await db
      .update(packagingSpecsTable)
      .set(patch)
      .where(eq(packagingSpecsTable.itemId, id))
      .returning();
    await diffAndAudit({
      recordType: "packaging_spec",
      recordId: id,
      itemId: id,
      category: "packaging",
      before: existing as Record<string, unknown>,
      after: updated as Record<string, unknown>,
      actor: user,
      fields: editableFields as unknown as Array<keyof Record<string, unknown>>,
    });
  } else {
    [updated] = await db
      .insert(packagingSpecsTable)
      .values({ itemId: id, ...patch })
      .returning();
    await diffAndAudit({
      recordType: "packaging_spec",
      recordId: id,
      itemId: id,
      category: "packaging",
      before: { itemId: id } as Record<string, unknown>,
      after: updated as Record<string, unknown>,
      actor: user,
      fields: editableFields as unknown as Array<keyof Record<string, unknown>>,
    });
  }

  await recomputeFlagsForItem(id);

  res.json({ packaging: serializePackaging(updated!) });
});

export default router;
