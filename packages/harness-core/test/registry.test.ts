import { describe, expect, test } from "bun:test"
import { HarnessNotRegisteredError, harnessFor, registerHarness } from "../src/registry"
import type { HarnessClient, WorkerEndpoint } from "../src/types"

const capabilities = {
  supportsMcpRegistration: true,
  supportsSessionImport: true,
  supportsQueueDelivery: true,
} as const

function fakeClient(kind: string): HarnessClient {
  return {
    harnessKind: kind,
    capabilities,
    createSession: async () => ({ sessionId: "ses_1" }),
    prompt: async () => {},
    interrupt: async () => {},
    getMessages: async () => [],
    subscribeEvents: async function* () {},
    replyQuestion: async () => {},
    cancelQuestion: async () => {},
    healthCheck: async () => ({ ok: true, version: "2.2.0" }),
  }
}

const worker = (harnessKind?: string): WorkerEndpoint => ({
  workerId: "w1",
  url: "http://w1:4096",
  password: "pw",
  harnessKind,
})

describe("harness registry", () => {
  test("throws HarnessNotRegisteredError for unknown kinds", () => {
    expect(() => harnessFor(worker("deepagents"))).toThrow(HarnessNotRegisteredError)
  })

  test("resolves a registered harness with the right kind", () => {
    registerHarness("opencode", () => fakeClient("opencode"))
    expect(harnessFor(worker("opencode")).harnessKind).toBe("opencode")
  })

  test("defaults to opencode when harnessKind is omitted", () => {
    registerHarness("opencode", () => fakeClient("opencode"))
    expect(harnessFor(worker()).harnessKind).toBe("opencode")
  })

  test("re-registering a kind replaces the factory", () => {
    registerHarness("opencode", () => fakeClient("opencode"))
    registerHarness("opencode", () => fakeClient("opencode-v2"))
    expect(harnessFor(worker()).harnessKind).toBe("opencode-v2")
  })
})
