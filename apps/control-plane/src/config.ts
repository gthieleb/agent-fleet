export interface Config {
  port: number
  databaseUrl: string
  kafkaBrokers: string
  oidcIssuer: string
  oidcAudience: string
  jwksUrl: string
  /** Static bearer for local dev/E2E; only honoured when nodeEnv === "test". */
  devToken: string | null
  nodeEnv: string
  k8sNamespace: string
  sandboxMcpNamespace: string
  sandboxWarmpool: string
  sandboxTemplate: string
}

export function loadConfig(env: Record<string, string | undefined> = Bun.env): Config {
  const requireEnv = (key: string): string => {
    const value = env[key]
    if (!value) throw new Error(`missing required env var ${key}`)
    return value
  }

  const oidcIssuer = requireEnv("OIDC_ISSUER")
  const jwksUrl = env.OIDC_JWKS_URL ?? `${oidcIssuer.replace(/\/$/, "")}/.well-known/jwks.json`

  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: requireEnv("DATABASE_URL"),
    kafkaBrokers: requireEnv("KAFKA_BROKERS"),
    oidcIssuer,
    oidcAudience: requireEnv("OIDC_AUDIENCE"),
    jwksUrl,
    devToken: env.DEV_TOKEN ?? null,
    nodeEnv: env.NODE_ENV ?? "production",
    k8sNamespace: env.K8S_NAMESPACE ?? "agent-fleet",
    sandboxMcpNamespace: env.SANDBOX_MCP_NAMESPACE ?? env.K8S_NAMESPACE ?? "agent-fleet",
    sandboxWarmpool: env.SANDBOX_WARMPOOL ?? "opencode-workspace-pool",
    sandboxTemplate: env.SANDBOX_TEMPLATE ?? "opencode-workspace-template",
  }
}
