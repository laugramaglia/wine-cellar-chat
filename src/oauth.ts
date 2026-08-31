// The OAuth 2.1 authorization endpoint.
//
// Added because Gemini — and every other OAuth-only MCP client — refuses a server that
// authenticates with a static bearer token. ADR-0003 chose bearer tokens for the MVP and
// named OAuth as the upgrade path; this is that path, taken early and additively:
// the bearer flow still works, so no existing client breaks.
//
// The identity question this has to answer is "who is the person at this browser?", and
// the system has no passwords to ask for. What it does have is API tokens, so the consent
// screen asks for one. Pasting a live token proves the same thing a password would, using
// a credential the user already holds, and it maps the OAuth grant onto the exact same
// user row every other path resolves to.

import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { hashToken } from './auth.js';
import { getDb } from './db/client.js';
import { resolvePermissions } from './permissions.js';
import type { AuthProps } from './auth.js';

interface OAuthEnv extends Env {
  OAUTH_PROVIDER: OAuthHelpers;
}

const html = (body: string, status = 200) =>
  new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wine Cellar MCP — authorize</title>
<style>
  :root { color-scheme: light dark; --bg:#faf9f7; --fg:#1c1917; --muted:#6b6560;
          --line:#e3ded7; --card:#fff; --accent:#7c2d3a; --accent-fg:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#171412; --fg:#f2ede7; --muted:#a39c94; --line:#332e2a; --card:#211d1a;
            --accent:#b4485c; --accent-fg:#fff; }
  }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
         background:var(--bg); color:var(--fg);
         font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .card { width:100%; max-width:460px; background:var(--card); border:1px solid var(--line);
          border-radius:14px; padding:28px; }
  h1 { margin:0 0 4px; font-size:19px; letter-spacing:-0.01em; }
  .sub { margin:0 0 22px; color:var(--muted); font-size:13.5px; }
  .client { border:1px solid var(--line); border-radius:9px; padding:12px 14px; margin-bottom:20px;
            background:var(--bg); font-size:13.5px; }
  .client strong { display:block; font-size:15px; margin-bottom:2px; }
  .client code { color:var(--muted); font-size:12px; word-break:break-all; }
  ul { margin:0 0 22px; padding-left:20px; color:var(--muted); font-size:13.5px; }
  li { margin:3px 0; }
  label { display:block; font-weight:600; font-size:13px; margin-bottom:6px; }
  input { width:100%; padding:10px 12px; font:13px ui-monospace,SFMono-Regular,Menlo,monospace;
          border:1px solid var(--line); border-radius:9px; background:var(--bg); color:var(--fg); }
  input:focus { outline:2px solid var(--accent); outline-offset:1px; }
  .hint { color:var(--muted); font-size:12.5px; margin:7px 0 20px; }
  .row { display:flex; gap:10px; }
  button { flex:1; padding:11px 16px; font-size:14px; font-weight:600; border-radius:9px;
           border:1px solid var(--line); cursor:pointer; background:transparent; color:var(--fg); }
  button.primary { background:var(--accent); border-color:var(--accent); color:var(--accent-fg); }
  .err { background:#fdecee; color:#8a1c2b; border:1px solid #f3c4cb; padding:10px 12px;
         border-radius:9px; margin-bottom:18px; font-size:13.5px; }
  @media (prefers-color-scheme: dark) {
    .err { background:#3a1c22; color:#f7c9d0; border-color:#5c2c36; }
  }
</style></head><body><div class="card">${body}</div></body></html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The permissions an OAuth grant asks for, described the way a person reads them. */
const SCOPE_COPY: Record<string, string> = {
  'catalog:read': 'Search and read the shared wine catalogue',
  'catalog:write': 'Add wines to the shared catalogue',
  'cellar:read': 'See what is in your cellar',
  'cellar:write': 'Add, move and drink bottles in your cellar',
  'review:read': 'Read tasting reviews',
  'review:write': 'Write tasting reviews as you',
  'prefs:read': 'Read your palate profile',
  'prefs:write': 'Change your palate profile',
  recommend: 'Recommend wines to you',
  'admin:users': 'Create, suspend and delete user accounts',
  'admin:tokens': 'Issue and revoke API keys',
};

function consentPage(client: { clientName?: string; clientId: string }, req: AuthRequest, error?: string) {
  const name = escape(client.clientName || client.clientId);
  const scopes = req.scope.length > 0 ? req.scope : ['(the full permissions of your role)'];
  return html(`
    <h1>Authorize ${name}</h1>
    <p class="sub">It is asking to use your Wine Cellar account.</p>
    ${error ? `<div class="err">${escape(error)}</div>` : ''}
    <div class="client">
      <strong>${name}</strong>
      <code>${escape(req.redirectUri)}</code>
    </div>
    <ul>${scopes.map((s) => `<li>${escape(SCOPE_COPY[s] ?? s)}</li>`).join('')}</ul>
    <form method="POST" action="/authorize">
      <input type="hidden" name="oauth_req" value="${escape(btoa(JSON.stringify(req)))}">
      <label for="token">Your Wine Cellar API token</label>
      <input id="token" name="token" type="password" autocomplete="off" spellcheck="false"
             placeholder="wc_..." required autofocus>
      <p class="hint">This proves who you are. It is checked and discarded — the connected
         app never receives it, and gets its own credential instead.</p>
      <div class="row">
        <button type="submit" name="action" value="deny">Deny</button>
        <button type="submit" name="action" value="approve" class="primary">Approve</button>
      </div>
    </form>`);
}

export async function handleAuthorizeGet(request: Request, env: OAuthEnv): Promise<Response> {
  let authReq: AuthRequest;
  try {
    authReq = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (err) {
    return html(`<h1>Invalid request</h1><p class="sub">${escape(
      err instanceof Error ? err.message : String(err),
    )}</p>`, 400);
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(authReq.clientId);
  if (!client) {
    return html('<h1>Unknown client</h1><p class="sub">That application is not registered with this server.</p>', 400);
  }
  return consentPage({ clientName: client.clientName, clientId: client.clientId }, authReq);
}

export async function handleAuthorizePost(request: Request, env: OAuthEnv): Promise<Response> {
  const form = await request.formData();
  const rawReq = String(form.get('oauth_req') ?? '');
  const presented = String(form.get('token') ?? '').trim();
  const action = String(form.get('action') ?? '');

  let authReq: AuthRequest;
  try {
    authReq = JSON.parse(atob(rawReq)) as AuthRequest;
  } catch {
    return html('<h1>Invalid request</h1><p class="sub">The authorization request was malformed. Start again from the app.</p>', 400);
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(authReq.clientId);
  const shown = { clientName: client?.clientName, clientId: authReq.clientId };

  if (action !== 'approve') {
    const denied = new URL(authReq.redirectUri);
    denied.searchParams.set('error', 'access_denied');
    if (authReq.state) denied.searchParams.set('state', authReq.state);
    return Response.redirect(denied.toString(), 302);
  }

  // Identify the person by the token they hold. Same lookup as every other path.
  const db = getDb(env);
  try {
    return await completeConsent(db, env, authReq, shown, presented, client);
  } finally {
    await db.dispose();
  }
}

async function completeConsent(
  db: ReturnType<typeof getDb>,
  env: OAuthEnv,
  authReq: AuthRequest,
  shown: { clientName?: string; clientId: string },
  presented: string,
  client: { clientName?: string } | null,
): Promise<Response> {
  const token = await db.findTokenByHash(await hashToken(presented));
  if (!token || token.revoked_at || (token.expires_at && token.expires_at <= new Date().toISOString())) {
    return consentPage(shown, authReq, 'That token is not valid, or it has been revoked or expired.');
  }
  const user = await db.getUser(token.user_id);
  if (!user || user.status !== 'active') {
    return consentPage(shown, authReq, `That account is ${user ? user.status : 'missing'} and cannot authorize anything.`);
  }

  // A grant can never exceed what the identifying token itself could do: role first,
  // narrowed by that token's scopes, then narrowed again by what the client asked for.
  const held = resolvePermissions(user.role, token.scopes);
  const granted = authReq.scope.length > 0 ? held.filter((p) => authReq.scope.includes(p)) : held;

  if (granted.length === 0) {
    return consentPage(shown, authReq, 'That token grants none of the permissions this application is asking for.');
  }

  const props: AuthProps = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tokenId: token.id,
    tokenLabel: `oauth:${client?.clientName ?? authReq.clientId}`,
    permissions: granted,
  };

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authReq,
    userId: user.id,
    metadata: { name: user.name, email: user.email, authorizedAt: new Date().toISOString() },
    scope: granted,
    props,
  });

  return Response.redirect(redirectTo, 302);
}
