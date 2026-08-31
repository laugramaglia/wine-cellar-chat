// Bearer token -> { userId, role, permissions } props.
//
// The per-request flow, in the order the wiki states it — the order is the rule:
//   1. read the header; missing or malformed -> 401
//   2. hash it and look it up; unknown, revoked or expired -> 401
//   3. load the user; status != active -> 401  (this is what catches 'deleted' too)
//   4. permissions = role_permissions(role) INTERSECT (token.scopes ?? everything)
//   5. hand them to the agent as props
//
// Handlers read the user from props, never from tool input. That is what makes "you can
// only touch your own cellar" structural rather than a validation rule someone forgets.

import { getDb, type Db } from './db/client.js';
import { resolvePermissions, type Permission } from './permissions.js';
import type { UserRole } from './types.js';

export interface AuthProps extends Record<string, unknown> {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  tokenId: string;
  tokenLabel: string;
  permissions: Permission[];
}

export const TOKEN_PREFIX = 'wc_';

/** 32 bytes of crypto.getRandomValues, base64url, prefixed so it is greppable in logs. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return TOKEN_PREFIX + b64;
}

/** Only the hash is ever stored (ADR-0012). Hex, 64 characters, 32 bytes. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const lastFour = (token: string) => token.slice(-4);

/**
 * "Malformed" is defined here, since the specification never defines it: the header must
 * be exactly `Bearer <token>`, one space, with a non-empty token carrying our prefix.
 */
function readBearer(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(header.trim());
  if (!match?.[1]) return null;
  const token = match[1];
  if (!token.startsWith(TOKEN_PREFIX) || token.length < TOKEN_PREFIX.length + 8) return null;
  return token;
}

export type AuthResult =
  | { ok: true; props: AuthProps; tokenId: string }
  | { ok: false; reason: string };

export async function authenticate(request: Request, env: Env): Promise<AuthResult> {
  const presented = readBearer(request);
  if (!presented) return { ok: false, reason: 'Missing or malformed Authorization header.' };

  const db = getDb(env);
  try {
    return await resolve(db, presented);
  } finally {
    await db.dispose();
  }
}

async function resolve(db: Db, presented: string): Promise<AuthResult> {
  const token = await db.findTokenByHash(await hashToken(presented));
  if (!token) return { ok: false, reason: 'Unknown token.' };
  if (token.revoked_at) return { ok: false, reason: 'Token has been revoked.' };
  if (token.expires_at && token.expires_at <= new Date().toISOString()) {
    return { ok: false, reason: 'Token has expired.' };
  }

  const user = await db.getUser(token.user_id);
  if (!user) return { ok: false, reason: 'Token belongs to no account.' };
  if (user.status !== 'active') return { ok: false, reason: `Account is ${user.status}.` };

  return {
    ok: true,
    tokenId: token.id,
    props: {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tokenId: token.id,
      tokenLabel: token.label,
      permissions: resolvePermissions(user.role, token.scopes),
    },
  };
}

/** Best-effort, off the request path. Never treat it as an audit signal. */
export async function touchLastUsed(env: Env, tokenId: string): Promise<void> {
  const db = getDb(env);
  try {
    await db.touchToken(tokenId);
  } catch {
    // best-effort by definition
  } finally {
    await db.dispose();
  }
}
