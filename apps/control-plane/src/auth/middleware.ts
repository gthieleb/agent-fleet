import type { MiddlewareHandler } from "hono"
import { ForbiddenError, UnauthorizedError } from "../api/errors"
import type { Config } from "../config"
import { createJwks, type User, verifyAccessToken } from "./jwt"

declare module "hono" {
  interface ContextVariableMap {
    user: User
  }
}

export function requireAuth(cfg: Config, roles?: User["role"][]): MiddlewareHandler {
  const jwks = createJwks(cfg)

  return async (c, next) => {
    const header = c.req.header("authorization") ?? ""
    const [scheme, token] = header.split(" ")
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedError()
    }

    let user: User
    if (cfg.nodeEnv === "test" && cfg.devToken && token === cfg.devToken) {
      user = { subject: "dev", role: "admin" }
    } else {
      user = await verifyAccessToken(token, cfg, jwks)
    }

    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenError()
    }

    c.set("user", user)
    await next()
  }
}
