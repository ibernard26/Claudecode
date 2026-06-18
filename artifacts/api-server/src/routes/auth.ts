import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { verifyPassword, requireUser } from "../lib/auth";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

router.post("/auth/login", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.ip ?? "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT_MAX) {
      res.status(429).json({ error: "Too many login attempts. Please try again later." });
      return;
    }
    entry.count += 1;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password required" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  req.session.userId = user.id;
  await writeAudit({
    recordType: "session",
    recordId: user.id,
    action: "login",
    actor: user,
    category: "auth",
  });
  res.json({
    user: serializeUser(user),
  });
});

router.post("/auth/logout", requireUser(), async (req, res) => {
  const user = req.currentUser!;
  await writeAudit({
    recordType: "session",
    recordId: user.id,
    action: "logout",
    actor: user,
    category: "auth",
  });
  req.session.destroy(() => {
    res.clearCookie("wh.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", async (req, res) => {
  if (!req.currentUser) {
    res.json({ user: null });
    return;
  }
  res.json({ user: serializeUser(req.currentUser) });
});

// DEV-ONLY: instant session bootstrap for screenshot previews
router.get("/auth/demo", async (req, res) => {
  const demoSecret = process.env["DEMO_SECRET"];
  if (!demoSecret) {
    // Disabled when no secret configured
    res.status(404).end();
    return;
  }
  const provided = typeof req.query["secret"] === "string" ? req.query["secret"] : "";
  if (provided !== demoSecret) {
    res.status(403).end();
    return;
  }
  const as = typeof req.query["as"] === "string" ? req.query["as"] : "admin";
  const goto = typeof req.query["goto"] === "string" ? req.query["goto"] : "/";
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, as));
  if (user) req.session.userId = user.id;
  // Redirect to the SPA root so the Vite app picks up the auth cookie
  const base = process.env["BASE_PATH"] ?? "";
  const target = `${base}${goto.startsWith("/") ? goto : `/${goto}`}`;
  res.redirect(302, target);
});

router.get("/auth/demo-users", async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(
    users.map((u) => ({
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      password: "demo",
      passwordHint: "demo",
      scopeLabel: u.role === 'admin' || u.role === 'auditor' ? 'Global Access' :
                  u.role === 'warehouse_manager' ? 'Warehouse Manager' :
                  u.role === 'supplier' ? 'Supplier Access' :
                  u.role === 'client' ? 'Client Access' : '',
    })),
  );
});

export function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    clientId: user.clientId,
    supplierId: user.supplierId,
    warehouseId: user.warehouseId,
  };
}

export default router;
