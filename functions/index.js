const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const triggerWorkflowRunHandler = require('./trigger-workflow-run');
const approveStepHandler = require('./approve-step');
const webhookTriggerHandler = require('./webhook-trigger');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for browser requests from frontend (http://localhost:3000)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-hasura-user-id, x-hasura-role, x-hasura-admin-secret, x-webhook-secret');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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
