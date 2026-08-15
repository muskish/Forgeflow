const triggerWorkflowRunHandler = require('./trigger-workflow-run');

async function webhookTriggerHandler(req, res) {
  const secretHeader = req.headers['x-webhook-secret'];
  const expectedSecret = process.env.NHOST_WEBHOOK_SECRET || 'nhost-webhook-secret-key-12345';

  if (secretHeader !== expectedSecret) {
    return res.status(401).json({ message: 'Unauthorized webhook trigger request' });
  }

  const workflowId = req.query?.workflow_id || req.body?.workflow_id;
  if (!workflowId) {
    return res.status(400).json({ message: 'Missing workflow_id in query or body' });
  }

  req.body = {
    input: { workflow_id: workflowId },
    session_variables: { 'x-hasura-role': 'editor' },
  };

  return triggerWorkflowRunHandler(req, res);
}

module.exports = webhookTriggerHandler;
