import { FleetEventSchema } from "@agent-fleet/fleet-schema"
import { z } from "zod"

/**
 * Normalized event a harness produces; extends the fleet envelope with the
 * harness kind so downstream consumers stay harness-agnostic.
 */
export const HarnessEventSchema = FleetEventSchema.extend({
  harnessKind: z.string().min(1),
})

export type HarnessEvent = z.infer<typeof HarnessEventSchema>

/**
 * Optional capabilities a harness may support. The dispatcher, question router
 * and reply service check these flags instead of branching on the harness kind.
 */
export interface HarnessCapabilities {
  supportsMcpRegistration: boolean
  supportsSessionImport: boolean
  supportsQueueDelivery: boolean
}

export interface HarnessSessionRef {
  sessionId: string
}

export interface HarnessPromptOptions {
  delivery?: "steer" | "queue"
}

export interface HarnessHealth {
  ok: boolean
  version: string | null
}

export interface HarnessQuestionAnswer {
  sessionId: string
  kind: "permission" | "form"
  refId: string
  answer: unknown
}

export interface HarnessQuestionRef {
  sessionId: string
  kind: "permission" | "form"
  refId: string
}

/**
 * Everything the control plane may do with any agent harness.
 * Implementations: harness-opencode (now), harness-deepagents (later).
 */
export interface HarnessClient {
  readonly harnessKind: string
  readonly capabilities: HarnessCapabilities
  createSession(input: { project: string; title: string }): Promise<HarnessSessionRef>
  prompt(sessionId: string, text: string, opts?: HarnessPromptOptions): Promise<void>
  interrupt(sessionId: string): Promise<void>
  getMessages(sessionId: string): Promise<unknown[]>
  subscribeEvents(): AsyncIterable<HarnessEvent>
  replyQuestion(input: HarnessQuestionAnswer): Promise<void>
  cancelQuestion(input: HarnessQuestionRef): Promise<void>
  healthCheck(): Promise<HarnessHealth>
}

export interface WorkerEndpoint {
  workerId: string
  url: string
  password: string
  harnessKind?: string
}

export type HarnessFactory = (worker: WorkerEndpoint) => HarnessClient
