import session, { type SessionOptions } from "express-session";
import type { RequestHandler } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const sessionSecret = process.env["SESSION_SECRET"] ?? "dev-only-warehouse-hub";

const options: SessionOptions = {
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 1000 * 60 * 60 * 8,
  },
  name: "wh.sid",
};

export const sessionMiddleware: RequestHandler = session(options);
