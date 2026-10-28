import { z } from "zod"

/**
 * Normalized event envelope that every harness produces and the event bridge
 * publishes to `agent-fleet.events` (Kafka key = sessionId, fallback workerId).
 */
export const FleetEventSchema = z.object({
  workerId: z.string().min(1),
  sessionId: z.string().min(1).nullable(),
  seq: z.string().min(1),
  type: z.string().min(1),
  data: z.unknown(),
  receivedAt: z.string().datetime(),
})

export type FleetEvent = z.infer<typeof FleetEventSchema>
