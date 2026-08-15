'use client';

import React, { useState, useEffect } from 'react';
import { fetchGraphQL, callFunctionsAction, GET_ORG_WORKFLOWS, CREATE_WORKFLOW_MUTATION } from '@/lib/graphql';
import {
  Play, Plus, RefreshCw, CheckCircle, Clock, AlertTriangle, Shield, Check, Lock, ChevronRight, Zap, LogOut, LogIn, UserCheck,
  Layers, Cpu, Sparkles, ShieldAlert, Hexagon
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
      } catch (e) { }
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

  // Unauthenticated Login Screen in Matte Gray & Electric Lime (#d4fc30)
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#d6d6d8] text-[#171717] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-[#eaeaea] border border-slate-300/80 rounded-3xl p-8 space-y-6 shadow-lg">
          <div className="text-center space-y-3">
            <div className="inline-flex p-4 rounded-2xl bg-[#d4fc30] text-[#171717] shadow-sm">
              <Hexagon className="w-8 h-8 fill-current" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#171717]">
              Forgeflow <span className="bg-[#d4fc30] text-[#171717] px-2 py-0.5 rounded-lg inline-block">AI Engine</span>
            </h1>
            <p className="text-sm text-slate-600 font-medium">Sign in with an authenticated user account</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSignIn(emailInput);
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">Email Address</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="user@orga.com"
                className="w-full bg-[#f4f4f5] border border-slate-300 rounded-2xl px-4 py-3 text-sm text-[#171717] focus:outline-none focus:border-slate-900 transition font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">Password</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-[#f4f4f5] border border-slate-300 rounded-2xl px-4 py-3 text-sm text-[#171717] focus:outline-none focus:border-slate-900 transition font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-2 bg-[#d4fc30] hover:bg-[#c0eb00] text-[#171717] text-sm py-3.5 rounded-full font-black shadow-sm transition active:scale-98"
            >
              <LogIn className="w-4 h-4" /> {isSigningIn ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          {/* Quick Sign In Buttons in Hexabot Matte Capsules */}
          <div className="border-t border-slate-300/60 pt-5 space-y-3">
            <span className="text-xs text-slate-600 block text-center font-bold uppercase tracking-wider">Select Test Account to Sign In:</span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleSignIn('owner@orga.com')}
                className="text-xs p-3 bg-[#f4f4f5] hover:bg-[#d4fc30] border border-slate-300 rounded-2xl text-left transition group"
              >
                <div className="font-extrabold text-[#171717]">Org A Owner</div>
                <div className="text-[11px] text-slate-500 font-medium">owner@orga.com</div>
              </button>

              <button
                onClick={() => handleSignIn('editor@orga.com')}
                className="text-xs p-3 bg-[#f4f4f5] hover:bg-[#d4fc30] border border-slate-300 rounded-2xl text-left transition group"
              >
                <div className="font-extrabold text-[#171717]">Org A Editor</div>
                <div className="text-[11px] text-slate-500 font-medium">editor@orga.com</div>
              </button>

              <button
                onClick={() => handleSignIn('viewer@orga.com')}
                className="text-xs p-3 bg-[#f4f4f5] hover:bg-[#d4fc30] border border-slate-300 rounded-2xl text-left transition group"
              >
                <div className="font-extrabold text-[#171717]">Org A Viewer</div>
                <div className="text-[11px] text-slate-500 font-medium">viewer@orga.com</div>
              </button>

              <button
                onClick={() => handleSignIn('editor@orgb.com')}
                className="text-xs p-3 bg-[#f4f4f5] hover:bg-[#d4fc30] border border-slate-300 rounded-2xl text-left transition group"
              >
                <div className="font-extrabold text-[#171717]">Org B Editor</div>
                <div className="text-[11px] text-slate-500 font-medium">editor@orgb.com</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Dashboard in Hexabot Matte Gray & Electric Lime Palette
  return (
    <div className="min-h-screen bg-[#d6d6d8] text-[#171717] flex font-sans">
      {/* Sidebar matching Hexabot Matte Black & Lime Aesthetics */}
      <aside className="w-16 bg-[#171717] flex flex-col items-center justify-between py-6 shrink-0 shadow-lg">
        <div className="flex flex-col items-center gap-6">
          {/* Hexabot Logo Icon */}
          <button
            onClick={() => loadWorkflows()}
            className="w-10 h-10 rounded-2xl bg-[#d4fc30] text-[#171717] flex items-center justify-center font-black shadow-md hover:bg-[#c0eb00] transition"
            title="Refresh Data"
          >
            <Hexagon className="w-5 h-5 fill-current" />
          </button>

          <nav className="flex flex-col items-center gap-3">
            {/* New Workflow Action */}
            {userRole !== 'viewer' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-10 h-10 rounded-2xl bg-[#262626] text-[#d4fc30] hover:bg-[#d4fc30] hover:text-[#171717] flex items-center justify-center transition"
                title="Create New Workflow"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}

            {/* Workflows Navigation */}
            <button
              onClick={() => loadWorkflows()}
              className="w-10 h-10 rounded-2xl bg-[#262626] text-slate-300 hover:text-white flex items-center justify-center transition"
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
            className="w-10 h-10 rounded-full bg-[#262626] hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Workspace View */}
      <main className="flex-1 p-8 space-y-8 max-w-7xl mx-auto overflow-y-auto">
        {/* Hexabot Hero Headline */}
        <div className="space-y-3">
          <h1 className="text-4xl font-black tracking-tight text-[#171717]">
            How can I help you today,{' '}
            <span className="bg-[#d4fc30] text-[#171717] px-3.5 py-0.5 rounded-full inline-block font-black border border-slate-900/10">
              {currentUser.displayName}
            </span>
          </h1>
          <p className="text-slate-600 font-semibold text-base">
            Select or run a workflow in <span className="font-extrabold text-[#171717]">{userOrgName || 'Loading...'}</span>
          </p>
        </div>

        {/* User Context & Quota Metric Cards (Hexabot Pill Styling) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-5 bg-[#eaeaea] border border-slate-300/80 rounded-3xl space-y-1.5 shadow-xs">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Organization</span>
            <div className="text-xl font-black text-[#171717]">{userOrgName || 'Resolving...'}</div>
            <div className="text-xs text-slate-600 font-mono font-bold">Org ID: {userOrgId || '...'}</div>
          </div>

          <div className="p-5 bg-[#eaeaea] border border-slate-300/80 rounded-3xl space-y-1.5 shadow-xs">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Database Role</span>
            <div className="text-xl font-black text-[#171717] capitalize">{userRole || 'Resolving...'}</div>
            <div className="text-xs text-slate-600 font-medium">
              {userRole === 'viewer' ? '🚫 Restricted: Cannot run or approve workflows' : '✅ Permitted: Can trigger & approve steps'}
            </div>
          </div>

          <div className="p-5 bg-[#eaeaea] border border-slate-300/80 rounded-3xl space-y-1.5 shadow-xs">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Quota Usage</span>
            <div className="text-xl font-black text-[#171717]">
              {orgData ? `${orgData.quota_used} / ${orgData.quota_limit} Runs` : '0 / 100 Runs'}
            </div>
            <div className="w-full bg-slate-300 h-3 rounded-full overflow-hidden mt-1 p-0.5">
              <div
                className="bg-[#d4fc30] h-full rounded-full transition-all duration-500 border border-slate-800"
                style={{ width: `${Math.min(100, ((orgData?.quota_used || 0) / (orgData?.quota_limit || 100)) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main Workspace Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workflows List */}
          <div className="lg:col-span-1 bg-[#eaeaea] border border-slate-300/80 rounded-3xl p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-[#171717] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#171717]" /> Workflows
              </h2>
              {userRole !== 'viewer' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 bg-[#d4fc30] hover:bg-[#c0eb00] text-[#171717] text-xs px-4 py-2 rounded-full font-black shadow-xs transition"
                >
                  <Plus className="w-4 h-4" /> New Task
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-sm text-slate-500 py-6 text-center font-bold">Loading workflows...</div>
            ) : workflows.length === 0 ? (
              <div className="text-sm text-slate-500 py-10 text-center border-2 border-dashed border-slate-300 rounded-3xl font-bold">
                No workflows found in this organization.
              </div>
            ) : (
              <div className="space-y-3.5">
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="p-4 bg-[#f4f4f5] hover:bg-[#ffffff] border border-slate-300/80 rounded-2xl space-y-2.5 transition group"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-[#171717] text-sm">{wf.name}</h3>
                      {userRole !== 'viewer' ? (
                        <button
                          onClick={() => handleTriggerWorkflow(wf.id)}
                          className="flex items-center gap-1.5 bg-[#171717] hover:bg-[#d4fc30] hover:text-[#171717] text-white text-xs px-3.5 py-1.5 rounded-full font-black transition shadow-xs"
                        >
                          <Play className="w-3 h-3 fill-current" /> Run
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 flex items-center gap-1 font-bold">
                          <Lock className="w-3 h-3" /> Viewer
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">{wf.description || 'No description'}</p>
                    <div className="text-[11px] text-slate-500 font-mono font-bold">ID: {wf.id}</div>
                    <div className="text-xs text-slate-600 font-bold flex items-center gap-2 pt-1">
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
          <div className="lg:col-span-2 bg-[#eaeaea] border border-slate-300/80 rounded-3xl p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-300/80 pb-4">
              <div>
                <h2 className="text-lg font-black text-[#171717] flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-[#171717]" /> Live Execution Monitor
                </h2>
                {activeRunId && <div className="text-xs text-slate-600 font-mono font-bold mt-0.5">Run ID: {activeRunId}</div>}
              </div>
              {runStatus && (
                <span
                  className={`text-xs px-4 py-1.5 rounded-full font-black uppercase tracking-wider ${runStatus === 'completed'
                      ? 'bg-emerald-200 text-emerald-950 border border-emerald-400'
                      : runStatus === 'paused'
                        ? 'bg-[#d4fc30] text-[#171717] border border-slate-900'
                        : 'bg-slate-300 text-slate-900 border border-slate-400'
                    }`}
                >
                  Status: {runStatus}
                </span>
              )}
            </div>

            {!activeRunId ? (
              <div className="py-20 text-center text-slate-500 text-sm font-extrabold">
                Select or trigger a workflow to view step-by-step real-time execution.
              </div>
            ) : (
              <div className="space-y-4">
                {stepRuns.map((sr) => (
                  <div key={sr.id} className="p-5 bg-[#f4f4f5] border border-slate-300/80 rounded-2xl space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-[#171717] text-[#d4fc30] text-xs font-black flex items-center justify-center">
                          {sr.workflow_step?.step_order || 1}
                        </span>
                        <span className="font-extrabold text-sm uppercase tracking-wide text-[#171717]">
                          {sr.workflow_step?.type}
                        </span>
                      </div>

                      <span
                        className={`text-xs px-3.5 py-1 rounded-full font-black ${sr.status === 'completed'
                            ? 'bg-emerald-200 text-emerald-950 border border-emerald-300'
                            : sr.status === 'paused'
                              ? 'bg-[#d4fc30] text-[#171717] border border-slate-900'
                              : 'bg-slate-300 text-slate-800'
                          }`}
                      >
                        {sr.status}
                      </span>
                    </div>

                    {sr.output && (
                      <pre className="p-4 bg-white border border-slate-300/80 rounded-2xl text-xs font-mono text-slate-900 overflow-x-auto shadow-2xs font-semibold">
                        {JSON.stringify(sr.output, null, 2)}
                      </pre>
                    )}

                    {/* Pause / Approval Gate UI */}
                    {sr.status === 'paused' && (
                      <div className="p-4 bg-[#d4fc30] border border-slate-900 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
                        <div className="text-xs text-[#171717] font-black flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-[#171717] shrink-0" />
                          <span>Workflow execution paused awaiting approval.</span>
                        </div>
                        <button
                          onClick={() => handleApproveStep(sr.id)}
                          className="bg-[#171717] hover:bg-slate-800 text-white font-black text-xs px-5 py-2.5 rounded-full shadow-xs transition"
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
        <div className="p-6 bg-[#eaeaea] border border-slate-300/80 rounded-3xl space-y-4 shadow-xs">
          <h2 className="text-sm font-black text-[#171717] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" /> Cross-Org Isolation Test (ID Guessing Security Verification)
          </h2>
          <p className="text-xs text-slate-600 font-bold">
            Enter an Org A Workflow ID while signed in as Org B user to prove strict Hasura RLS rejection (returns empty result).
          </p>

          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter target Workflow ID (e.g. Org A workflow UUID)"
              value={idGuessInput}
              onChange={(e) => setIdGuessInput(e.target.value)}
              className="flex-1 bg-[#f4f4f5] border border-slate-300 rounded-2xl px-4 py-3 text-xs text-[#171717] focus:outline-none focus:border-slate-900 transition font-bold"
            />
            <button
              onClick={handleTestIdGuessing}
              className="bg-[#171717] hover:bg-[#d4fc30] hover:text-[#171717] text-white text-xs px-6 py-3 rounded-full font-black transition shadow-xs"
            >
              Execute Raw Query
            </button>
          </div>

          {idGuessResult && (
            <pre className="p-4 bg-white border border-slate-300/80 rounded-2xl text-xs font-mono text-slate-900 overflow-x-auto font-semibold">
              {JSON.stringify(idGuessResult, null, 2)}
            </pre>
          )}
        </div>
      </main>

      {/* Create Custom Workflow Modal (Hexabot Matte Gray & Electric Lime Styling) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-[#171717]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#eaeaea] border border-slate-300 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-xl font-black text-[#171717]">Create Custom Workflow</h2>
            <form onSubmit={handleCreateWorkflow} className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">Workflow Name</label>
                <input
                  type="text"
                  required
                  value={newWfName}
                  onChange={(e) => setNewWfName(e.target.value)}
                  placeholder="Financial Refund Escalation"
                  className="w-full bg-[#f4f4f5] border border-slate-300 rounded-2xl px-4 py-2.5 text-sm text-[#171717] focus:outline-none font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">Description</label>
                <input
                  type="text"
                  value={newWfDesc}
                  onChange={(e) => setNewWfDesc(e.target.value)}
                  placeholder="AI refund evaluation with VP signoff"
                  className="w-full bg-[#f4f4f5] border border-slate-300 rounded-2xl px-4 py-2.5 text-sm text-[#171717] focus:outline-none font-bold"
                />
              </div>

              {/* Step 1 Configuration: LLM Prompt */}
              <div className="p-4 bg-[#f4f4f5] border border-slate-300/80 rounded-2xl space-y-2">
                <div className="text-xs font-black text-[#171717] flex items-center justify-between">
                  <span>Step 1: LLM Call</span>
                  <span className="text-[10px] text-slate-500 font-mono">type: llm_call</span>
                </div>
                <label className="text-[11px] font-bold text-slate-600 block">LLM Input Prompt</label>
                <textarea
                  rows={2}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-[#171717] focus:outline-none font-mono font-semibold"
                />
              </div>

              {/* Step 2 Configuration: Conditional Branch */}
              <div className="p-4 bg-[#f4f4f5] border border-slate-300/80 rounded-2xl space-y-2">
                <div className="text-xs font-black text-[#171717] flex items-center justify-between">
                  <span>Step 2: Conditional Branch</span>
                  <span className="text-[10px] text-slate-500 font-mono">type: conditional_branch</span>
                </div>
                <label className="text-[11px] font-bold text-slate-600 block">Branch Target Condition</label>
                <input
                  type="text"
                  value={customCondition}
                  onChange={(e) => setCustomCondition(e.target.value)}
                  placeholder="URGENT"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-[#171717] focus:outline-none font-mono font-semibold"
                />
              </div>

              {/* Step 3 Configuration: Approval Gate */}
              <div className="p-4 bg-[#f4f4f5] border border-slate-300/80 rounded-2xl space-y-2">
                <div className="text-xs font-black text-[#171717] flex items-center justify-between">
                  <span>Step 3: Approval Gate</span>
                  <span className="text-[10px] text-slate-400 font-mono">type: approval_gate</span>
                </div>
                <label className="text-[11px] font-bold text-slate-600 block">Gate Signoff Title</label>
                <input
                  type="text"
                  value={customGateName}
                  onChange={(e) => setCustomGateName(e.target.value)}
                  placeholder="Finance VP Signoff"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-[#171717] focus:outline-none font-semibold"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-slate-300 hover:bg-slate-400 text-slate-900 text-xs px-5 py-2.5 rounded-full font-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#d4fc30] hover:bg-[#c0eb00] text-[#171717] text-xs px-6 py-2.5 rounded-full font-black shadow-xs"
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
