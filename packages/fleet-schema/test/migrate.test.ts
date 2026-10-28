import { describe, expect, test } from "bun:test"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { questions, sessions, workers } from "../src/db/schema"

const migrationsFolder = path.join(import.meta.dir, "..", "drizzle")

async function setup() {
  const client = new PGlite()
  const db = drizzle(client)
  await migrate(db, { migrationsFolder })
  return { client, db }
}

describe("migrations", () => {
  test("create all fleet tables", async () => {
    const { client } = await setup()

    const res = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    )
    const names = res.rows.map((r) => r.table_name)

    expect(names).toContain("workers")
    expect(names).toContain("sessions")
    expect(names).toContain("questions")
    expect(names).toContain("import_jobs")
    expect(names).toContain("users")
  })

  test("unique(sessionId, refId) rejects duplicate questions", async () => {
    const { db } = await setup()

    await db.insert(workers).values({ id: "w1", url: "http://w1:4096" })
    await db.insert(sessions).values({
      id: "ses_1",
      workerId: "w1",
      ownerId: "u1",
      title: "Demo",
      project: "demo",
    })

    const question = {
      sessionId: "ses_1",
      workerId: "w1",
      kind: "permission",
      refId: "req_1",
      payload: { tool: "bash" },
      ownerId: "u1",
    }

    await db.insert(questions).values(question)

    let thrown: unknown
    try {
      await db.insert(questions).values(question)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeDefined()
    expect(String((thrown as Error).message)).toContain("Failed query")
  })
})
