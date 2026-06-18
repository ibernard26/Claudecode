import { and, eq, sql } from "drizzle-orm";
import {
  db,
  warehousesTable,
  suppliersTable,
  clientsTable,
  inventoryItemsTable,
  usersTable,
  dockSlotsTable,
  slotReservationsTable,
} from "@workspace/db";
import type { Logger } from "pino";

function currentWeekStart(): string {
  const now = new Date();
  const dow = now.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + offset);
  return monday.toISOString().slice(0, 10);
}

export async function seedCapacityIfEmpty(log: Logger): Promise<void> {
  const [{ slotCount }] = await db
    .select({ slotCount: sql<number>`count(*)::int` })
    .from(dockSlotsTable);

  const warehouses = await db
    .select()
    .from(warehousesTable)
    .orderBy(warehousesTable.id);
  if (warehouses.length === 0) {
    log.warn("Capacity seed: no warehouses, skipping");
    return;
  }
  const [whEast, whWest] = warehouses;

  let insertedSlots: Array<typeof dockSlotsTable.$inferSelect> = [];

  if (slotCount === 0) {
    const slotsByWarehouse = [
      {
        wh: whEast,
        slots: [
          { label: "Dock 1 — Inbound", start: "06:00", end: "10:00", cap: 24 },
          { label: "Dock 2 — Outbound", start: "10:00", end: "14:00", cap: 24 },
          { label: "Dock 3 — Outbound", start: "14:00", end: "18:00", cap: 18 },
        ],
      },
    ];
    if (whWest) {
      slotsByWarehouse.push({
        wh: whWest,
        slots: [
          { label: "Dock A — Inbound", start: "07:00", end: "11:00", cap: 20 },
          { label: "Dock B — Outbound", start: "11:00", end: "15:00", cap: 20 },
        ],
      });
    }

    const dockSeed: Array<typeof dockSlotsTable.$inferInsert> = [];
    for (const group of slotsByWarehouse) {
      for (let day = 1; day <= 5; day++) {
        for (const s of group.slots) {
          dockSeed.push({
            warehouseId: group.wh.id,
            label: s.label,
            dayOfWeek: day,
            startTime: s.start,
            endTime: s.end,
            palletCapacity: s.cap,
          });
        }
      }
    }
    insertedSlots = await db
      .insert(dockSlotsTable)
      .values(dockSeed)
      .returning();
    log.info(
      { count: insertedSlots.length },
      "Capacity seed: created dock slots",
    );
  } else {
    insertedSlots = await db.select().from(dockSlotsTable);
    log.info({ slots: slotCount }, "Capacity seed: slots already exist");
  }

  // Always ensure sample reservations exist for the current week
  const weekStart = currentWeekStart();
  const [{ resCount }] = await db
    .select({ resCount: sql<number>`count(*)::int` })
    .from(slotReservationsTable)
    .where(eq(slotReservationsTable.weekStart, weekStart));

  if (resCount > 0) {
    log.info({ resCount, weekStart }, "Capacity seed: reservations already exist for this week");
    return;
  }

  const [acme] = await db.select().from(suppliersTable).orderBy(suppliersTable.id);
  if (!acme) return;
  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.id);
  const northstar = suppliers[1] ?? acme;
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.id);
  const [globex] = clients;
  if (!globex) return;
  const initech = clients[1] ?? globex;
  const items = await db.select().from(inventoryItemsTable);
  const itemBySku = new Map(items.map((i) => [i.sku, i]));
  const users = await db.select().from(usersTable).orderBy(usersTable.id);
  const managerUser = users.find((u) => u.role === "warehouse_manager") ?? users[0];
  const acmeUser = users.find((u) => u.role === "supplier") ?? managerUser;
  if (!managerUser || !acmeUser) return;

  const find = (whId: number, day: number, prefix: string) =>
    insertedSlots.find(
      (s) =>
        s.warehouseId === whId &&
        s.dayOfWeek === day &&
        s.label.startsWith(prefix),
    );

  const reservations: Array<typeof slotReservationsTable.$inferInsert> = [];

  const e1 = find(whEast.id, 1, "Dock 1");
  if (e1 && itemBySku.has("ACM-PWR-2410")) {
    reservations.push({
      slotId: e1.id,
      weekStart,
      supplierId: acme.id,
      clientId: globex.id,
      itemId: itemBySku.get("ACM-PWR-2410")!.id,
      palletCount: 8,
      reference: "PO-9001 inbound",
      status: "confirmed",
      createdById: managerUser.id,
    });
  }
  const e2 = find(whEast.id, 2, "Dock 2");
  if (e2 && itemBySku.has("ACM-BRK-0015")) {
    reservations.push({
      slotId: e2.id,
      weekStart,
      supplierId: acme.id,
      clientId: globex.id,
      itemId: itemBySku.get("ACM-BRK-0015")!.id,
      palletCount: 12,
      reference: "Globex outbound batch",
      status: "confirmed",
      createdById: managerUser.id,
    });
  }
  const e3 = find(whEast.id, 3, "Dock 3");
  if (e3 && itemBySku.has("ACM-FRG-0501")) {
    reservations.push({
      slotId: e3.id,
      weekStart,
      supplierId: acme.id,
      clientId: initech.id,
      itemId: itemBySku.get("ACM-FRG-0501")!.id,
      palletCount: 4,
      reference: "Fragile lens shipment",
      status: "confirmed",
      createdById: managerUser.id,
    });
  }
  if (whWest) {
    const wA = find(whWest.id, 4, "Dock A");
    if (wA && itemBySku.has("NSL-PKG-1100")) {
      reservations.push({
        slotId: wA.id,
        weekStart,
        supplierId: northstar.id,
        clientId: initech.id,
        itemId: itemBySku.get("NSL-PKG-1100")!.id,
        palletCount: 6,
        reference: "Pallet wrap restock",
        status: "confirmed",
        createdById: managerUser.id,
      });
    }
    const wB = find(whWest.id, 2, "Dock B");
    if (wB && itemBySku.has("NSL-MTR-1200")) {
      reservations.push({
        slotId: wB.id,
        weekStart,
        supplierId: northstar.id,
        clientId: initech.id,
        itemId: itemBySku.get("NSL-MTR-1200")!.id,
        palletCount: 10,
        reference: "Motor shipment Q2",
        status: "confirmed",
        createdById: managerUser.id,
      });
    }
  }

  if (reservations.length > 0) {
    await db.insert(slotReservationsTable).values(reservations);
    log.info(
      { count: reservations.length, weekStart },
      "Capacity seed: created sample reservations for current week",
    );
  }
}
