const HASURA_ENDPOINT = 'http://localhost:1337/v1/metadata';
const ADMIN_SECRET = 'nhost-admin-secret';

async function sendMetadata(payload) {
  const res = await fetch(HASURA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function main() {
  console.log('🚀 Applying Hasura metadata (tables, relationships, permissions, custom actions)...');

  const tables = ['organizations', 'org_members', 'workflows', 'workflow_steps', 'workflow_triggers', 'workflow_runs', 'step_runs'];

  // 1. Track Tables
  for (const table of tables) {
    try {
      await sendMetadata({
        type: 'pg_track_table',
        args: {
          source: 'default',
          table: { name: table, schema: 'public' },
        },
      });
    } catch (e) {}
  }

  // 2. Create Object Relationships
  const objectRels = [
    { table: 'org_members', name: 'organization', using: { foreign_key_constraint_on: 'org_id' } },
    { table: 'workflows', name: 'organization', using: { foreign_key_constraint_on: 'org_id' } },
    { table: 'workflow_steps', name: 'workflow', using: { foreign_key_constraint_on: 'workflow_id' } },
    { table: 'workflow_triggers', name: 'workflow', using: { foreign_key_constraint_on: 'workflow_id' } },
    { table: 'workflow_runs', name: 'workflow', using: { foreign_key_constraint_on: 'workflow_id' } },
    { table: 'step_runs', name: 'workflow_run', using: { foreign_key_constraint_on: 'workflow_run_id' } },
    { table: 'step_runs', name: 'workflow_step', using: { foreign_key_constraint_on: 'step_id' } },
  ];

  for (const rel of objectRels) {
    try {
      await sendMetadata({
        type: 'pg_create_object_relationship',
        args: { source: 'default', ...rel },
      });
    } catch (e) {}
  }

  // 3. Create Array Relationships
  const arrayRels = [
    { table: 'organizations', name: 'org_members', using: { foreign_key_constraint_on: { table: { name: 'org_members', schema: 'public' }, column: 'org_id' } } },
    { table: 'organizations', name: 'workflows', using: { foreign_key_constraint_on: { table: { name: 'workflows', schema: 'public' }, column: 'org_id' } } },
    { table: 'workflows', name: 'workflow_steps', using: { foreign_key_constraint_on: { table: { name: 'workflow_steps', schema: 'public' }, column: 'workflow_id' } } },
    { table: 'workflows', name: 'workflow_triggers', using: { foreign_key_constraint_on: { table: { name: 'workflow_triggers', schema: 'public' }, column: 'workflow_id' } } },
    { table: 'workflows', name: 'workflow_runs', using: { foreign_key_constraint_on: { table: { name: 'workflow_runs', schema: 'public' }, column: 'workflow_id' } } },
    { table: 'workflow_runs', name: 'step_runs', using: { foreign_key_constraint_on: { table: { name: 'step_runs', schema: 'public' }, column: 'workflow_run_id' } } },
  ];

  for (const rel of arrayRels) {
    try {
      await sendMetadata({
        type: 'pg_create_array_relationship',
        args: { source: 'default', ...rel },
      });
    } catch (e) {}
  }

  // 4. Create Select Permissions for roles (owner, editor, viewer)
  const roles = ['owner', 'editor', 'viewer'];

  for (const role of roles) {
    // Organizations
    await sendMetadata({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { name: 'organizations', schema: 'public' },
        role,
        permission: {
          columns: '*',
          filter: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } },
        },
      },
    });

    // Workflows
    await sendMetadata({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { name: 'workflows', schema: 'public' },
        role,
        permission: {
          columns: '*',
          filter: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } },
        },
      },
    });

    // Workflow Steps
    await sendMetadata({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { name: 'workflow_steps', schema: 'public' },
        role,
        permission: {
          columns: '*',
          filter: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } },
        },
      },
    });

    // Workflow Triggers
    await sendMetadata({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { name: 'workflow_triggers', schema: 'public' },
        role,
        permission: {
          columns: '*',
          filter: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } },
        },
      },
    });

    // Workflow Runs
    await sendMetadata({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { name: 'workflow_runs', schema: 'public' },
        role,
        permission: {
          columns: '*',
          filter: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } },
        },
      },
    });

    // Step Runs
    await sendMetadata({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { name: 'step_runs', schema: 'public' },
        role,
        permission: {
          columns: '*',
          filter: { workflow_run: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } } },
        },
      },
    });
  }

  // 5. Create Insert & Update Permissions for owner and editor
  for (const role of ['owner', 'editor']) {
    await sendMetadata({
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { name: 'workflows', schema: 'public' },
        role,
        permission: {
          check: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } },
          columns: '*',
        },
      },
    });

    await sendMetadata({
      type: 'pg_create_update_permission',
      args: {
        source: 'default',
        table: { name: 'workflows', schema: 'public' },
        role,
        permission: {
          filter: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } },
          columns: '*',
        },
      },
    });

    await sendMetadata({
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { name: 'workflow_steps', schema: 'public' },
        role,
        permission: {
          check: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } },
          columns: '*',
        },
      },
    });

    await sendMetadata({
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { name: 'workflow_triggers', schema: 'public' },
        role,
        permission: {
          check: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } },
          columns: '*',
        },
      },
    });
  }

  // 6. Custom Actions Registration
  try {
    await sendMetadata({
      type: 'set_custom_types',
      args: {
        scalars: [],
        enums: [],
        input_objects: [],
        objects: [
          {
            name: 'TriggerWorkflowRunOutput',
            fields: [
              { name: 'run_id', type: 'String!' },
              { name: 'status', type: 'String!' }
            ]
          },
          {
            name: 'ApproveStepOutput',
            fields: [
              { name: 'success', type: 'Boolean!' },
              { name: 'message', type: 'String!' },
              { name: 'status', type: 'String!' }
            ]
          }
        ]
      }
    });

    await sendMetadata({
      type: 'create_action',
      args: {
        name: 'triggerWorkflowRun',
        definition: {
          kind: 'synchronous',
          handler: 'http://host.docker.internal:3001/trigger-workflow-run',
          forward_client_headers: true,
        },
        permissions: [{ role: 'owner' }, { role: 'editor' }]
      }
    });

    await sendMetadata({
      type: 'create_action',
      args: {
        name: 'approveStep',
        definition: {
          kind: 'synchronous',
          handler: 'http://host.docker.internal:3001/approve-step',
          forward_client_headers: true,
        },
        permissions: [{ role: 'owner' }, { role: 'editor' }, { role: 'viewer' }]
      }
    });
  } catch (e) {}

  console.log('✅ Hasura metadata updated cleanly!');
}

main().catch(console.error);
