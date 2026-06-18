import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  type User,
} from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

export type Role =
  | "admin"
  | "warehouse_manager"
  | "supplier"
  | "client"
  | "auditor";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function loadCurrentUser(req: Request): Promise<User | null> {
  const userId = req.session?.userId;
  if (typeof userId !== "number") return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

export function attachCurrentUser() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const user = await loadCurrentUser(req);
    if (user) req.currentUser = user;
    next();
  };
}

export function requireUser() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.currentUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.currentUser;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(user.role as Role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function isWritableRole(role: string): boolean {
  return role === "admin" || role === "warehouse_manager";
}

export function isAuditor(role: string): boolean {
  return role === "auditor";
}
