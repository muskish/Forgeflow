# AI Agent Workflow Builder — Progress Log

## Phase 0 — Project Setup
### Status: Completed & Verified

## Phase 1 — Schema & Migrations
### Status: Completed & Verified

## Phase 2 — Hasura Permissions, Layer 1 (Org + Role Scoping)
### Status: Fully Verified with Empirical Test Evidence

### Role Matrix & Test Scenarios:
- **Org A Editor**: `user_id: 22222222-2222-2222-2222-222222222222`, `org_id: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, `role: editor`
- **Org B Editor**: `user_id: 44444444-4444-4444-4444-444444444444`, `org_id: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`, `role: editor`

### Empirical Execution Evidence:

#### Test 1: Org A Editor queries Org A workflows
*Query:*
```graphql
query { workflows { id name org_id } }
```
*Result:*
```json
{"data":{"workflows":[{"id":"c1111111-1111-1111-1111-111111111111","name":"Customer Escalation & Review Workflow","org_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}]}}
```

#### Test 2: Org B Editor attempts to read Org A workflow by ID (ID-guessing `c1111111-1111-1111-1111-111111111111`)
*Query:*
```graphql
query { workflows_by_pk(id: "c1111111-1111-1111-1111-111111111111") { id name org_id } }
```
*Result:*
```json
{"data":{"workflows_by_pk":null}}
```

#### Test 3: Org B Editor attempts cross-org mutation to update Org A's workflow
*Mutation:*
```graphql
mutation { update_workflows_by_pk(pk_columns: {id: "c1111111-1111-1111-1111-111111111111"}, _set: {name: "Hacked Workflow"}) { id name } }
```
*Result:*
```json
{"data":{"update_workflows_by_pk":null}}
```

#### Test 4: Org B Editor attempts cross-org insert into Org A (`org_id: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`)
*Mutation:*
```graphql
mutation { insert_workflows_one(object: {org_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Rogue Org B Workflow"}) { id name } }
```
*Result:*
```json
{"errors":[{"message":"check constraint of an insert/update permission has failed","extensions":{"path":"$.selectionSet.insert_workflows_one.args.object","code":"permission-error"}}]}
```

---

## Phase 3 — GraphQL Operations
### Status: Fully Verified with Empirical Test Evidence

#### Test 1: Nested Query — Org Workflows with steps, triggers, and recent run status
*Query:*
```graphql
query GetOrgWorkflowsNested {
  workflows {
    id
    name
    workflow_steps { id step_order type }
    workflow_triggers { id trigger_type }
    workflow_runs(limit: 1) { id status }
  }
}
```
*Result:*
```json
{"data":{"workflows":[{"id":"c1111111-1111-1111-1111-111111111111","name":"Customer Escalation & Review Workflow","workflow_steps":[],"workflow_triggers":[],"workflow_runs":[]}]}}
```

#### Test 2: Nested Mutation — Create Workflow with steps & triggers in a single mutation
*Mutation:*
```graphql
mutation CreateWorkflowNested {
  insert_workflows_one(object: {
    org_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Phase 3 Test Workflow",
    description: "Nested creation test",
    workflow_steps: { data: [{ step_order: 1, type: "llm_call", config: { prompt: "Summarize ticket" } }, { step_order: 2, type: "approval_gate", config: { gate_name: "Manager Signoff" } }] },
    workflow_triggers: { data: [{ trigger_type: "manual", config: {} }] }
  }) {
    id
    name
    workflow_steps { id step_order type }
    workflow_triggers { id trigger_type }
  }
}
```
*Result:*
```json
{"data":{"insert_workflows_one":{"id":"eac45e96-5d6a-4df6-8d62-d325220b34bc","name":"Phase 3 Test Workflow","workflow_steps":[{"id":"e3281b20-b45d-4b1d-99c5-8ef026719fea","step_order":1,"type":"llm_call"},{"id":"bb1903b6-d7a0-4320-9688-98492e0ef194","step_order":2,"type":"approval_gate"}],"workflow_triggers":[{"id":"e4588f7c-1024-48d9-a780-15ecc1a63cfa","trigger_type":"manual"}]}}}
```

---

## Phase 4 — The Action Handler & Approval Gate Engine
### Status: Fully Verified with Empirical Test Evidence

#### Test 1: Trigger Workflow Run Pauses at Approval Gate
*Trigger Request:*
```bash
curl -X POST http://localhost:3001/trigger-workflow-run \
  -H "Content-Type: application/json" \
  -d '{"input": {"workflow_id": "eac45e96-5d6a-4df6-8d62-d325220b34bc"}, "session_variables": {"x-hasura-user-id": "22222222-2222-2222-2222-222222222222", "x-hasura-role": "editor"}}'
```
*Result:*
```json
{"run_id":"bd032340-c333-467c-a6a3-2ad3e0313933","status":"paused"}
```

#### Test 2: Viewer Role Rejection for Step Approval (Layer 2 In-Handler Check)
*Approve Request (Viewer):*
```bash
curl -X POST http://localhost:3001/approve-step \
  -H "Content-Type: application/json" \
  -d '{"input": {"step_run_id": "a021e0eb-2e96-4ef8-a11b-4f1f6bd5d22f"}, "session_variables": {"x-hasura-user-id": "33333333-3333-3333-3333-333333333333", "x-hasura-role": "viewer"}}'
```
*Result:*
```json
{"success":false,"message":"Layer 2 Authorization Failed: User role 'viewer' in Org aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa is not permitted to approve steps. Must be owner or editor.","status":"forbidden"}
```

#### Test 3: Editor Role Authorization for Step Approval & Workflow Resumption
*Approve Request (Editor):*
```bash
curl -X POST http://localhost:3001/approve-step \
  -H "Content-Type: application/json" \
  -d '{"input": {"step_run_id": "a021e0eb-2e96-4ef8-a11b-4f1f6bd5d22f"}, "session_variables": {"x-hasura-user-id": "22222222-2222-2222-2222-222222222222", "x-hasura-role": "editor"}}'
```
*Result:*
```json
{"success":true,"message":"Step approved and workflow resumed to completion.","status":"completed"}
```

#### Test 4: Dynamic `conditional_branch` Evaluation based on Prior Step LLM Output
*Step Runs Query (Run `92026205-44cf-4b42-8ca8-19932fc9072a`):*
```graphql
query { step_runs(where: {workflow_run_id: {_eq: "92026205-44cf-4b42-8ca8-19932fc9072a"}}, order_by: {created_at: asc}) { id status output workflow_step { type step_order } } }
```
*Result:*
```json
{"data":{"step_runs":[{"id":"54d18883-6a8d-4255-af59-d03f28c7083d","status":"completed","output":{"prompt": "Classify urgency: URGENT ticket requiring immediate fix", "result": "**Urgency Classification:** **Urgent** – Immediate fix required (High‑priority ticket)."},"workflow_step":{"type":"llm_call","step_order":1}}, {"id":"75d96977-5ea6-438f-93d8-33c73f5f0c26","status":"completed","output":{"condition": "URGENT", "branch_taken": "true_branch", "evaluated_input": {"prompt": "Classify urgency: URGENT ticket requiring immediate fix", "result": "**Urgency Classification:** **Urgent** – Immediate fix required (High‑priority ticket)."}},"workflow_step":{"type":"conditional_branch","step_order":2}}, {"id":"569ce8be-8be6-456c-b9dc-c50e9a22c53e","status":"paused","output":{"gate": "Tier 3 Review", "awaiting_approval": true},"workflow_step":{"type":"approval_gate","step_order":3}}]}}
```

---

## Phase 5 — Triggers Beyond Manual
### Status: Fully Verified with Empirical Test Evidence

#### Test 1: Unauthorized Webhook Trigger Request (Invalid Shared Secret)
*Result:* `{"message":"Unauthorized webhook trigger request"}` (401 Unauthorized rejection)

#### Test 2: Authorized Webhook Trigger Request (Valid Shared Secret Starts Run)
*Result:* `{"run_id":"a93effeb-d1a0-427f-a8af-4343e047778f","status":"paused"}`

---

## Phase 6 & Phase 7 — Frontend & Final Scenario Verification
### Status: Fully Verified in Browser UI (`http://localhost:3000`)

- [x] **Multi-Tenant Persona Switching**: Tested switching between Org A Owner, Editor, Viewer, and Org B Editor personas.
- [x] **Live Step Status Stream**: Interactive step run monitor streams step progress live without full page refresh.
- [x] **Approval Gate UI**: Step approval interface allows permitted roles (Owner/Editor) to approve and resume execution, while restricting Viewers.
- [x] **Quota Indicator**: Real-time quota usage counter updates upon workflow execution.
- [x] **Cross-Org Security Tester**: Verified raw ID-guessing query rejection for Org B users.
