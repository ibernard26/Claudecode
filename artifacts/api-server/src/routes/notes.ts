import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  itemNotesTable,
  usersTable,
} from "@workspace/db";
import { requireUser } from "../lib/auth";
import {
  canPostNoteWithVisibility,
  canSeeItem,
  noteVisibilityScopeForUser,
} from "../lib/visibility";
import { writeAudit } from "../lib/audit";
import { serializeNote } from "./inventory";

const router: IRouter = Router();

router.get("/items/:id/notes", requireUser(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const user = req.currentUser!;
  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canSeeItem(user, item)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const noteScope = noteVisibilityScopeForUser(user);
  const rows = await db
    .select({
      note: itemNotesTable,
      authorName: usersTable.displayName,
      authorRole: usersTable.role,
    })
    .from(itemNotesTable)
    .leftJoin(usersTable, eq(usersTable.id, itemNotesTable.authorId))
    .where(and(eq(itemNotesTable.itemId, id), noteScope))
    .orderBy(desc(itemNotesTable.createdAt));
  res.json(
    rows.map((r) => serializeNote(r.note, r.authorName, r.authorRole)),
  );
});

router.post("/items/:id/notes", requireUser(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const user = req.currentUser!;
  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canSeeItem(user, item)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = (req.body?.body as string | undefined)?.trim();
  const visibility = (req.body?.visibility as string | undefined) ?? "shared";
  const category = (req.body?.category as string | undefined) ?? "general";
  if (!body) {
    res.status(400).json({ error: "body required" });
    return;
  }
  if (!canPostNoteWithVisibility(user, visibility)) {
    res.status(403).json({ error: "Cannot post with this visibility" });
    return;
  }

  const [created] = await db
    .insert(itemNotesTable)
    .values({
      itemId: id,
      body,
      visibility,
      category,
      authorId: user.id,
    })
    .returning();

  await writeAudit({
    recordType: "item_note",
    recordId: created.id,
    itemId: id,
    action: "created",
    category: "notes",
    actor: user,
    newValue: { visibility, category, body: body.slice(0, 200) },
  });

  res.status(201).json(serializeNote(created, user.displayName, user.role));
});

router.get("/items/:id/history", requireUser(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const user = req.currentUser!;
  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canSeeItem(user, item)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { auditLogsTable } = await import("@workspace/db");
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.itemId, id))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(200);
  res.json(
    rows.map((r) => ({
      id: r.id,
      recordType: r.recordType,
      recordId: r.recordId,
      itemId: r.itemId,
      action: r.action,
      field: r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      category: r.category,
      actorName: r.actorName,
      actorRole: r.actorRole,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

export default router;
