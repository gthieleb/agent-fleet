import { createApp } from "./app"
import { loadConfig } from "./config"

const cfg = loadConfig()
const app = createApp(cfg)

Bun.serve({
  port: cfg.port,
  fetch: app.fetch,
})

console.log(`control-plane listening on :${cfg.port}`)
