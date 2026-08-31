// Worker entry.
//
// /mcp accepts TWO kinds of credential, and this is deliberate:
//
//   1. an OAuth 2.1 access token, for clients that will not speak anything else
//      (Gemini refuses a server without it) — handled by OAuthProvider;
//   2. a static `wc_` bearer token, for Claude Code, Cursor and anything else that
//      can set a header — handled by resolveExternalToken below.
//
// ADR-0003 chose bearer tokens for the MVP and named OAuth as the upgrade path. Taking
// that path additively rather than as a replacement is what keeps every client that
// works today working tomorrow.
//
// Either way an unknown, revoked or expired credential — or one whose user is not
// active — is rejected before any tool list is produced.

import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { authenticate, generateToken, hashToken, lastFour, touchLastUsed } from './auth.js';
import { WineMcp } from './mcp.js';
import { getDb, getDbAdmin } from './db/client.js';
import { handleAuthorizeGet, handleAuthorizePost } from './oauth.js';
import { resolvePermissions } from './permissions.js';
import type { AuthProps } from './auth.js';

export { WineMcp };
export { MockDb } from './db/mock.js';

const MCP_PATH = '/mcp';

/** Everything that is not /mcp: health, bootstrap, reset, and the consent screen. */
const site = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/authorize') {
      const oauthEnv = env as Env & { OAUTH_PROVIDER: import('@cloudflare/workers-oauth-provider').OAuthHelpers };
      if (request.method === 'GET') return handleAuthorizeGet(request, oauthEnv);
      if (request.method === 'POST') return handleAuthorizePost(request, oauthEnv);
      return json({ error: 'Use GET or POST.' }, 405);
    }

    if (url.pathname === '/health') {
      const probe = getDbAdmin(env);
      let stats: Record<string, number>;
      try {
        stats = await probe.stats();
      } finally {
        await probe.dispose();
      }
      return json({
        status: 'ok',
        service: 'wine-cellar-mcp',
        storage: 'neon postgres via hyperdrive',
        endpoint: MCP_PATH,
        rows: stats,
      });
    }

    // The first admin cannot be created through a tool — there is nobody to authorize
    // it. With the database mocked inside a Durable Object there is no psql to seed
    // from either, so the bootstrap is this route: secret-gated, and idempotent in the
    // way ADR-0013 leaves open — it refuses once any active admin exists, so a second
    // run can never be a silent privilege grant.
    if (url.pathname === '/bootstrap' && request.method === 'POST') {
      return bootstrap(request, env);
    }

    // There is deliberately NO /reset route. An earlier build had one, secret-gated, to
    // return a test deployment to a known state. It was removed once real data went in:
    // a single leaked secret would have wiped somebody's entire cellar, and the only
    // thing it bought was convenience during testing. To wipe a deployment now, redeploy
    // with a new Durable Object migration tag. Inconvenient on purpose.

    return json({ error: `Not found. The MCP endpoint is ${MCP_PATH}.` }, 404);
  },
} satisfies ExportedHandler<Env>;

/**
 * Runs once a credential has been accepted — by the OAuth provider from its own grant, or
 * by resolveExternalToken from a `wc_` token.
 *
 * It then re-reads the user, EVERY REQUEST, and this is not belt-and-braces: an OAuth
 * access token carries its props encrypted in KV and the provider injects them without
 * consulting the database at all. Without the check below, a grant outlives the account
 * that authorized it — a deleted user keeps writing (and their rows land against a
 * dangling user_id), a suspended user keeps working, and a demoted admin keeps their old
 * permissions until the token expires an hour later.
 *
 * That is not hypothetical. It happened here on 2026-08-29: a Gemini grant authorized
 * before a database reset went on writing a cellar lot and a review against a user row
 * that no longer existed, and neither the owner nor `cellar_list` could see them.
 *
 * Permissions are re-derived from the CURRENT role and intersected with what the grant
 * already held, so this can only ever narrow — a promotion does not silently widen a
 * session that was authorized before it.
 */
const mcpApi = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const holder = ctx as unknown as { props?: AuthProps };
    const props = holder.props;
    if (!props?.userId) return unauthorized('No resolved identity on this request.');

    const check = getDb(env);
    let user;
    try {
      user = await check.getUser(props.userId);
    } finally {
      await check.dispose();
    }
    if (!user) return unauthorized('The account this credential was issued for no longer exists.');
    if (user.status !== 'active') return unauthorized(`Account is ${user.status}.`);

    const held = new Set(resolvePermissions(user.role, null));
    holder.props = {
      ...props,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: props.permissions.filter((p) => held.has(p)),
    };

    return WineMcp.serve(MCP_PATH, { binding: 'WINE_MCP' }).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

function unauthorized(detail: string): Response {
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: detail }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': 'Bearer realm="wine-cellar-mcp", error="invalid_token"',
    },
  });
}

export default new OAuthProvider({
  apiRoute: MCP_PATH,
  apiHandler: mcpApi,
  defaultHandler: site,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  scopesSupported: [
    'catalog:read', 'catalog:write',
    'cellar:read', 'cellar:write',
    'review:read', 'review:write',
    'prefs:read', 'prefs:write',
    'recommend',
    'admin:users', 'admin:tokens',
  ],

  /**
   * The bearer path, preserved. The provider calls this when the presented token is not
   * one of its own; a `wc_` token is validated exactly as it always was, and the props
   * it produces are the same shape an OAuth grant produces.
   */
  async resolveExternalToken({ token, request, env }) {
    const auth = await authenticate(withBearer(request, token), env as Env);
    if (!auth.ok) return null;
    // Best-effort and off the request path, exactly as before; never an audit signal.
    void touchLastUsed(env as Env, auth.tokenId);
    return { props: auth.props };
  },
});

/** authenticate() reads the Authorization header; the provider hands us the bare token. */
function withBearer(request: Request, token: string): Request {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(request.url, { method: request.method, headers });
}

async function bootstrap(request: Request, env: Env): Promise<Response> {
  const secret = env.BOOTSTRAP_SECRET;
  if (!secret) return json({ error: 'Bootstrap is not configured on this deployment.' }, 403);

  const presented = request.headers.get('x-bootstrap-secret') ?? '';
  if (!timingSafeEqual(presented, secret)) return json({ error: 'Forbidden.' }, 403);

  const db = getDb(env);
  try {
    return await seedFirstAdmin(db, request);
  } finally {
    await db.dispose();
  }
}

async function seedFirstAdmin(db: ReturnType<typeof getDb>, request: Request): Promise<Response> {
  if ((await db.countActiveAdmins()) > 0) {
    return json(
      { error: 'An active admin already exists. Every account after the first is created through user_create.' },
      409,
    );
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string; email?: string; label?: string };
  const admin = await db.createUser({
    name: body.name ?? 'bootstrap admin',
    email: body.email ?? 'admin@example.com',
    role: 'admin',
  });

  const plaintext = generateToken();
  const token = await db.createToken({
    user_id: admin.id,
    token_hash: await hashToken(plaintext),
    token_last4: lastFour(plaintext),
    label: body.label ?? 'bootstrap',
    created_by: null,
  });
  await db.audit({
    actor_user_id: null,
    action: 'user_created',
    target_user_id: admin.id,
    metadata: { via: 'bootstrap', role: 'admin' },
  });
  await db.audit({
    actor_user_id: null,
    action: 'token_issued',
    target_user_id: admin.id,
    metadata: { via: 'bootstrap', token_id: token.id, label: token.label },
  });

  return json({
    user: admin,
    token: { id: token.id, label: token.label, plaintext },
    warning: 'This token is shown exactly once. Store it now; it cannot be recovered.',
  });
}

/** Constant-time compare. At 32 bytes of entropy the timing channel is academic, but it
 *  costs nothing to close. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
