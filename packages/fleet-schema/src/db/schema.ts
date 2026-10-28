import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

export const workers = pgTable("workers", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  passwordSecretRef: text("password_secret_ref"),
  status: text("status").notNull().default("down"), // healthy | degraded | down | rejected
  version: text("version"),
  labels: jsonb("labels").$type<Record<string, string>>().notNull().default({}),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
})

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").references(() => workers.id, { onDelete: "set null" }),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  project: text("project").notNull(),
  state: text("state").notNull().default("active"), // active | idle | lost | imported
  importedFrom: text("imported_from"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    workerId: text("worker_id").notNull(),
    kind: text("kind").notNull(), // permission | form
    refId: text("ref_id").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending | answered | cancelled
    reply: jsonb("reply"),
    ownerId: text("owner_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("questions_session_ref_uq").on(table.sessionId, table.refId)],
)

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceUrl: text("source_url").notNull(),
  status: text("status").notNull().default("pending"),
  stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
})

export const users = pgTable("users", {
  subject: text("subject").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"), // admin | user
})

export type WorkerRecord = typeof workers.$inferSelect
export type SessionRecord = typeof sessions.$inferSelect
export type QuestionRecord = typeof questions.$inferSelect
export type ImportJobRecord = typeof importJobs.$inferSelect
export type UserRecord = typeof users.$inferSelect
