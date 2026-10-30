# Agent-Fleet Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-Session-Plattform, in der verteilte OpenCode-2.x-Worker von einem Control-Plane-Backend über Kafka überwacht werden, alle Rückfragen an ein Frontend-Inbox geroutet und Sessions bis zur Antwort suspendiert werden.

**Architecture:** Approach A — N OpenCode-Worker (`opencode serve`, StatefulSet+PVC) + zentrales Control-Plane-Backend (Bun/Hono, `@opencode/client`) als Dispatcher/Event-Bridge/Question-Router/Reply-Service + Single-Instance-Kafka (KRaft) + Postgres via CNPG. Frontend React/Vite. Bestehender `sandbox-mcp-operator` wird per `SandboxMCP`-CR je Worker provisioniert und via experimental-MCP-API registriert.

**Tech Stack:** Bun ≥1.3, Hono 4, `@opencode/client@2.2.x` (nur innerhalb `harness-opencode`), kafkajs 2, drizzle-orm + pglite (Tests), zod 3, jose 5, `@kubernetes/client-node`, **SvelteKit 2 + Svelte 5 (SPA, adapter-static)**, Biome, Helm 3 + OCI (ghcr.io), Terraform ≥1.5 (`tehcyx/kind`, `hashicorp/kubernetes` ≥2.38, `hashicorp/helm`, `gavinbunney/kubectl ~>1.7`), kind + podman, ingress-nginx, **CNPG** (Postgres), **Strimzi** (Kafka, KRaft single-node), Authentik (OIDC).

**Spec:** `/home/gun/.opencode/plan/2026-10-27-agent-fleet-platform-design.md` (Sections 3, 5–10 sind verbindlich; der Plan argumentiert von dort)

**Execution Skill:** superpowers:executing-plans (Native — empfohlen: 19+1 Tasks mit festgelegten Interfaces, sequenzielle Abhängigkeiten) — Alternativ superpowers:subagent-driven-development.

**Verpflichtendes TDD-Design (für JEDEN Task):** Jeder einzelne Schritt folgt strikt superpowers:test-driven-development. Eisenregel: **kein Produktionscode ohne zuerst fehlschlagenden Test**; jeder Test wurde rot gesehen, bevor der minimale Code ihn grün macht; REFACTOR nur bei grüner Suite. Keine Ausnahme (auch nicht „zu trivial"), ohne explizite User-Freigabe. Bei Verstoß: Code löschen, mit Test-first neu starten.

## Global Constraints

- **TDD ist für jede Zeile Produktionscode Pflicht** (superpowers:test-driven-development): Test zuerst schreiben → rot sehen → minimaler Code → grün → Suite grün → refactor. Jeder Task erhält explizit RED/GREEN-Steps; ein Test, der sofort grün ist, prüft falsches Verhalten (fixen, nicht übergehen). Mocks nur wo unvermeidbar (external I/O: Kafka-Broker, K8s-API, OpenCode-HTTP, JWKS-IdP); Assertions auf echtes Verhalten, nie auf Mock-Verhalten (writing-good-tests.md).

- **Zweistufige E2E (User-Entscheidung 2026-10-30, präzisiert):** Drei getrennte Stränge mit je passendem Werkzeug:
  **(a) Task 17b — Frontend-UI-Sichtabnahme + Erfahrungssammlung über das `playwright`-MCP-Tool** (interaktiver Browser, DEV_TOKEN-auth, Sicht-/Screenshot-Prüfungen). Voraussetzung: `playwright`-MCP vom User aktiviert (Config `enabled: false`; MCP-First — niemals eigene Skripte, solange das Tool verfügbar ist). **Nicht CI-fähig.**
  **(b) Task 17c — Frontend-E2E für die Pipeline via `@playwright/test`** (headless, deterministisch, `npx playwright test`, GitHub-Actions; Artifact-Report via `actions/upload-artifact` + `daun/playwright-report-summary`). Das ist die Runner-Library, NICHT das MCP-Tool — für CI das passende Werkzeug.
  **(c) Task 19 — API-E2E-Smoke (Bun-Script)** (deterministischer Backend-Flow Session→Question→Reply→Import, kind/podman, GH Actions ohne Browser).
  Screenshots/Evidenz nie ins Produktions-Repo (AGENTS.md Screenshot-Policy); `*.png` git-ignored bzw. `docs/evidence/` für lokale Ablage.
- OpenCode-Server-Image: **`ghcr.io/anomalyco/opencode:2.2.0`** — V2, gepinnt; **nie `latest`** (zeigt auf V1 1.19.4). Health-Check assertet Server-Version `2.x`.
- Client/Server synchron: `@opencode/client` in Version **2.2.x** pinnen (bun.lock).
- Repo: **`gthieleb/agent-fleet`** (Monorepo: `apps/`, `packages/`, `charts/`, `infra/`, `e2e/`, `.github/workflows/`).
- Jeder Service bekommt **Docker-Image** (`ghcr.io/gthieleb/agent-fleet-{worker,backend,frontend}`) **und OCI-Helm-Chart** (`oci://ghcr.io/gthieleb/charts/agent-fleet-*`), gebaut von GitHub Actions.
- pre-commit ab Task 1 aktiv: `gitleaks`, `pre-commit-hooks` (check-yaml, check-json, end-of-file-fixer, trailing-whitespace, detect-private-key, check-added-large-files), **biome** (TS), **yamllint**, **tflint** (system, `infra/`). `pre-commit install` + `pre-commit run -a` grün vor jedem Commit.
- Kafka: **Strimzi-Operator** (≥0.48, KRaft, single-node, RF=1); Topics als `KafkaTopic`-CRDs. Topic-Namen exakt: `agent-fleet.events` (Key=`sessionId`), `agent-fleet.questions`, `agent-fleet.answers`, `agent-fleet.state` (compacted, `cleanupPolicy=compact`).
- Postgres via **CNPG**; DB-Schema via drizzle-Migrationen; Unit-Tests gegen **pglite**, nie gegen produktive DB.
- Frontend: **SvelteKit 2 (SPA via adapter-static), Svelte 5, TypeScript** — kein React.
- **Harness-Entkopplung (verbindlich):** Backend spricht Sessions/Events/Fragen **nur über `HarnessClient`** (`packages/harness-core`). `harness-opencode` ist die erste Implementierung; LangChain-DeepAgents später als eigenes Provider-Package (`harness-deepagents`). OpenCode-spezifische Fähigkeiten (MCP-Registrierung, Session-Import) sind **optionale Capabilities** (`supportsMcpRegistration`, `supportsSessionImport`) — Dispatcher/Router/Reply fragen Flags ab, kein `instanceof`/keine direkten `@opencode/client`-Importe außerhalb von `harness-opencode`.
- Auth: **Authentik-OIDC** — Backend validiert JWT via JWKS (jose, `verifyAccessToken`); Rollen-Claim `roles: ["admin"|"user"]`; für Tests: `DEV_TOKEN`-Bypass (nur wenn `NODE_ENV=test` gesetzt).
- Worker-Auth: Basic (`opencode:<OPENCODE_PASSWORD>`); Passwörter nur als K8s-Secrets; NetworkPolicy: nur Backend ↔ Worker.
- Fragen-Lifecycle: **kein Timeout**; Status `pending → answered | cancelled`; Owner + Admins dürfen antworten; Cancel immer möglich.
- Import: **admin-only** (Quelle = admin-betriebene OpenCode-Instanz, URL+Password); Sessions laufen danach mit Platform-Gateway-Credentials.
- **Frontend: SvelteKit 2 + Svelte 5** (SPA, adapter-static) — kein React. **Kafka via Strimzi-Operator** (nicht Bitnami). **Harness-Abstraktion:** alle Session-/Event-/Question-Operationen laufen über `HarnessClient` (Task 4b); OpenCode-Implementierung austauschbar/erweiterbar gegen LangChain-DeepAgents als weiteres Provider-Package, ohne Backend-Kerne Änderung.
- E2E: Terraform + kind + **podman** (`KIND_EXPERIMENTAL_PROVIDER=podman`), ingress-nginx mit extraPortMappings `8080→80`, `8443→443`; `kindest/node` gepinnt.
- LLM-Egress: Worker-Provider = OpenAI-kompatibler Endpoint des bestehenden **llmgateway-setup** (LiteLLM/Bifrost); per-User virtual keys. In E2E durch einen Mock-Provider ersetzt (kein echter LLM-Call in CI).
- Keine Secrets in Dateien; `{env:…}`-Substitution bzw. Secret-Refs.

## Review Focus

1. **Bridge-Reconnect erzeugt keine Duplikate/Lücken** (SSE ist live-only): dedup per `seq`, Resync nach `server.connected` — Test in Task 8 (Duplikat-Events werden verworfen, Lücke triggert Resync).
2. **Antwort auf bereits beantwortete/abgebrochene Frage** → kein 500, sondern `conflict` — Test in Task 10 (zweite Antwort auf gleiche questionId → `{status:"conflict"}`).
3. **Worker stirbt mit offener Frage** → Frage wird `cancelled`, Session `lost`, Inbox bleibt konsistent — Test in Task 9 (Worker-Status `down` löst Sweep aus).
4. **V1-Image-/Version-Mismatch** (Client 2.x ↔ Server 1.x) → Registry verwirft Worker — Test in Task 6 (`/api/info` ohne `2.x`-Version → Status `rejected`).
5. **Kafka nicht erreichbar** → Bridge puffert in-process und retryt (kein Event-Verlust bei kurzem Outage), Start schlägt nicht fehl — Test in Task 8 (Producer-Mock wirft einmal → Event wird nachgeholt).

---

## Communication Checkpoints

| Kanal | Zweck | Ziel |
|---|---|---|
| **GitHub `gthieleb/agent-fleet`** (Commits/Pushes) | Primärer Kanal: jeder Wave-Abschluss = Commit + Push; Plan/Spec leben im Repo unter `docs/superpowers/` | repo muss nach jedem Notify gepusht sein (keine toten Links) |
| GitHub Issues | Task-Tracking bei Blockern; 1 Issue = 1 Blocker mit Wave-Referenz | nach Fix → Close im selben Wave |
| (optional erweiterbar: Slack/Signal — vom Partner anzugeben) | asynchrone Reviews | — |

**Checkpoint-Schedule:** Nach **jedem Task** (bzw. Wave): Commit + Push, dann Statusupdate im 📡-Format:
`📡 **Wave [N] Complete — [Titel]** / **Done:** … / **Verified:** [Test-Befehl + Ergebnis] / **Next:** … / **Blockers:** … | None`
**Delegation:** Externe Kommunikation nur über Subagenten mit passendem Skill, nie direkt aus dem Implementierer-Kontext.

## Pipeline & Hook Check (Befund)

- **Neues Repo** → es existieren weder CI noch pre-commit. **Gap wird von diesem Plan geschlossen**, nicht extern getrackt: Task 1 (pre-commit: gitleaks, biome, yamllint, tflint) + Task 3 (GitHub Actions: ci.yml, docker-publish.yml, helm-publish.yml) + Task 19 (e2e.yml).
- **Deploy-Side-Effects:** Ab Task 3 löst **Push auf `main` die Publish-Workflows aus** → Docker-Images + OCI-Charts landen in `ghcr.io/gthieleb/*` (intendiert, kein Deploy). **Rollback:** ghcr-Package-Version löschen. Merge = Publish, niemals überraschend.
- E2E-Pipeline läuft isoliert in kind+podman — kein Produktionskontakt.

## Git-Worktree-Regel

Sequenzielle Ausführung im frischen Repo (single working tree) — keine Parallel-Coding-Tasks im selben Tree. **Executor-Safety:** vor jedem Task-Dispatch `git status --short` prüfen; dirty Tree = STOP und melden, niemals stash-and-hope.

---

### Task 0: Repo-Anlage + Architektur-Diagramm (draw.io) + Verifikations-Loop + README/About + Drawio-Skill-Update

**Files:**
- Create: GitHub-Repo **`gthieleb/agent-fleet`** (default `--public`; mit `--description` + `--add-topic opencode,mcp,kubernetes,agent-sandbox,kafka,helm,terraform`)
- Create: `docs/architecture/agent-fleet-architecture.drawio` (Original-Export) **und** `docs/architecture/agent-fleet-architecture.png`
- Create: `README.md` (About-Section mit eingebetteter Grafik, Referenzen, Architektur-Entscheidungen)
- Create: `docs/superpowers/specs/2026-10-27-agent-fleet-platform-design.md` (Kopie aus Plan-Dir), `docs/superpowers/plans/2026-10-27-agent-fleet-plan.md` (Kopie)
- Modify: Drawio-Skill (in `~/.agents/skills/` bzw. Geburtsort `~/.config/opencode/skills/` — vom Executor lokalisieren): neuer Abschnitt „Diagram-Verification-Loop"

**Interfaces:**
- Produces: gepushtes Repo mit Diagramm + Docs — Basis für alle Folge-Tasks; PNG-Pfad `docs/architecture/agent-fleet-architecture.png` wird im README referenziert.
- Consumes: Drawio-Skill + drawio-next MCP (`start_session`, `create_new_diagram`, `edit_diagram`, `export_diagram`, `screenshot_diagram`, `get_shape_library`), Playwright-MCP, `vision`-Subagent.

**Diagramm-Spez (verbindlich):**
- **Farb-Legende (Pflicht-Box im Diagramm):** **Monorepo-Services** (Code liegt in `agent-fleet`) = **Blaufamilie** (z. B. `#4A90D9`-Töne): Control-Plane (inkl. Module Auth, Worker-Registry, Dispatcher, Event-Bridge, Question-Router, Reply-Service, MCP-Registrar, Import), Frontend, Worker-Image/Chart, E2E-Suite. **Externe/Upstream-Services** = **Roter/Orange-Familie** (z. B. `#D9776B`-Töne): OpenCode 2.2.0 (upstream Base-Image), sandbox-mcp-operator, agent-sandbox-controller + CRDs (kubernetes-sigs), Bitnami-Kafka, CNPG-Postgres, Authentik, llmgateway-setup (LiteLLM/Bifrost), ingress-nginx. **Plattform/Laufzeit** = Grau: kind + podman, Kubernetes. Kafka-Topics als Zylinder mit Topic-Namen (`agent-fleet.events/questions/answers/state`).
- **Pflicht-Komponenten & Flüsse (aus Spec §5/§6):** User → Frontend ⇄ Backend (REST/WS); Backend ⇄ Postgres (Registry/Inbox, Label **CNPG**); Backend → Kafka (produce/consume, Label **Strimzi/KRaft**); Backend ⇄ N×Worker (SSE `event.subscribe`, Session-API, Permission-/Form-Reply); Worker → llmgateway-setup → LLM-Provider (per-User virtual keys); Backend → SandboxMCP-CRs (get-or-create) → sandbox-mcp-operator → Agent-Sandboxes (WarmPool, gVisor); Worker → SandboxMCP-Endpoint (streamable HTTP `/mcp`, Registrierung via `PUT /api/experimental/mcp/{server}`); Frontend/Backend → Authentik (OIDC/JWKS); Terraform → kind (podman) + ingress-nginx als E2E-Hülle; GitHub Actions → ghcr (Docker-Images + OCI-Helm-Charts) als Annotation-Lane. **Harness-Core-Abstraktion** als Backend-Modul mit Anmerkung „OpenCode ↔ DeepAgents (LangChain) austauschbar/erweiterbar" (gestrichelte Box um Worker-Schicht: „Agent-Harness-Plugin-Schicht").
- Vor Cloud-/K8s-Icons: `get_shape_library` aufrufen und **exakte Style-Namen** verwenden — niemals raten.

- [ ] **Step 1: Repo anlegen** — `gh repo create gthieleb/agent-fleet --public --description "..." --add-topic ...`; klonen in den Workspace; Branch `main` bestätigen; minimales `.gitignore`.
- [ ] **Step 2: Diagramm erstellen** — drawio-next: `start_session` → Drawing-Guide folgen → `create_new_diagram` gemäß Spez (in Teilen via `edit_diagram`, wenn zu groß für einen Call); Legende als eigene Gruppe unten links.
- [ ] **Step 3: Export** — `export_diagram` → `.drawio` (Original-XML) + `.png` nach `docs/architecture/` (beide Pflicht).
- [ ] **Step 4: Verifikations-Loop — maximal 5 Iterationen.** Pro Iteration: (a) `screenshot_diagram` bzw. Playwright-Screenshot des Previews; (b) `vision`-Subagent mit PNG-Pfad + Checkliste: ① keine überlappenden Shapes, ② keine Kanten durch Shapes, ③ Labels lesbar/nicht abgeschnitten, ④ Farbsemantik korrekt (extern vs. monorepo vs. plattform), ⑤ alle Pflicht-Komponenten/Flüsse vorhanden, ⑥ Legende korrekt; (c) Findings via `edit_diagram` fixen → re-export. **Abbruch: PASS oder nach der 5. Iteration** (dann letzten Stand + offene Findings dokumentiert committen).
- [ ] **Step 5: README schreiben** — About-Section direkt unter dem Titel mit `![Architecture](docs/architecture/agent-fleet-architecture.png)`; **Referenzen-Tabelle** (sandbox-mcp-operator, agent-sandbox-lab, llmgateway-setup, authentik-setup, terraform-k8s-cnpg, agent-skills, opencode.ai/v2-Docs inkl. Version 2.2.0, kubernetes-sigs/agent-sandbox, Bitnami-Kafka, CNPG, tehcyx/kind); **Architektur-Entscheidungen** als ADR-Kurzfassung (Approach A · Kafka single KRaft · SQLite-pro-Worker + Postgres-Registry · kein LLM im Backend · natives Blocking = Suspension · Import admin-only · Pinning 2.2.0 & `latest`=V1-Gotcha · llmgateway per-User-Keys · 1× SandboxMCP je Worker · Push-to-main = Publish-Side-Effect).
- [ ] **Step 6: Plan + Spec ins Repo kopieren** — nach `docs/superpowers/{plans,specs}/`; README verlinkt beide; GitHub-About nicht bildfähig → Beschreibung verweist auf README-Grafik.
- [ ] **Step 7: Drawio-Skill aktualisieren** — Skill lokalisieren (Skills-Verzeichnis-Policy beachten); Abschnitt „Diagram-Verification-Loop (Playwright + Vision)" ergänzen: Prozedur, Checkliste ①–⑥, Max-5-Iterations-Regel, Commit-Policy (PNG + Original-Export immer zusammen); Skill-Store-Regeln beachten (keine Namens-Duplikate, kanonischer Store).
- [ ] **Step 8: Commit + Push + Verify** — ein Commit `chore: bootstrap repo with architecture diagram, spec and plan`; Push; Verify: `gh api repos/gthieleb/agent-fleet/commits` → 200, PNG-RAW-URL → 200, README rendert (Grafik sichtbar). **Erst danach** irgendjemanden benachrichtigen (Output-Commit-Policy).
- [ ] **Step 9: Wave-Update** — 📡-Checkpoint gemäß Communication Checkpoints posten.

---

### Task 1: Monorepo-Scaffold + Repo-Policies

**Files:**
- Create: `package.json` (bun workspaces: `apps/*`, `packages/*`), `biome.json`, `.yamllint`, `.pre-commit-config.yaml`, `.gitignore`, `README.md`, `Makefile`
- Create: `apps/control-plane/package.json`, `apps/frontend/package.json`, `packages/fleet-schema/package.json` (leere Workspace-Gerüste)

**Interfaces:**
- Produces: Workspace-Layout + grüne pre-commit-Kette, die alle Folge-Tasks voraussetzen.

- [ ] **Step 1: Repo lokal anlegen** — `git init`, Branch `main`; Struktur wie oben; README mit Architektur-Skizze (aus Spec §5) und Setup-Anleitung.
- [ ] **Step 2: pre-commit-Config schreiben** — Hooks exakt wie Global Constraints; `tflint` als system-Hook nur auf `infra/` (`files: ^infra/`), biome auf TS (`types: [ts, tsx]`), yamllint auf YAML.
- [ ] **Step 3: Verifizieren** — `pre-commit install && pre-commit run -a` auf absichtlich verletzender Datei (trailing whitespace, unvalidiertes YAML) → FAIL; nach Fix → PASS.
- [ ] **Step 4: Workspace-Check** — `bun install` → Lockfile entsteht; `biome check .` → 0 Errors.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "chore: scaffold agent-fleet monorepo with policies"`.

### Task 2: Worker-Image

**Files:**
- Create: `apps/worker/Dockerfile`, `apps/worker/entrypoint.sh`, `apps/worker/opencode-bootstrap.json` (Defaults: Model-Anmeldung via Gateway s. Global Constraints, Permissions-Ask-Regel für E2E: `{"action":"bash","resource":"*","effect":"ask"}`), `apps/worker/.dockerignore`
- Test: `apps/worker/smoke.sh` (podman-basiert)

**Interfaces:**
- Produces: Image `ghcr.io/gthieleb/agent-fleet-worker:dev` — FROM `ghcr.io/anomalyco/opencode:2.2.0`; Entrypoint startet `opencode serve --hostname 0.0.0.0 --port 4096`; ENV `OPENCODE_PASSWORD` (Pflicht, fail-fast wenn leer).

- [ ] **Step 1: Smoke-Script schreiben (fail-first)** — `smoke.sh`: baut Image, startet Container mit `OPENCODE_PASSWORD=test`, assertet `curl -u opencode:test http://localhost:4096/api/info` → 200 **und** Body enthält `"2.2"`; danach Cleanup. Erst ohne Image ausführen → FAIL.
- [ ] **Step 2: Dockerfile + entrypoint implementieren** — Mehrstufig nicht nötig (Basis-Image final); entrypoint: `exec opencode serve --hostname 0.0.0.0 --port 4096`; HEALTHCHECK via `/api/info`. Bootstrap-JSON nach `~/.config/opencode/opencode.json` im Image.
- [ ] **Step 3: Smoke ausführen** — `apps/worker/smoke.sh` → PASS (Version-Assert greift).
- [ ] **Step 4: Negative Probe** — Image mit `latest`-Tag bauen → Smoke muss wegen Version-Assert FAILen (beweist Gotcha-Schutz). Dann zurück auf 2.2.0.
- [ ] **Step 5: Commit** — `feat(worker): pinned opencode 2.2.0 worker image with smoke test`.

### Task 3: Worker-Helm-Chart + Publish-Pipelines

**Files:**
- Create: `charts/agent-fleet-worker/` (Chart.yaml `version: 0.1.0`, values.yaml, templates/{statefulset,service-headless,secret,networkpolicy}.yaml, _helpers.tpl), `charts/agent-fleet-worker/ct.yaml`
- Create: `.github/workflows/ci.yml`, `.github/workflows/docker-publish.yml` (reusable, matrix: worker/backend/frontend), `.github/workflows/helm-publish.yml` (matrix über `charts/*`)

**Interfaces:**
- Produces: Chart `agent-fleet-worker` mit Values: `image.tag`, `replicas`, `opencodePassword.secretKeyRef|inline` (secretKeyRef gewinnt), `storage.size` (default `5Gi`), `resources`; Pod: StatefulSet, `serviceName: agent-fleet-worker`, PVC `data` → `~/.local/share/opencode`, Port 4096.
- Produces: Workflows: `docker-publish.yml` (buildx → `ghcr.io/gthieleb/agent-fleet-<name>`, Tags `main`+`sha`+`v*`), `helm-publish.yml` (`helm package` → `helm push oci://ghcr.io/gthieleb/charts`, auf Tags `v*` und main).

- [ ] **Step 1: Chart-Templates schreiben** — wie Interfaces; Secret aus `secretKeyRef` oder `stringData` (nie beides gleichzeitig, `required`-Fehler otherwise).
- [ ] **Step 2: Statische Validierung** — `helm lint charts/agent-fleet-worker` → PASS; `helm template … | kubeconform -strict -summary` → PASS.
- [ ] **Step 3: Live-Install gegen handgestartetes kind** — `KIND_EXPERIMENTAL_PROVIDER=podman kind create cluster`; `helm install w1 ./charts/agent-fleet-worker --set …passwordInline=test`; `kubectl run curl-test --rm -it --image=curlimages/curl -- curl -u opencode:test http://w1-agent-fleet-worker:4096/api/info` → 200. Danach Cluster löschen.
- [ ] **Step 4: Workflows schreiben** — Matrix-Build wie Interfaces; `actionlint` lokal → PASS; `pre-commit run -a` (YAML-Checks) → PASS.
- [ ] **Step 5: Commit** — `feat(ci): worker chart + image/chart publish pipelines`.

### Task 4: `fleet-schema` — Types, Topics, DB-Schema

**Files:**
- Create: `packages/fleet-schema/src/{topics.ts,events.ts,questions.ts,index.ts}`, `packages/fleet-schema/src/db/{schema.ts,relations.ts}`, `packages/fleet-schema/drizzle/` (Migrationen)
- Test: `packages/fleet-schema/test/{topics.test.ts,migrate.test.ts}`

**Interfaces:**
- Produces (exakt): `TOPICS = { events: "agent-fleet.events", questions: "agent-fleet.questions", answers: "agent-fleet.answers", state: "agent-fleet.state" } as const`
- Produces: `FleetEventSchema` (zod): `{ workerId: string; sessionId: string | null; seq: string; type: string; data: unknown; receivedAt: string }`
- Produces: drizzle-Tabellen: `workers(id text pk, url text, passwordSecretRef text, status text ['healthy'|'degraded'|'down'|'rejected'], version text, labels jsonb, lastSeenAt timestamp)`, `sessions(id text pk, workerId text ref, ownerId text, title text, project text, state text ['active'|'idle'|'lost'|'imported'], importedFrom text null, createdAt, updatedAt)`, `questions(id uuid pk, sessionId text ref, workerId text, kind text ['permission'|'form'], refId text, payload jsonb, status text ['pending'|'answered'|'cancelled'], reply jsonb null, ownerId text, createdAt, answeredAt null, unique(sessionId, refId))`, `importJobs(id uuid pk, sourceUrl text, status text, stats jsonb)`, `users(subject text pk, name text, role text ['admin'|'user'])`.
- Produces: `QuestionRecord` (Typ von questions-Zeile) für Backend und Frontend.

- [ ] **Step 1: Failing tests** — `topics.test.ts`: Topic-Konstanten exakt; `migrate.test.ts`: `drizzle-kit generate` Migration gegen pglite (`import { DrizzlePgDatabase } from "drizzle-orm/pglite"`) anwenden → Tabellen existieren, `unique(sessionId, refId)` schlägt Duplikat fehl.
- [ ] **Step 2: Testlauf fail** — `bun test packages/fleet-schema` → FAIL (Module fehlen).
- [ ] **Step 3: Implementieren** — zod-Schemas + drizzle-Schema + erste Migration; pglite als dev-dependency.
- [ ] **Step 4: Testlauf pass** — `bun test packages/fleet-schema` → PASS.
- [ ] **Step 5: Commit** — `feat(schema): fleet topics, event zod schema, drizzle migrations`.

### Task 4b: `harness-core` — Harness-Entkopplung (OpenCode ↔ DeepAgents)

**Files:**
- Create: `packages/harness-core/src/{types.ts,capabilities.ts,registry.ts,index.ts}`
- Test: `packages/harness-core/test/{registry.test.ts,types.test.ts}`

**Interfaces:**
- Consumes: Task 4 (FleetEventSchema — `HarnessEvent` baut darauf auf).
- Produces (exakt): `HarnessEvent = FleetEvent & {harnessKind: string}` (zod).
- Produces:
  ```ts
  interface HarnessCapabilities {
    supportsMcpRegistration: boolean
    supportsSessionImport: boolean
    supportsQueueDelivery: boolean
  }
  interface HarnessClient {
    readonly harnessKind: string
    readonly capabilities: HarnessCapabilities
    createSession(input: {project: string; title: string}): Promise<{sessionId: string}>
    prompt(sessionId: string, text: string, opts?: {delivery?: "steer" | "queue"}): Promise<void>
    interrupt(sessionId: string): Promise<void>
    getMessages(sessionId: string): Promise<unknown[]>
    subscribeEvents(): AsyncIterable<HarnessEvent>
    replyQuestion(input: {sessionId: string; kind: "permission" | "form"; refId: string; answer: unknown}): Promise<void>
    cancelQuestion(input: {sessionId: string; kind: "permission" | "form"; refId: string}): Promise<void>
    healthCheck(): Promise<{ok: boolean; version: string | null}>
  }
  type WorkerEndpoint = {workerId: string; url: string; password: string; harnessKind?: string}
  type HarnessFactory = (worker: WorkerEndpoint) => HarnessClient
  registerHarness(kind: string, factory: HarnessFactory): void
  harnessFor(worker: WorkerEndpoint): HarnessClient  // default "opencode", unknown kind → HarnessNotRegisteredError
  ```

- [ ] **Step 1: Failing tests** — registry.test.ts: (a) `harnessFor` ohne Registrierung → default-factory `opencode` aus harness-opencode wird später in Task 6 registriert — hier: unknown kind `deepagents` ohne Registrierung → `HarnessNotRegisteredError`; (b) Registrierung + `harnessFor` liefert Instanz mit korrektem `harnessKind`; (c) types.test.ts: `HarnessEvent` validiert FleetEvent + `harnessKind`.
- [ ] **Step 2: Fail-Run** — `bun test packages/harness-core` → FAIL.
- [ ] **Step 3: Implementieren** — Interfaces, Capabilities-Typen, Registry-Map mit Default-Resolution.
- [ ] **Step 4: Pass-Run** — `bun test packages/harness-core` → PASS.
- [ ] **Step 5: Commit** — `feat(harness-core): harness-agnostic client interface and registry`.

### Task 5: Backend-Gerüst + Auth (OIDC/Dev-Token)

**Files:**
- Create: `apps/control-plane/src/{index.ts,config.ts}`, `apps/control-plane/src/auth/{jwt.ts,middleware.ts}`, `apps/control-plane/src/api/{routes.ts,errors.ts}`
- Test: `apps/control-plane/test/auth.test.ts`

**Interfaces:**
- Consumes: `fleet-schema` (Task 4).
- Produces: `loadConfig(): Config` aus ENV (`DATABASE_URL, KAFKA_BROKERS, OIDC_ISSUER, OIDC_AUDIENCE, DEV_TOKEN, K8S_NAMESPACE, SANDBOX_MCP_NAMESPACE, SANDBOX_WARMPOOL, SANDBOX_TEMPLATE, PORT`).
- Produces: `verifyAccessToken(token: string): Promise<User>` (jose-createRemoteJWKSet; wirft `UnauthorizedError`); `requireAuth(roles?: Role[])` Hono-Middleware; bei gesetztem `DEV_TOKEN` und matchendem Token → Fake-User `{subject:"dev", role:"admin"}` (nur wenn `NODE_ENV=test`).
- Produces: REST-Skelett: `GET /healthz` (immer 200 ohne Auth), `GET /api/me` (auth-pflichtig), Fehler-Envelope `{error: {code, message}}`.

- [ ] **Step 1: Failing tests** — auth.test.ts: (a) gültiges Test-JWT (mit `jose.SignJWT`, JWKS via lokalen Mock-Server) → 200 + subject; (b) falsches Token → 401; (c) DEV_TOKEN-Flow → admin-User; (d) Rollen-Check: user-Rolle auf admin-Route → 403.
- [ ] **Step 2: Fail-Run** — `bun test apps/control-plane` → FAIL.
- [ ] **Step 3: Implementieren** — Hono-App, config, jose-JWKS-Verify, Middleware, Error-Handler.
- [ ] **Step 4: Pass-Run** — `bun test apps/control-plane` → PASS; `biome check` grün.
- [ ] **Step 5: Commit** — `feat(backend): hono scaffold with authentik oidc auth`.

### Task 6: Worker-Registry + Health-Poller

**Files:**
- Create: `apps/control-plane/src/opencode/clientFactory.ts`, `apps/control-plane/src/registry/{workerRegistry.ts,healthLoop.ts}`
- Test: `apps/control-plane/test/registry.test.ts`

**Interfaces:**
- Produces: **`OpencodeHarness implements HarnessClient`** (Task 4b) im Verzeichnis `apps/control-plane/src/harness/opencode/` — intern `makeClient(worker): OpenCode` via `OpenCode.make({baseUrl, headers: {authorization: "Basic " + btoa("opencode:" + password)}})`; Passwort aus Secret via `@kubernetes/client-node` (readNamespacedSecret) — lokal/E2E ohne K8s: `WORKER_PASSWORDS_JSON`-Fallback (Map workerId→password). Capabilities: `supportsMcpRegistration:true, supportsSessionImport:true, supportsQueueDelivery:true`; `healthCheck()` = `client.server.info()` mit Version-Major-Assert `2`. Registrierung der Factory unter `"opencode"` bei Start.
- Produces: `registerWorker(input: {workerId: string; url: string; passwordSecretRef?: string; harnessKind?: string}): Promise<void>` (drizzle-Upsert, default `harnessKind:"opencode"`), `getWorker(id)`, `listWorkers()`.
- Produces: `startHealthLoop(intervalMs = 10000): Promise<void>` — pro Worker `harnessFor(worker).healthCheck()`: Version-Major-Assert `2` (sonst Status `rejected`), Status `healthy` + `lastSeenAt` upsert; 3× Fehler → `down`.
- Consumes: Task 4 (DB-Schema), Task 4b (HarnessClient, harnessFor, registerHarness).

- [ ] **Step 1: Failing tests** — (a) `registerWorker` + `listWorkers` Roundtrip (pglite); (b) Health-Loop mit gemocktem `server.info()`: v2-Version → `healthy`; v1-Version → `rejected`; 3× Reject → `down` (Fake-Timer).
- [ ] **Step 2: Fail-Run** — `bun test apps/control-plane` → FAIL.
- [ ] **Step 3: Implementieren** — clientFactory (K8s-Secret-Reader mit JSON-Fallback), Registry, Health-Loop.
- [ ] **Step 4: Pass-Run** — Tests PASS; Review-Focus-4 abgedeckt (Version-Assert-Test).
- [ ] **Step 5: Commit** — `feat(backend): worker registry with version-asserting health loop`.

### Task 7: Session-Service (Dispatcher)

**Files:**
- Create: `apps/control-plane/src/sessions/sessionService.ts`, `apps/control-plane/src/api/sessions.ts`
- Test: `apps/control-plane/test/sessions.test.ts`

**Interfaces:**
- Consumes: Task 6 (`makeClient`, `getWorker`, `listWorkers`).
- Produces: `createSession(input: {userId: string; project: string; title: string}): Promise<{sessionId: string; workerId: string}>` — Platzierung: erster `healthy` Worker (Labels `project` bevorzugt), dann `client.session.create({location:{directory: "/workspace"}})` + drizzle-Insert (`state:"active"`).
- Produces: `prompt(input: {sessionId: string; text: string}): Promise<void>` — Ownership-Check, `client.session.prompt(...)`; Busy-Session → Inbox-Delivery `queue` (Payload `delivery:"queue"`).
- Produces: `interrupt(sessionId)`, `getMessages(sessionId): Promise<SessionMessage[]>` (Passthrough `client.session.messages`), REST: `POST/GET /api/sessions`, `GET /api/sessions/:id/messages`, `POST /api/sessions/:id/prompt`, `POST /api/sessions/:id/interrupt`.

- [ ] **Step 1: Failing tests** — (a) createSession wählt gesunden Worker + legt DB-Zeile an (Client-Mock); (b) Ownership-Verstoß → 403; (c) prompt auf busy-Session → `queue`-Delivery im Mock-Capture; (d) Worker ohne Capacity (alle `down`) → 503 mit klarem Fehlercode.
- [ ] **Step 2: Fail-Run** → FAIL. **Step 3: Implementieren.** **Step 4: Pass-Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): session dispatcher with placement and ownership`.

### Task 8: Event-Bridge (SSE → Kafka)

**Files:**
- Create: `apps/control-plane/src/bridge/{eventBridge.ts,dedup.ts,resync.ts}`
- Test: `apps/control-plane/test/bridge.test.ts`

**Interfaces:**
- Consumes: Task 6 (listWorkers, `harnessFor`), Task 4 (TOPICS), Task 4b (HarnessEvent).
- Produces: `startEventBridge(): Promise<void>` — pro `healthy` Worker `harnessFor(worker).subscribeEvents()` (AsyncIterable, provider-agnostisch); jedes `HarnessEvent` → kafkajs `send({topic: TOPICS.events, messages: [{key: sessionId ?? workerId, value}]})`.
- Produces: Dedup per `(workerId, seq)` LRU (10000 Einträge); `server.connected`-Event → `resync(workerId)`: `session.list` + Status-Delta (kein Message-Replay; Messages on-demand über Task 7).
- Produces: In-process-Buffer (Bounded, 10k) + Endless-Retry bei Producer-Fehlern; `stopEventBridge()`.

- [ ] **Step 1: Failing tests** — (a) gemockte Subscription + Mock-Producer: Events landen mit korrektem Key im Topic `agent-fleet.events`; (b) Duplikat-`seq` → genau ein Senden (Review-Focus-1); (c) `server.connected` → resync wird aufgerufen (Spy); (d) Producer wirft einmal → Event ist nachgeholt (Review-Focus-5); (e) Buffer-Overflow → ältestes Event verworfen + Log-Warn (bewusste Policy).
- [ ] **Step 2: Fail-Run** → FAIL. **Step 3: Implementieren.** **Step 4: Pass-Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): sse-to-kafka event bridge with dedup and resync`.

### Task 9: Question-Router (Events → Inbox + Push)

**Files:**
- Create: `apps/control-plane/src/questions/{questionRouter.ts,workerLoss.ts}`, `apps/control-plane/src/ws/{bus.ts,wsRoute.ts}`
- Test: `apps/control-plane/test/questions.test.ts`

**Interfaces:**
- Consumes: Task 4 (TOPICS, QuestionRecord), Task 8 (producer-Infra).
- Produces: `startQuestionRouter(): Promise<void>` — Consumer auf `agent-fleet.events`: Event-Typen `permission.updated`/`form.created` mit `status/pending`-Semantik → Insert `questions` (Idempotenz via `unique(sessionId, refId)` + `onConflictDoNothing`) → Produce `agent-fleet.questions` → `bus.publish({type:"question.created", question})`.
- Produces: `bus.publish(event: WsEvent): void` + `subscribe(handler): () => void`; WS-Route `GET /ws` (Bearer via Query `?token=`), sendet `question.created|question.updated|session.updated`.
- Produces: `workerLossSweep()`: Worker-Status `down` → alle dessen `pending`-Fragen → `cancelled`, Sessions → `lost`, je `question.updated` + `session.updated` (Review-Focus-3). Health-Loop (Task 6) ruft Sweep on-Transition.
- Hinweis zu Event-Typen: exakte Namen aus `/api/event`-Stream des gepinnten Servers ableiten (OpenAPI `V2EventEncoded`); Mapping in `questionRouter.ts` zentral pflegen.

- [ ] **Step 1: Failing tests** — (a) permission-pending-Event → Question `pending` in DB + WS-Publish + Kafka-Produktion; (b) gleiches Event nochmal → keine zweite Frage (Idempotenz); (c) form.created → kind `form`; (d) Worker `down` mit offener Frage → `cancelled` + Session `lost` (Review-Focus-3); (e) WS: zwei Clients, beide erhalten Push.
- [ ] **Step 2: Fail-Run** → FAIL. **Step 3: Implementieren.** **Step 4: Pass-Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): question router with inbox, ws push and worker-loss sweep`.

### Task 10: Reply-Service

**Files:**
- Create: `apps/control-plane/src/replies/replyService.ts`, `apps/control-plane/src/api/questions.ts`
- Test: `apps/control-plane/test/replies.test.ts`

**Interfaces:**
- Consumes: Task 4b (`HarnessClient` via `harnessFor` — Reply-Calls laufen **ausschließlich über `replyQuestion`/`cancelQuestion`**; HTTP-Details der Endpoints liegen in `harness-opencode`), Task 9 (QuestionRecord, bus).
- Produces: `replyQuestion(input: {questionId: string; answer: unknown; actor: User}): Promise<ReplyResult>` — lädt Frage, prüft Status `pending` + Rechte (Owner oder `admin`); `kind:"permission"` → `POST /api/session/{sid}/permission/{refId}/reply` (Map `answer` → `{reply: "once"|"always"|"reject"}`); `kind:"form"` → `POST /api/session/{sid}/form/{refId}/reply` (Payload `{answers}`); danach Status `answered` + Kafka `agent-fleet.answers` + `bus.publish(question.updated)`.
- Produces: `cancelQuestion(input: {questionId; actor}): Promise<ReplyResult>` — permission → reply `"reject"`, form → `DELETE …/form/{formId}`; Status `cancelled`.
- Produces: `ReplyResult = { status: "answered" | "cancelled" | "conflict" | "not_found" }`; REST: `GET /api/questions`, `POST /api/questions/:id/reply`, `POST /api/questions/:id/cancel`.

- [ ] **Step 1: Failing tests** — (a) permission-reply → Client-Call mit korrektem Body + DB `answered` + Events; (b) form-reply; (c) Zweit-Antwort → `{status:"conflict"}`, kein Client-Call (Review-Focus-2); (d) non-Owner ohne admin → 403; (e) Worker-409 (settled) → `conflict`; (f) Cancel → reject-/DELETE-Call + `cancelled`.
- [ ] **Step 2: Fail-Run** → FAIL. **Step 3: Implementieren.** **Step 4: Pass-Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): reply service with conflict handling and cancel`.

### Task 11: MCP-Registrar (SandboxMCP je Worker)

**Files:**
- Create: `apps/control-plane/src/mcp/{sandboxMcp.ts,mcpRegistrar.ts}`
- Test: `apps/control-plane/test/mcp.test.ts`

**Interfaces:**
- Consumes: Task 6 (Registry, `harnessFor`), Task 4b (Capability `supportsMcpRegistration` — vor Registrierung prüfen, sonst Skip mit Log), `@kubernetes/client-node` (CustomObjectsApi), CRD `SandboxMCP` (`mcps.sandbox.gthieleb.dev/v1alpha1`, Namespace aus Config `SANDBOX_MCP_NAMESPACE`).
- Produces: `ensureSandboxMcp(workerId: string): Promise<{endpoint: string; token: string}>` — get-or-create `SandboxMCP`-CR (name `agent-fleet-<workerId>`), Warten auf `status.ready`, Lesen `status.endpoint` + Token aus Secret (`spec.http.auth.secretKeyRef`).
- Produces: `registerOnWorker(worker: Worker, endpoint: string, token: string): Promise<void>` — `PUT /api/experimental/mcp/{server}` mit `{config: {type:"remote", url: endpoint, oauth:false, headers:{Authorization:"Bearer "+token}, protocol:"auto"}}` via `@opencode/client` (operationId `experimental.mcp.add`; Fallback: roher Fetch auf Worker-API). Server-Name konstant `"agent-sandbox"`.
- Produces: `deprovisionWorker(workerId)` — CR-Delete (löst Sandbox-Freigabe), Worker aus Registry entfernen.

- [ ] **Step 1: Failing tests** — (a) CR nicht vorhanden → Create + Poll bis ready → Endpoint/Token korrekt (K8s-API-Mock); (b) CR vorhanden+ready → kein Create; (c) registerOnWorker → PUT-Call mit exaktem Config-Body (Capture); (d) deprovision → Delete-Call.
- [ ] **Step 2: Fail-Run** → FAIL. **Step 3: Implementieren.** **Step 4: Pass-Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): per-worker sandboxmcp provisioning and mcp registration`.

### Task 12: Import-Service (admin-only)

**Files:**
- Create: `apps/control-plane/src/import/importService.ts`, `apps/control-plane/src/api/import.ts`
- Test: `apps/control-plane/test/import.test.ts`

**Interfaces:**
- Consumes: Task 6 (Registry), Task 4b (Capability `supportsSessionImport` — ohne Flag: 503 mit klarem Fehlercode), `@opencode/client` für Quelle **nur innerhalb `harness-opencode`**.
- Produces: `listSourceSessions(source: {url: string; password: string}): Promise<{id: string; title: string; time: string}[]>` — Source-Client (Basic auth), `client.session.list()` (Cursor-Pagination bis Ende).
- Produces: `importSession(input: {source: {url; password}; sessionId: string; targetWorkerId: string; actor: User}): Promise<{sessionId: string}>` — admin-Assert; `GET /api/experimental/session/{id}/export` auf Quelle → `POST /api/experimental/session/import` auf Ziel-Worker → Registry-Insert (`state:"imported"`, `importedFrom: source.url`); `importJobs`-Zeile mit Stats. Import-Reihenfolge: parent-Sessions zuerst (anhand `parentID` im Export-Payload sortieren).
- REST: `POST /api/import/sessions` (list), `POST /api/import` (run) — beide admin-only.

- [ ] **Step 1: Failing tests** — (a) listSourceSessions paginiert (2-Cursor-Mock); (b) Import-Flow: export→import→DB-Zeile `imported` (Mock-Clients); (c) Subagent-Baum: 3 Sessions mit parentID-Kette → Import-Reihenfolge parents-first (Review-Focus 5, Assert auf Call-Reihenfolge); (d) non-admin → 403.
- [ ] **Step 2: Fail-Run** → FAIL. **Step 3: Implementieren.** **Step 4: Pass-Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): admin-only session import via export/import api`.

### Task 13: Backend-Chart + Backend-Image

**Files:**
- Create: `apps/control-plane/Dockerfile`, `charts/agent-fleet-backend/` (deployment, service, ingress-optional, secret-env, networkpolicy, hpa-aus), values wie folgt
- Test: `charts/agent-fleet-backend/` via `helm lint` + kubeconform; Image-Smoke analog Task 2

**Interfaces:**
- Consumes: docker-publish/helm-publish-Workflows (Task 3).
- Produces: Chart-Values: `image.tag`, `env` (DATABASE_URL, KAFKA_BROKERS, OIDC_*, K8S_NAMESPACE, SANDBOX_*), `secrets` (secretKeyRefs), `service.port=3000`; SA mit RBAC für: SandboxMCP-CRD CRUD, Secret-Read (nur eigene Namespace), StatefulSet-Read (Worker-Discovery optional via DNS statt K8s-API).

- [ ] **Step 1: Dockerfile** (bun-base, `bun install --production`, non-root, HEALTHCHECK `/healthz`) + Build lokal via podman.
- [ ] **Step 2: Chart-Templates** + `helm lint` + `helm template | kubeconform -strict` → PASS.
- [ ] **Step 3: Live-Smoke** — handgestartetes kind (Task 3 Muster), CNPG weglassen: values mit `DATABASE_URL` gegen Port-forward der lokalen Postgres-Pod; `/healthz` + `/api/me` (DEV_TOKEN) erreichbar.
- [ ] **Step 4: Workflow-Matrix ergänzen** — `docker-publish.yml`/`helm-publish.yml` um backend erweitern (falls matrix-basiert: kein Edit nötig; sonst ergänzen); `actionlint` → PASS.
- [ ] **Step 5: Commit** — `feat(backend): docker image and helm chart`.

### Task 14: Frontend-Gerüst + Auth + API-Client

**Files:**
- Create: `apps/frontend/` (**SvelteKit 2, SPA via adapter-static**, TypeScript): `src/routes/{login,dashboard,session/[id],inbox,import,admin}/+page.svelte`, `src/lib/api/{client.ts,types.ts}`, `src/lib/auth/{oidc.ts,store.svelte.ts}`, Layout `+layout.svelte`
- Test: `apps/frontend/test/{client.test.ts,oidc.test.ts}` (vitest + @testing-library/svelte via bun)

**Interfaces:**
- Consumes: Backend-REST (Tasks 7, 9, 10, 12) + `fleet-schema` `QuestionRecord`.
- Produces: `api<T>(path: string, init?: RequestInit): Promise<T>` — Bearer aus Token-Store, 401 → Redirect Login.
- Produces: OIDC-PKCE (authorization-code + PKCE gegen Authentik; `oidc-client-ts` oder handgerollt — Entscheidung: `oidc-client-ts`), `DEV_TOKEN`-Bypass für E2E.

- [ ] **Step 1: Failing tests** — (a) api-Client hängt Bearer an + wirft bei 401 mit Redirect-Spy; (b) OIDC-Redirect-URL-Bau korrekt (PKCE-Challenge vorhanden).
- [ ] **Step 2: Fail-Run** → FAIL. **Step 3: Scaffold + Implementieren** (Vite-React-TS, Biome-integriert). **Step 4: Pass-Run** → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): vite react scaffold with oidc and api client`.

### Task 15: Dashboard + Session-Detail

**Files:**
- Create: `apps/frontend/src/routes/{dashboard,session/[id]}/+page.svelte`, `src/lib/ws/fleetWs.svelte.ts` (rune-based store), `src/lib/components/{SessionCard,StatusBadge,MessageTimeline}.svelte`
- Test: `apps/frontend/test/dashboard.test.ts` (Komponenten-Tests mit Mock-WS)

**Interfaces:**
- Consumes: `GET /api/sessions`, `GET /api/sessions/:id/messages`, `GET /api/workers`, WS `question.*`/`session.updated`.
- Produces: Dashboard: Session-Kacheln (Status-Badge live via WS), Worker-Health-Liste; Detail: Message-Timeline (Poll on-demand + WS-Invalidierung), Prompt-Box (`POST …/prompt`), Interrupt-Button.

- [ ] **Step 1: Failing tests** — (a) Dashboard rendert Sessions aus Mock-API; (b) WS `session.updated` ändert Badge ohne Reload; (c) Prompt-Box → POST-Spy; (d) Empty-State (keine Sessions).
- [ ] **Step 2: Fail-Run** → FAIL. **Step 3: Implementieren.** **Step 4: Pass-Run** → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): dashboard and session detail with live ws updates`.

### Task 16: Inbox + Import-Wizard + Admin

**Files:**
- Create: `apps/frontend/src/routes/{inbox,import,admin}/+page.svelte`, `src/lib/components/{QuestionCard,AnswerForm,ImportDialog}.svelte`
- Test: `apps/frontend/test/inbox.test.ts`

**Interfaces:**
- Consumes: `GET /api/questions`, `POST /api/questions/:id/reply`, `POST /api/questions/:id/cancel`, Import-Endpoints (Task 12).
- Produces: Inbox: Frage-Karten gruppiert nach Session; `AnswerForm` je `kind` (permission: once/always/reject; form: dynamisch aus `payload.fields`); konflikt-Feedback bei `{status:"conflict"}`. ImportPage: Quelle (URL+Password), Session-Auswahl, Fortschritt. AdminPage: Worker-Liste + deprovision.

- [ ] **Step 1: Failing tests** — (a) pending-Frage wird gerendert; (b) Antwort-Submit → korrekter Body je kind; (c) Konflikt-Antwort zeigt Fehlerbanner; (d) nur Owner/admin sieht Antwort-Buttons (Rollen-Mock).
- [ ] **Step 2: Fail-Run** → FAIL. **Step 3: Implementieren.** **Step 4: Pass-Run** → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): inbox, import wizard and admin views`.

### Task 17: Frontend-Chart + Image

**Files:**
- Create: `apps/frontend/Dockerfile` (Multi-Stage: bun build → SvelteKit adapter-static → nginx-unprivileged, SPA-Fallback via try_files), `charts/agent-fleet-frontend/` (deployment, service, ingress mit `host`-Value, values: `backendUrl`, `oidc.*`)
- Test: helm lint + kubeconform + Image-Smoke (nginx serviert index, inject der Runtime-Config `window.__FLEET_CONFIG__` aus ConfigMap)

**Interfaces:**
- Consumes: Publish-Workflows (Task 3).
- Produces: Chart-Values: `image.tag`, `ingress.host` (E2E: `fleet.kind.localhost`), `config.backendUrl`, `config.oidcIssuer/clientId`.

- [ ] **Step 1: Dockerfile + Build + Smoke** — `curl localhost:8080` → 200 + `<div id="root">`.
- [ ] **Step 2: Chart + Validierung** — `helm lint` + kubeconform PASS; Runtime-Config-Injection via ConfigMap geprüft.
- [ ] **Step 3: Commit** — `feat(frontend): docker image and helm chart`.

### Task 17b: Frontend-UI-Erfahrungssammlung via Playwright-MCP (User-Entscheidung 2026-10-30)

**Files:**
- Create: `e2e/ui/README.md` (Doku des Playwright-MCP-Verlaufs + Screenshot-Ablage-Konvention), `.gitignore`-Eintrag `docs/evidence/` für Screenshots (nie ins Produktions-Repo)
- Test: **Playwright-MCP-Tool** (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_take_screenshot`) gegen die Task-18-Umgebung

**Interfaces:**
- Consumes: laufende E2E-Umgebung (Task 18), SvelteKit-Frontend (Tasks 14–17), Backend-DEV_TOKEN, **`playwright`-MCP (vom User aktiviert)**
- Produces: UI-Abnahme-Report + Evidenz-Screenshots nach `docs/evidence/ui-<date>/` (optional Release-Asset, falls in Issue/PR verlinkt)

**Ablauf (ein Nutzerfluss, Sichtprüfung je Schritt — dient explizit auch dem „Erfahrungen sammeln" mit dem MCP-Tool):**
1. `browser_navigate` → Frontend-URL (`http://fleet.kind.localhost:8080`), Assert: Login-Titel sichtbar.
2. Login (DEV_TOKEN-Pfad) → Redirect auf `/dashboard`, Snapshot: Session-Kacheln/Empty-State.
3. `browser_click` → Session anlegen → Snapshot: neue Session sichtbar.
4. Prompt → Permission-Ask (`bash → ask`) → Snapshot: Inbox `pending`.
5. `browser_click` → Antwort `once` → Snapshot: Inbox `answered`, Session aktiv.
6. Pro Schritt `browser_take_screenshot` → Evidenz; Abschluss-Report PASS/FAIL je Schritt.

- [ ] **Step 1: Voraussetzung** — E2E up (Task 18), `playwright`-MCP aktiv (andernfalls STOP, User bitten zu aktivieren — keine eigenen Skripte).
- [ ] **Step 2: Login-Sichtprüfung** — Navigieren, Snapshot Titel+Form, Screenshot.
- [ ] **Step 3: Session-Flow** — Anlegen → Prompt → Snapshot Inbox `pending`.
- [ ] **Step 4: Antwort-Flow** — Antworten → Snapshot Session aktiv, Screenshot.
- [ ] **Step 5: Commit** — Evidenz + Doku `e2e/ui/README.md`; Screenshots nur `docs/evidence/` (git-ignored) oder Release-Asset.

### Task 17c: Frontend-E2E für die Pipeline via @playwright/test

**Files:**
- Create: `apps/frontend/e2e/{login.spec.ts,session.spec.ts,inbox.spec.ts}`, `apps/frontend/playwright.config.ts` (webServer + baseURL `http://fleet.kind.localhost:8080`, projects `chromium`), `apps/frontend/package.json` (deps: `@playwright/test`)
- Modify: `.github/workflows/ci.yml` — Job `frontend-e2e`: `bun install`, `npx playwright install --with-deps chromium`, `npx playwright test`, `actions/upload-artifact` (playwright-report) + `daun/playwright-report-summary@v3`
- Test: `npx playwright test` (headless, deterministisch, DEV_TOKEN-auth via `page.setExtraHTTPHeaders`/`localStorage`)

**Interfaces:**
- Consumes: Frontend (Tasks 14–17), DEV_TOKEN, CI-Container-Runtime (Ubuntu-Runner)
- Produces: deterministische UI-Regression fürs Pipeline: Login-Redirect, Session-Anlage, Inbox-Antwort; Report-Artifacts

- [ ] **Step 1: Failing-Setup** — `playwright.config.ts` + erster Spec `login.spec.ts` (Assert Login-Titel); `npx playwright test` → rot (App nicht erreichbar ohne webServer/Umgebung) bzw. zunächst Spec-vor-Implementierung (TDD).
- [ ] **Step 2: Specs implementieren** — login/session/inbox-Specs mit DEV_TOKEN-Handling.
- [ ] **Step 3: Local-Run** — gegen Task-18-Umgebung grün; `npx playwright test` → PASS + Report.
- [ ] **Step 4: CI-Job** — `ci.yml` um `frontend-e2e` erweitern, `actionlint` grün, Report-Artifacts konfiguriert.
- [ ] **Step 5: Commit** — `feat(frontend): playwright e2e suite for pipeline + ci job`.

### Task 18: Terraform: kind-cluster + platform-stack Module

**Files:**
- Create: `infra/modules/kind-cluster/{main.tf,versions.tf,variables.tf,outputs.tf}` — `tehcyx/kind`-Provider; `kind_cluster` mit `kind_config` (extraPortMappings `8080→80`, `8443→443`; kubeconfig nach `~/.kube/agent-fleet-e2e`), ENV `KIND_EXPERIMENTAL_PROVIDER=podman` dokumentiert + `Makefile`-Target setzt es.
- Create: `infra/modules/platform-stack/{main.tf,versions.tf,variables.tf,outputs.tf}` + `manifests/` — (a) ingress-nginx (helm_release, controller `hostPort`-frei, NodeSelector kind); (b) CNPG: Operator-Manifest vendored + `Cluster`-CR (1 Instance, 10Gi); (c) **Strimzi**: Operator-Manifeste (vendored, Version gepinnt) + `Kafka`-CR (KRaft, `replicas: 1`, RF=1, single-node-storage PVC) + **`KafkaTopic`-CRDs für alle 4 Topics** (`agent-fleet.state` mit `cleanupPolicy: compact`, `agent-fleet.events` mit Retention 7d); (d) agent-sandbox controller_stack + gVisor-NodeImage aus `agent-sandbox-lab` übernommen (`enable_gvisor` var, default false für CI); (e) `SandboxTemplate` + `SandboxWarmPool` (aus E2E-Vars); (f) helm_release backend/frontend/worker (Charts aus lokalem Pfad, images via `kind_load` bzw. `kind load`-Skript), Values wiring (DATABASE_URL=CNPG-Service, KAFKA_BROKERS=Service, OIDC=var).
- Test: `terraform fmt -check`, `terraform validate`, `tflint` (pre-commit); Live-Proof in Task 19.

**Interfaces:**
- Produces: `infra/e2e/main.tf` (Root: ruft beide Module; vars: `worker_count=2`, `cluster_name="agent-fleet-e2e"`, `enable_gvisor=false`); Outputs: `backend_url` (`http://fleet.kind.localhost:8080`), `frontend_url`, `worker_names`.
- Produces: Namespace `agent-fleet` für Platform, `agent-sandbox-system` für Controller (Muster aus Lab).

- [ ] **Step 1: Module schreiben** wie Files/Interfaces (DRY: keine Duplikate aus `agent-sandbox-lab` kopieren, sondern referenzieren/vendoren mit Quelle im Header-Kommentar).
- [ ] **Step 2: Statische Validierung** — `terraform fmt -check -recursive && terraform -chdir=infra/e2e init -backend=false && terraform -chdir=infra/e2e validate && pre-commit run -a` → PASS.
- [ ] **Step 3: Erster Live-Apply (lokal)** — `make e2e-up` (setzt podman-env, terraform apply) → Cluster + Stack up; `kubectl get pods -A` zeigt: cnpg 1/1, kafka 1/1, ingress-nginx 1/1, backend 1/1, frontend 1/1, worker 2/2 StatefulSet, SandboxMCP-CRs ready.
- [ ] **Step 4: Commit** — `feat(infra): terraform kind/podman e2e environment with platform stack`.

### Task 19: E2E-Smoke-Suite + Pipeline

**Files:**
- Create: `e2e/smoke.ts` (Bun-Script), `e2e/run.sh`, `.github/workflows/e2e.yml`
- Test: die Suite IST der Test.

**Interfaces:**
- Consumes: laufende E2E-Umgebung (Task 18), Backend-API (DEV_TOKEN), Worker (Permission-Ask-Regel aus Task 2: `bash effect:"ask"`).
- Produces: `e2e/smoke.ts` Ablauf: (1) `GET /healthz` 200; (2) Worker healthy + Version 2.x; (3) `POST /api/sessions` → sessionId; (4) `POST …/prompt` „Run `ls /workspace` via bash"; (5) poll `GET /api/questions` bis pending-Frage (kind permission, timeout 60s); (6) `POST /api/questions/:id/reply {answer:"once"}`; (7) Session erreicht idle (poll messages); (8) Import: zweiten Worker als Quelle → `POST /api/import` → Session unter Ziel-Worker `imported` sichtbar; (9) Cleanup via `make e2e-down`. Exit-Code != 0 bei jedem Schritt-Fail mit klarem Step-Log.
- Produces: `e2e.yml`: on PR + schedule; ubuntu-latest; podman (preinstalled) + `KIND_EXPERIMENTAL_PROVIDER=podman`; bun setup; `make e2e-up && bun e2e/smoke.ts && make e2e-down`; Terraform-Cache;_failure → Cluster-Logs als Artifact (kubectl describe + logs).

- [ ] **Step 1: smoke.ts schreiben** — Schritte wie Interfaces, mit `Bun.env.E2E_BACKEND_URL` + `DEV_TOKEN`.
- [ ] **Step 2: Lokaler Run** — gegen Task-18-Umgebung → Suite grün (bei Rot: Stack fixen, nicht Suite verwässern).
- [ ] **Step 3: e2e.yml schreiben** — `actionlint` PASS; einmaliger manuelles Trigger auf Branch → Pipeline grün.
- [ ] **Step 4: Docs** — README: `make e2e-up/e2e-down`, Voraussetzungen podman+kind+terraform, Authentik-E2E-Story (DEV_TOKEN in CI, OIDC nur lokal manuell testbar).
- [ ] **Step 5: Commit** — `feat(e2e): smoke suite and github actions e2e pipeline`.

---

## Selbst-Review (abgehakt)

1. **Spec-Abdeckung:** G1→T3/18, G2→T8/9/10, G3→T4/8, G4→T4/12, G5→T5/14, G6→T11, G7→T14–17, G8→T18, G9→T2, G10→T1/3/13/17, G11→T18/19; Constraints §3 alle in Global Constraints; §6 Flows: Lifecycle→T7, Frage→T8–10, Import→T12, Subagent→T11. Keine Lücke.
2. **Step-Scan:** Steps benennen Signatur/Befehl/Erwartung; keine TBDs.
3. **Typ-Konsistenz:** `ReplyResult`, `TOPICS`, `QuestionRecord`, `FleetEvent`, `ensureSandboxMcp`/`registerOnWorker` durchgehend gleich benannt.
4. **Review-Focus:** 5 Items, Tests in T6/8/9/10/12 verankert.
5. **Proportion:** Plan ≈ 2× Spec-Länge bei 19 Tasks für 5 Services + Infra — vertretbar, Steps ohne Code-Transkripte gehalten.
