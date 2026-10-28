import type { HarnessCapabilities } from "./types"

/** A harness that supports none of the optional features. */
export const NO_CAPABILITIES: HarnessCapabilities = {
  supportsMcpRegistration: false,
  supportsSessionImport: false,
  supportsQueueDelivery: false,
}

/** Build a capability set from partial overrides (all default to false). */
export function capabilities(overrides: Partial<HarnessCapabilities> = {}): HarnessCapabilities {
  return { ...NO_CAPABILITIES, ...overrides }
}
