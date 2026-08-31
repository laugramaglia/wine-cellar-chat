// End-to-end check of the OAuth 2.1 authorization code flow with PKCE — the flow an
// OAuth-only client such as Gemini performs.
//
//   node --experimental-strip-types scripts/oauth-smoke.ts <base-url> <bootstrap-secret> [admin-token]
//
// On a fresh deployment it bootstraps its own admin. On one that already has an admin —
// which is every real deployment, since /bootstrap refuses a second time — pass an admin
// token as the third argument. It creates nothing but an OAuth client and a grant, so it
// is safe to run against a deployment holding real data.
//
// It drives the whole thing over HTTP the way a real client would: discovery, dynamic
// client registration, the consent screen, the code exchange, and finally an MCP session
// authenticated with the resulting access token. It also asserts the things that must
// NOT work — a wrong token at the consent screen, a replayed authorization code, and a
// scope the identifying token does not itself hold.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8799').replace(/\/$/, '');
const SECRET = process.argv[3] ?? 'dev-bootstrap-secret';
const SUPPLIED_TOKEN = process.argv[4];

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: unknown, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
  }
}

const section = (t: string) => console.log(`\n${t}`);

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

const REDIRECT = 'https://example.com/oauth/callback';

/** Use a supplied token, or bootstrap one if this deployment has no admin yet. */
async function resolveAdminToken(): Promise<string> {
  if (SUPPLIED_TOKEN) return SUPPLIED_TOKEN;
  const res = await fetch(`${BASE}/bootstrap`, {
    method: 'POST',
    headers: { 'x-bootstrap-secret': SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'oauth smoke', email: `smoke+${Date.now()}@example.com`, label: 'oauth-smoke' }),
  });
  const body = (await res.json()) as { token?: { plaintext: string }; error?: string };
  if (body.token) return body.token.plaintext;
  console.error(
    `\nCannot obtain an admin token: ${body.error}\n` +
      'Pass one as the third argument:\n' +
      '  node --experimental-strip-types scripts/oauth-smoke.ts <url> <secret> <admin-token>\n',
  );
  process.exit(1);
}

async function main() {
  console.log(`OAuth 2.1 flow check against ${BASE}\n${'='.repeat(60)}`);

  section('An admin to identify with');
  const adminToken = await resolveAdminToken();
  check('have an admin token to authorize with', adminToken.startsWith('wc_'));

  section('Discovery');
  const meta = (await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json()) as {
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint: string;
    code_challenge_methods_supported?: string[];
  };
  check('authorization server metadata is published', Boolean(meta.authorization_endpoint), meta);
  check('S256 PKCE is advertised', meta.code_challenge_methods_supported?.includes('S256'), meta.code_challenge_methods_supported);

  section('Dynamic client registration');
  const reg = (await (
    await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Gemini (test)',
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    })
  ).json()) as { client_id: string; client_secret?: string };
  check('a client can register itself', Boolean(reg.client_id), reg);

  section('Consent screen');
  const { verifier, challenge } = await pkce();
  const authUrl = new URL(meta.authorization_endpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', reg.client_id);
  authUrl.searchParams.set('redirect_uri', REDIRECT);
  authUrl.searchParams.set('scope', 'catalog:read cellar:read recommend');
  authUrl.searchParams.set('state', 'xyz-state');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const page = await fetch(authUrl);
  const pageHtml = await page.text();
  check('the consent screen renders', page.status === 200 && pageHtml.includes('Authorize'), page.status);
  check('it names the client', pageHtml.includes('Gemini (test)'));
  check('it describes the scopes in words', pageHtml.includes('See what is in your cellar'));

  const oauthReqField = /name="oauth_req" value="([^"]+)"/.exec(pageHtml)?.[1];
  check('it carries the authorization request forward', Boolean(oauthReqField));
  const decoded = oauthReqField!.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

  const approve = async (token: string) => {
    const body = new URLSearchParams({ oauth_req: decoded, token, action: 'approve' });
    return fetch(meta.authorization_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
    });
  };

  section('Identity is proved, not assumed');
  const wrong = await approve('wc_definitely-not-a-real-token');
  check('a bad token is refused at the consent screen', wrong.status === 200 && (await wrong.text()).includes('not valid'), wrong.status);

  const good = await approve(adminToken);
  const location = good.headers.get('location') ?? '';
  check('approving redirects back to the client', good.status === 302 && location.startsWith(REDIRECT), { status: good.status, location });
  const returned = new URL(location);
  const code = returned.searchParams.get('code');
  check('with an authorization code', Boolean(code));
  check('and the state echoed back', returned.searchParams.get('state') === 'xyz-state');

  section('Token exchange');
  const tokenRes = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: REDIRECT,
      client_id: reg.client_id,
      client_secret: reg.client_secret ?? '',
      code_verifier: verifier,
    }),
  });
  const grant = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; token_type?: string; scope?: string };
  check('the code exchanges for an access token', Boolean(grant.access_token), grant);
  check('a refresh token comes with it', Boolean(grant.refresh_token));
  check('the granted scope is what was asked for', grant.scope?.includes('cellar:read'), grant.scope);

  section('Using the access token against MCP');
  const client = new Client({ name: 'oauth-smoke', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${grant.access_token}` } },
    }),
  );
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  check('an OAuth session reaches the MCP server', tools.length > 0, tools);
  check('and sees only the granted scopes', tools.length === 4, tools);
  check('cellar_list is available', tools.includes('cellar_list'));
  check('cellar_add is NOT — it was never granted', !tools.includes('cellar_add'), tools);
  check('user_create is NOT, despite the user being an admin', !tools.includes('user_create'), tools);

  const called = (await client.callTool({ name: 'wine_search', arguments: { query: 'anything' } })) as {
    isError?: boolean;
    content: Array<{ text: string }>;
  };
  check('a granted tool actually runs', !called.isError, called.content?.[0]?.text);
  await client.close();

  section('Refresh');
  const refreshed = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: grant.refresh_token!,
      client_id: reg.client_id,
      client_secret: reg.client_secret ?? '',
    }),
  });
  const next = (await refreshed.json()) as { access_token?: string };
  check('the refresh token yields a new access token', Boolean(next.access_token), next);

  section('A grant does not outlive its account');
  // The bug this asserts against was live in production: an OAuth token kept working
  // after its user was deleted, because the provider trusts the props it stored in KV
  // and never re-reads the database.
  {
    const victim = (await (await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }),
    })).status);
    check('the bearer admin session is alive to begin with', victim === 200, victim);

    // Authorize a client as a throwaway member, then suspend that member.
    const memberClient = new Client({ name: 'setup', version: '1.0.0' });
    await memberClient.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${adminToken}` } },
    }));
    const made = JSON.parse((await memberClient.callTool({
      name: 'user_create',
      arguments: { name: 'Ghost', email: `ghost+${Date.now()}@example.com`, role: 'member', issue_token: true, token_label: 'ghost' },
    }) as { content: Array<{ text: string }> }).content[0]!.text) as { user: { id: string }; token: { plaintext: string } };

    const p3 = await pkce();
    const u3 = new URL(meta.authorization_endpoint);
    u3.searchParams.set('response_type', 'code');
    u3.searchParams.set('client_id', reg.client_id);
    u3.searchParams.set('redirect_uri', REDIRECT);
    u3.searchParams.set('scope', 'cellar:read');
    u3.searchParams.set('state', 'ghost');
    u3.searchParams.set('code_challenge', p3.challenge);
    u3.searchParams.set('code_challenge_method', 'S256');
    const h3 = await (await fetch(u3)).text();
    const f3 = /name="oauth_req" value="([^"]+)"/.exec(h3)![1]!
      .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    const a3 = await fetch(meta.authorization_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ oauth_req: f3, token: made.token.plaintext, action: 'approve' }),
      redirect: 'manual',
    });
    const c3 = new URL(a3.headers.get('location')!).searchParams.get('code')!;
    const g3 = (await (await fetch(meta.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: c3, redirect_uri: REDIRECT,
        client_id: reg.client_id, client_secret: reg.client_secret ?? '', code_verifier: p3.verifier,
      }),
    })).json()) as { access_token?: string };
    check('the member authorized a client', Boolean(g3.access_token));

    const live = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${g3.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }),
    });
    check('and that grant works', live.status === 200, live.status);

    await memberClient.callTool({ name: 'user_update', arguments: { user_id: made.user.id, status: 'suspended' } });
    const afterSuspend = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${g3.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }),
    });
    check('suspending the user kills the OAuth grant immediately', afterSuspend.status === 401, afterSuspend.status);

    await memberClient.callTool({ name: 'user_update', arguments: { user_id: made.user.id, status: 'active' } });
    await memberClient.callTool({ name: 'user_delete', arguments: { user_id: made.user.id, hard: true } });
    const afterDelete = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${g3.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }),
    });
    check('deleting the user kills it too — no writes against a dangling id', afterDelete.status === 401, afterDelete.status);
    await memberClient.close();
  }

  section('Replaying an authorization code kills the grant');
  // Done last and on a grant of its own, because it is destructive by design: OAuth 2.1
  // requires that a replayed code revoke everything issued from it. Testing it earlier
  // silently invalidates the access token the rest of the run depends on — which is how
  // this check first appeared as a mysterious 401.
  {
    const p2 = await pkce();
    const u2 = new URL(meta.authorization_endpoint);
    u2.searchParams.set('response_type', 'code');
    u2.searchParams.set('client_id', reg.client_id);
    u2.searchParams.set('redirect_uri', REDIRECT);
    u2.searchParams.set('scope', 'catalog:read');
    u2.searchParams.set('state', 'replay-state');
    u2.searchParams.set('code_challenge', p2.challenge);
    u2.searchParams.set('code_challenge_method', 'S256');
    const html2 = await (await fetch(u2)).text();
    const field2 = /name="oauth_req" value="([^"]+)"/.exec(html2)![1]!
      .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    const approved2 = await fetch(meta.authorization_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ oauth_req: field2, token: adminToken, action: 'approve' }),
      redirect: 'manual',
    });
    const code2 = new URL(approved2.headers.get('location')!).searchParams.get('code')!;
    const exchange = (grantBody: Record<string, string>) =>
      fetch(meta.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(grantBody),
      });
    const body2 = {
      grant_type: 'authorization_code', code: code2, redirect_uri: REDIRECT,
      client_id: reg.client_id, client_secret: reg.client_secret ?? '', code_verifier: p2.verifier,
    };
    const first = (await (await exchange(body2)).json()) as { access_token?: string };
    check('the second code exchanges once', Boolean(first.access_token));

    const replay = await exchange(body2);
    check('and is rejected on replay', replay.status >= 400, replay.status);

    const afterReplay = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${first.access_token}`, 'content-type': 'application/json' },
    });
    check('the replay revokes the token already issued from it', afterReplay.status === 401, afterReplay.status);
  }

  section('The bearer path still works alongside it');
  const bearer = new Client({ name: 'bearer', version: '1.0.0' });
  await bearer.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${adminToken}` } },
    }),
  );
  const bearerTools = (await bearer.listTools()).tools.map((t) => t.name);
  check('the same endpoint accepts a wc_ token', bearerTools.length === 18, bearerTools.length);
  await bearer.close();

  const nonsense = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { Authorization: 'Bearer neither-kind-of-token' },
  });
  check('a credential of neither kind is rejected', nonsense.status === 401, nonsense.status);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nOAuth smoke test crashed:', err);
    process.exit(1);
  });
