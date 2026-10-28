import type { HarnessClient, HarnessFactory, WorkerEndpoint } from "./types"

export class HarnessNotRegisteredError extends Error {
  constructor(public readonly harnessKind: string) {
    super(`No harness registered for kind "${harnessKind}"`)
    this.name = "HarnessNotRegisteredError"
  }
}

const factories = new Map<string, HarnessFactory>()

/** Register (or replace) the factory for a harness kind. */
export function registerHarness(kind: string, factory: HarnessFactory): void {
  if (!kind) throw new Error("harness kind must not be empty")
  factories.set(kind, factory)
}

/** Resolve the harness client for a worker (defaults to "opencode"). */
export function harnessFor(worker: WorkerEndpoint): HarnessClient {
  const kind = worker.harnessKind ?? "opencode"
  const factory = factories.get(kind)
  if (!factory) throw new HarnessNotRegisteredError(kind)
  return factory(worker)
}

/** Registered harness kinds (diagnostics/tests). */
export function registeredHarnesses(): string[] {
  return [...factories.keys()]
}
