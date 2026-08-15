export const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || 'http://localhost:1337/v1/graphql';
export const FUNCTIONS_ENDPOINT = 'http://localhost:3001';

export async function fetchGraphQL({
  query,
  variables = {},
  headers = {},
}: {
  query: string;
  variables?: any;
  headers?: Record<string, string>;
}) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export async function callFunctionsAction({
  endpoint,
  payload,
  headers = {},
}: {
  endpoint: 'trigger-workflow-run' | 'approve-step';
  payload: any;
  headers?: Record<string, string>;
}) {
  const res = await fetch(`${FUNCTIONS_ENDPOINT}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export const GET_ORG_WORKFLOWS = `
  query GetOrgWorkflows {
    workflows(order_by: { created_at: desc }) {
      id
      org_id
      name
      description
      is_active
      created_at
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        config
      }
      workflow_triggers {
        id
        trigger_type
        config
      }
      workflow_runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        started_at
        ended_at
      }
    }
    organizations {
      id
      name
      quota_limit
      quota_used
    }
  }
`;

export const CREATE_WORKFLOW_MUTATION = `
  mutation CreateWorkflow($orgId: uuid!, $name: String!, $description: String, $steps: [workflow_steps_insert_input!]!) {
    insert_workflows_one(object: {
      org_id: $orgId,
      name: $name,
      description: $description,
      workflow_steps: {
        data: $steps
      }
    }) {
      id
      name
    }
  }
`;

export const TRIGGER_WORKFLOW_MUTATION = `
  mutation TriggerWorkflow($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      run_id
      status
    }
  }
`;

export const APPROVE_STEP_MUTATION = `
  mutation ApproveStep($step_run_id: uuid!) {
    approveStep(step_run_id: $step_run_id) {
      success
      message
      status
    }
  }
`;
