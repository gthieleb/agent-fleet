# Session Handoff — agent-fleet

> Erstellt: 2026-10-30 · Für neue Session/Kontext. Dieses File ist der Ankerpunkt: hier weitermachen, ohne den bisherigen Verlauf neu lesen zu müssen.

## 1. Was ist das Projekt?

`gthieleb/agent-fleet` — Multi-Session-Control-Plane für OpenCode-Agent-Fleets:
- Verteilte OpenCode-2.x-Worker (`opencode serve`, StatefulSet+PVC) ← Harness #1 (austauschbar gegen LangChain-DeepAgents via `harness-core`-Interface)
- Zentrales Control-Plane-Backend (Bun/Hono): Dispatcher, Event-Bridge, Question-Router, Reply-Service, MCP-Registrar, Import
- **Strimzi-Kafka** (KRaft single-node) als Event-Backbone, Topics: `agent-fleet.{events,questions,answers,state}`
- **CNPG**-Postgres für Registry/Inbox (Workers behalten eigenes SQLite auf PVC)
- **SvelteKit 2 + Svelte 5** Frontend (SPA, adapter-static)
- Auth: **Authentik-OIDC** (JWKS im Backend), `DEV_TOKEN`-Bypass für Tests/E2E
- E2E: Terraform + kind + **podman** + ingress-nginx
- Bestehender `sandbox-mcp-operator` wird per `SandboxMCP`-CR je Worker provisioniert & via experimental-MCP-API registriert

## 2. Dokumente (Pfade)

| Datei | Pfad |
|---|---|
| **Plan (verbindlich)** | `~/agent-fleet/docs/superpowers/plans/2026-10-27-agent-fleet-plan.md` (auch `~/.opencode/plan/`) |
| **Design-Spec** | `~/agent-fleet/docs/superpowers/specs/2026-10-27-agent-fleet-platform-design.md` |
| **SDD-Ledger** (Fortschritt+Rulings) | `~/agent-fleet/.superpowers/sdd/2026-10-27-agent-fleet-plan/progress.md` (git-ignored!) |
| **Repo** | `/home/gun/projects/agent-fleet` (= `~/agent-fleet`), remote `https://github.com/gthieleb/agent-fleet`, Branch `main` |

> **Wichtig:** Kopien von Plan/Spec liegen in `docs/superpowers/` IM Repo (mitgepusht) UND in `~/.opencode/plan/` (local). Edits im Repo vornehmen (wird mitcommitted); `~/.opencode/plan/` nur lesend.

## 3. Fortschritt (was schon committed + CI-grün ist)

| Task | Inhalt | Commit(s) | Tests |
|---|---|---|---|
| **0** | Repo-Anlage, draw.io-Architekturdiagramm (PNG+Original, Farb-Semantik: blau=Monorepo/rot=extern/grau=Plattform), README(About/Referenzen/ADRs), drawio-Skill aktualisiert | `394d231` | Vision-Abnahme SHIP (Iteration 5) |
| **1** | Monorepo-Scaffold, pre-commit (gitleaks/pre-commit-hooks/yamllint/biome/tflint), Makefile | `81f10a3` | hängt |
| **2** | Worker-Image (`apps/worker/`, offizielles `ghcr.io/anomalyco/opencode:2.2.0`, non-root, smoke.sh) | `ffe3edb` | smoke SKIPPED lokal (kein podman) |
| **3** | Worker-Helm-Chart (StatefulSet+PVC+Secret+NetworkPolicy) + `ci.yml`/`docker-publish.yml`/`helm-publish.yml` | `d16b325`, `34d7220` | helm/kubeconform/actionlint, **CI+Publish grün** |
| **4** | `fleet-schema`: TOPICS, FleetEventSchema, drizzle (workers/sessions/questions/import_jobs/users), Migration 0000 | `2e665dc`, `132f6e9` | 6 Tests, pglite |
| **4b** | `harness-core`: HarnessClient-Interface, Capabilities-Flags, Registry (registerHarness/harnessFor, default opencode) | `df34261` | 7 Tests |
| **5** | Backend-Gerüst: Hono, config-loader, jose-JWKS (Authentik), requireAuth, Fehler-Envelope | `2cae711` | 7 Tests |

**Gesamt: 20 Unit-/Integrationstests grün, CI-Lauf grün.** Latest commit `2cae711`.

## 4. Umgebung / Tooling (bereits eingerichtet, ohne sudo)

- Shell-PATH ergänzt: `$HOME/.bun/bin` (bun 1.4.4) und `$HOME/.local/bin` (helm 4.3.1, kubeconform 0.8.0, actionlint 1.7.12, pre-commit 4.7, yamllint 1.38). In **neuer Session** ggf. `export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"` machen (steht auch in `~/.bashrc`).
- Bun via Release-Zip (kein `unzip` vorhanden, python `zipfile` genutzt); pre-commit/yamllint via `uv tool install` mit `UV_NO_CONFIG=1` (uv-Config hat inkompatibles `virtualenv`-Feld).
- Bun-Global-Cache: `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0` nur im Container relevant.

## 5. Blocker & offene Punkte (WICHTIG)

1. **KEIN podman/docker/kind auf dem Host** → E2E (Task 18/19) lokal nicht fahrbar. CI-Runner haben Container-Runtime → Pipelines laufen. Falls podman installiert wird (`apt install podman` oder rootless), lokale E2E-Validierung möglich.
2. **Kein `playwright`-MCP in der Session aktiv** (Config `enabled: false`) → nur relevant für Task 17b; User muss togglen. Task 17c (`@playwright/test`) braucht das MCP NICHT.
3. **Ollama-Monatslimit** (general-Subagenten) war offen — aktuelle Verfügbarkeit prüfen; sonst native Ausführung (wie Tasks 2–5 erfolgreich).
4. **Playwright im Host-Browser** (nur draw.io-Rendering, nicht Tests): User-space-Libs + Fonts unter `/tmp/opencode/render/libs` (`LD_LIBRARY_PATH` + `FONTCONFIG_FILE=/tmp/opencode/render/fonts.conf`), Chromium-headless-shell in `~/.cache/ms-playwright/`.

## 6. PENDING-ENTSCHEIDUNGEN (vom User, siehe letzte Konversation)

**A) Playwright/E2E-Strategie — GELÖST (2026-10-30, drei Stränge):**
1. **17b — Playwright-MCP „Erfahrungen sammeln"**: interaktive UI-Sichtabnahme + Screenshots (DEV_TOKEN). Braucht `playwright`-MCP aktiv. **Nicht CI-fähig.**
2. **17c — Frontend-E2E für die Pipeline via `@playwright/test`**: headless, deterministisch, GitHub-Actions (Artifact + `daun/playwright-report-summary`). Das ist die Runner-Library, NICHT das MCP.
3. **19 — API-E2E-Smoke (Bun-Script)**: Backend-Flow deterministisch in kind/podman.

**WICHTIG für die neue Session:** `playwright`-MCP ist in `~/.config/opencode/opencode.jsonc` **`enabled: false`**. MCP-First: **NIEMALS selbst aktivieren**, NIEMALS mit eigenen Skripten umgehen — User bitten, `/mcps` → `playwright` zu aktivieren (nur für 17b). Für 17c hingegen ist `@playwright/test` das richtige Pipeline-Werkzeug (MCP wäre dafür das falsche Tool).

**B) TDD-Design pro Einzelpunkt — GELÖST:**
Striktes Test-First für jeden einzelnen Punkt ist verpflichtend im Plan verankert (Header + Global Constraints Zeile 1). Neue Session beginnt jeden Task nach superpowers:test-driven-development: Test zuerst → rot sehen → minimaler Code → grün → Suite grün → refactor. Keine Ausnahme ohne User-Freigabe.

## 7. Nächster Schritt (sofern User nicht umordnet)

**Task 6 — Worker-Registry + OpenCode-Harness:**
- `harness-opencode` Package implementieren (`OpencodeHarness implements HarnessClient`): `makeClient` aus `@opencode/client@2.2.x` (Basic auth `opencode:<password>`), Password via `@kubernetes/client-node` (readNamespacedSecret) mit `WORKER_PASSWORDS_JSON`-Fallback; Capability-Flags (`supportsMcpRegistration/import/queue` = true); `healthCheck()` = `server.info()` mit Version-Major-Assert `2`.
- `registerWorker/getWorker/listWorkers` (drizzle-Upsert, default `harnessKind:"opencode"`).
- `startHealthLoop(intervalMs=10000)`: healthCheck → `healthy`, V1-Version → `rejected`, 3× Fehler → `down`.
- Tests: (a) registry roundtrip (pglite), (b) health-loop mock: v2→healthy, v1→rejected, 3×reject→down.

Danach: Task 7 (Session-Dispatcher) → 8 (Event-Bridge→Kafka) → 9 (Question-Router) → 10 (Reply-Service) → 11 (MCP-Registrar/SandboxMCP) → 12 (Import) → 13 (Backend-Chart) → 14–17 (SvelteKit-Frontend + Chart) → [17b Playwright?] → 18 (Terraform kind/podman) → 19 (E2E-Smoke).

## 8. Wichtige Rulings (Kurzform; Details im Ledger)

- **`edit_diagram` expandiert Named Styles NICHT** → draw.io-Boxen farblos; immer voll expandierte Inline-Styles nutzen.
- **Headless-Chromium ohne System-Fonts rendert KEINEN Text** → user-space fontconfig + DejaVu nötig (draw.io-Export).
- **Vision-Ergebnisse nie ungeprüft übernehmen** — mehrfach Platzhalter-/Farb-/Kanten-Halluzinationen; deterministische Pixel-Checks vor jedem Vision-Lauf.
- **bun `expect().rejects` versteht Drizzle-Thenables nicht** → try/catch.
- **pre-commit `biome --write`** formatiert gestagte Dateien → Commit-Abbruch; Hooks manuell bis 0 Modifikationen.
- **check-yaml/yamllint schließen Helm-Templates aus** (Go-Templates kein YAML).
- **gitleaks-Hook baut per Go** im Hintergrund (langsam, ok).
- **Push auf `main` = Publish-Side-Effect** (docker/helm-publish) — bewusst.
- CI brauchte `bun install --frozen-lockfile` (fehlte anfangs).

## 9. Kommunikations-Checkpoints

Nach jedem Task: Commit + Push + ggf. 📡-Update mit Done/Verified/Next/Blockers. GitHub-Commits sind der Primärkanal.

---
**Kopiertes Plan/History-Files**: die aktuelle vollständige Plan-Datei liegt im Repo `docs/superpowers/plans/` und in `~/.opencode/plan/`; der genaue fortgeschriebene State ist das SDD-Ledger `~/.superpowers/sdd/.../progress.md`.
