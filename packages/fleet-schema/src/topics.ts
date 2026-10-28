export const TOPICS = {
  events: "agent-fleet.events",
  questions: "agent-fleet.questions",
  answers: "agent-fleet.answers",
  state: "agent-fleet.state",
} as const

export type TopicKey = keyof typeof TOPICS
