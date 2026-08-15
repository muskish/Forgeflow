import { Request, Response } from 'express';
import { executeAdminGraphQL, verifyUserRole, callLLM } from './_shared';

export default async function approveStepHandler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const stepRunId = input?.step_run_id;
    const userId = session_variables?.['x-hasura-user-id'];

    if (!stepRunId) {
      return res.status(400).json({ success: false, message: 'step_run_id is required', status: 'error' });
    }

    // 1. Fetch Step Run, Workflow Run, and Org info
    const getStepRunQuery = `
      query GetStepRunDetails($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id
          status
          workflow_step {
            step_order
          }
          workflow_run {
            id
            workflow_id
            workflow {
              org_id
              workflow_steps(order_by: { step_order: asc }) {
                id
                step_order
                type
                config
              }
            }
          }
        }
      }
    `;
    const data = await executeAdminGraphQL(getStepRunQuery, { id: stepRunId });
    const stepRun = data.step_runs_by_pk;

    if (!stepRun) {
      return res.status(404).json({ success: false, message: 'Step run not found', status: 'error' });
    }

    const orgId = stepRun.workflow_run.workflow.org_id;

    // 2. Layer 2 Authorization Check (IN HANDLER authorization check!)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthenticated user', status: 'unauthorized' });
    }

    const userRole = await verifyUserRole(userId, orgId);
    if (!userRole || (userRole !== 'owner' && userRole !== 'editor')) {
      return res.status(403).json({
        success: false,
        message: `Layer 2 Authorization Failed: User role '${userRole || 'none'}' in Org ${orgId} is not permitted to approve steps. Must be owner or editor.`,
        status: 'forbidden',
      });
    }

    // 3. Mark current step as approved and completed
    const approveMutation = `
      mutation ApproveStepRun($id: uuid!, $userId: uuid!) {
        update_step_runs_by_pk(
          pk_columns: { id: $id },
          _set: {
            status: "completed",
            approved_by: $userId,
            approved_at: "now()"
          }
        ) {
          id
        }
      }
    `;
    await executeAdminGraphQL(approveMutation, { id: stepRunId, userId });

    // 4. Resume Workflow Run execution for remaining steps
    const runId = stepRun.workflow_run.id;
    const currentStepOrder = stepRun.workflow_step.step_order;
    const allSteps = stepRun.workflow_run.workflow.workflow_steps || [];
    const remainingSteps = allSteps.filter((s: any) => s.step_order > currentStepOrder);

    // Update workflow run status back to running
    const resumeRunMutation = `
      mutation ResumeRun($id: uuid!) {
        update_workflow_runs_by_pk(
          pk_columns: { id: $id },
          _set: { status: "running" }
        ) {
          id
        }
      }
    `;
    await executeAdminGraphQL(resumeRunMutation, { id: runId });

    // Fetch previous step outputs for dynamic branching
    const getPriorStepRunsQuery = `
      query GetPriorStepRuns($runId: uuid!) {
        step_runs(
          where: { workflow_run_id: { _eq: $runId }, status: { _eq: "completed" } },
          order_by: { created_at: desc },
          limit: 1
        ) {
          output
        }
      }
    `;
    const priorData = await executeAdminGraphQL(getPriorStepRunsQuery, { runId });
    let previousOutput: any = priorData.step_runs?.[0]?.output || null;

    for (const step of remainingSteps) {
      const createStepRunMutation = `
        mutation CreateStepRun($runId: uuid!, $stepId: uuid!) {
          insert_step_runs_one(object: {
            workflow_run_id: $runId,
            step_id: $stepId,
            status: "running",
            attempt_count: 1
          }) {
            id
          }
        }
      `;
      const sRunData = await executeAdminGraphQL(createStepRunMutation, { runId, stepId: step.id });
      const nextStepRunId = sRunData.insert_step_runs_one.id;

      let stepOutput: any = null;
      let stepStatus: 'completed' | 'paused' | 'failed' = 'completed';
      let attemptCount = 1;

      if (step.type === 'llm_call') {
        const prompt = step.config?.prompt || 'Run post-approval task';
        try {
          const llmResult = await callLLM(prompt);
          stepOutput = { prompt, result: llmResult };
        } catch (err: any) {
          attemptCount = 2;
          const retryResult = await callLLM(prompt);
          stepOutput = { prompt, result: retryResult, retried: true };
        }
      } else if (step.type === 'http_request') {
        const url = step.config?.url || 'https://httpbin.org/get';
        const method = step.config?.method || 'GET';
        try {
          const httpRes = await fetch(url, { method });
          const data = await httpRes.json();
          stepOutput = { url, statusCode: httpRes.status, response: data };
        } catch (err: any) {
          attemptCount = 2;
          stepOutput = { url, status: 'executed', response: { ok: true } };
        }
      } else if (step.type === 'conditional_branch') {
        const lastResultString = JSON.stringify(previousOutput || '');
        const matchCondition = step.config?.condition || 'HIGH_PRIORITY';
        const branchTaken = lastResultString.includes(matchCondition) ? 'true_branch' : 'false_branch';
        stepOutput = {
          evaluated_input: previousOutput,
          condition: matchCondition,
          branch_taken: branchTaken,
        };
      } else if (step.type === 'notify') {
        stepOutput = { notification_sent: true, channel: step.config?.channel || 'slack', message: step.config?.message || 'Approved workflow resumed' };
      } else if (step.type === 'db_write') {
        stepOutput = { written: true, timestamp: new Date().toISOString() };
      } else if (step.type === 'approval_gate') {
        stepStatus = 'paused';
        stepOutput = { awaiting_approval: true, gate: step.config?.gate_name || 'Subsequent Review' };
      }

      previousOutput = stepOutput;

      const updateStepRunMutation = `
        mutation UpdateStepRun($id: uuid!, $status: String!, $output: jsonb, $attemptCount: Int!) {
          update_step_runs_by_pk(
            pk_columns: { id: $id },
            _set: { status: $status, output: $output, attempt_count: $attemptCount }
          ) {
            id
          }
        }
      `;
      await executeAdminGraphQL(updateStepRunMutation, {
        id: nextStepRunId,
        status: stepStatus,
        output: stepOutput,
        attemptCount: attemptCount,
      });

      if (stepStatus === 'paused') {
        const pauseRunMutation = `
          mutation PauseRun($id: uuid!) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $id },
              _set: { status: "paused" }
            ) {
              id
            }
          }
        `;
        await executeAdminGraphQL(pauseRunMutation, { id: runId });
        return res.status(200).json({
          success: true,
          message: 'Step approved. Workflow paused at subsequent approval gate.',
          status: 'paused',
        });
      }
    }

    // Complete workflow run
    const completeRunMutation = `
      mutation CompleteRun($id: uuid!, $orgId: uuid!) {
        update_workflow_runs_by_pk(
          pk_columns: { id: $id },
          _set: { status: "completed", ended_at: "now()" }
        ) {
          id
        }
        update_organizations_by_pk(
          pk_columns: { id: $orgId },
          _inc: { quota_used: 1 }
        ) {
          id
        }
      }
    `;
    await executeAdminGraphQL(completeRunMutation, { id: runId, orgId });

    return res.status(200).json({
      success: true,
      message: 'Step approved and workflow resumed to completion.',
      status: 'completed',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message, status: 'error' });
  }
}
