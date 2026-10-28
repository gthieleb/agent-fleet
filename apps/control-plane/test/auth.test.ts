import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import { createApp } from "../src/app"
import type { Config } from "../src/config"

let privateKey: CryptoKey
let jwksServer: ReturnType<typeof Bun.serve>
let jwksUrl: string

beforeAll(async () => {
  const pair = await generateKeyPair("RS256")
  privateKey = pair.privateKey
  const jwk = await exportJWK(pair.publicKey)
  jwk.kid = "test-key"
  jwk.alg = "RS256"
  jwksServer = Bun.serve({
    port: 0,
    fetch: () => Response.json({ keys: [jwk] }),
  })
  jwksUrl = `http://127.0.0.1:${jwksServer.port}/jwks.json`
})

afterAll(() => {
  jwksServer.stop(true)
})

function config(): Config {
  return {
    port: 0,
    databaseUrl: "postgres://unused",
    kafkaBrokers: "unused:9092",
    oidcIssuer: "https://issuer.test/application/o/agent-fleet/",
    oidcAudience: "agent-fleet",
    jwksUrl,
    devToken: "dev-secret",
    nodeEnv: "test",
    k8sNamespace: "agent-fleet",
    sandboxMcpNamespace: "agent-fleet",
    sandboxWarmpool: "opencode-workspace-pool",
    sandboxTemplate: "opencode-workspace-template",
  }
}

async function signToken(claims: Record<string, unknown>): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(config().oidcIssuer)
    .setAudience("agent-fleet")
    .setSubject("user-123")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey)
}

describe("auth", () => {
  test("healthz is public", async () => {
    const res = await createApp(config()).request("/healthz")
    expect(res.status).toBe(200)
  })

  test("valid token returns the subject on /api/me", async () => {
    const token = await signToken({ roles: ["user"] })
    const res = await createApp(config()).request("/api/me", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { subject: string; role: string }
    expect(body.subject).toBe("user-123")
    expect(body.role).toBe("user")
  })

  test("missing token returns 401 with error envelope", async () => {
    const res = await createApp(config()).request("/api/me")
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("unauthorized")
  })

  test("garbage token returns 401", async () => {
    const res = await createApp(config()).request("/api/me", {
      headers: { authorization: "Bearer not-a-jwt" },
    })
    expect(res.status).toBe(401)
  })

  test("dev token yields an admin user", async () => {
    const res = await createApp(config()).request("/api/me", {
      headers: { authorization: "Bearer dev-secret" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { subject: string; role: string }
    expect(body.subject).toBe("dev")
    expect(body.role).toBe("admin")
  })

  test("user role is rejected on admin routes", async () => {
    const token = await signToken({ roles: ["user"] })
    const res = await createApp(config()).request("/api/admin/ping", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("forbidden")
  })

  test("admin role passes admin routes", async () => {
    const token = await signToken({ roles: ["admin"] })
    const res = await createApp(config()).request("/api/admin/ping", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })
})
