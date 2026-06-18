import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
} from "drizzle-orm/pg-core";

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  partNumber: text("part_number"),
  serialNumber: text("serial_number"),
  stockNumber: text("stock_number"),
  poNumber: text("po_number"),
  workOrderNumber: text("work_order_number"),
  supplierRef: text("supplier_ref"),
  carrierRef: text("carrier_ref"),
  shipmentRef: text("shipment_ref"),
  asnNumber: text("asn_number"),
  description: text("description").notNull(),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  quantityRequested: integer("quantity_requested").notNull().default(0),
  reorderPoint: integer("reorder_point").notNull().default(0),
  warehouseLocation: text("warehouse_location"),
  warehouseId: integer("warehouse_id").notNull(),
  supplierId: integer("supplier_id"),
  clientId: integer("client_id"),
  status: text("status").notNull().default("Available"),
  priority: text("priority"),
  quarter: text("quarter").notNull(),
  year: integer("year").notNull(),
  nextReviewDate: date("next_review_date"),
  lastUpdated: timestamp("last_updated", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type InsertInventoryItem = typeof inventoryItemsTable.$inferInsert;
