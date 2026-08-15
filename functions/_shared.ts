const HASURA_ENDPOINT = process.env.NHOST_HASURA_URL || 'http://localhost:1337/v1/graphql';
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';

export async function executeAdminGraphQL(query: string, variables: any = {}) {
  const response = await fetch(HASURA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL Error: ${JSON.stringify(result.errors)}`);
  }
  return result.data;
}

export async function verifyUserRole(userId: string, orgId: string) {
  const query = `
    query CheckOrgRole($userId: uuid!, $orgId: uuid!) {
      org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) {
        role
      }
    }
  `;
  const data = await executeAdminGraphQL(query, { userId, orgId });
  const members = data.org_members || [];
  if (members.length === 0) return null;
  return members[0].role as 'owner' | 'editor' | 'viewer';
}

export async function callLLM(prompt: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER || 'stub';
  const apiKey = process.env.LLM_API_KEY;

  if (provider === 'groq' && apiKey) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Groq LLM API returned status ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No response generated';
  }

  // Artificial delay stub for offline/test mode
  await new Promise((resolve) => setTimeout(resolve, 1500));
  
  // Return deterministic keyword output for testing dynamic conditional branch logic
  if (prompt.toLowerCase().includes('urgent') || prompt.toLowerCase().includes('high')) {
    return 'CLASSIFICATION: HIGH_PRIORITY';
  }
  return 'CLASSIFICATION: NORMAL_PRIORITY';
}
