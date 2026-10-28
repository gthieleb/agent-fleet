import { relations } from "drizzle-orm"
import { questions, sessions, workers } from "./schema"

export const workersRelations = relations(workers, ({ many }) => ({
  sessions: many(sessions),
}))

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  worker: one(workers, {
    fields: [sessions.workerId],
    references: [workers.id],
  }),
  questions: many(questions),
}))

export const questionsRelations = relations(questions, ({ one }) => ({
  session: one(sessions, {
    fields: [questions.sessionId],
    references: [sessions.id],
  }),
}))
