import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const itemNotesTable = pgTable("item_notes", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("shared"),
  category: text("category").notNull().default("general"),
  authorId: integer("author_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ItemNote = typeof itemNotesTable.$inferSelect;
export type InsertItemNote = typeof itemNotesTable.$inferInsert;
