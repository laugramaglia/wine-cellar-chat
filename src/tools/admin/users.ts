import { z } from 'zod';
import { defineTool } from '../define.js';
import { USER_ROLES } from '../../types.js';
import { generateToken, hashToken, lastFour } from '../../auth.js';

export const userCreate = defineTool({
  name: 'user_create',
  title: 'Create an account',
  description:
    'Create a user account. With issue_token: true the account and its first API key are created in one call, ' +
    'and the plaintext key is returned exactly once — it is never retrievable again.',
  input: {
    name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    role: z.enum(USER_ROLES).optional().default('member'),
    issue_token: z.boolean().optional().default(false),
    token_label: z.string().min(1).max(64).optional().default('default'),
  },
  async handler(args, { db, props }) {
    const user = await db.createUser({ name: args.name, email: args.email, role: args.role });
    await db.audit({
      actor_user_id: props.userId,
      action: 'user_created',
      target_user_id: user.id,
      metadata: { role: user.role, email_domain: args.email.split('@')[1] ?? null },
    });

    if (!args.issue_token) return { user, token: null };

    const plaintext = generateToken();
    const token = await db.createToken({
      user_id: user.id,
      token_hash: await hashToken(plaintext),
      token_last4: lastFour(plaintext),
      label: args.token_label ?? 'default',
      created_by: props.userId,
    });
    await db.audit({
      actor_user_id: props.userId,
      action: 'token_issued',
      target_user_id: user.id,
      metadata: { token_id: token.id, label: token.label, scopes: token.scopes },
    });

    return {
      user,
      token: {
        id: token.id,
        label: token.label,
        plaintext,
        warning:
          'This is a live credential and it is shown exactly once. Do not echo it into a chat transcript, ' +
          'a log, or a shared session. If it is exposed, revoke it with token_revoke and issue another.',
      },
    };
  },
});

export const userList = defineTool({
  name: 'user_list',
  title: 'List accounts',
  description: 'Every account: role, status, live token count and last activity.',
  input: {
    include_deleted: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(200).optional().default(50),
  },
  async handler(args, { db }) {
    const users = await db.listUsers(args.include_deleted);
    return { count: users.length, users: users.slice(0, args.limit) };
  },
});

export const userUpdate = defineTool({
  name: 'user_update',
  title: 'Change a role or status',
  description:
    'Change an account\'s role or status. Guards: an admin cannot demote or suspend themselves, ' +
    'and the last remaining active admin cannot be demoted or suspended.',
  input: {
    user_id: z.string().uuid(),
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(['active', 'suspended']).optional()
      .describe("Deletion goes through user_delete, not through this tool"),
  },
  async handler(args, { db, props }) {
    if (args.role === undefined && args.status === undefined) {
      throw new Error('Pass a role, a status, or both.');
    }
    const target = await db.getUser(args.user_id);
    if (!target) throw new Error(`No user with id '${args.user_id}'.`);

    const demoting = args.role !== undefined && args.role !== 'admin' && target.role === 'admin';
    const suspending = args.status === 'suspended' && target.status === 'active';

    if (args.user_id === props.userId && (demoting || suspending)) {
      throw new Error('An admin cannot demote or suspend themselves.');
    }
    if ((demoting || suspending) && target.role === 'admin' && target.status === 'active') {
      const others = await db.countActiveAdmins(target.id);
      if (others === 0) {
        throw new Error('This is the last active admin; demoting or suspending them would lock everyone out.');
      }
    }

    const before = { role: target.role, status: target.status };
    const user = await db.updateUser(args.user_id, { role: args.role, status: args.status });

    if (args.role !== undefined && args.role !== before.role) {
      await db.audit({
        actor_user_id: props.userId,
        action: 'user_role_changed',
        target_user_id: user.id,
        metadata: { from: before.role, to: user.role },
      });
    }
    if (args.status !== undefined && args.status !== before.status) {
      await db.audit({
        actor_user_id: props.userId,
        action: 'user_status_changed',
        target_user_id: user.id,
        metadata: { from: before.status, to: user.status },
      });
    }

    return {
      user,
      note: user.status === 'suspended'
        ? 'Every token this user holds now fails at the next request. Reinstating them restores all of those tokens, because suspension does not revoke.'
        : undefined,
    };
  },
});

export const userDelete = defineTool({
  name: 'user_delete',
  title: 'Delete an account',
  description:
    'Remove an account. Soft by default: status becomes deleted, tokens are revoked, the row survives so history resolves, ' +
    'and the email address is freed for reuse. hard: true also drops their cellar, reviews and preferences. ' +
    'Wines they contributed stay in the shared catalogue either way.',
  input: {
    user_id: z.string().uuid(),
    hard: z.boolean().optional().default(false),
  },
  async handler(args, { db, props }) {
    if (args.user_id === props.userId) throw new Error('An admin cannot delete themselves.');
    const target = await db.getUser(args.user_id);
    if (!target) throw new Error(`No user with id '${args.user_id}'.`);
    if (target.role === 'admin' && target.status === 'active') {
      const others = await db.countActiveAdmins(target.id);
      if (others === 0) throw new Error('This is the last active admin and cannot be deleted.');
    }

    if (args.hard) {
      const dropped = await db.hardDeleteUser(args.user_id);
      await db.audit({
        actor_user_id: props.userId,
        action: 'user_deleted',
        target_user_id: null,
        metadata: { depth: 'hard', deleted_user: args.user_id, dropped },
      });
      return { deleted: 'hard', dropped, user: null };
    }

    const user = await db.softDeleteUser(args.user_id);
    await db.audit({
      actor_user_id: props.userId,
      action: 'user_deleted',
      target_user_id: user.id,
      metadata: { depth: 'soft' },
    });
    return { deleted: 'soft', user, note: 'Tokens revoked; the email address is now free for reuse.' };
  },
});
