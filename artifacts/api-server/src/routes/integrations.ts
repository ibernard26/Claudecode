import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  integrationsTable,
  syncJobsTable,
} from "@workspace/db";
import { requireUser, requireRole } from "../lib/auth";
import { logger } from "../lib/logger";
import { runSyncForIntegration } from "../lib/sync";

const router: IRouter = Router();

router.get("/integrations", requireUser(), async (_req, res) => {
  const rows = await db.select().from(integrationsTable).orderBy(integrationsTable.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      status: r.status,
      lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: r.lastSyncStatus,
      lastSyncMessage: r.lastSyncMessage,
      nextSyncAt: r.nextSyncAt?.toISOString() ?? null,
    })),
  );
});

router.get("/integrations/sync-jobs", requireUser(), async (_req, res) => {
  const rows = await db
    .select({ job: syncJobsTable, integrationName: integrationsTable.name })
    .from(syncJobsTable)
    .leftJoin(integrationsTable, eq(syncJobsTable.integrationId, integrationsTable.id))
    .orderBy(desc(syncJobsTable.startedAt))
    .limit(50);
  res.json(
    rows.map((r) => ({
      id: r.job.id,
      integrationId: r.job.integrationId,
      integrationName: r.integrationName ?? null,
      status: r.job.status,
      startedAt: r.job.startedAt.toISOString(),
      finishedAt: r.job.finishedAt?.toISOString() ?? null,
      recordsProcessed: r.job.recordsProcessed,
      message: r.job.message,
    })),
  );
});

router.post("/integrations/sync", requireUser(), requireRole("admin", "warehouse_manager"), async (req, res) => {
  const integrationId = Number(req.body?.integrationId);
  if (!Number.isFinite(integrationId)) {
    res.status(400).json({ error: "integrationId required" });
    return;
  }
  const [integration] = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.id, integrationId));
  if (!integration) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await runSyncForIntegration(integration, logger);
  const [refreshed] = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.id, integrationId));
  res.json({
    id: refreshed!.id,
    status: refreshed!.status,
    lastSyncAt: refreshed!.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: refreshed!.lastSyncStatus,
    lastSyncMessage: refreshed!.lastSyncMessage,
  });
});

export default router;
