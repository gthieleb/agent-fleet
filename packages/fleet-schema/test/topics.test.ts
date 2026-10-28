import { describe, expect, test } from "bun:test"
import { FleetEventSchema } from "../src/events"
import { TOPICS } from "../src/topics"

describe("topics", () => {
  test("exposes the exact fleet topic names", () => {
    expect(TOPICS).toEqual({
      events: "agent-fleet.events",
      questions: "agent-fleet.questions",
      answers: "agent-fleet.answers",
      state: "agent-fleet.state",
    })
  })
})

describe("FleetEventSchema", () => {
  test("accepts a complete event", () => {
    const parsed = FleetEventSchema.safeParse({
      workerId: "w1",
      sessionId: "ses_abc",
      seq: "42",
      type: "permission.updated",
      data: { status: "pending" },
      receivedAt: "2026-10-28T12:00:00.000Z",
    })
    expect(parsed.success).toBe(true)
  })

  test("accepts a null sessionId (worker-scoped events)", () => {
    const parsed = FleetEventSchema.safeParse({
      workerId: "w1",
      sessionId: null,
      seq: "1",
      type: "server.connected",
      data: {},
      receivedAt: "2026-10-28T12:00:00.000Z",
    })
    expect(parsed.success).toBe(true)
  })

  test("rejects an event without workerId", () => {
    const parsed = FleetEventSchema.safeParse({
      sessionId: "ses_abc",
      seq: "1",
      type: "x",
      data: {},
      receivedAt: "2026-10-28T12:00:00.000Z",
    })
    expect(parsed.success).toBe(false)
  })
})
