# Design: Agent-Fleet-Plattform für OpenCode (Arbeitstitel „agent-fleet")

Datum: 2026-10-27 · Status: Entwurf zur Abnahme · Approach A (Verteilte Worker + zentrales Control-Plane), vom Partner gewählt

## 1. Intent & Warum

Eine Plattform, in der **viele OpenCode-Agent-Sessions parallel** auf verteilten Workern laufen (in Agent Sandboxes bzw. hinter Gateways), von einem **Web-Frontend** überwacht und gesteuert werden. Alle **Rückfragen der Sessions an den Nutzer** (Permission-Asks, Forms, MCP-Elicitation) werden über einen zentralen **Dispatcher + Kafka** gebündelt und ans Frontend geroutet; die Session **blockiert nativ** bis zur Antwort (Suspension). Das Backend übernimmt Dispatcher-Logik und **Anmeldung**, führt die zentrale **Session-Registry** (Postgres) und erlaubt den **Import bestehender OpenCode-Sessions**. Ein **bereits vorhandener, eigener MCP-Service** (mit Kubernetes Agent-Sandbox gebaut) wird als Remote-MCP-Backend angebunden — Subagents bekommen Sandbox-Execution als Tools.

Warum: OpenCode-Events sind live-only ohne Replay; viele isolierte Sessions brauchen ein zuständiges Event-Backbone, zentrale Auth-/Ownership-Kontrolle und ein einziges Frage-Postfach für den Nutzer. Single-Instance-Kafka (KRaft) gibt Durability + Replay bei minimalem Ops-Aufwand.

## 2. Ziele / Non-Goals / Anti-Goals

**Ziele (Phase 1)**
- G1: N OpenCode-Worker (K8s-Pods, `opencode serve`), parallel betreibbar, Health-überwacht
- G2: Zentrale Inbox: **alle** Fragen aller Sessions → Frontend; Antworten erreichen die richtige Session; Session blockiert bis Antwort
- G3: Kafka (single instance, KRaft) als Event-Backbone mit Replay; Topics partitioniert nach `sessionID`
- G4: Session-Registry in **Postgres** (Backend-Metadaten); Import bestehender Sessions über die offizielle API
- G5: Auth: OIDC/JWT, per-User Session-Ownership
- G6: Subagents: Sandbox-Execution über den **bestehenden MCP-Service** (remote, Streamable HTTP)
- G7: Frontend: Dashboard, Session-Detail, Inbox, Import-Wizard, Admin
- G8: Deployment auf Kubernetes
- G9: **OpenCode 2.x pinnen**: Worker-Image `ghcr.io/anomalyco/opencode:2.2.0` — niemals `latest` (zeigt auf V1 1.19.4!)
- G10: Eigenes Repo **`gthieleb/agent-fleet`** (Monorepo); CI/CD-Pipelines für **Docker-Images + OCI-Helm-Charts aller Services** nach `ghcr.io/gthieleb/*`
- G11: **Terraform-E2E-Umgebung**: kind mit **podman** (`KIND_EXPERIMENTAL_PROVIDER=podman`), ingress-nginx via extraPortMappings, Muster aus `agent-sandbox-lab`

**Non-Goals (Phase 1)**
- Kafka-Cluster / exactly-once; NATS statt Kafka
- agentgateway als Policy-Plane (Phase 2, optional)
- Worker selbst in Agent-Sandbox-CRDs (Phase 2: Hardening)
- Eigenes LLM im Backend (für interne Aufgaben: One-Shot-Generate auf einer zentralen OpenCode-Instanz)
- OpenCode V1-Migration; Direktverbindung Browser → Worker

**Anti-Goals**
- Niemals extern in `opencode.db` schreiben (SQLite gehört dem Worker)
- Kein eigener Agent-Harness — OpenCode ist der Harness
- Kein LLM-Traffic durchs Backend

## 3. Constraints (recherchierte OpenCode-V2-Fakten)

| Fakt | Konsequenz |
|---|---|
| Storage: SQLite (`OPENCODE_DB` ändert nur den Pfad) | Registry in eigenem Postgres; Worker-DB bleibt SQLite (PVC pro Worker) |
| Events: `GET /api/event` (SSE), **live-only, kein Replay**, `server.connected`-Marker | Event-Bridge muss bei Reconnect via `session.list`/messages resyncen; Kafka kompensiert Replay |
| Worker-Auth: `OPENCODE_PASSWORD`, Basic-Auth (User `opencode`), `opencode serve --hostname 0.0.0.0 --port` | Nur das Backend spricht Worker (Security Boundary); Secrets via K8s |
| Fragen-Mechanik: Permission-Requests (`/api/permission/request`, `…/{requestID}/reply`), Forms (`/api/form`, `…/form/{formID}/reply`, Cancel), MCP-Elicitation → Forms; Session **blockiert** bis Antwort | Suspension ist gratis; Reply-Service nutzt genau diese Endpoints |
| `POST /api/experimental/session/{id}/wait`, `…/background` | Dispatcher kann auf Idle warten / Blocking-Tools backgrounden |
| Session-Inbox (`/api/session/{id}/inbox`, Delivery `steer|queue`) | Prompts an beschäftigte Sessions können gequeued werden |
| Import/Export: `POST /api/experimental/session/import`, `GET /api/experimental/session/{id}/export` (experimental) | Import-Funktion ohne DB-Parsing; opencode-Version pinnen |
| MCP: remote = Streamable HTTP; OAuth (CIMD/DCR/pre-registered) oder `oauth:false`+Headers mit `{env:…}`; `protocol: legacy|auto|2026-07-28`; Timeouts startup/catalog/execution | Bestehender MCP-Service wird per URL + Header-Token angebunden |
| `_meta["ai.opencode/sessionID"]` bei `tools/call` (nicht als AuthZ!) | Sandbox-Affinität & Attribution pro Session im MCP-Service |
| Dynamische MCP-Registrierung: `PUT /api/experimental/mcp/{server}` (location-scoped), `connect`/`disconnect` | MCP-Registrar kann pro Worker/Location registrieren — keine Config-Dateien |
| Provider-Credentials + LLM-Calls laufen in den Workern | Backend bleibt LLM-frei |
| Offizielles Docker-Image `ghcr.io/anomalyco/opencode:<2.x.y>`; `latest` zeigt auf **V1** (1.19.4) | Worker-Image pinnen auf 2.2.0; Health-Check assertet 2.x |
| OpenCode-Worker-Basisimage läuft unter supervisor-freundlichem `opencode serve` (foreground) | Worker-Container = 1 Prozess, StatefulSet + PVC |

## 4. Approaches

**A — Verteilte Worker + zentrales Control-Plane (GEWÄHLT):** N Worker-Pods mit `opencode serve`; Backend (TS/Bun, `@opencode/client`) macht Dispatcher, Auth, Registry, Event-Bridge, Question-Router; Kafka verbindet die Welten. Passt zur Sandbox-Vision, Worker sind zustandsfrei austauschbar, Blast-Radius pro Session klein. Tradeoff: Worker-Lifecycle, Health-Handling, Event-Dedup nach Reconnect.

**B — SDK-embedded Backend:** OpenCode in-process via `@opencode/sdk`. Verworfen: Sessions sterben mit Backend-Restart, Backend muss Node/Bun sein, widerspricht Isolations-Anforderung.

**C — Ein zentraler OpenCode-Server:** Verworfen: SPOF, keine per-Session-Isolation, begrenzte Parallelität.

## 5. Architektur

```
Frontend (React)  ⇄  WebSocket/SSE + REST  ⇄  Control-Plane Backend (TS/Bun)
                                                      │
                 ┌────────────────────────────────────┼───────────────────────┐
                 ▼                                    ▼                       ▼
        Kafka (single, KRaft)                   Postgres (Registry)   OIDC-Provider
                 ▲                                    │
                 │ Events (key=sessionID)             │ Session→Worker-Mapping
                 │                                    ▼
        Event-Bridge im Backend  ⇄  N × OpenCode-Worker (opencode serve, PVC/SQLite)
                 │                        │ remote MCP (Streamable HTTP, {env:}-Token)
                 │                        ▼
                 │                 bestehender MCP-Service (Deployment)
                 │                        │ SandboxClaim / WarmPools
                 │                        ▼
                 │                 Agent-Sandbox-Pods (kubernetes-sigs/agent-sandbox)
                 └─ Antworten: Frontend → Backend → Worker-Reply-Endpoints
```

**Komponenten & Verantwortlichkeiten**

1. **OpenCode-Worker** (K8s Deployment, repliziert): `opencode serve`, Headless-Service, `OPENCODE_PASSWORD` aus Secret, SQLite auf PVC. Besitzt Sessions, Provider-Credentials, LLM-Calls, Permission-/Form-Verwaltung.
2. **Control-Plane Backend** (TS/Bun + `@opencode/client`):
   - **Auth**: OIDC-Login, JWT-Verifikation, Session-Ownership
   - **Worker-Registry**: Health via `/api/info`, Kapazität, Labels (Projekt-Affinität)
   - **Dispatcher**: Session-Platzierung, `session.create`/`prompt`/`command`, Inbox-Delivery (`steer`/`queue`), `wait`/`interrupt`
   - **Event-Bridge**: pro Worker `client.event.subscribe()`, Normalisierung, Produktion nach Kafka; Reconnect + Resync (Liste/Messages + `server.connected`)
   - **Question-Router**: Permission-/Form-/Elicitation-Events → Postgres-Inbox → Kafka `sessions.questions` → WebSocket-Push
   - **Reply-Service**: Frontend-Antworten → Worker-Endpoints (`permission/…/reply`, `form/{formID}/reply`, Form-Cancel)
   - **Import-Service**: Quelle (Server-URL+Auth) → Sessions listen (Cursor) → export → `import` auf Ziel-Worker → Registry-Eintrag
   - **MCP-Registrar**: `PUT /api/experimental/mcp/{server}` pro Worker/Location; registriert den bestehenden MCP-Service
   - **Interne LLM-Aufgaben** (optional): One-Shot-Generate (`/api/experimental/generate/text`) gegen eine dedizierte Utility-OpenCode-Instanz
3. **Kafka** (single instance, KRaft): Topics `opencode.events` (key=sessionID, Retention ~7d, Replay), `sessions.questions`, `sessions.answers` (Audit), `sessions.state` (compacted), `dispatch.commands`. Consumer-Gruppen: Frontend-Push (Backend), Audit, State-Projektion.
4. **Frontend** (React): Dashboard (Session-Kacheln, Worker-Health), Session-Detail (Timeline/Messages/Tool-Calls via Backend), Inbox (Frage-Warteschlange mit Antwort-Formularen), Import-Wizard, Admin (User, Worker, Fragen-Audit).
5. **Postgres**: `users`, `workers`, `sessions` (session_id→worker_id, owner, state, project, imported_from), `questions` (type, payload, status, reply, Timestamps), `import_jobs`, Audit.
6. **Bestehender MCP-Service**: Deployment mit Streamable-HTTP-Endpoint, Header-Auth; nutzt `ai.opencode/sessionID` für pro-Session Sandbox-Affinität; provisioniert Agent-Sandboxes (WarmPools) für Subagent-Code-Execution; Aufräum-Job bei Session-Ende.

## 6. Kern-Flows

**Session-Lifecycle:** Frontend legt Task an → Dispatcher wählt Worker (Kapazität/Projekt-Affinität) → `session.create` → MCP-Registrar verdrahtet → `session.prompt` → Events fließen via Bridge/Kafka zurück ins Frontend.

**Frage-Flow (Herzstück):** Session stößt auf Permission-Ask/Form/Elicitation → blockiert → Event → Bridge → Question-Router → Postgres + Kafka → WebSocket → Nutzer antwortet im Frontend → Reply-Service → Worker-Reply-Endpoint → Session läuft weiter.

**Import:** Admin authentifiziert Quell-Instanz → Session-Liste (Cursor) → pro Session `export` → `import` auf Ziel-Worker → Registry + UI.

**Subagent-Sandbox-Flow:** Subagent ruft MCP-Tool → MCP-Service sieht `sessionID` im `_meta` → Sandbox aus Pool (WarmPool) → Ausführung → Resultat → Session-Ende signalisiert Aufräum-Job.

## 7. Abstimmungs-Entscheidungen (2026-10-27, partner bestätigt)

| Entscheidung | Antwort | Konsequenz |
|---|---|---|
| Skalierung Phase 1 | **Klein**: ≤5 Worker, ≤20 Sessions, ≤10 Nutzer | 1 Backend-Replica; SSE-Bridges in einem Prozess; Dedup einfach |
| Tenancy / Credentials | **Multi-User soft** | Geteilte Worker; per-User-LLM-Credentials via llmgateway Virtual keys (LiteLLM/Bifrost), NICHT workerweit |
| Session-Durability | **Pod-Restart ja, Node-Verlust akzeptabel** | Worker als StatefulSet + PVC/SQLite; Registry markiert Sessions bei Worker-Verlust als `lost` |
| Import-Quellen | **Admin-only**, einmalige Migration | Kein Egress auf beliebige Endpoints, keine Fremd-Credential-Vaulting |
| Fragen-Lifecycle (mein Call) | Kein hartes Timeout; Owner + Admins antworten; Cancel immer; Reminder konfigurierbar | questions.status: `pending→answered|cancelled` |
| Deployment (mein Call) | Ein K8s-Cluster, co-located, NetworkPolicy „nur Backend ↔ Worker" | simpelstes Netzmodell |
| OIDC-Provider (mein Call) | **Authentik** (bestehende Instanz, `authentik-setup`) | JWT-Bearer-Validierung im Backend via JWKS; PKCE-Login im Frontend |
| Postgres (mein Call) | **CNPG** (CloudNativePG, bestehendes Modul `terraform-k8s-cnpg`) | Postgres als K8s-CRD-Cluster im gleichen Cluster |

## 8. Analyse: `gthieleb/sandbox-mcp-operator` (der bestehende MCP-Service)

**Stand (aus Repo-Analyse):** Weit fleet-fertig. Zwei Modi: Host (stdio) + **Operator Mode (streamable-http `/mcp`)**. Go-Operator mit `SandboxMCP`-CRD (`mcps.sandbox.gthieleb.dev/v1alpha1`): reconciled Deployment + Service + optional Ingress + SA/RBAC + NetworkPolicy, `status.endpoint` = fertige Remote-MCP-URL. 6 Tools (`sandbox_run_command/write_file/read_file/list_files/session_info/cleanup`), WarmPool-Claims, gVisor-RuntimeClass, Bearer-Token-Auth via Secret (`MCP_AUTH_TOKEN`), In-cluster-SDK-Modus. OpenCode-Wiring (remote + headers) bereits in `examples/opencode.json.example`. Tests offline + live-smoke vorhanden.

**Lücken für Fleet-Integration:**
1. **Affinität pro Server-Lifetime, nicht pro OpenCode-Session** („one sandbox pod per server lifetime", `replicas: N` = N eigene Sandboxes) → Phase 1: **1× `SandboxMCP` pro Worker** (per-Worker-Sandbox; Backend provisioniert CR je Worker). Phase 2: `_meta["ai.opencode/sessionID"]`-basiertes Multi-Sandbox-Mapping in der Bridge.
2. **Kein Auto-Cleanup bei Session-/Worker-Ende** (`sandbox_cleanup` ist Agent-Tool) → Backend löst Worker-Stilllegung über CR-Delete; Idle-Reaper für Sandboxes als Operator-Erweiterung (Phase 2).
3. Deployment create-only bei `spec.http.auth`-Änderung → Rotation = rollout restart; im Plan berücksichtigen.

## 9. Ökosystem-Integration (bestehende gthieleb-Repos)

| Repo | Rolle in agent-fleet |
|---|---|
| `sandbox-mcp-operator` | Remote-MCP-Backend je Worker; Backend legt `SandboxMCP`-CRs an und registriert Endpoints per `PUT /api/experimental/mcp/{server}` |
| `agent-sandbox-lab` | Vorlage für E2E: Terraform + kubectl-Provider, vendored controller_stack, gVisor-Node-Image, ingress-nginx, SandboxWarmPool/Template |
| `llmgateway-setup` (LiteLLM/Bifrost/Kong + agentgateway) | LLM-Egress der Worker: OpenCode-Provider = OpenAI-kompatibler Gateway-Endpoint; **per-User virtual keys** (Multi-User soft); agentgateway optional als MCP-Policy-Plane |
| `authentik-setup` | OIDC-IdP: Client für agent-fleet, JWKS-Endpoint, Rollen-Claims |
| `terraform-k8s-cnpg` | Postgres-Cluster (CNPG) für Registry/Inbox |
| `agent-skills` (OpenCode Skills) + `sandbox-policy.md` | Instructions/Skills im Worker-Image mountbar |
| `opencode-mcp`, `mcp-media`, weitere MCP-Server | Später per MCP-Registrar registrierbar (dieselbe `PUT`-Mechanik) |

## 10. Änderungen nach Partner-Review (2026-10-27, verbindlich)

1. **Kafka via Strimzi-Operator** statt Bitnami-Chart: `Kafka`-CR (KRaft, single-node) + `KafkaTopic`-CRDs (4 Topics, state compacted) — K8s-nativere Lifecycle-Verwaltung, passt zur CNPG-Philosophie (CRD statt StatefulSet-Pflege).
2. **Frontend: SvelteKit 2 + Svelte 5** (SPA via adapter-static) statt React — Partner-Präferenz.
3. **Harness-Entkopplung:** `HarnessClient`-Schnittstelle im Backend. `harness-opencode` = erste Implementierung (Events: SSE → HarnessEvents; Fragen: Permission/Form/Elicitation; Replies: permission-/form-Reply-Endpoints). Später: `harness-deepagents` (LangChain DeepAgents: LangGraph-Interrupts als Question-Quelle) ohne Änderung an Dispatcher/Question-Router/Reply-Service/Kafka — nur Registry-Eintrag + Capability-Flags. OpenCode-spezifisch bleibt NUR: MCP-Registrierung + Session-Import (optionale Capabilities).
4. CNPG bestätigt (bereits §7) — Postgres-Cluster als CRD im Zielcluster.

## 11. Offene Punkte für den Builder (bewusst offen gelassen)

- Worker-Kapazitätsmodell & Scheduling-Algorithmus
- Frontend-Komponentenstruktur & Design-System
- Kafka-Consumer-Konfiguration, DLQ-Strategie, Event-Schema-Versionierung
- Observability: Metrik-Namen, Dashboards, Tracing
- OpenCode-**Minor**-Upgrade-Strategie innerhalb 2.x (2.2.0 pinnen, experimental Endpoints beobachten)
- Teststrategie (Integrationstests gegen echtes `opencode serve`, pglite für DB-Unit-Tests, E2E in kind)
- gVisor-Node-Image & Sandbox-Reaper im Operator (Phase 2)
- Repo-Setup ist **gelegt**: CI/CD (GitHub Actions, docker + OCI-Helm) + pre-commit (gitleaks, biome, yamllint, tflint) ab Day 1 — siehe G10