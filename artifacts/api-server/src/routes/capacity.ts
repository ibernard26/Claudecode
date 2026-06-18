import { Router, type IRouter } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
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
  type DockSlot,
  type SlotReservation,
} from "@workspace/db";
import { requireUser, isWritableRole } from "../lib/auth";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoMonday(input?: string): string {
  const d = input ? new Date(input + "T00:00:00Z") : new Date();
  if (Number.isNaN(d.getTime())) return isoMonday(undefined);
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

router.get("/capacity/run-sheet", requireUser(), async (req, res) => {
  const user = req.currentUser!;

  // Resolve the target date (default to today UTC)
  const dateParam =
    typeof req.query["date"] === "string" ? req.query["date"] : null;
  const targetDate = dateParam
    ? new Date(dateParam + "T00:00:00Z")
    : new Date();
  if (Number.isNaN(targetDate.getTime())) {
    res.status(400).json({ error: "Invalid date" });
    return;
  }
  const isoDate = targetDate.toISOString().slice(0, 10);
  const weekStart = isoMonday(isoDate);
  const dayOfWeek = targetDate.getUTCDay(); // 0=Sun … 6=Sat
  const dayLabel = DAY_NAMES[dayOfWeek] ?? "Unknown";

  // Resolve warehouse
  const warehouses = await db
    .select()
    .from(warehousesTable)
    .orderBy(warehousesTable.name);
  const warehouseIdParam = num(req.query["warehouseId"]);
  let warehouseId = warehouseIdParam;
  if (warehouseId == null) {
    if (user.warehouseId != null) warehouseId = user.warehouseId;
    else if (warehouses.length > 0) warehouseId = warehouses[0]!.id;
  }
  if (warehouseId == null) {
    res.status(400).json({ error: "No warehouse available" });
    return;
  }
  const warehouse = warehouses.find((w) => w.id === warehouseId);

  // Dock slots for this warehouse + day
  const slots = await db
    .select()
    .from(dockSlotsTable)
    .where(
      and(
        eq(dockSlotsTable.warehouseId, warehouseId),
        eq(dockSlotsTable.dayOfWeek, dayOfWeek),
      ),
    )
    .orderBy(dockSlotsTable.startTime);

  if (slots.length === 0) {
    res.json({
      date: isoDate,
      dayLabel,
      warehouseId,
      warehouseName: warehouse?.name ?? "Unknown",
      warehouseCode: warehouse?.code ?? null,
      warehouseLocation: warehouse?.location ?? null,
      generatedAt: new Date().toISOString(),
      totalDocks: 0,
      totalPallets: 0,
      totalReservations: 0,
      docks: [],
    });
    return;
  }

  const slotIds = slots.map((s) => s.id);

  // Confirmed reservations for these slots in this week
  const rawReservations = await db
    .select({
      r: slotReservationsTable,
      supplierName: suppliersTable.name,
      clientName: clientsTable.name,
      itemSku: inventoryItemsTable.sku,
      itemDescription: inventoryItemsTable.description,
      warehouseLocation: inventoryItemsTable.warehouseLocation,
      hazmat: packagingSpecsTable.hazmatFlag,
      fragile: packagingSpecsTable.fragile,
      temperatureControl: packagingSpecsTable.temperatureControlRequired,
      loadSequence: packagingSpecsTable.loadSequence,
    })
    .from(slotReservationsTable)
    .leftJoin(suppliersTable, eq(suppliersTable.id, slotReservationsTable.supplierId))
    .leftJoin(clientsTable, eq(clientsTable.id, slotReservationsTable.clientId))
    .leftJoin(inventoryItemsTable, eq(inventoryItemsTable.id, slotReservationsTable.itemId))
    .leftJoin(packagingSpecsTable, eq(packagingSpecsTable.itemId, slotReservationsTable.itemId))
    .where(
      and(
        eq(slotReservationsTable.weekStart, weekStart),
        sql`${slotReservationsTable.slotId} = ANY(ARRAY[${sql.join(slotIds.map(id => sql`${id}`), sql`, `)}]::int[])`,
        sql`${slotReservationsTable.status} <> 'cancelled'`,
      ),
    );

  // Role-filter: suppliers see own, clients see own
  const filtered = rawReservations.filter((row) => {
    if (user.role === "admin" || user.role === "warehouse_manager" || user.role === "auditor") return true;
    if (user.role === "supplier") return row.r.supplierId === user.supplierId;
    if (user.role === "client") return row.r.clientId === user.clientId;
    return false;
  });

  // Compliance flag counts per item
  const itemIds = [...new Set(filtered.map((r) => r.r.itemId).filter((id): id is number => id != null))];
  const flagCounts = new Map<number, number>();
  if (itemIds.length > 0) {
    const flagRows = await db
      .select({
        itemId: complianceFlagsTable.itemId,
        count: sql<number>`count(*)::int`,
      })
      .from(complianceFlagsTable)
      .where(
        and(
          isNull(complianceFlagsTable.resolvedAt),
          sql`${complianceFlagsTable.itemId} = ANY(ARRAY[${sql.join(itemIds.map(id => sql`${id}`), sql`, `)}]::int[])`,
        ),
      )
      .groupBy(complianceFlagsTable.itemId);
    for (const fr of flagRows) {
      if (fr.itemId != null) flagCounts.set(fr.itemId, fr.count);
    }
  }

  // Group by slot, assign per-dock sequence numbers
  const docks = slots.map((slot) => {
    const slotReservations = filtered
      .filter((row) => row.r.slotId === slot.id)
      .sort((a, b) => (a.r.id - b.r.id));

    const palletsReserved = slotReservations.reduce((sum, r) => sum + r.r.palletCount, 0);

    return {
      slotId: slot.id,
      label: slot.label,
      startTime: slot.startTime,
      endTime: slot.endTime,
      palletCapacity: slot.palletCapacity,
      palletsReserved,
      reservations: slotReservations.map((row, idx) => ({
        id: row.r.id,
        seq: idx + 1,
        palletCount: row.r.palletCount,
        reference: row.r.reference,
        status: row.r.status,
        supplierName: row.supplierName ?? null,
        clientName: row.clientName ?? null,
        itemSku: row.itemSku ?? null,
        itemDescription: row.itemDescription ?? null,
        warehouseLocation: row.warehouseLocation ?? null,
        hazmat: row.hazmat ?? false,
        fragile: row.fragile ?? false,
        temperatureControl: row.temperatureControl ?? false,
        openFlagCount: row.r.itemId != null ? (flagCounts.get(row.r.itemId) ?? 0) : 0,
        loadSequence: row.loadSequence ?? null,
      })),
    };
  }).filter((dock) => dock.reservations.length > 0);

  const totalPallets = docks.reduce((s, d) => s + d.palletsReserved, 0);
  const totalReservations = docks.reduce((s, d) => s + d.reservations.length, 0);

  res.json({
    date: isoDate,
    dayLabel,
    warehouseId,
    warehouseName: warehouse?.name ?? "Unknown",
    warehouseCode: warehouse?.code ?? null,
    warehouseLocation: warehouse?.location ?? null,
    generatedAt: new Date().toISOString(),
    totalDocks: docks.length,
    totalPallets,
    totalReservations,
    docks,
  });
});

router.get("/capacity/board", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  const weekStart = isoMonday(
    typeof req.query["weekStart"] === "string"
      ? (req.query["weekStart"] as string)
      : undefined,
  );
  const warehouseIdParam = num(req.query["warehouseId"]);

  const warehouses = await db
    .select()
    .from(warehousesTable)
    .orderBy(warehousesTable.name);

  let warehouseId = warehouseIdParam;
  if (warehouseId == null) {
    if (user.warehouseId != null) warehouseId = user.warehouseId;
    else if (warehouses.length > 0) warehouseId = warehouses[0].id;
  }
  if (warehouseId == null) {
    res.json({
      weekStart,
      warehouseId: null,
      warehouses: [],
      days: [],
      slotDefinitions: [],
      reservations: [],
    });
    return;
  }

  const slots = await db
    .select()
    .from(dockSlotsTable)
    .where(eq(dockSlotsTable.warehouseId, warehouseId))
    .orderBy(dockSlotsTable.dayOfWeek, dockSlotsTable.startTime);

  const reservations = await db
    .select({
      r: slotReservationsTable,
      supplierName: suppliersTable.name,
      clientName: clientsTable.name,
      itemSku: inventoryItemsTable.sku,
      itemDescription: inventoryItemsTable.description,
    })
    .from(slotReservationsTable)
    .leftJoin(
      suppliersTable,
      eq(suppliersTable.id, slotReservationsTable.supplierId),
    )
    .leftJoin(
      clientsTable,
      eq(clientsTable.id, slotReservationsTable.clientId),
    )
    .leftJoin(
      inventoryItemsTable,
      eq(inventoryItemsTable.id, slotReservationsTable.itemId),
    )
    .where(eq(slotReservationsTable.weekStart, weekStart));

  // Filter to slots in this warehouse
  const slotIds = new Set(slots.map((s) => s.id));
  const filteredReservations = reservations.filter((row) =>
    slotIds.has(row.r.slotId),
  );

  // Role-based reservation visibility:
  // suppliers see only their own reservations in detail; pallet totals are still aggregated.
  // clients see only their own.
  const visibleReservations = filteredReservations.filter((row) => {
    if (row.r.status === "cancelled") return false;
    if (
      user.role === "admin" ||
      user.role === "warehouse_manager" ||
      user.role === "auditor"
    ) {
      return true;
    }
    if (user.role === "supplier")
      return row.r.supplierId === user.supplierId;
    if (user.role === "client") return row.r.clientId === user.clientId;
    return false;
  });

  const reservedBySlot = new Map<number, number>();
  for (const row of filteredReservations) {
    if (row.r.status === "cancelled") continue;
    reservedBySlot.set(
      row.r.slotId,
      (reservedBySlot.get(row.r.slotId) ?? 0) + row.r.palletCount,
    );
  }

  const days = Array.from({ length: 7 }).map((_, i) => ({
    date: addDays(weekStart, i),
    dayOfWeek: i,
    label: DAY_LABELS[i],
  }));

  res.json({
    weekStart,
    warehouseId,
    warehouses: warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      code: w.code,
    })),
    days,
    slotDefinitions: slots.map((s) => ({
      id: s.id,
      warehouseId: s.warehouseId,
      label: s.label,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      palletCapacity: s.palletCapacity,
      palletsReserved: reservedBySlot.get(s.id) ?? 0,
    })),
    reservations: visibleReservations.map((row) =>
      serializeReservation(row.r, {
        supplierName: row.supplierName,
        clientName: row.clientName,
        itemSku: row.itemSku,
        itemDescription: row.itemDescription,
      }),
    ),
  });
});

router.post("/capacity/slots", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  if (!isWritableRole(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const warehouseId = Number(body.warehouseId);
  const label = String(body.label ?? "").trim();
  const dayOfWeek = Number(body.dayOfWeek);
  const startTime = String(body.startTime ?? "").trim();
  const endTime = String(body.endTime ?? "").trim();
  const palletCapacity = Number(body.palletCapacity);
  if (
    !Number.isFinite(warehouseId) ||
    label.length === 0 ||
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime) ||
    !Number.isFinite(palletCapacity) ||
    palletCapacity <= 0
  ) {
    res.status(400).json({ error: "Invalid slot payload" });
    return;
  }
  const [slot] = await db
    .insert(dockSlotsTable)
    .values({
      warehouseId,
      label,
      dayOfWeek,
      startTime,
      endTime,
      palletCapacity,
    })
    .returning();
  await writeAudit({
    recordType: "dock_slot",
    recordId: slot.id,
    action: "create",
    category: "capacity",
    newValue: JSON.stringify({ label, dayOfWeek, palletCapacity }),
    actor: user,
  });
  res.status(201).json({ slot: serializeSlot(slot) });
});

router.delete("/capacity/slots/:id", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  if (!isWritableRole(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [slot] = await db
    .select()
    .from(dockSlotsTable)
    .where(eq(dockSlotsTable.id, id));
  if (!slot) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db
    .delete(slotReservationsTable)
    .where(eq(slotReservationsTable.slotId, id));
  await db.delete(dockSlotsTable).where(eq(dockSlotsTable.id, id));
  await writeAudit({
    recordType: "dock_slot",
    recordId: id,
    action: "delete",
    category: "capacity",
    oldValue: JSON.stringify({ label: slot.label }),
    actor: user,
  });
  res.json({ ok: true });
});

router.post("/capacity/reservations", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  if (user.role === "auditor" || user.role === "client") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const slotId = Number(body.slotId);
  const weekStart = isoMonday(
    typeof body.weekStart === "string" ? body.weekStart : undefined,
  );
  const palletCount = Number(body.palletCount);
  const itemId = body.itemId == null ? null : Number(body.itemId);
  const reference =
    typeof body.reference === "string" ? body.reference.trim() : null;

  if (
    !Number.isFinite(slotId) ||
    !Number.isFinite(palletCount) ||
    palletCount <= 0
  ) {
    res.status(400).json({ error: "Invalid reservation payload" });
    return;
  }

  const [slot] = await db
    .select()
    .from(dockSlotsTable)
    .where(eq(dockSlotsTable.id, slotId));
  if (!slot) {
    res.status(404).json({ error: "Slot not found" });
    return;
  }

  // Determine supplier/client linkage from caller role or admin-provided fields.
  let supplierId: number | null = null;
  let clientId: number | null = null;
  if (user.role === "supplier") {
    supplierId = user.supplierId ?? null;
    if (supplierId == null) {
      res.status(400).json({ error: "Supplier account is not linked" });
      return;
    }
  } else {
    // admin or warehouse_manager — may specify either
    if (body.supplierId != null) supplierId = Number(body.supplierId);
    if (body.clientId != null) clientId = Number(body.clientId);
  }

  if (itemId != null) {
    const [item] = await db
      .select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.id, itemId));
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    if (
      user.role === "supplier" &&
      item.supplierId !== user.supplierId
    ) {
      res.status(403).json({ error: "Cannot reserve for another supplier's item" });
      return;
    }
    if (supplierId == null && item.supplierId != null)
      supplierId = item.supplierId;
    if (clientId == null && item.clientId != null) clientId = item.clientId;
  }

  // Capacity check
  const existing = await db
    .select({
      total: sql<number>`coalesce(sum(${slotReservationsTable.palletCount}), 0)::int`,
    })
    .from(slotReservationsTable)
    .where(
      and(
        eq(slotReservationsTable.slotId, slotId),
        eq(slotReservationsTable.weekStart, weekStart),
        sql`${slotReservationsTable.status} <> 'cancelled'`,
      ),
    );
  const totalReserved = existing[0]?.total ?? 0;
  if (totalReserved + palletCount > slot.palletCapacity) {
    res.status(409).json({
      error: "Insufficient capacity for this slot",
      capacity: slot.palletCapacity,
      reserved: totalReserved,
      requested: palletCount,
    });
    return;
  }

  const status = isWritableRole(user.role) ? "confirmed" : "planned";

  const [reservation] = await db
    .insert(slotReservationsTable)
    .values({
      slotId,
      weekStart,
      supplierId,
      clientId,
      itemId,
      palletCount,
      reference,
      status,
      createdById: user.id,
    })
    .returning();

  await writeAudit({
    recordType: "slot_reservation",
    recordId: reservation.id,
    itemId,
    action: "create",
    category: "capacity",
    newValue: JSON.stringify({
      slotId,
      weekStart,
      palletCount,
      status,
      reference,
    }),
    actor: user,
  });

  res.status(201).json({ reservation: serializeReservation(reservation) });
});

router.patch("/capacity/reservations/:id", requireUser(), async (req, res) => {
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
    res.status(404).json({ error: "Not found" });
    return;
  }

  const canManage = isWritableRole(user.role);
  const isOwner =
    reservation.createdById === user.id ||
    (user.role === "supplier" &&
      reservation.supplierId === user.supplierId);

  if (!canManage && !isOwner) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (
      !canManage &&
      body.status !== "cancelled" &&
      body.status !== "planned"
    ) {
      res.status(403).json({ error: "Cannot change status" });
      return;
    }
    patch.status = body.status;
  }
  if (body.palletCount != null) {
    const n = Number(body.palletCount);
    if (!Number.isFinite(n) || n <= 0) {
      res.status(400).json({ error: "Invalid palletCount" });
      return;
    }
    patch.palletCount = n;
  }
  if (typeof body.reference === "string") patch.reference = body.reference;

  if (Object.keys(patch).length === 0) {
    res.json({ reservation: serializeReservation(reservation) });
    return;
  }

  if (patch.palletCount != null && patch.status !== "cancelled") {
    const [slot] = await db.select().from(dockSlotsTable)
      .where(eq(dockSlotsTable.id, reservation.slotId));
    if (slot) {
      const [existing] = await db
        .select({
          total: sql<number>`coalesce(sum(${slotReservationsTable.palletCount}), 0)::int`,
        })
        .from(slotReservationsTable)
        .where(
          and(
            eq(slotReservationsTable.slotId, reservation.slotId),
            eq(slotReservationsTable.weekStart, reservation.weekStart),
            sql`${slotReservationsTable.status} <> 'cancelled'`,
            sql`${slotReservationsTable.id} <> ${reservation.id}`,
          ),
        );
      const otherReserved = existing?.total ?? 0;
      if (otherReserved + Number(patch.palletCount) > slot.palletCapacity) {
        res.status(409).json({
          error: "Insufficient capacity for updated palletCount",
          capacity: slot.palletCapacity,
          otherReserved,
          requested: patch.palletCount,
        });
        return;
      }
    }
  }

  const [updated] = await db
    .update(slotReservationsTable)
    .set(patch)
    .where(eq(slotReservationsTable.id, id))
    .returning();

  await writeAudit({
    recordType: "slot_reservation",
    recordId: id,
    action: "update",
    category: "capacity",
    oldValue: JSON.stringify({
      status: reservation.status,
      palletCount: reservation.palletCount,
    }),
    newValue: JSON.stringify(patch),
    actor: user,
  });

  res.json({ reservation: serializeReservation(updated) });
});

router.delete("/capacity/reservations/:id", requireUser(), async (req, res) => {
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
    res.status(404).json({ error: "Not found" });
    return;
  }
  const canManage = isWritableRole(user.role);
  const isOwner =
    reservation.createdById === user.id ||
    (user.role === "supplier" &&
      reservation.supplierId === user.supplierId);
  if (!canManage && !isOwner) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db
    .delete(slotReservationsTable)
    .where(eq(slotReservationsTable.id, id));
  await writeAudit({
    recordType: "slot_reservation",
    recordId: id,
    action: "delete",
    category: "capacity",
    oldValue: JSON.stringify({
      slotId: reservation.slotId,
      weekStart: reservation.weekStart,
      palletCount: reservation.palletCount,
    }),
    actor: user,
  });
  res.json({ ok: true });
});

router.get(
  "/capacity/reservations/:id/manifest",
  requireUser(),
  async (req, res) => {
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
      res.status(404).json({ error: "Reservation not found" });
      return;
    }

    // Visibility: admin/manager/auditor see all; supplier sees own; client sees own.
    const canView =
      user.role === "admin" ||
      user.role === "warehouse_manager" ||
      user.role === "auditor" ||
      (user.role === "supplier" &&
        reservation.supplierId === user.supplierId) ||
      (user.role === "client" && reservation.clientId === user.clientId);
    if (!canView) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [slot] = await db
      .select()
      .from(dockSlotsTable)
      .where(eq(dockSlotsTable.id, reservation.slotId));
    if (!slot) {
      res.status(404).json({ error: "Slot not found" });
      return;
    }

    const [warehouse] = await db
      .select()
      .from(warehousesTable)
      .where(eq(warehousesTable.id, slot.warehouseId));

    const supplier = reservation.supplierId
      ? (
          await db
            .select()
            .from(suppliersTable)
            .where(eq(suppliersTable.id, reservation.supplierId))
        )[0]
      : null;

    const client = reservation.clientId
      ? (
          await db
            .select()
            .from(clientsTable)
            .where(eq(clientsTable.id, reservation.clientId))
        )[0]
      : null;

    const item = reservation.itemId
      ? (
          await db
            .select()
            .from(inventoryItemsTable)
            .where(eq(inventoryItemsTable.id, reservation.itemId))
        )[0]
      : null;

    const packaging = reservation.itemId
      ? (
          await db
            .select()
            .from(packagingSpecsTable)
            .where(eq(packagingSpecsTable.itemId, reservation.itemId))
        )[0]
      : null;

    const flags = reservation.itemId
      ? await db
          .select()
          .from(complianceFlagsTable)
          .where(
            and(
              eq(complianceFlagsTable.itemId, reservation.itemId),
              isNull(complianceFlagsTable.resolvedAt),
            ),
          )
          .orderBy(complianceFlagsTable.severity)
      : [];

    // Compute scheduled date from weekStart + slot.dayOfWeek
    const monday = new Date(reservation.weekStart + "T00:00:00Z");
    const offsetFromMon = ((slot.dayOfWeek + 6) % 7); // Mon=1 → 0, Tue=2 → 1, ...
    monday.setUTCDate(monday.getUTCDate() + offsetFromMon);
    const scheduledDate = monday.toISOString().slice(0, 10);

    const manifestNumber = `MAN-${warehouse?.code ?? "WH"}-${reservation.weekStart.replace(/-/g, "")}-${String(reservation.id).padStart(4, "0")}`;
    const barcodePayload = [
      manifestNumber,
      `S${reservation.slotId}`,
      `R${reservation.id}`,
      item?.sku ?? "NOSKU",
      `Q${reservation.palletCount}`,
    ].join("|");

    await writeAudit({
      recordType: "slot_reservation",
      recordId: reservation.id,
      action: "manifest_view",
      category: "capacity",
      newValue: manifestNumber,
      actor: user,
    });

    res.json({
      reservation: serializeReservation(reservation, {
        supplierName: supplier?.name ?? null,
        clientName: client?.name ?? null,
        itemSku: item?.sku ?? null,
        itemDescription: item?.description ?? null,
      }),
      slot: {
        id: slot.id,
        label: slot.label,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        palletCapacity: slot.palletCapacity,
      },
      warehouse: warehouse
        ? {
            id: warehouse.id,
            name: warehouse.name,
            code: warehouse.code ?? null,
            location: warehouse.location ?? null,
          }
        : { id: slot.warehouseId, name: "Unknown" },
      supplier: supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            code: supplier.code ?? null,
          }
        : null,
      client: client
        ? {
            id: client.id,
            name: client.name,
            code: client.code ?? null,
          }
        : null,
      item: item
        ? {
            id: item.id,
            sku: item.sku,
            description: item.description,
            partNumber: item.partNumber ?? null,
            poNumber: item.poNumber ?? null,
            asnNumber: item.asnNumber ?? null,
            warehouseLocation: item.warehouseLocation ?? null,
            quantityOnHand: item.quantityOnHand,
          }
        : null,
      packaging: packaging
        ? {
            ...packaging,
            updatedAt: packaging.updatedAt.toISOString(),
          }
        : null,
      flags: flags.map((f) => ({
        ...f,
        detectedAt: f.detectedAt.toISOString(),
        resolvedAt: f.resolvedAt ? f.resolvedAt.toISOString() : null,
      })),
      manifestNumber,
      generatedAt: new Date().toISOString(),
      generatedBy: user.displayName ?? user.username,
      barcodePayload,
      scheduledDate,
    });
  },
);

function serializeSlot(s: DockSlot) {
  return {
    id: s.id,
    warehouseId: s.warehouseId,
    label: s.label,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    palletCapacity: s.palletCapacity,
  };
}

function serializeReservation(
  r: SlotReservation,
  extra: {
    supplierName?: string | null;
    clientName?: string | null;
    itemSku?: string | null;
    itemDescription?: string | null;
  } = {},
) {
  return {
    id: r.id,
    slotId: r.slotId,
    weekStart: r.weekStart,
    supplierId: r.supplierId,
    clientId: r.clientId,
    itemId: r.itemId,
    palletCount: r.palletCount,
    reference: r.reference,
    status: r.status,
    createdById: r.createdById,
    createdAt: r.createdAt.toISOString(),
    supplierName: extra.supplierName ?? null,
    clientName: extra.clientName ?? null,
    itemSku: extra.itemSku ?? null,
    itemDescription: extra.itemDescription ?? null,
  };
}

export default router;
