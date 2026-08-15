import { Request, Response } from 'express';
import triggerWorkflowRunHandler from './trigger-workflow-run';

export default async function webhookTriggerHandler(req: Request, res: Response) {
  const secretHeader = req.headers['x-webhook-secret'];
  const expectedSecret = process.env.NHOST_WEBHOOK_SECRET || 'nhost-webhook-secret-key-12345';

  if (secretHeader !== expectedSecret) {
    return res.status(401).json({ message: 'Unauthorized webhook trigger request' });
  }

  const workflowId = req.query.workflow_id || req.body?.workflow_id;
  if (!workflowId) {
    return res.status(400).json({ message: 'Missing workflow_id in query or body' });
  }

  // Delegate execution to triggerWorkflowRunHandler
  req.body = {
    input: { workflow_id: workflowId },
    session_variables: { 'x-hasura-role': 'editor' }, // Webhook acts as authorized system editor
  };

  return triggerWorkflowRunHandler(req, res);
}
