const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const triggerWorkflowRunHandler = require('./trigger-workflow-run');
const approveStepHandler = require('./approve-step');
const webhookTriggerHandler = require('./webhook-trigger');

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
