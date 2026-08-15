import express from 'express';
import dotenv from 'dotenv';
import triggerWorkflowRunHandler from './trigger-workflow-run';
import approveStepHandler from './approve-step';
import webhookTriggerHandler from './webhook-trigger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'Nhost Functions Engine' });
});

app.post('/trigger-workflow-run', (req, res) => triggerWorkflowRunHandler(req, res));
app.post('/approve-step', (req, res) => approveStepHandler(req, res));
app.post('/webhook-trigger', (req, res) => webhookTriggerHandler(req, res));

app.listen(PORT, () => {
  console.log(`🚀 Nhost Functions Runner listening on http://localhost:${PORT}`);
});
