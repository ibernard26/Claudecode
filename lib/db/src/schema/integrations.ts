import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("connected"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  lastSyncMessage: text("last_sync_message"),
  nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
});

export const syncJobsTable = pgTable("sync_jobs", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  recordsProcessed: integer("records_processed").notNull().default(0),
  message: text("message"),
});

export type Integration = typeof integrationsTable.$inferSelect;
export type SyncJob = typeof syncJobsTable.$inferSelect;
