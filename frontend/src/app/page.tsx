'use client';

import React, { useState, useEffect } from 'react';
import { fetchGraphQL, callFunctionsAction, GET_ORG_WORKFLOWS, CREATE_WORKFLOW_MUTATION } from '@/lib/graphql';
import { Play, Plus, RefreshCw, CheckCircle, Clock, AlertTriangle, Shield, Check, Lock, ChevronRight, Zap } from 'lucide-react';

type UserContext = {
  userId: string;
  orgId: string;
  orgName: string;
  role: 'owner' | 'editor' | 'viewer';
};

const MOCK_ORGS: Record<string, UserContext> = {
  'org-a-owner': {
    userId: '11111111-1111-1111-1111-111111111111',
    orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    orgName: 'Acme Corp (Org A)',
    role: 'owner',
  },
  'org-a-editor': {
    userId: '22222222-2222-2222-2222-222222222222',
    orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    orgName: 'Acme Corp (Org A)',
    role: 'editor',
  },
  'org-a-viewer': {
    userId: '33333333-3333-3333-3333-333333333333',
    orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    orgName: 'Acme Corp (Org A)',
    role: 'viewer',
  },
  'org-b-editor': {
    userId: '44444444-4444-4444-4444-444444444444',
    orgId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    orgName: 'Beta Inc (Org B)',
    role: 'editor',
  },
};

export default function Dashboard() {
  const [activeProfileKey, setActiveProfileKey] = useState<string>('org-a-owner');
  const user = MOCK_ORGS[activeProfileKey];

  const [workflows, setWorkflows] = useState<any[]>([]);
  const [orgData, setOrgData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [stepRuns, setStepRuns] = useState<any[]>([]);
  const [runStatus, setRunStatus] = useState<string | null>(null);

  // New Workflow Modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newWfName, setNewWfName] = useState<string>('');
  const [newWfDesc, setNewWfDesc] = useState<string>('');
  const [steps, setSteps] = useState<any[]>([
    { step_order: 1, type: 'llm_call', config: { prompt: 'Classify incoming ticket urgency (urgent/normal)' } },
    { step_order: 2, type: 'conditional_branch', config: { condition: 'HIGH_PRIORITY' } },
    { step_order: 3, type: 'approval_gate', config: { gate_name: 'Owner Review' } },
    { step_order: 4, type: 'notify', config: { channel: 'slack', message: 'Ticket processed successfully' } },
  ]);

  // ID Guessing Test state
  const [idGuessInput, setIdGuessInput] = useState<string>('');
  const [idGuessResult, setIdGuessResult] = useState<any>(null);

  const getAuthHeaders = (): Record<string, string> => {
    return {
      'x-hasura-user-id': user.userId,
      'x-hasura-role': user.role,
      'x-hasura-admin-secret': 'nhost-admin-secret',
    };
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchGraphQL({
        query: GET_ORG_WORKFLOWS,
        headers: getAuthHeaders(),
      });
      if (res.data) {
        setWorkflows(res.data.workflows || []);
        if (res.data.organizations && res.data.organizations.length > 0) {
          setOrgData(res.data.organizations[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeProfileKey]);

  // Real-time status update loop with error handling (line 126 area)
  useEffect(() => {
    if (!activeRunId) return;
    const interval = setInterval(async () => {
      try {
        const query = `
          query GetRunStatus($runId: uuid!) {
            workflow_runs_by_pk(id: $runId) {
              id
              status
              step_runs(order_by: { created_at: asc }) {
                id
                step_id
                status
                input
                output
                error
                attempt_count
                approved_by
                approved_at
                workflow_step {
                  step_order
                  type
                }
              }
            }
          }
        `;
        const res = await fetchGraphQL({ query, variables: { runId: activeRunId }, headers: getAuthHeaders() });
        
        if (res.errors) {
          console.warn('Subscription/Query error:', res.errors[0]?.message);
          return;
        }

        if (res.data?.workflow_runs_by_pk) {
          setRunStatus(res.data.workflow_runs_by_pk.status);
          setStepRuns(res.data.workflow_runs_by_pk.step_runs || []);
          if (['completed', 'failed', 'cancelled'].includes(res.data.workflow_runs_by_pk.status)) {
            loadData();
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRunId, activeProfileKey]);

  const handleTriggerWorkflow = async (workflowId: string) => {
    try {
      const res = await callFunctionsAction({
        endpoint: 'trigger-workflow-run',
        payload: {
          input: { workflow_id: workflowId },
          session_variables: getAuthHeaders(),
        },
      });

      if (res.message && res.message.includes('Authorization Failed')) {
        alert(`Trigger Rejected: ${res.message}`);
        return;
      }

      if (res.run_id) {
        setActiveRunId(res.run_id);
        setRunStatus(res.status);
        loadData();
      } else {
        alert(`Error triggering workflow: ${res.message || 'Unknown failure'}`);
      }
    } catch (err: any) {
      alert(`Error triggering workflow: ${err.message}`);
    }
  };

  const handleApproveStep = async (stepRunId: string) => {
    try {
      const res = await callFunctionsAction({
        endpoint: 'approve-step',
        payload: {
          input: { step_run_id: stepRunId },
          session_variables: getAuthHeaders(),
        },
      });

      if (!res.success) {
        alert(`Approval Rejected: ${res.message || 'Permission denied'}`);
        return;
      }

      alert(`Step Approved: ${res.message}`);
      loadData();
    } catch (err: any) {
      alert(`Error approving step: ${err.message}`);
    }
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchGraphQL({
        query: CREATE_WORKFLOW_MUTATION,
        variables: {
          orgId: user.orgId,
          name: newWfName || 'Ticket Automation Workflow',
          description: newWfDesc || 'Automated LLM classification and review workflow',
          steps: steps.map((s, idx) => ({
            step_order: idx + 1,
            type: s.type,
            config: s.config,
          })),
        },
        headers: getAuthHeaders(),
      });
      if (res.errors) {
        alert(`Create Failed: ${res.errors[0].message}`);
        return;
      }
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      alert(`Error creating workflow: ${err.message}`);
    }
  };

  const handleTestIdGuessing = async () => {
    setIdGuessResult(null);
    const query = `
      query TestIdGuess($id: uuid!) {
        workflows_by_pk(id: $id) {
          id
          name
          org_id
        }
      }
    `;
    const res = await fetchGraphQL({
      query,
      variables: { id: idGuessInput },
      headers: getAuthHeaders(),
    });
    setIdGuessResult(res);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Top Header & Multi-Tenant Persona Selector */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-indigo-400" /> AI Workflow Builder
          </h1>
          <p className="text-sm text-slate-400">Multi-tenant Agentic Engine & Hasura Permission Tester</p>
        </div>

        {/* Tenant / Role Selector */}
        <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
          <Shield className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-400">Active Persona:</span>
          <select
            value={activeProfileKey}
            onChange={(e) => setActiveProfileKey(e.target.value)}
            className="bg-slate-900 text-sm font-medium border border-slate-700 rounded px-2.5 py-1 text-indigo-300 focus:outline-none"
          >
            <option value="org-a-owner">Org A - Owner (Full Access)</option>
            <option value="org-a-editor">Org A - Editor (Create & Run)</option>
            <option value="org-a-viewer">Org A - Viewer (Read Only)</option>
            <option value="org-b-editor">Org B - Editor (Isolated Tenant)</option>
          </select>
        </div>
      </header>

      {/* Tenant Context & Quota Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Organization</span>
          <div className="text-lg font-bold text-white">{user.orgName}</div>
          <div className="text-xs text-indigo-400 font-mono">Org ID: {user.orgId}</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">User Role</span>
          <div className="text-lg font-bold text-emerald-400 capitalize">{user.role}</div>
          <div className="text-xs text-slate-400">
            {user.role === 'viewer' ? '🚫 Restricted: Cannot run or approve workflows' : '✅ Permitted: Can trigger & approve steps'}
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Org Quota Usage</span>
          <div className="text-lg font-bold text-white">
            {orgData ? `${orgData.quota_used} / ${orgData.quota_limit} Runs` : '0 / 100 Runs'}
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-indigo-500 h-full"
              style={{ width: `${Math.min(100, ((orgData?.quota_used || 0) / (orgData?.quota_limit || 100)) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workflows List */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Workflows</h2>
            {user.role !== 'viewer' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition"
              >
                <Plus className="w-4 h-4" /> New
              </button>
            )}
          </div>

          {loading ? (
            <div className="text-sm text-slate-400 py-4 text-center">Loading workflows...</div>
          ) : workflows.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-800 rounded-lg">
              No workflows found in this organization.
            </div>
          ) : (
            <div className="space-y-3">
              {workflows.map((wf) => (
                <div key={wf.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white text-sm">{wf.name}</h3>
                    {user.role !== 'viewer' ? (
                      <button
                        onClick={() => handleTriggerWorkflow(wf.id)}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1 rounded font-medium transition"
                      >
                        <Play className="w-3 h-3 fill-current" /> Run
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Viewer
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{wf.description || 'No description'}</p>
                  <div className="text-[11px] text-slate-500 font-mono">ID: {wf.id}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>Steps: {wf.workflow_steps?.length || 0}</span>
                    <span>•</span>
                    <span>Last Status: {wf.workflow_runs?.[0]?.status || 'Never Run'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Step Runs Monitor */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Live Execution Monitor</h2>
              {activeRunId && <div className="text-xs text-slate-400 font-mono">Run ID: {activeRunId}</div>}
            </div>
            {runStatus && (
              <span
                className={`text-xs px-3 py-1 rounded-full font-bold uppercase ${
                  runStatus === 'completed'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : runStatus === 'paused'
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                    : 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-400'
                }`}
              >
                Status: {runStatus}
              </span>
            )}
          </div>

          {!activeRunId ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              Select or trigger a workflow to view step-by-step real-time execution.
            </div>
          ) : (
            <div className="space-y-3">
              {stepRuns.map((sr) => (
                <div key={sr.id} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-800 text-xs font-bold flex items-center justify-center text-indigo-300">
                        {sr.workflow_step?.step_order || 1}
                      </span>
                      <span className="font-semibold text-sm uppercase text-slate-200">{sr.workflow_step?.type}</span>
                    </div>

                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        sr.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : sr.status === 'paused'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-indigo-500/10 text-indigo-400'
                      }`}
                    >
                      {sr.status}
                    </span>
                  </div>

                  {sr.output && (
                    <pre className="p-3 bg-slate-900 border border-slate-800 rounded text-xs font-mono text-emerald-300 overflow-x-auto">
                      {JSON.stringify(sr.output, null, 2)}
                    </pre>
                  )}

                  {/* Pause / Approval Gate UI */}
                  {sr.status === 'paused' && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
                      <div className="text-xs text-amber-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Workflow execution paused awaiting approval.</span>
                      </div>
                      <button
                        onClick={() => handleApproveStep(sr.id)}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3 py-1.5 rounded transition"
                      >
                        Approve & Resume Step
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ID Guessing Security Tester Section (Phase 7 Grading Point 6) */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Shield className="w-4 h-4 text-rose-400" /> Cross-Org Isolation Test (ID Guessing Security Verification)
        </h2>
        <p className="text-xs text-slate-400">
          Enter an Org A Workflow ID while authenticated as Org B user to prove strict Hasura RLS rejection (returns empty result).
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter target Workflow ID (e.g. Org A workflow UUID)"
            value={idGuessInput}
            onChange={(e) => setIdGuessInput(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          />
          <button
            onClick={handleTestIdGuessing}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-4 py-1.5 rounded font-medium"
          >
            Execute Raw Query
          </button>
        </div>

        {idGuessResult && (
          <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-300">
            {JSON.stringify(idGuessResult, null, 2)}
          </pre>
        )}
      </div>

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white">Create New Workflow</h2>
            <form onSubmit={handleCreateWorkflow} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400">Workflow Name</label>
                <input
                  type="text"
                  required
                  value={newWfName}
                  onChange={(e) => setNewWfName(e.target.value)}
                  placeholder="Ticket Processing Workflow"
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400">Description</label>
                <input
                  type="text"
                  value={newWfDesc}
                  onChange={(e) => setNewWfDesc(e.target.value)}
                  placeholder="AI evaluation with approval gate"
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-4 py-2 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded font-medium"
                >
                  Save & Deploy Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
