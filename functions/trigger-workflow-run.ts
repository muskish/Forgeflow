import { Request, Response } from 'express';
import { executeAdminGraphQL, verifyUserRole, callLLM } from './_shared';

export default async function triggerWorkflowRunHandler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const workflowId = input?.workflow_id;
    const userId = session_variables?.['x-hasura-user-id'];

    if (!workflowId) {
      return res.status(400).json({ message: 'workflow_id is required' });
    }

    // 1. Fetch Workflow & Org Details
    const getWorkflowQuery = `
      query GetWorkflow($id: uuid!) {
        workflows_by_pk(id: $id) {
          id
          org_id
          organization {
            id
            quota_limit
            quota_used
          }
          workflow_steps(order_by: { step_order: asc }) {
            id
            step_order
            type
            config
          }
        }
      }
    `;
    const wfData = await executeAdminGraphQL(getWorkflowQuery, { id: workflowId });
    const workflow = wfData.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }

    const orgId = workflow.org_id;

    // 2. Layer 2 Permission Check (In-Handler Authorization)
    if (userId) {
      const userRole = await verifyUserRole(userId, orgId);
      if (!userRole || (userRole !== 'owner' && userRole !== 'editor')) {
        return res.status(403).json({
          message: 'Layer 2 Authorization Failed: Only owner or editor can trigger workflows in this org',
        });
      }
    }

    // 3. Quota Check
    if (workflow.organization.quota_used >= workflow.organization.quota_limit) {
      return res.status(400).json({ message: 'Organization quota limit reached' });
    }

    // 4. Create workflow_run
    const createRunMutation = `
      mutation CreateRun($workflowId: uuid!, $triggeredBy: uuid) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflowId,
          status: "running",
          triggered_by: $triggeredBy,
          trigger_type: "manual",
          started_at: "now()"
        }) {
          id
          status
        }
      }
    `;
    const runData = await executeAdminGraphQL(createRunMutation, {
      workflowId,
      triggeredBy: userId || null,
    });
    const runId = runData.insert_workflow_runs_one.id;

    // 5. Execute Steps
    const steps = workflow.workflow_steps || [];
    let previousStepOutput: any = null;

    for (const step of steps) {
      // Create initial step_run with running status
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
      const stepRunData = await executeAdminGraphQL(createStepRunMutation, {
        runId,
        stepId: step.id,
      });
      const stepRunId = stepRunData.insert_step_runs_one.id;

      // Handle Step Execution by Type
      let stepOutput: any = null;
      let stepStatus: 'completed' | 'paused' | 'failed' = 'completed';
      let errorMsg: string | null = null;
      let attemptCount = 1;

      try {
        if (step.type === 'llm_call') {
          const prompt = step.config?.prompt || 'Classify task urgency';
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
            try {
              const retryRes = await fetch(url, { method });
              const retryData = await retryRes.json();
              stepOutput = { url, statusCode: retryRes.status, response: retryData, retried: true };
            } catch (retryErr: any) {
              stepOutput = { url, error: retryErr.message };
              stepStatus = 'failed';
              errorMsg = retryErr.message;
            }
          }
        } else if (step.type === 'conditional_branch') {
          // Dynamic Branching based on actual previous step's output!
          const lastResultString = JSON.stringify(previousStepOutput || '');
          const matchCondition = step.config?.condition || 'HIGH_PRIORITY';
          const branchTaken = lastResultString.includes(matchCondition) ? 'true_branch' : 'false_branch';

          stepOutput = {
            evaluated_input: previousStepOutput,
            condition: matchCondition,
            branch_taken: branchTaken,
          };
        } else if (step.type === 'notify') {
          stepOutput = {
            notification_sent: true,
            channel: step.config?.channel || 'slack',
            message: step.config?.message || 'Workflow step executed',
          };
        } else if (step.type === 'db_write') {
          stepOutput = {
            written: true,
            data: step.config?.data || { timestamp: new Date().toISOString() },
          };
        } else if (step.type === 'approval_gate') {
          stepStatus = 'paused';
          stepOutput = { awaiting_approval: true, gate: step.config?.gate_name || 'Manual Review' };
        }

        previousStepOutput = stepOutput;
      } catch (err: any) {
        stepStatus = 'failed';
        errorMsg = err.message;
      }

      // Update step_runs status & attempt_count
      const updateStepRunMutation = `
        mutation UpdateStepRun($id: uuid!, $status: String!, $output: jsonb, $error: String, $attemptCount: Int!) {
          update_step_runs_by_pk(
            pk_columns: { id: $id },
            _set: { status: $status, output: $output, error: $error, attempt_count: $attemptCount }
          ) {
            id
          }
        }
      `;
      await executeAdminGraphQL(updateStepRunMutation, {
        id: stepRunId,
        status: stepStatus,
        output: stepOutput,
        error: errorMsg,
        attemptCount: attemptCount,
      });

      // If step paused (approval gate hit), pause workflow run and break loop!
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
        return res.status(200).json({ run_id: runId, status: 'paused' });
      }

      if (stepStatus === 'failed') {
        const failRunMutation = `
          mutation FailRun($id: uuid!) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $id },
              _set: { status: "failed", ended_at: "now()" }
            ) {
              id
            }
          }
        `;
        await executeAdminGraphQL(failRunMutation, { id: runId });
        return res.status(200).json({ run_id: runId, status: 'failed' });
      }
    }

    // All steps completed successfully
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

    return res.status(200).json({ run_id: runId, status: 'completed' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}
