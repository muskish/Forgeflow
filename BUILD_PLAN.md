# AI Agent Workflow Builder — Build Plan for Antigravity

## Execution rule — read this first
**Do not run any terminal command on your own.** For every command you
would normally run (`nhost init`, `nhost up`, migrations, `git commit`,
package installs, etc.), instead print the exact command and ask the human
to run it and paste back the output. Do not proceed to interpret a result
you didn't actually see — wait for the pasted output. This rule stays in
effect until the human explicitly says you're allowed to run terminal
commands yourself. This overrides any other instruction in this file that
implies running something directly.

## How to use this file
Work through the phases **in order**. Do not move to the next phase until the
"Definition of Done" for the current phase is fully met — this assignment is
graded as one integrated scenario, not a checklist, so a shortcut in an early
phase (e.g. sloppy Hasura permissions) will silently break the final scenario
in Phase 7.

After finishing each phase: propose a commit message like
`phase-2: hasura permissions (org+role scoping)` (but don't run `git commit`
yourself — see Execution rule above), and write a short note in
`PROGRESS.md` (create it) saying what's done, what's stubbed, and any open
questions.

**Evidence, not assertions:** a "Definition of Done" is not met just because
you believe the code should work. For each Definition of Done, paste the
actual command output / query result / test result into `PROGRESS.md` as
evidence. A checkmark with no evidence attached means the phase isn't done.

**Never weaken a check to make something pass.** If a permission check (Layer
1 or Layer 2) is causing the final scenario to fail, that is a real bug to
fix elsewhere — never loosen, remove, or bypass the check itself just to get
the demo working. If you're tempted to do this, stop and flag it instead
(see below).

If you get stuck on something for more than ~30 min of real effort, stop,
write down exactly what's failing and what you tried, and flag it instead of
guessing further — that note is what gets escalated.

Original assignment is in `ASSIGNMENT.md` (copy the full brief there) — treat
it as the source of truth if anything here is ambiguous.

---

## Phase 0 — Project setup
- Init nhost project locally (`nhost init`), Postgres + Hasura running.
- Init Next.js (App Router) frontend in `/frontend`, TypeScript.
- Set up a GitHub repo, `.env.example` with every required var (LLM API key,
  nhost project vars, webhook secret, etc.) — never commit real secrets.
- Decide and document (in README) which LLM you're using for `llm_call`
  (Groq/OpenRouter/Gemini free tier) — if none available, implement a
  stubbed call with a disclosed artificial delay (e.g. `setTimeout` +
  a comment explaining it's stubbed) rather than silently faking success.
- **Webhook/event-trigger reachability — no ngrok**: we're not using ngrok
  or any local tunnel. Hasura Event Triggers and scheduled functions need a
  publicly reachable URL to call back into, so instead: do a bare-bones
  Vercel deploy *early* (right after Phase 0 setup or by end of Phase 3, not
  saved for Phase 8), and test the non-manual trigger in Phase 5 against
  that live Vercel URL instead of localhost. Note this explicitly in the
  README so it's clear why the deploy happens earlier than the Phase 8
  deliverable list implies.
- **Free-tier gotchas to note in README now** (so nobody's surprised later):
  nhost's free Starter project pauses after a week of inactivity and needs
  reactivating before a demo/recording; Groq's free tier is rate-limited
  (~30 requests/min) — don't loop `llm_call` retries tightly in testing or
  you'll hit 429s mid-demo.

**Definition of done:** `nhost up` runs clean, Hasura console loads, Next.js
app boots and can hit a trivial Hasura query. (Human runs these commands and
pastes output per the Execution rule.)

---

## Phase 1 — Schema & migrations
Create tables (names flexible, relationships are not):
- `organizations` (id, name, quota_limit, quota_used, quota_period_start)
- `org_members` (user_id, org_id, role: owner|editor|viewer)
- `workflows` (id, org_id, name, ...)
- `workflow_steps` (id, workflow_id, order, type, config jsonb)
- `workflow_triggers` (id, workflow_id, trigger_type, config jsonb)
- `workflow_runs` (id, workflow_id, status incl. `paused`, started_at, ended_at)
- `step_runs` (id, workflow_run_id, step_id, status, input jsonb, output jsonb,
  error, attempt_count, approved_by, approved_at)

Add FKs for every relationship in the brief: org → members → workflows →
steps/triggers, workflow → runs → step_runs.

Add one aggregation: a Postgres view or computed field for org-level usage
this month, or average run duration. Pick whichever is less code; document
which one and why in the write-up later.

**Definition of done:** migrations apply cleanly from scratch
(`nhost up` on a fresh DB), all tables show up in Hasura console with
relationships tracked (object + array relationships both directions).
Paste the migration output and a screenshot/description of the tracked
relationships into `PROGRESS.md`.

---

## Phase 2 — Hasura permissions, Layer 1 (org + role scoping)
This is the layer most likely to be graded harshly — get it right before
moving on.

For every table, permissions must filter by the caller's `org_id` via
`org_members` (using Hasura's session variable / relationship-based
permission, e.g. `org_members.user_id._eq: X-Hasura-User-Id` chained through
the relationship), **not** just role. An editor in Org A must never be able
to see or touch Org B's rows even though they share a role name.

Role matrix:
- `owner`: full CRUD on workflows/steps/triggers, manage org_members
- `editor`: create/edit workflows + steps, can insert `workflow_runs`
  (i.e. trigger runs), cannot manage org_members
- `viewer`: select-only, cannot insert into `workflow_runs`

**Definition of done:** manually test in Hasura console with two fake users
in two different orgs, same role — confirm cross-org reads/writes are
rejected, not just filtered to empty results (there's a difference; empty
result on a permitted-but-scoped query is correct, an error on a genuinely
forbidden mutation is also fine — just don't let it silently succeed
cross-org). Paste the actual query/mutation and its result for each test
case into `PROGRESS.md` — not a summary claiming it works.

---

## Phase 3 — GraphQL operations
- Query: org's workflows with steps, triggers, and most recent run status
  (nested query using the relationships from Phase 1).
- Mutation: create/edit a workflow + its steps + triggers (can be one
  mutation with nested inserts, or a few chained ones from the frontend).
- Mutation: `approveStep` — this is actually a Hasura **Action**, not a
  plain mutation, because it needs to check the approver's role before
  resuming (see Phase 4).
- Subscription: on `step_runs`, filtered by `workflow_run_id`, for live
  status including a "paused, awaiting approval" state.

**Definition of done:** test each in the GraphiQL/Hasura console before
wiring to frontend. Paste each query/mutation/subscription and its result
into `PROGRESS.md`.

---

## Phase 4 — The Action handler (core of the assignment)
Two Hasura Actions, backed by handler functions (nhost Functions or your
own backend, whichever is faster — document the choice):

### `triggerWorkflowRun(workflow_id)`
1. Verify caller is owner/editor in the workflow's org (re-check here, don't
   rely solely on Hasura row permissions, since this is a custom business
   action).
2. Check org quota isn't exhausted — reject if so.
3. Create `workflow_run` (status: running).
4. Execute steps in order:
   - `llm_call`: real API call (or stub) — retry once on failure, record
     `attempt_count`.
   - `http_request`: generic external call — same retry logic.
   - `db_write`: write result into your own tables.
   - `conditional_branch`: branch based on **the actual previous step's
     output**, not a hardcoded/stubbed value. This is a hard requirement,
     not a nice-to-have — a demo where the branch outcome doesn't change
     when the LLM's output changes fails the Final Task even if everything
     else works.
   - `notify`: fire as an Event Trigger (see Phase 5), not inline.
   - `approval_gate`: set `workflow_run.status = paused`, stop execution
     here. Do not advance further steps.
5. Update `step_runs` / `workflow_run` status after every step so the
   subscription reflects it live (don't batch updates to the end).
6. On completion, increment org quota usage.

### `approveStep(step_run_id)`
1. Look up the org for this step_run.
2. Check the caller is owner/editor in that org — **this check must live in
   the handler**, not just in Hasura permissions, since it's a mid-execution
   decision (per the brief).
3. If authorized: mark step approved (`approved_by`, `approved_at`), resume
   execution from the next step, continuing the same status-update pattern.
4. If not authorized: return a clear error, do not resume.

**Definition of done:**
- Trigger a run via GraphiQL, watch step_runs update row by row via a
  subscription open in another tab, hit an approval_gate, confirm it
  pauses, call `approveStep` as a viewer (should fail) then as an editor
  (should resume and finish).
- Specifically test `conditional_branch` with two different LLM outputs and
  confirm the branch taken actually differs. Paste both runs' outputs and
  which branch each took into `PROGRESS.md`.
- Paste the actual subscription output stream (or a description of what
  updated in what order) into `PROGRESS.md`, not just "it worked."

---

## Phase 5 — Triggers beyond manual
Implement manual (just an Action call from frontend) plus **at least one**
of:
- **Webhook**: the `triggerWorkflowRun` Action itself, called by an external
  HTTP request with some auth (e.g. a shared secret per workflow) — this
  satisfies "webhook trigger" if documented clearly as such.
- **Scheduled**: nhost/Hasura scheduled function on a cron, calling
  `triggerWorkflowRun` for workflows with a `scheduled` trigger type.
- **Database event**: Hasura Event Trigger on a watched table's insert/update,
  calling a function that starts a run.

Also implement `notify` as an Event Trigger (per the brief) — a row write
(e.g. to a `notifications` table) fires a Hasura Event Trigger that calls
Slack webhook or sends an email.

**Definition of done:** one non-manual trigger actually starts a run without
a button click, provably (e.g. curl the webhook against the deployed Vercel
URL, or wait for the cron, or insert a row and watch a run appear). Local
Hasura can still call out to the deployed Vercel endpoint fine — only the
reverse (something external reaching your local machine) needed a tunnel,
which is why deploying early avoids the ngrok requirement entirely. Paste
the curl command/output or equivalent proof into `PROGRESS.md`.

---

## Phase 6 — Frontend
- Auth via nhost (sign up/sign in, org context — assume a user can belong to
  one org for simplicity unless multi-org is trivial with your auth setup).
- Workflow builder screen: add/reorder steps of different types (a simple
  ordered list with a type dropdown + JSON config textarea is fine — this
  doesn't need to be a drag-and-drop canvas), attach a trigger.
- Run button (hidden for viewers), live per-step status via subscription,
  with a visible pause/approve UI when a step is `paused`.
- Usage/quota indicator (calls used / allowed).

**Definition of done:** you can, in the browser, build a workflow, run it,
watch it update live, hit a pause, approve it, watch it finish — with no
manual refresh.

---

## Phase 7 — Final scenario (this is what's actually graded)
Reproduce, live, and record:
1. Two orgs, each with their own users/roles.
2. Org A owner builds a workflow: ≥3 step types incl. `llm_call`,
   `http_request`, and a `conditional_branch` that changes behavior based on
   the LLM's actual output (not a hardcoded branch).
3. Start it two ways: manually, and via the webhook/scheduled/event trigger
   you built.
4. Include an `approval_gate` — run pauses, only an owner/editor in that org
   can approve it forward (test that a viewer, and a user from Org B,
   cannot).
5. Live status streams step-by-step, no refresh, including the paused state.
6. Log in as an Org B user — prove they cannot see, trigger, or approve
   anything in Org A, **including by guessing a workflow_id/run_id directly**
   (this is worth specifically testing — try a raw GraphQL query with a
   known Org A ID while authenticated as an Org B user).

Record this as a short screen capture.

**Definition of done:** all six points hold up in one continuous take.

---

## Phase 8 — Deliverables
- GitHub repo, README: setup, how to run locally, which API keys are needed
  or that a call is stubbed (and why), plus the free-tier gotchas noted in
  Phase 0.
- Deployed Next.js app on Vercel (or similar) — must be a live URL, not just
  code.
- Hasura metadata/migrations committed, showing schema, relationships, both
  permission layers.
- ~1 page write-up: schema reasoning, how the two permission layers differ
  in enforcement (Hasura row permissions vs. in-handler checks), how
  approval-gate pause/resume works.
- The recording from Phase 7.

---

## Phase 8.5 — explain.md (interview prep, not a grading deliverable)
Once the codebase is real and working, produce `explain.md` — a document
meant to prepare the human for an interview question like "walk me through
what you built." Structure it **by decision, not by file** — interviewers
ask "why two permission layers instead of one," not "what does
`actions/triggerWorkflowRun.ts` do." Each section should point to the
relevant file(s), not replace them.

Sections to include:
- **The two permission layers** — what each one is, why one isn't enough,
  where each lives in code.
- **The Action handler & pause/resume** — how `triggerWorkflowRun` and
  `approveStep` coordinate through `workflow_runs.status`.
- **Retry logic** — where it lives, why `llm_call`/`http_request` need it.
- **Cross-org isolation** — how a query is scoped, and how it was tested
  against ID-guessing.
- **Live subscriptions** — how the frontend gets step-by-step updates
  without polling.
- An appendix table of important files and what each does, for quick
  reference — this comes after the decision sections, not instead of them.

Note for the human: treat this draft as a starting point, not a finished
artifact — rewriting each section in your own words before an interview is
where the actual prep value comes from, not the document itself.

---

## Notes for whoever picks this up after Antigravity
- The two most likely failure points are (a) Layer 1 permissions actually
  scoping by org, not just role, and (b) the Action handler doing the
  step-level authorization checks itself rather than assuming Hasura
  permissions cover it. Sanity-check both before recording the final
  scenario.
- If `conditional_branch` behavior looks hardcoded rather than genuinely
  reading the previous step's LLM output, that's a red flag worth fixing
  before submission — this is now a hard Definition-of-Done item in Phase 4,
  not just a closing note.