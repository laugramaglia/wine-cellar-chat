import { z } from 'zod';
import { defineTool } from '../define.js';
import { generateToken, hashToken, lastFour } from '../../auth.js';
import { PERMISSIONS, ROLE_PERMISSIONS, isPermission } from '../../permissions.js';

export const tokenCreate = defineTool({
  name: 'token_create',
  title: 'Issue an API key',
  description:
    'Issue an API key for a user. One key per client — the label is what makes revoking one client leave the others working. ' +
    'The plaintext is returned exactly once and only its hash is stored. ' +
    'Optional scopes narrow the key below the user\'s role; they can never widen it.',
  input: {
    user_id: z.string().uuid(),
    label: z.string().min(1).max(64).describe('The client this key is for: claude-desktop, gemini, phone'),
    scopes: z.array(z.enum(PERMISSIONS)).min(1).optional()
      .describe('Omit to inherit the user\'s role in full. An empty list is not a valid value.'),
    expires_at: z.string().datetime().optional(),
  },
  async handler(args, { db, props }) {
    const user = await db.getUser(args.user_id);
    if (!user) throw new Error(`No user with id '${args.user_id}'.`);
    if (user.status === 'deleted') throw new Error('That account is deleted; issue a key to a live account.');

    // Validate the subset at issuance AND intersect at every use. Validating here is
    // what stops a scope the role does not currently grant lying dormant and starting
    // to work the moment the user is promoted, with nobody re-authorizing it then.
    let refused: string[] = [];
    let scopes = args.scopes ?? null;
    if (scopes) {
      const granted = new Set<string>(ROLE_PERMISSIONS[user.role]);
      refused = scopes.filter((s) => !granted.has(s));
      if (refused.length === scopes.length) {
        throw new Error(
          `None of the requested scopes are granted by the role '${user.role}': ${refused.join(', ')}. ` +
            'A token can only narrow a role, never widen it.',
        );
      }
      scopes = scopes.filter((s) => isPermission(s) && granted.has(s));
    }

    const plaintext = generateToken();
    const token = await db.createToken({
      user_id: args.user_id,
      token_hash: await hashToken(plaintext),
      token_last4: lastFour(plaintext),
      label: args.label,
      scopes,
      expires_at: args.expires_at ?? null,
      created_by: props.userId,
    });

    await db.audit({
      actor_user_id: props.userId,
      action: 'token_issued',
      target_user_id: args.user_id,
      metadata: { token_id: token.id, label: token.label, scopes: token.scopes, expires_at: token.expires_at },
    });

    return {
      token: {
        id: token.id,
        user_id: token.user_id,
        label: token.label,
        scopes: token.scopes,
        expires_at: token.expires_at,
        last4: token.token_last4,
      },
      plaintext,
      refused_scopes: refused.length > 0 ? refused : undefined,
      note: refused.length > 0
        ? `Dropped ${refused.join(', ')}: the role '${user.role}' does not grant them. The key is narrower than you asked for.`
        : undefined,
      warning:
        'This is a live credential and it is shown exactly once. Do not echo it into a chat transcript, ' +
        'a log, or a shared session. If it is exposed, revoke it and issue another — it cannot be scrubbed.',
    };
  },
});

export const tokenList = defineTool({
  name: 'token_list',
  title: 'List API keys',
  description:
    'Keys for one user, or for everyone. Never the token itself, and never more than its last 4 characters. ' +
    'last_used_at is best-effort and must not be used to decide a key is unused.',
  input: {
    user_id: z.string().uuid().optional(),
    include_revoked: z.boolean().optional().default(true),
  },
  async handler(args, { db }) {
    const tokens = await db.listTokens(args.user_id);
    const rows = tokens
      .filter((t) => args.include_revoked || !t.revoked_at)
      .map((t) => ({
        id: t.id,
        user_id: t.user_id,
        label: t.label,
        last4: t.token_last4,
        scopes: t.scopes,
        created_at: t.created_at,
        last_used_at: t.last_used_at,
        expires_at: t.expires_at,
        revoked_at: t.revoked_at,
      }));
    return {
      count: rows.length,
      tokens: rows,
      note: 'last_used_at is written best-effort off the request path; a key in daily use can read stale or null.',
    };
  },
});

export const tokenRevoke = defineTool({
  name: 'token_revoke',
  title: 'Revoke an API key',
  description: 'Revoke a key by id. Takes effect at the next request. Revoking an already-revoked key is a no-op.',
  input: { token_id: z.string().uuid() },
  async handler(args, { db, props }) {
    const tokens = await db.listTokens();
    const target = tokens.find((t) => t.id === args.token_id);
    if (!target) throw new Error(`No token with id '${args.token_id}'.`);

    // Nothing in the specification guards revocation against self-lockout, though
    // user_update guards against self-suspension. This is the same failure.
    if (target.user_id === props.userId) {
      const mine = tokens.filter((t) => t.user_id === props.userId && !t.revoked_at);
      const admins = await db.countActiveAdmins(props.userId);
      if (mine.length <= 1 && admins === 0) {
        throw new Error(
          'That is your last live key and you are the last active admin; revoking it would lock everyone out. ' +
            'Issue a replacement key first.',
        );
      }
    }

    const { token, already_revoked } = await db.revokeToken(args.token_id);
    if (!already_revoked) {
      await db.audit({
        actor_user_id: props.userId,
        action: 'token_revoked',
        target_user_id: token.user_id,
        metadata: { token_id: token.id, label: token.label },
      });
    }
    return {
      token_id: token.id,
      label: token.label,
      revoked_at: token.revoked_at,
      already_revoked,
    };
  },
});
