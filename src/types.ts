// Domain types. These mirror src/db/schema.sql exactly — the enums here are the same
// closed sets declared as Postgres types there (ADR-0015). Where the two disagree,
// the database is right and this file is the bug.

export const USER_ROLES = ['admin', 'member', 'guest'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const; // ADR-0017
export type UserStatus = (typeof USER_STATUSES)[number];

export const WINE_TYPES = [
  'red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified',
] as const;
export type WineType = (typeof WINE_TYPES)[number];

export const SWEETNESS = ['bone_dry', 'dry', 'off_dry', 'medium_sweet', 'sweet'] as const;
export type Sweetness = (typeof SWEETNESS)[number];

// ADR-0015: one scale for body, tannin and acidity. Array order IS the scale order,
// which is what lets palate fit be measured as a distance along it.
export const INTENSITY = ['low', 'medium_minus', 'medium', 'medium_plus', 'high'] as const;
export type Intensity = (typeof INTENSITY)[number];

export const CELLAR_STATUSES = ['in_cellar', 'drunk', 'gifted'] as const;
export type CellarStatus = (typeof CELLAR_STATUSES)[number];

export const AUDIT_ACTIONS = [
  'user_created', 'user_role_changed', 'user_status_changed',
  'user_deleted', 'token_issued', 'token_revoked',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface ApiToken {
  id: string;
  user_id: string;
  token_hash: string;       // hex SHA-256; the plaintext is never stored (ADR-0012)
  token_last4: string;
  label: string;
  scopes: string[] | null;  // null = inherit the role in full; never [] (ADR-0018)
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface UserPrefs {
  user_id: string;
  likes: PrefLists;
  dislikes: PrefLists;
  avoid: string[];
  budget_min: number | null;
  budget_max: number | null;
  sweetness: Sweetness | null;
  body: Intensity | null;
  tannin: Intensity | null;
  acidity: Intensity | null;
  notes: string | null;
  updated_at: string;
}

export interface PrefLists {
  grapes: string[];
  regions: string[];
  styles: string[];
}

export interface Wine {
  id: string;
  name: string;
  producer: string | null;
  vintage: number | null;   // null = NV (ADR-0016)
  country: string | null;
  region: string | null;
  subregion: string | null;
  wine_type: WineType | null;
  grapes: string[];
  abv: number | null;
  sweetness: Sweetness | null;
  body: Intensity | null;
  tannin: Intensity | null;
  acidity: Intensity | null;
  avg_price: number | null;
  style_tags: string[];
  food_pairings: string[];
  tasting_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CellarItem {
  id: string;
  user_id: string;
  wine_id: string;
  quantity: number;
  purchase_price: number | null;
  purchase_date: string | null;
  location: string | null;
  drink_from: string | null;
  drink_until: string | null;
  status: CellarStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  wine_id: string;
  rating: number;
  drank_on: string | null;
  occasion: string | null;
  body_text: string | null;
  would_buy_again: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  actor_user_id: string | null;
  action: AuditAction;
  target_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
