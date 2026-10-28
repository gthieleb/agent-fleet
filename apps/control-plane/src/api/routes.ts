import { Hono } from "hono"
import { requireAuth } from "../auth/middleware"
import type { Config } from "../config"
import { ApiError } from "./errors"

export function apiRoutes(cfg: Config): Hono {
  const app = new Hono()

  app.get("/api/me", requireAuth(cfg), (c) => c.json(c.get("user")))

  app.get("/api/admin/ping", requireAuth(cfg, ["admin"]), (c) => c.json({ ok: true }))

  return app
}

export function errorHandler(error: Error, c: Parameters<Parameters<Hono["onError"]>[0]>[1]) {
  if (error instanceof ApiError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.status as never)
  }
  console.error("unhandled error", error)
  return c.json({ error: { code: "internal", message: "internal error" } }, 500)
}
