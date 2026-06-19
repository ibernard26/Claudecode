import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  dockSlotsTable,
  slotReservationsTable,
  warehousesTable,
  suppliersTable,
  clientsTable,
  inventoryItemsTable,
  packagingSpecsTable,
  complianceFlagsTable,
  shipmentItemsTable,
  type SlotReservation,
  type DockSlot,
} from "@workspace/db";
import { requireUser, isWritableRole } from "../lib/auth";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

// ── helpers ────────────────────────────────────────────────────────────────

export function isoMonday(input?: string): string {
  const d = input ? new Date(input + "T00:00:00Z") : new Date();
  if (Number.isNaN(d.getTime())) return isoMonday(undefined);
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function scheduledDateFromSlot(weekStart: string, dayOfWeek: number): string {
  const monday = new Date(weekStart + "T00:00:00Z");
  const offsetFromMon = (dayOfWeek + 6) % 7; // Mon=1 → 0, Tue=2 → 1, ...
  monday.setUTCDate(monday.getUTCDate() + offsetFromMon);
  return monday.toISOString().slice(0, 10);
}

type VerifyStatus = "pass" | "warn" | "fail";

interface VerifyCheck {
  code: string;
  label: string;
  status: VerifyStatus;
  detail?: string;
}

interface VerifyBody {
  slotId?: unknown;
  weekStart?: unknown;
  palletCount?: unknown;
  itemIds?: unknown;
  carrierRef?: unknown;
  asnNumber?: unknown;
  reference?: unknown;
}

async function runVerify(body: VerifyBody): Promise<{ canProceed: boolean; checks: VerifyCheck[] }> {
  const checks: VerifyCheck[] = [];
  const slotId = Number(body.slotId);
  const weekStart = isoMonday(typeof body.weekStart === "string" ? body.weekStart : undefined);
  const palletCount = Number(body.palletCount);
  const itemIds: number[] = Array.isArray(body.itemIds) ? body.itemIds.map(Number).filter(Number.isFinite) : [];
  const carrierRef = typeof body.carrierRef === "string" ? body.carrierRef.trim() : "";
  const asnNumber = typeof body.asnNumber === "string" ? body.asnNumber.trim() : "";

  // 1. SLOT_EXISTS
  const [slot] = await db.select().from(dockSlotsTable).where(eq(dockSlotsTable.id, slotId));
  if (!slot) {
    checks.push({ code: "SLOT_EXISTS", label: "Dock slot exists", status: "fail", detail: "Slot not found in database" });
    return { canProceed: false, checks };
  }
  checks.push({ code: "SLOT_EXISTS", label: "Dock slot exists", status: "pass" });

  // 2. CAPACITY
  const [capRow] = await db
    .select({ total: sql<number>`coalesce(sum(${slotReservationsTable.palletCount}), 0)::int` })
    .from(slotReservationsTable)
    .where(
      and(
        eq(slotReservationsTable.slotId, slotId),
        eq(slotReservationsTable.weekStart, weekStart),
        sql`${slotReservationsTable.status} <> 'cancelled'`,
      ),
    );
  const alreadyReserved = capRow?.total ?? 0;
  const remaining = slot.palletCapacity - alreadyReserved;
  if (palletCount > remaining) {
    checks.push({
      code: "CAPACITY",
      label: "Slot has sufficient capacity",
      status: "fail",
      detail: `Requested ${palletCount} pallets but only ${remaining} remain (capacity ${slot.palletCapacity}, reserved ${alreadyReserved})`,
    });
  } else {
    checks.push({
      code: "CAPACITY",
      label: "Slot has sufficient capacity",
      status: "pass",
      detail: `${remaining} pallets remaining after this shipment`,
    });
  }

  // 3. ITEMS_SELECTED
  if (itemIds.length === 0) {
    checks.push({ code: "ITEMS_SELECTED", label: "Items selected", status: "fail", detail: "At least one item must be selected" });
    const canProceed = checks.every((c) => c.status !== "fail");
    return { canProceed, checks };
  }
  checks.push({ code: "ITEMS_SELECTED", label: "Items selected", status: "pass", detail: `${itemIds.length} item(s) selected` });

  // Load items
  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(inArray(inventoryItemsTable.id, itemIds));

  // 4. ITEM_STATUS
  const goodStatuses = new Set(["ReadyForShipment", "ReadyForLoading", "ReadyForStaging"]);
  const badStatusItems = items.filter((it) => !goodStatuses.has(it.status));
  if (badStatusItems.length > 0) {
    checks.push({
      code: "ITEM_STATUS",
      label: "All items ready for shipment",
      status: "warn",
      detail: `${badStatusItems.length} item(s) not in a ready status: ${badStatusItems.map((i) => i.sku).join(", ")}`,
    });
  } else {
    checks.push({ code: "ITEM_STATUS", label: "All items ready for shipment", status: "pass" });
  }

  // Load packaging specs
  const packagingRows = await db
    .select()
    .from(packagingSpecsTable)
    .where(inArray(packagingSpecsTable.itemId, itemIds));
  const packagingByItemId = new Map(packagingRows.map((p) => [p.itemId, p]));

  // 5. PACKAGING_SPECS
  const missingPackaging = items.filter((it) => !packagingByItemId.has(it.id));
  if (missingPackaging.length > 0) {
    checks.push({
      code: "PACKAGING_SPECS",
      label: "All items have packaging specifications",
      status: "fail",
      detail: `Missing packaging specs for: ${missingPackaging.map((i) => i.sku).join(", ")}`,
    });
  } else {
    const incompleteDims = packagingRows.filter(
      (p) => p.packageWeight == null || p.packageLength == null || p.packageWidth == null || p.packageHeight == null,
    );
    if (incompleteDims.length > 0) {
      const skus = incompleteDims.map((p) => items.find((i) => i.id === p.itemId)?.sku ?? String(p.itemId));
      checks.push({
        code: "PACKAGING_SPECS",
        label: "All items have packaging specifications",
        status: "warn",
        detail: `Incomplete dimensions for: ${skus.join(", ")}`,
      });
    } else {
      checks.push({ code: "PACKAGING_SPECS", label: "All items have packaging specifications", status: "pass" });
    }
  }

  // 6. NO_CRITICAL_FLAGS — load open compliance flags for all items
  const openFlags = await db
    .select()
    .from(complianceFlagsTable)
    .where(
      and(
        inArray(complianceFlagsTable.itemId, itemIds),
        isNull(complianceFlagsTable.resolvedAt),
      ),
    );
  const criticalFlags = openFlags.filter((f) => f.severity === "critical");
  const highFlags = openFlags.filter((f) => f.severity === "high");
  const otherFlags = openFlags.filter((f) => f.severity !== "critical" && f.severity !== "high");
  if (criticalFlags.length > 0) {
    checks.push({
      code: "NO_CRITICAL_FLAGS",
      label: "No critical compliance flags",
      status: "fail",
      detail: `${criticalFlags.length} critical unresolved flag(s)`,
    });
  } else if (highFlags.length > 0) {
    checks.push({
      code: "NO_CRITICAL_FLAGS",
      label: "No critical compliance flags",
      status: "warn",
      detail: `${highFlags.length} high-severity unresolved flag(s)`,
    });
  } else if (otherFlags.length > 0) {
    checks.push({
      code: "NO_CRITICAL_FLAGS",
      label: "No critical compliance flags",
      status: "warn",
      detail: `${otherFlags.length} medium/low unresolved flag(s)`,
    });
  } else {
    checks.push({ code: "NO_CRITICAL_FLAGS", label: "No critical compliance flags", status: "pass" });
  }

  // 7. CARRIER_REF — warn if any packaging row has non-empty carrierRequirement and no carrierRef provided
  const requiresCarrier = packagingRows.filter((p) => p.carrierRequirement && p.carrierRequirement.trim().length > 0);
  if (requiresCarrier.length > 0 && !carrierRef) {
    checks.push({
      code: "CARRIER_REF",
      label: "Carrier reference provided",
      status: "warn",
      detail: `${requiresCarrier.length} item(s) have a carrier requirement but no carrier reference was supplied`,
    });
  } else {
    checks.push({ code: "CARRIER_REF", label: "Carrier reference provided", status: "pass" });
  }

  // 8. ASN_REQUIRED — fail if any packaging row has asnRequired=true and no asnNumber provided
  const requiresAsn = packagingRows.filter((p) => p.asnRequired === true);
  if (requiresAsn.length > 0 && !asnNumber) {
    checks.push({
      code: "ASN_REQUIRED",
      label: "ASN number provided",
      status: "fail",
      detail: `${requiresAsn.length} item(s) require an ASN number`,
    });
  } else {
    checks.push({ code: "ASN_REQUIRED", label: "ASN number provided", status: "pass" });
  }

  // 9. WEEK_FUTURE — warn if weekStart is before today
  const todayIso = new Date().toISOString().slice(0, 10);
  if (weekStart < todayIso) {
    checks.push({
      code: "WEEK_FUTURE",
      label: "Shipment week is current or future",
      status: "warn",
      detail: `Week ${weekStart} is in the past (today is ${todayIso})`,
    });
  } else {
    checks.push({ code: "WEEK_FUTURE", label: "Shipment week is current or future", status: "pass" });
  }

  const canProceed = checks.every((c) => c.status !== "fail");
  return { canProceed, checks };
}

function serializeShipmentSummary(
  reservation: SlotReservation,
  slot: DockSlot,
  warehouse: { id: number; name: string; code?: string | null } | null,
  supplier: { id: number; name: string; code?: string | null } | null,
  client: { id: number; name: string; code?: string | null } | null,
  itemCount: number,
) {
  const scheduledDate = scheduledDateFromSlot(reservation.weekStart, slot.dayOfWeek);
  const warehouseCode = warehouse?.code ?? "WH";
  const manifestNumber = `SHP-${warehouseCode}-${reservation.weekStart.replace(/-/g, "")}-${String(reservation.id).padStart(4, "0")}`;
  return {
    id: reservation.id,
    weekStart: reservation.weekStart,
    status: reservation.status,
    palletCount: reservation.palletCount,
    reference: reservation.reference ?? null,
    slotId: reservation.slotId,
    slotLabel: slot.label,
    warehouseId: warehouse?.id ?? slot.warehouseId,
    warehouseName: warehouse?.name ?? "Unknown",
    supplierId: reservation.supplierId ?? null,
    supplierName: supplier?.name ?? null,
    clientId: reservation.clientId ?? null,
    clientName: client?.name ?? null,
    scheduledDate,
    itemCount,
    manifestNumber,
    createdAt: reservation.createdAt.toISOString(),
  };
}

// ── POST /shipments/verify ─────────────────────────────────────────────────

router.post("/shipments/verify", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  if (user.role === "auditor" || user.role === "client") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = (req.body ?? {}) as VerifyBody;
  const result = await runVerify(body);
  res.json(result);
});

// ── POST /shipments ────────────────────────────────────────────────────────

router.post("/shipments", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  if (user.role === "auditor" || user.role === "client") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = (req.body ?? {}) as VerifyBody & {
    supplierId?: unknown;
    clientId?: unknown;
    shipmentRef?: unknown;
  };

  // Run verify first
  const { canProceed, checks } = await runVerify(body);
  if (!canProceed) {
    res.status(422).json({ error: "Shipment failed verification checks", checks });
    return;
  }

  const slotId = Number(body.slotId);
  const weekStart = isoMonday(typeof body.weekStart === "string" ? body.weekStart : undefined);
  const palletCount = Number(body.palletCount);
  const itemIds: number[] = Array.isArray(body.itemIds) ? body.itemIds.map(Number).filter(Number.isFinite) : [];
  const carrierRef = typeof body.carrierRef === "string" && body.carrierRef.trim() ? body.carrierRef.trim() : null;
  const shipmentRef = typeof body.shipmentRef === "string" && body.shipmentRef.trim() ? body.shipmentRef.trim() : null;
  const asnNumber = typeof body.asnNumber === "string" && body.asnNumber.trim() ? body.asnNumber.trim() : null;
  const reference = typeof body.reference === "string" && body.reference.trim() ? body.reference.trim() : null;

  // Determine supplier/client
  let supplierId: number | null = null;
  let clientId: number | null = null;
  if (user.role === "supplier") {
    supplierId = user.supplierId ?? null;
  } else {
    if (body.supplierId != null) supplierId = Number(body.supplierId) || null;
    if (body.clientId != null) clientId = Number(body.clientId) || null;
  }

  const status = isWritableRole(user.role) ? "confirmed" : "planned";

  // Create reservation
  const [reservation] = await db
    .insert(slotReservationsTable)
    .values({ slotId, weekStart, supplierId, clientId, palletCount, reference, status, createdById: user.id })
    .returning();

  // Insert shipment items
  if (itemIds.length > 0) {
    await db.insert(shipmentItemsTable).values(
      itemIds.map((itemId) => ({ reservationId: reservation.id, itemId })),
    );

    // Update item fields if provided
    if (carrierRef || shipmentRef || asnNumber) {
      const patch: Record<string, string> = {};
      if (carrierRef) patch.carrierRef = carrierRef;
      if (shipmentRef) patch.shipmentRef = shipmentRef;
      if (asnNumber) patch.asnNumber = asnNumber;
      await db.update(inventoryItemsTable).set(patch).where(inArray(inventoryItemsTable.id, itemIds));
    }
  }

  // Write audit log
  await writeAudit({
    recordType: "shipment",
    recordId: reservation.id,
    action: "create",
    category: "shipment",
    newValue: JSON.stringify({ slotId, weekStart, palletCount, status, itemCount: itemIds.length }),
    actor: user,
  });

  // Load related data for response
  const [slot] = await db.select().from(dockSlotsTable).where(eq(dockSlotsTable.id, slotId));
  const [warehouse] = slot
    ? await db.select().from(warehousesTable).where(eq(warehousesTable.id, slot.warehouseId))
    : [];
  const [supplier] = supplierId
    ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId))
    : [];
  const [client] = clientId
    ? await db.select().from(clientsTable).where(eq(clientsTable.id, clientId))
    : [];

  res.status(201).json({
    shipment: serializeShipmentSummary(
      reservation,
      slot!,
      warehouse ?? null,
      supplier ?? null,
      client ?? null,
      itemIds.length,
    ),
  });
});

// ── GET /shipments ─────────────────────────────────────────────────────────

router.get("/shipments", requireUser(), async (req, res) => {
  const user = req.currentUser!;

  // Get all reservations that have at least one shipment_items row
  const rows = await db
    .select({
      r: slotReservationsTable,
      slot: dockSlotsTable,
      warehouse: warehousesTable,
      supplier: suppliersTable,
      client: clientsTable,
      itemCount: sql<number>`count(${shipmentItemsTable.id})::int`,
    })
    .from(slotReservationsTable)
    .innerJoin(shipmentItemsTable, eq(shipmentItemsTable.reservationId, slotReservationsTable.id))
    .innerJoin(dockSlotsTable, eq(dockSlotsTable.id, slotReservationsTable.slotId))
    .leftJoin(warehousesTable, eq(warehousesTable.id, dockSlotsTable.warehouseId))
    .leftJoin(suppliersTable, eq(suppliersTable.id, slotReservationsTable.supplierId))
    .leftJoin(clientsTable, eq(clientsTable.id, slotReservationsTable.clientId))
    .groupBy(
      slotReservationsTable.id,
      dockSlotsTable.id,
      warehousesTable.id,
      suppliersTable.id,
      clientsTable.id,
    )
    .orderBy(desc(slotReservationsTable.createdAt));

  // Role scoping
  const filtered = rows.filter((row) => {
    if (user.role === "supplier") return row.r.supplierId === user.supplierId;
    if (user.role === "client") return row.r.clientId === user.clientId;
    return true;
  });

  res.json(
    filtered.map((row) =>
      serializeShipmentSummary(
        row.r,
        row.slot,
        row.warehouse ?? null,
        row.supplier ?? null,
        row.client ?? null,
        row.itemCount,
      ),
    ),
  );
});

// ── GET /shipments/:id ─────────────────────────────────────────────────────

router.get("/shipments/:id", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [reservation] = await db
    .select()
    .from(slotReservationsTable)
    .where(eq(slotReservationsTable.id, id));
  if (!reservation) {
    res.status(404).json({ error: "Shipment not found" });
    return;
  }

  // Role scoping
  if (user.role === "supplier" && reservation.supplierId !== user.supplierId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (user.role === "client" && reservation.clientId !== user.clientId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [slot] = await db.select().from(dockSlotsTable).where(eq(dockSlotsTable.id, reservation.slotId));
  if (!slot) {
    res.status(404).json({ error: "Slot not found" });
    return;
  }

  const [warehouse] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, slot.warehouseId));

  const [supplier] = reservation.supplierId
    ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, reservation.supplierId))
    : [null];

  const [client] = reservation.clientId
    ? await db.select().from(clientsTable).where(eq(clientsTable.id, reservation.clientId))
    : [null];

  // Shipment items
  const shipmentItemRows = await db
    .select({ si: shipmentItemsTable, item: inventoryItemsTable })
    .from(shipmentItemsTable)
    .innerJoin(inventoryItemsTable, eq(inventoryItemsTable.id, shipmentItemsTable.itemId))
    .where(eq(shipmentItemsTable.reservationId, id));

  const itemIds = shipmentItemRows.map((r) => r.item.id);

  // Packaging specs
  const packagingRows = itemIds.length > 0
    ? await db.select().from(packagingSpecsTable).where(inArray(packagingSpecsTable.itemId, itemIds))
    : [];

  // Open compliance flags per item
  const flagRows = itemIds.length > 0
    ? await db
        .select({
          itemId: complianceFlagsTable.itemId,
          count: sql<number>`count(*)::int`,
        })
        .from(complianceFlagsTable)
        .where(
          and(
            inArray(complianceFlagsTable.itemId, itemIds),
            isNull(complianceFlagsTable.resolvedAt),
          ),
        )
        .groupBy(complianceFlagsTable.itemId)
    : [];

  const flagCountByItemId = new Map(flagRows.map((f) => [f.itemId, f.count]));
  const packagingByItemId = new Map(packagingRows.map((p) => [p.itemId, p]));

  const scheduledDate = scheduledDateFromSlot(reservation.weekStart, slot.dayOfWeek);
  const warehouseCode = warehouse?.code ?? "WH";
  const manifestNumber = `SHP-${warehouseCode}-${reservation.weekStart.replace(/-/g, "")}-${String(reservation.id).padStart(4, "0")}`;

  res.json({
    reservation: {
      id: reservation.id,
      slotId: reservation.slotId,
      weekStart: reservation.weekStart,
      supplierId: reservation.supplierId ?? null,
      clientId: reservation.clientId ?? null,
      palletCount: reservation.palletCount,
      reference: reservation.reference ?? null,
      status: reservation.status,
      createdById: reservation.createdById,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    },
    slot: {
      id: slot.id,
      label: slot.label,
      startTime: slot.startTime,
      endTime: slot.endTime,
      dayOfWeek: slot.dayOfWeek,
      palletCapacity: slot.palletCapacity,
    },
    warehouse: warehouse
      ? { id: warehouse.id, name: warehouse.name, code: warehouse.code ?? null }
      : { id: slot.warehouseId, name: "Unknown", code: null },
    supplier: supplier
      ? { id: supplier.id, name: supplier.name, code: supplier.code }
      : null,
    client: client
      ? { id: client.id, name: client.name, code: client.code }
      : null,
    items: shipmentItemRows.map((row) => ({
      id: row.item.id,
      sku: row.item.sku,
      description: row.item.description,
      status: row.item.status,
      quantityOnHand: row.item.quantityOnHand,
      carrierRef: row.item.carrierRef ?? null,
      shipmentRef: row.item.shipmentRef ?? null,
      asnNumber: row.item.asnNumber ?? null,
      packagingSpec: packagingByItemId.get(row.item.id) ?? null,
      openFlagCount: flagCountByItemId.get(row.item.id) ?? 0,
    })),
    scheduledDate,
    manifestNumber,
  });
});

export default router;
