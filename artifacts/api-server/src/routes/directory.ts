import { Router, type IRouter } from "express";
import {
  db,
  clientsTable,
  suppliersTable,
  warehousesTable,
} from "@workspace/db";
import { requireUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/directory/clients", requireUser(), async (_req, res) => {
  const rows = await db.select().from(clientsTable).orderBy(clientsTable.name);
  res.json(rows.map(({ id, name, code }) => ({ id, name, code })));
});

router.get("/directory/suppliers", requireUser(), async (_req, res) => {
  const rows = await db
    .select()
    .from(suppliersTable)
    .orderBy(suppliersTable.name);
  res.json(rows.map(({ id, name, code }) => ({ id, name, code })));
});

router.get("/directory/warehouses", requireUser(), async (_req, res) => {
  const rows = await db
    .select()
    .from(warehousesTable)
    .orderBy(warehousesTable.name);
  res.json(
    rows.map(({ id, name, code, location }) => ({ id, name, code, location })),
  );
});

export default router;
