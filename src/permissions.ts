// ADR-0010: two-layer enforcement. tools/list is filtered per caller AND every handler
// re-checks. The filter is a UX affordance; the handler check is the security boundary.
// ADR-0011: TOOL_PERMISSIONS is exhaustive over ToolName — adding a tool without
// deciding its permission is a type error, not an accidental hole.

import type { UserRole } from './types.js';

export const PERMISSIONS = [
  'catalog:read', 'catalog:write',
  'cellar:read', 'cellar:write',
  'review:read', 'review:write',
  'prefs:read', 'prefs:write',
  'recommend',
  'admin:users', 'admin:tokens',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const TOOL_NAMES = [
  'wine_search', 'wine_get', 'wine_upsert',
  'cellar_list', 'cellar_add', 'cellar_update',
  'review_list', 'review_write',
  'prefs_get', 'prefs_set',
  'wine_recommend',
  'user_create', 'user_list', 'user_update', 'user_delete',
  'token_create', 'token_list', 'token_revoke',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Every tool declares exactly one required permission — not zero, not a set. */
export const TOOL_PERMISSIONS: Record<ToolName, Permission> = {
  wine_search: 'catalog:read',
  wine_get: 'catalog:read',
  wine_upsert: 'catalog:write',
  cellar_list: 'cellar:read',
  cellar_add: 'cellar:write',
  cellar_update: 'cellar:write',
  review_list: 'review:read',
  review_write: 'review:write',
  prefs_get: 'prefs:read',
  prefs_set: 'prefs:write',
  wine_recommend: 'recommend',
  user_create: 'admin:users',
  user_list: 'admin:users',
  user_update: 'admin:users',
  user_delete: 'admin:users',
  token_create: 'admin:tokens',
  token_list: 'admin:tokens',
  token_revoke: 'admin:tokens',
};

const MEMBER_PERMISSIONS: Permission[] = [
  'catalog:read', 'catalog:write',
  'cellar:read', 'cellar:write',
  'review:read', 'review:write',
  'prefs:read', 'prefs:write',
  'recommend',
];

const GUEST_PERMISSIONS: Permission[] = [
  'catalog:read', 'review:read', 'prefs:read', 'recommend',
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: [...MEMBER_PERMISSIONS, 'admin:users', 'admin:tokens'],
  member: MEMBER_PERMISSIONS,
  guest: GUEST_PERMISSIONS,
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * A caller holds a permission if their role grants it AND — when the token carries
 * explicit scopes — the token grants it too. A token can only ever narrow what its
 * user's role allows, never widen it.
 */
export function resolvePermissions(role: UserRole, scopes: string[] | null): Permission[] {
  const fromRole = ROLE_PERMISSIONS[role];
  if (scopes === null) return [...fromRole];
  const narrowed = new Set(scopes);
  return fromRole.filter((p) => narrowed.has(p));
}

export function can(held: readonly Permission[], required: Permission): boolean {
  return held.includes(required);
}
