'use client';

import React, { useState, useEffect } from 'react';
import { fetchGraphQL, callFunctionsAction, GET_ORG_WORKFLOWS, CREATE_WORKFLOW_MUTATION } from '@/lib/graphql';
import { Play, Plus, RefreshCw, CheckCircle, Clock, AlertTriangle, Shield, Check, Lock, ChevronRight, Zap, LogOut, LogIn, UserCheck, Trash2 } from 'lucide-react';

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [emailInput, setEmailInput] = useState<string>('owner@orga.com');
  const [passwordInput, setPasswordInput] = useState<string>('Password123!');
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  // Server-Resolved Org & Role from org_members
  const [userRole, setUserRole] = useState<'owner' | 'editor' | 'viewer' | null>(null);
  const [userOrgId, setUserOrgId] = useState<string | null>(null);
  const [userOrgName, setUserOrgName] = useState<string | null>(null);

  const [workflows, setWorkflows] = useState<any[]>([]);
  const [orgData, setOrgData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [stepRuns, setStepRuns] = useState<any[]>([]);
  const [runStatus, setRunStatus] = useState<string | null>(null);

  // New Workflow Modal state with dynamic customizable steps
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newWfName, setNewWfName] = useState<string>('');
  const [newWfDesc, setNewWfDesc] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('Classify customer message: URGENT server crash ticket requiring immediate fix');
  const [customCondition, setCustomCondition] = useState<string>('URGENT');
  const [customGateName, setCustomGateName] = useState<string>('Executive Review');

  // ID Guessing Test state
  const [idGuessInput, setIdGuessInput] = useState<string>('');
  const [idGuessResult, setIdGuessResult] = useState<any>(null);

  // Load session from localStorage on mount
  useEffect(() => {
    const savedSession = localStorage.getItem('nhost_auth_session');
    if (savedSession) {
      try {
        setCurrentUser(JSON.parse(savedSession));
      } catch (e) {}
    }
  }, []);

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'x-hasura-admin-secret': 'nhost-admin-secret',
    };
    if (currentUser?.id) {
      headers['x-hasura-user-id'] = currentUser.id;
    }
    if (userRole) {
      headers['x-hasura-role'] = userRole;
    }
    return headers;
  };

  // Resolve User's Org & Role from org_members table in PostgreSQL
  const resolveUserOrgAndRole = async (userId: string) => {
    try {
      const query = `
        query ResolveUserMembership($userId: uuid!) {
          org_members(where: { user_id: { _eq: $userId } }) {
            role
            org_id
            organization {
              id
              name
              quota_limit
              quota_used
            }
          }
        }
      `;
      const res = await fetchGraphQL({
        query,
        variables: { userId },
        headers: getAuthHeaders(),
      });

      const member = res.data?.org_members?.[0];
      if (member) {
        setUserRole(member.role);
        setUserOrgId(member.org_id);
        setUserOrgName(member.organization?.name);
        setOrgData(member.organization);
      }
    } catch (err) {
      console.error('Failed to resolve org membership:', err);
    }
  };

  const loadWorkflows = async () => {
    if (!currentUser?.id) return;
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
    if (currentUser?.id) {
      resolveUserOrgAndRole(currentUser.id);
      loadWorkflows();
    }
  }, [currentUser?.id]);

  // Real-time status update loop with error handling
  useEffect(() => {
    if (!activeRunId || !currentUser) return;
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
            loadWorkflows();
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRunId, currentUser]);

  const handleSignIn = async (email: string) => {
    setIsSigningIn(true);
    try {
      const userMap: Record<string, AuthUser> = {
        'owner@orga.com': { id: '11111111-1111-1111-1111-111111111111', email: 'owner@orga.com', displayName: 'Org A Owner' },
        'editor@orga.com': { id: '22222222-2222-2222-2222-222222222222', email: 'editor@orga.com', displayName: 'Org A Editor' },
        'viewer@orga.com': { id: '33333333-3333-3333-3333-333333333333', email: 'viewer@orga.com', displayName: 'Org A Viewer' },
        'editor@orgb.com': { id: '44444444-4444-4444-4444-444444444444', email: 'editor@orgb.com', displayName: 'Org B Editor' },
      };

      const user = userMap[email.toLowerCase()];
      if (!user) {
        alert('Invalid email address. Please use one of the test accounts.');
        return;
      }

      setCurrentUser(user);
      localStorage.setItem('nhost_auth_session', JSON.stringify(user));
    } catch (err: any) {
      alert(`Login Failed: ${err.message}`);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setUserRole(null);
    setUserOrgId(null);
    setUserOrgName(null);
    localStorage.removeItem('nhost_auth_session');
  };

  const handleTriggerWorkflow = async (workflowId: string) => {
    try {
      const res = await callFunctionsAction({
        endpoint: 'trigger-workflow-run',
        payload: {
          input: { workflow_id: workflowId },
          session_variables: {
            'x-hasura-user-id': currentUser?.id,
            'x-hasura-role': userRole,
          },
        },
      });

      if (res.message && res.message.includes('Authorization Failed')) {
        alert(`Trigger Rejected: ${res.message}`);
        return;
      }

      if (res.run_id) {
        setActiveRunId(res.run_id);
        setRunStatus(res.status);
        loadWorkflows();
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
          session_variables: {
            'x-hasura-user-id': currentUser?.id,
            'x-hasura-role': userRole,
          },
        },
      });

      if (!res.success) {
        alert(`Approval Rejected: ${res.message || 'Permission denied'}`);
        return;
      }

      alert(`Step Approved: ${res.message}`);
      loadWorkflows();
    } catch (err: any) {
      alert(`Error approving step: ${err.message}`);
    }
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userOrgId) return;
    try {
      const dynamicSteps = [
        { step_order: 1, type: 'llm_call', config: { prompt: customPrompt } },
        { step_order: 2, type: 'conditional_branch', config: { condition: customCondition } },
        { step_order: 3, type: 'approval_gate', config: { gate_name: customGateName } },
        { step_order: 4, type: 'notify', config: { channel: 'slack', message: 'Workflow step process completed' } },
      ];

      const res = await fetchGraphQL({
        query: CREATE_WORKFLOW_MUTATION,
        variables: {
          orgId: userOrgId,
          name: newWfName || 'Custom AI Workflow',
          description: newWfDesc || 'Customized multi-step execution pipeline',
          steps: dynamicSteps,
        },
        headers: getAuthHeaders(),
      });
      if (res.errors) {
        alert(`Create Failed: ${res.errors[0].message}`);
        return;
      }
      setShowCreateModal(false);
      loadWorkflows();
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

  // If Unauthenticated, Render Login Screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Zap className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white">AI Workflow Builder</h1>
            <p className="text-sm text-slate-400">Sign in with an authenticated user account</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSignIn(emailInput);
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-xs font-medium text-slate-400">Email Address</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="user@orga.com"
                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400">Password</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-2.5 rounded-lg font-semibold transition"
            >
              <LogIn className="w-4 h-4" /> {isSigningIn ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          {/* Quick Sign In Buttons for Demo Accounts */}
          <div className="border-t border-slate-800 pt-4 space-y-2">
            <span className="text-xs text-slate-500 block text-center font-medium">Select Test Account to Sign In:</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSignIn('owner@orga.com')}
                className="text-xs p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-left"
              >
                <div className="font-semibold text-indigo-300">Org A Owner</div>
                <div className="text-[10px] text-slate-500">owner@orga.com</div>
              </button>

              <button
                onClick={() => handleSignIn('editor@orga.com')}
                className="text-xs p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-left"
              >
                <div className="font-semibold text-emerald-300">Org A Editor</div>
                <div className="text-[10px] text-slate-500">editor@orga.com</div>
              </button>

              <button
                onClick={() => handleSignIn('viewer@orga.com')}
                className="text-xs p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-left"
              >
                <div className="font-semibold text-amber-300">Org A Viewer</div>
                <div className="text-[10px] text-slate-500">viewer@orga.com</div>
              </button>

              <button
                onClick={() => handleSignIn('editor@orgb.com')}
                className="text-xs p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-left"
              >
                <div className="font-semibold text-rose-300">Org B Editor</div>
                <div className="text-[10px] text-slate-500">editor@orgb.com</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Authenticated Dashboard
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Top Header with Authenticated User & Sign Out Button */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-indigo-400" /> AI Workflow Builder
          </h1>
          <p className="text-sm text-slate-400">Multi-tenant Agentic Engine & Hasura Permission Tester</p>
        </div>

        {/* Real User Account Info Badge */}
        <div className="flex items-center gap-3 bg-slate-950 p-2 px-3 rounded-lg border border-slate-800">
          <UserCheck className="w-4 h-4 text-emerald-400" />
          <div className="text-xs">
            <div className="font-semibold text-white">{currentUser.email}</div>
            <div className="text-slate-400 flex items-center gap-1">
              <span>{userOrgName || 'Loading Org...'}</span>
              <span>•</span>
              <span className="text-indigo-300 capitalize font-medium">{userRole || 'Resolving Role...'}</span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="ml-2 bg-slate-800 hover:bg-rose-900/50 hover:text-rose-300 text-slate-400 p-1.5 rounded transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tenant Context & Quota Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Server-Resolved Organization</span>
          <div className="text-lg font-bold text-white">{userOrgName || 'Resolving...'}</div>
          <div className="text-xs text-indigo-400 font-mono">Org ID: {userOrgId || '...'}</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Server-Resolved Role</span>
          <div className="text-lg font-bold text-emerald-400 capitalize">{userRole || 'Resolving...'}</div>
          <div className="text-xs text-slate-400">
            {userRole === 'viewer' ? '🚫 Restricted: Cannot run or approve workflows' : '✅ Permitted: Can trigger & approve steps'}
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
            {userRole !== 'viewer' && (
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
                    {userRole !== 'viewer' ? (
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

      {/* ID Guessing Security Tester Section */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Shield className="w-4 h-4 text-rose-400" /> Cross-Org Isolation Test (ID Guessing Security Verification)
        </h2>
        <p className="text-xs text-slate-400">
          Enter an Org A Workflow ID while signed in as Org B user to prove strict Hasura RLS rejection (returns empty result).
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

      {/* Create Custom Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-bold text-white">Create Custom Workflow</h2>
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

              {/* Step 1 Configuration: LLM Prompt */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                <div className="text-xs font-semibold text-indigo-400 flex items-center justify-between">
                  <span>Step 1: LLM Call</span>
                  <span className="text-[10px] text-slate-500 font-mono">type: llm_call</span>
                </div>
                <label className="text-[11px] text-slate-400 block">LLM Input Prompt</label>
                <textarea
                  rows={2}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none font-mono"
                />
              </div>

              {/* Step 2 Configuration: Conditional Branch */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                <div className="text-xs font-semibold text-indigo-400 flex items-center justify-between">
                  <span>Step 2: Conditional Branch</span>
                  <span className="text-[10px] text-slate-500 font-mono">type: conditional_branch</span>
                </div>
                <label className="text-[11px] text-slate-400 block">Branch Target Condition</label>
                <input
                  type="text"
                  value={customCondition}
                  onChange={(e) => setCustomCondition(e.target.value)}
                  placeholder="URGENT"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none font-mono"
                />
              </div>

              {/* Step 3 Configuration: Approval Gate */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                <div className="text-xs font-semibold text-indigo-400 flex items-center justify-between">
                  <span>Step 3: Approval Gate</span>
                  <span className="text-[10px] text-slate-500 font-mono">type: approval_gate</span>
                </div>
                <label className="text-[11px] text-slate-400 block">Gate Signoff Title</label>
                <input
                  type="text"
                  value={customGateName}
                  onChange={(e) => setCustomGateName(e.target.value)}
                  placeholder="Executive Review"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
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
