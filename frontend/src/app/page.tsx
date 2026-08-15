'use client';

import React, { useState, useEffect } from 'react';
import { fetchGraphQL, callFunctionsAction, GET_ORG_WORKFLOWS, CREATE_WORKFLOW_MUTATION } from '@/lib/graphql';
import { 
  Play, Plus, RefreshCw, CheckCircle, Clock, AlertTriangle, Shield, Check, Lock, ChevronRight, Zap, LogOut, LogIn, UserCheck, 
  Layers, Cpu, Sparkles, ShieldAlert
} from 'lucide-react';

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

  // New Workflow Modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newWfName, setNewWfName] = useState<string>('');
  const [newWfDesc, setNewWfDesc] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('Analyze customer inquiry: URGENT ticket requiring immediate fix');
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
        { step_order: 4, type: 'notify', config: { channel: 'slack', message: 'Workflow process complete' } },
      ];

      const res = await fetchGraphQL({
        query: CREATE_WORKFLOW_MUTATION,
        variables: {
          orgId: userOrgId,
          name: newWfName || 'Custom Agent Workflow',
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

  // If Unauthenticated, Render Sleek Modern Light Login Screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#f4f4f6] text-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 space-y-6 shadow-xl">
          <div className="text-center space-y-3">
            <div className="inline-flex p-4 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100 shadow-sm">
              <Sparkles className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Forgeflow <span className="bg-gradient-to-r from-purple-600 to-fuchsia-600 bg-clip-text text-transparent">AI Engine</span>
            </h1>
            <p className="text-sm text-slate-500 font-medium">Sign in with an authenticated user account</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSignIn(emailInput);
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1">Email Address</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="user@orga.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1">Password</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm py-3 rounded-xl font-semibold shadow-md transition transform active:scale-98"
            >
              <LogIn className="w-4 h-4" /> {isSigningIn ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          {/* Quick Sign In Buttons for Demo Accounts */}
          <div className="border-t border-slate-100 pt-5 space-y-3">
            <span className="text-xs text-slate-400 block text-center font-semibold uppercase tracking-wider">Select Test Account to Sign In:</span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleSignIn('owner@orga.com')}
                className="text-xs p-3 bg-purple-50/50 hover:bg-purple-100/60 border border-purple-100 rounded-xl text-left transition"
              >
                <div className="font-bold text-purple-700">Org A Owner</div>
                <div className="text-[11px] text-slate-500">owner@orga.com</div>
              </button>

              <button
                onClick={() => handleSignIn('editor@orga.com')}
                className="text-xs p-3 bg-emerald-50/50 hover:bg-emerald-100/60 border border-emerald-100 rounded-xl text-left transition"
              >
                <div className="font-bold text-emerald-700">Org A Editor</div>
                <div className="text-[11px] text-slate-500">editor@orga.com</div>
              </button>

              <button
                onClick={() => handleSignIn('viewer@orga.com')}
                className="text-xs p-3 bg-amber-50/50 hover:bg-amber-100/60 border border-amber-100 rounded-xl text-left transition"
              >
                <div className="font-bold text-amber-700">Org A Viewer</div>
                <div className="text-[11px] text-slate-500">viewer@orga.com</div>
              </button>

              <button
                onClick={() => handleSignIn('editor@orgb.com')}
                className="text-xs p-3 bg-rose-50/50 hover:bg-rose-100/60 border border-rose-100 rounded-xl text-left transition"
              >
                <div className="font-bold text-rose-700">Org B Editor</div>
                <div className="text-[11px] text-slate-500">editor@orgb.com</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Dashboard with Functional Left Sidebar
  return (
    <div className="min-h-screen bg-[#f4f4f6] text-slate-900 flex font-sans">
      {/* Functional Sidebar matching reference design */}
      <aside className="w-16 bg-white border-r border-slate-200/80 flex flex-col items-center justify-between py-5 shrink-0 shadow-sm">
        <div className="flex flex-col items-center gap-6">
          {/* Logo / Refresh Button */}
          <button
            onClick={() => loadWorkflows()}
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-fuchsia-600 text-white flex items-center justify-center shadow-md hover:opacity-90 transition"
            title="Refresh Data"
          >
            <Sparkles className="w-5 h-5" />
          </button>

          <nav className="flex flex-col items-center gap-3">
            {/* New Workflow Action */}
            {userRole !== 'viewer' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 flex items-center justify-center transition shadow-xs"
                title="Create New Workflow"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}

            {/* Workflows Navigation */}
            <button
              onClick={() => loadWorkflows()}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-purple-50 hover:text-purple-600 text-slate-600 flex items-center justify-center transition"
              title="Workflows Overview"
            >
              <Layers className="w-5 h-5" />
            </button>
          </nav>
        </div>

        {/* User Profile / Sign Out Action */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleSignOut}
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 flex items-center justify-center transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Workspace View */}
      <main className="flex-1 p-8 space-y-8 max-w-7xl mx-auto overflow-y-auto">
        {/* Reference-Inspired Hero Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
            Hi there,{' '}
            <span className="bg-gradient-to-r from-purple-600 via-fuchsia-600 to-indigo-600 bg-clip-text text-transparent">
              {currentUser.displayName}
            </span>
          </h1>
          <p className="text-slate-500 font-medium text-base">
            What workflow would you like to execute in <span className="font-semibold text-slate-800">{userOrgName || 'Loading...'}</span> today?
          </p>
        </div>

        {/* User Context & Quota Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-5 bg-white border border-slate-200/80 rounded-2xl space-y-1.5 shadow-xs hover:border-purple-200 transition">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Server Organization</span>
            <div className="text-xl font-bold text-slate-900">{userOrgName || 'Resolving...'}</div>
            <div className="text-xs text-purple-600 font-mono">Org ID: {userOrgId || '...'}</div>
          </div>

          <div className="p-5 bg-white border border-slate-200/80 rounded-2xl space-y-1.5 shadow-xs hover:border-purple-200 transition">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Database Role</span>
            <div className="text-xl font-bold text-emerald-600 capitalize">{userRole || 'Resolving...'}</div>
            <div className="text-xs text-slate-500">
              {userRole === 'viewer' ? '🚫 Restricted: Cannot run or approve workflows' : '✅ Permitted: Can trigger & approve steps'}
            </div>
          </div>

          <div className="p-5 bg-white border border-slate-200/80 rounded-2xl space-y-1.5 shadow-xs hover:border-purple-200 transition">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quota Usage</span>
            <div className="text-xl font-bold text-slate-900">
              {orgData ? `${orgData.quota_used} / ${orgData.quota_limit} Runs` : '0 / 100 Runs'}
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-gradient-to-r from-purple-600 to-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, ((orgData?.quota_used || 0) / (orgData?.quota_limit || 100)) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main Workspace Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workflows List */}
          <div className="lg:col-span-1 bg-white border border-slate-200/80 rounded-3xl p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-600" /> Workflows
              </h2>
              {userRole !== 'viewer' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs px-3.5 py-2 rounded-xl font-semibold shadow-xs transition"
                >
                  <Plus className="w-4 h-4" /> New
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-sm text-slate-400 py-6 text-center">Loading workflows...</div>
            ) : workflows.length === 0 ? (
              <div className="text-sm text-slate-400 py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                No workflows found in this organization.
              </div>
            ) : (
              <div className="space-y-3.5">
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="p-4 bg-slate-50/70 hover:bg-purple-50/30 border border-slate-200/70 hover:border-purple-300 rounded-2xl space-y-2.5 transition group"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 text-sm group-hover:text-purple-700 transition">{wf.name}</h3>
                      {userRole !== 'viewer' ? (
                        <button
                          onClick={() => handleTriggerWorkflow(wf.id)}
                          className="flex items-center gap-1.5 bg-slate-900 hover:bg-purple-600 text-white text-xs px-3 py-1.5 rounded-xl font-semibold transition shadow-xs"
                        >
                          <Play className="w-3 h-3 fill-current" /> Run
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Viewer
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{wf.description || 'No description'}</p>
                    <div className="text-[11px] text-slate-400 font-mono">ID: {wf.id}</div>
                    <div className="text-xs text-slate-500 font-medium flex items-center gap-2 pt-1">
                      <span>Steps: {wf.workflow_steps?.length || 0}</span>
                      <span>•</span>
                      <span>Status: {wf.workflow_runs?.[0]?.status || 'Never Run'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Execution Monitor */}
          <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-3xl p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-indigo-600" /> Live Execution Monitor
                </h2>
                {activeRunId && <div className="text-xs text-slate-400 font-mono mt-0.5">Run ID: {activeRunId}</div>}
              </div>
              {runStatus && (
                <span
                  className={`text-xs px-3.5 py-1 rounded-full font-bold uppercase ${
                    runStatus === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : runStatus === 'paused'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-purple-50 text-purple-700 border border-purple-200'
                  }`}
                >
                  Status: {runStatus}
                </span>
              )}
            </div>

            {!activeRunId ? (
              <div className="py-20 text-center text-slate-400 text-sm font-medium">
                Select or trigger a workflow to view step-by-step real-time execution.
              </div>
            ) : (
              <div className="space-y-4">
                {stepRuns.map((sr) => (
                  <div key={sr.id} className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                          {sr.workflow_step?.step_order || 1}
                        </span>
                        <span className="font-bold text-sm uppercase tracking-wide text-slate-800">
                          {sr.workflow_step?.type}
                        </span>
                      </div>

                      <span
                        className={`text-xs px-3 py-1 rounded-full font-bold ${
                          sr.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : sr.status === 'paused'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        {sr.status}
                      </span>
                    </div>

                    {sr.output && (
                      <pre className="p-4 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 overflow-x-auto shadow-2xs">
                        {JSON.stringify(sr.output, null, 2)}
                      </pre>
                    )}

                    {/* Pause / Approval Gate UI */}
                    {sr.status === 'paused' && (
                      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                        <div className="text-xs text-amber-800 font-semibold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Workflow execution paused awaiting approval.</span>
                        </div>
                        <button
                          onClick={() => handleApproveStep(sr.id)}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition"
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

        {/* Cross-Org Isolation Security Tester */}
        <div className="p-6 bg-white border border-slate-200/80 rounded-3xl space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500" /> Cross-Org Isolation Test (ID Guessing Security Verification)
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Enter an Org A Workflow ID while signed in as Org B user to prove strict Hasura RLS rejection (returns empty result).
          </p>

          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter target Workflow ID (e.g. Org A workflow UUID)"
              value={idGuessInput}
              onChange={(e) => setIdGuessInput(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white transition"
            />
            <button
              onClick={handleTestIdGuessing}
              className="bg-slate-900 hover:bg-purple-600 text-white text-xs px-5 py-2.5 rounded-xl font-semibold shadow-xs transition"
            >
              Execute Raw Query
            </button>
          </div>

          {idGuessResult && (
            <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 overflow-x-auto">
              {JSON.stringify(idGuessResult, null, 2)}
            </pre>
          )}
        </div>
      </main>

      {/* Create Custom Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-xl font-extrabold text-slate-900">Create Custom Workflow</h2>
            <form onSubmit={handleCreateWorkflow} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Workflow Name</label>
                <input
                  type="text"
                  required
                  value={newWfName}
                  onChange={(e) => setNewWfName(e.target.value)}
                  placeholder="Financial Refund Escalation"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Description</label>
                <input
                  type="text"
                  value={newWfDesc}
                  onChange={(e) => setNewWfDesc(e.target.value)}
                  placeholder="AI refund evaluation with VP signoff"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Step 1 Configuration: LLM Prompt */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="text-xs font-bold text-purple-700 flex items-center justify-between">
                  <span>Step 1: LLM Call</span>
                  <span className="text-[10px] text-slate-400 font-mono">type: llm_call</span>
                </div>
                <label className="text-[11px] font-semibold text-slate-500 block">LLM Input Prompt</label>
                <textarea
                  rows={2}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none font-mono"
                />
              </div>

              {/* Step 2 Configuration: Conditional Branch */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="text-xs font-bold text-purple-700 flex items-center justify-between">
                  <span>Step 2: Conditional Branch</span>
                  <span className="text-[10px] text-slate-400 font-mono">type: conditional_branch</span>
                </div>
                <label className="text-[11px] font-semibold text-slate-500 block">Branch Target Condition</label>
                <input
                  type="text"
                  value={customCondition}
                  onChange={(e) => setCustomCondition(e.target.value)}
                  placeholder="URGENT"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none font-mono"
                />
              </div>

              {/* Step 3 Configuration: Approval Gate */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="text-xs font-bold text-purple-700 flex items-center justify-between">
                  <span>Step 3: Approval Gate</span>
                  <span className="text-[10px] text-slate-400 font-mono">type: approval_gate</span>
                </div>
                <label className="text-[11px] font-semibold text-slate-500 block">Gate Signoff Title</label>
                <input
                  type="text"
                  value={customGateName}
                  onChange={(e) => setCustomGateName(e.target.value)}
                  placeholder="Finance VP Signoff"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-4 py-2.5 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs px-5 py-2.5 rounded-xl font-semibold shadow-xs"
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
