import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const complianceFlagsTable = pgTable(
  "compliance_flags",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull(),
    category: text("category").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
    severity: text("severity").notNull().default("medium"),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    uniqOpen: uniqueIndex("compliance_flags_item_code_uniq").on(
      t.itemId,
      t.code,
    ),
  }),
);

export type ComplianceFlag = typeof complianceFlagsTable.$inferSelect;
export type InsertComplianceFlag = typeof complianceFlagsTable.$inferInsert;
