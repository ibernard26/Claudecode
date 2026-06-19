import {
  pgTable,
  serial,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const shipmentItemsTable = pgTable(
  "shipment_items",
  {
    id: serial("id").primaryKey(),
    reservationId: integer("reservation_id").notNull(),
    itemId: integer("item_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reservationIdx: index("shipment_items_reservation_id_idx").on(t.reservationId),
    itemIdx: index("shipment_items_item_id_idx").on(t.itemId),
    uniq: uniqueIndex("shipment_items_reservation_item_uniq").on(t.reservationId, t.itemId),
  }),
);

export type ShipmentItem = typeof shipmentItemsTable.$inferSelect;
export type InsertShipmentItem = typeof shipmentItemsTable.$inferInsert;
