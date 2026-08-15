# Architectural Deep-Dive & Decision Guide (`explain.md`)

This document prepares you for technical interviews and architecture walkthroughs of the AI Agent Workflow Builder. It details the key architectural choices, security layers, state machine patterns, and resilience mechanisms.

---

## 1. The Two Permission Layers

### **Layer 1: Hasura Row-Level Security (RLS)**
- **What it is**: Declarative database-level filtering defined in Hasura table metadata (`nhost/metadata/databases/default/tables/public_*.yaml`).
- **How it works**: Every GraphQL query or standard mutation evaluates session variables (`X-Hasura-User-Id`, `X-Hasura-Role`). Table filters chain through relationship trees, e.g.:
  `workflow.organization.org_members.user_id._eq: X-Hasura-User-Id`
- **Where it lives**: `nhost/metadata/databases/default/tables/`

### **Layer 2: In-Handler Authorization**
- **What it is**: Imperative business logic checks executed inside custom Hasura Action handlers (`triggerWorkflowRun` and `approveStep`).
- **Why Layer 1 is not enough**: Hasura RLS governs row access on standard table CRUD, but custom GraphQL Actions run with elevated privileges or execute multi-step workflows. A viewer might pass Layer 1 row select filters, but mid-execution actions (like approving a paused step or triggering a workflow run) require fine-grained role evaluation (`owner`/`editor` vs `viewer`) enforced directly inside the handler logic before performing state transitions.
- **Where it lives**: [functions/trigger-workflow-run.ts](file:///d:/Vocallabs/functions/trigger-workflow-run.ts) and [functions/approve-step.ts](file:///d:/Vocallabs/functions/approve-step.ts) via `verifyUserRole()`.

---

## 2. Action Handler & Pause/Resume Mechanics

The workflow execution engine is built as an explicit state machine:
- **`triggerWorkflowRun`**:
  1. Validates org membership & quota limits.
  2. Creates a `workflow_run` (status: `running`).
  3. Sequentially executes steps (`llm_call`, `http_request`, `conditional_branch`, `notify`, `db_write`).
  4. When an `approval_gate` step is encountered, it sets `step_run.status = 'paused'` and `workflow_run.status = 'paused'`, breaking the execution loop.

- **`approveStep`**:
  1. Receives `step_run_id`.
  2. Evaluates Layer 2 authorization (caller MUST be `owner` or `editor` in the step's org).
  3. Updates `step_run` status to `completed` and records `approved_by` & `approved_at`.
  4. Resumes `workflow_run` status to `running` and executes all remaining steps to completion.

---

## 3. Retry Logic & External Call Safety

- **Where it lives**: `functions/trigger-workflow-run.ts` and `functions/_shared.ts`.
- **Why it is necessary**:
  - LLM providers (e.g., Groq, OpenRouter) and external HTTP APIs can experience transient network glitches or rate limits (e.g., Groq 429 rate limits).
  - The step execution engine catches failures, increments `attempt_count`, and retries the call once before failing the step run.

---

## 4. Cross-Org Isolation & ID-Guessing Resistance

- **How queries are scoped**: Queries never accept an unvalidated `org_id` parameter from the client. All queries filter through the authenticated user's session relationship `org_members`.
- **ID-Guessing Defense**: If a malicious user in Org B attempts a direct GraphQL query using a known Org A `workflow_id` or `run_id`, Hasura's RLS engine evaluates `organization.org_members.user_id = X-Hasura-User-Id`. Since Org B user is not in Org A's `org_members`, the query yields an empty result set (`null` / `{}`), strictly preventing cross-tenant data leakage.

---

## 5. Live Updates & Real-Time Streaming

- **Mechanism**: The frontend utilizes GraphQL Subscriptions (over WebSockets) listening to the `step_runs` table filtered by `workflow_run_id`.
- **Why no polling**: Each step state update (e.g., `running` -> `completed` or `paused`) is pushed instantly over the WebSocket connection, allowing the UI to stream live progress and present approval controls the exact millisecond an `approval_gate` is reached.

---

## 6. Appendix: Important Files Directory

| File Path | Description |
|---|---|
| [BUILD_PLAN.md](file:///d:/Vocallabs/BUILD_PLAN.md) | Original execution blueprint & rule constraints |
| [PROGRESS.md](file:///d:/Vocallabs/PROGRESS.md) | Phase-by-phase evidence & execution progress log |
| [README.md](file:///d:/Vocallabs/README.md) | System architecture overview & local run setup |
| [explain.md](file:///d:/Vocallabs/explain.md) | Interview preparation and technical rationale |
| [nhost/migrations/default/1700000000000_init_schema/up.sql](file:///d:/Vocallabs/nhost/migrations/default/1700000000000_init_schema/up.sql) | PostgreSQL database schema migration |
| [nhost/metadata/actions.yaml](file:///d:/Vocallabs/nhost/metadata/actions.yaml) | Hasura Custom Actions metadata definitions |
| [functions/trigger-workflow-run.ts](file:///d:/Vocallabs/functions/trigger-workflow-run.ts) | Nhost Action handler for executing workflows |
| [functions/approve-step.ts](file:///d:/Vocallabs/functions/approve-step.ts) | Nhost Action handler for step approval & resumption |
| [functions/webhook-trigger.ts](file:///d:/Vocallabs/functions/webhook-trigger.ts) | Webhook trigger handler endpoint |
| [frontend/src/app/page.tsx](file:///d:/Vocallabs/frontend/src/app/page.tsx) | Next.js interactive dashboard & multi-tenant persona tester |
