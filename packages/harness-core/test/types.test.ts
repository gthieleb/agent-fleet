import { describe, expect, test } from "bun:test"
import { HarnessEventSchema } from "../src/types"

const baseEvent = {
  workerId: "w1",
  sessionId: null,
  seq: "1",
  type: "server.connected",
  data: {},
  receivedAt: "2026-10-28T12:00:00.000Z",
}

describe("HarnessEventSchema", () => {
  test("accepts a fleet event extended with harnessKind", () => {
    const parsed = HarnessEventSchema.safeParse({ ...baseEvent, harnessKind: "opencode" })
    expect(parsed.success).toBe(true)
  })

  test("rejects an event without harnessKind", () => {
    const parsed = HarnessEventSchema.safeParse(baseEvent)
    expect(parsed.success).toBe(false)
  })

  test("keeps fleet event validation", () => {
    const parsed = HarnessEventSchema.safeParse({
      ...baseEvent,
      workerId: "",
      harnessKind: "opencode",
    })
    expect(parsed.success).toBe(false)
  })
})
