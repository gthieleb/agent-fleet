import { Hono } from "hono"
import { apiRoutes, errorHandler } from "./api/routes"
import type { Config } from "./config"

export function createApp(cfg: Config): Hono {
  const app = new Hono()
  app.onError(errorHandler)

  app.get("/healthz", (c) => c.json({ ok: true }))

  app.route("/", apiRoutes(cfg))

  return app
}
