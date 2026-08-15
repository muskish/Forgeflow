-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create tables if not exists
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    quota_limit INT NOT NULL DEFAULT 100,
    quota_used INT NOT NULL DEFAULT 0,
    quota_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, org_id)
);

CREATE TABLE IF NOT EXISTS public.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    type TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workflow_id, step_order)
);

CREATE TABLE IF NOT EXISTS public.workflow_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    triggered_by UUID,
    trigger_type TEXT NOT NULL DEFAULT 'manual',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.step_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'skipped')),
    input JSONB,
    output JSONB,
    error TEXT,
    attempt_count INT NOT NULL DEFAULT 0,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.org_usage_stats AS
SELECT 
    w.org_id,
    COUNT(r.id) AS total_runs,
    COALESCE(AVG(EXTRACT(EPOCH FROM (r.ended_at - r.started_at))), 0) AS avg_run_duration_seconds
FROM public.workflows w
LEFT JOIN public.workflow_runs r ON r.workflow_id = w.id
GROUP BY w.org_id;

-- Seed Sample Organizations
INSERT INTO public.organizations (id, name, quota_limit, quota_used)
VALUES 
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme Corp (Org A)', 100, 2),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Beta Inc (Org B)', 50, 0)
ON CONFLICT (id) DO NOTHING;

-- Seed Sample Org Members
INSERT INTO public.org_members (user_id, org_id, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'editor'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer'),
  ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'editor')
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Seed Sample Workflow for Org A
INSERT INTO public.workflows (id, org_id, name, description)
VALUES 
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Customer Escalation & Review Workflow', 'AI Ticket Classification with Approval Gate & Slack Notification')
ON CONFLICT (id) DO NOTHING;

-- Seed Steps for Org A Workflow
INSERT INTO public.workflow_steps (id, workflow_id, step_order, type, config)
VALUES
  ('s1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 1, 'llm_call', '{"prompt": "Analyze customer email: URGENT ticket requiring immediate refund"}'::jsonb),
  ('s2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 2, 'conditional_branch', '{"condition": "HIGH_PRIORITY"}'::jsonb),
  ('s3333333-3333-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', 3, 'approval_gate', '{"gate_name": "Executive Review"}'::jsonb),
  ('s4444444-4444-4444-4444-444444444444', 'c1111111-1111-1111-1111-111111111111', 4, 'notify', '{"channel": "slack", "message": "High priority ticket approved and processed"}'::jsonb)
ON CONFLICT (workflow_id, step_order) DO NOTHING;
