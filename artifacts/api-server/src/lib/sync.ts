import { eq } from "drizzle-orm";
import {
  db,
  integrationsTable,
  syncJobsTable,
  type Integration,
} from "@workspace/db";
import { recomputeAllFlags } from "./exceptions";
import type { Logger } from "pino";

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // hourly

export async function runSyncForIntegration(
  integration: Integration,
  log: Logger,
): Promise<void> {
  const start = new Date();
  const [job] = await db
    .insert(syncJobsTable)
    .values({
      integrationId: integration.id,
      status: "running",
      startedAt: start,
    })
    .returning();

  await db
    .update(integrationsTable)
    .set({ status: "syncing" })
    .where(eq(integrationsTable.id, integration.id));

  try {
    // Mock work: re-run exception engine and pretend to push/pull records.
    const { scanned } = await recomputeAllFlags();
    const finished = new Date();
    const message = `Mock ${integration.kind.toUpperCase()} sync OK — ${scanned} records reconciled.`;
    await db
      .update(syncJobsTable)
      .set({
        status: "success",
        finishedAt: finished,
        recordsProcessed: scanned,
        message,
      })
      .where(eq(syncJobsTable.id, job.id));
    await db
      .update(integrationsTable)
      .set({
        status: "connected",
        lastSyncAt: finished,
        lastSyncStatus: "success",
        lastSyncMessage: message,
        nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS),
      })
      .where(eq(integrationsTable.id, integration.id));
    log.info(
      { integration: integration.name, scanned },
      "sync: completed",
    );
  } catch (err) {
    const finished = new Date();
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(syncJobsTable)
      .set({ status: "error", finishedAt: finished, message })
      .where(eq(syncJobsTable.id, job.id));
    await db
      .update(integrationsTable)
      .set({
        status: "error",
        lastSyncAt: finished,
        lastSyncStatus: "error",
        lastSyncMessage: message,
        nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS),
      })
      .where(eq(integrationsTable.id, integration.id));
    log.error({ err, integration: integration.name }, "sync: failed");
  }
}

export async function runAllSyncs(log: Logger): Promise<void> {
  const integrations = await db.select().from(integrationsTable);
  for (const integ of integrations) {
    await runSyncForIntegration(integ, log);
  }
}

export function startHourlySyncTimer(log: Logger): NodeJS.Timeout {
  const timer = setInterval(() => {
    runAllSyncs(log).catch((err) =>
      log.error({ err }, "Hourly sync timer failed"),
    );
  }, SYNC_INTERVAL_MS);
  // Don't keep the event loop alive solely for the timer.
  if (typeof timer.unref === "function") timer.unref();
  log.info(
    { intervalMs: SYNC_INTERVAL_MS },
    "sync: hourly timer started",
  );
  return timer;
}
