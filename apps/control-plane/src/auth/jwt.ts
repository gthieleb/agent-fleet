import { createRemoteJWKSet, jwtVerify } from "jose"
import { UnauthorizedError } from "../api/errors"
import type { Config } from "../config"

export interface User {
  subject: string
  name?: string
  role: "admin" | "user"
}

type Jwks = ReturnType<typeof createRemoteJWKSet>

export function createJwks(cfg: Pick<Config, "jwksUrl">): Jwks {
  return createRemoteJWKSet(new URL(cfg.jwksUrl))
}

export async function verifyAccessToken(token: string, cfg: Config, jwks: Jwks): Promise<User> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: cfg.oidcIssuer,
      audience: cfg.oidcAudience,
    })
    return userFromClaims(payload as Record<string, unknown>)
  } catch {
    throw new UnauthorizedError("invalid token")
  }
}

export function userFromClaims(claims: Record<string, unknown>): User {
  const subject = typeof claims.sub === "string" ? claims.sub : ""
  if (!subject) throw new UnauthorizedError("token has no subject")
  const roles = Array.isArray(claims.roles) ? claims.roles : []
  const name = typeof claims.name === "string" ? claims.name : undefined
  return {
    subject,
    name,
    role: roles.includes("admin") ? "admin" : "user",
  }
}
