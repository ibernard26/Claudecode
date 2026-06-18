import {
  pgTable,
  serial,
  integer,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const dockSlotsTable = pgTable("dock_slots", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").notNull(),
  label: text("label").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  palletCapacity: integer("pallet_capacity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const slotReservationsTable = pgTable("slot_reservations", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id").notNull(),
  weekStart: date("week_start").notNull(),
  supplierId: integer("supplier_id"),
  clientId: integer("client_id"),
  itemId: integer("item_id"),
  palletCount: integer("pallet_count").notNull(),
  reference: text("reference"),
  status: text("status").notNull().default("planned"),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => ({
  slotIdIdx: index("slot_reservations_slot_id_idx").on(t.slotId),
  weekStartIdx: index("slot_reservations_week_start_idx").on(t.weekStart),
}));

export type DockSlot = typeof dockSlotsTable.$inferSelect;
export type InsertDockSlot = typeof dockSlotsTable.$inferInsert;
export type SlotReservation = typeof slotReservationsTable.$inferSelect;
export type InsertSlotReservation = typeof slotReservationsTable.$inferInsert;
