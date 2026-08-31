// The mocked database.
//
// This is an in-memory implementation of the same contract src/db/schema.sql declares.
// Every constraint the schema enforces is enforced here too, with the same names, so
// swapping this for the real Neon queries is a change of storage and not of behaviour:
//
//   ADR-0015  closed enumerations                     (types are the union types)
//   ADR-0016  NV identity, NULLS NOT DISTINCT         (identityKey)
//   ADR-0017  deleted is a status; live-only email    (assertEmailFree)
//   ADR-0018  token hash unique, live label unique    (createToken)
//   ADR-0019  lots; a closed lot holds nothing        (assertLot)
//   ADR-0020  bounds enforced below the tool schema   (assert* helpers)
//   ADR-0021  weighted search + fuzzy fallback        (searchWines)

import { DbError, notFound } from './errors.js';
import type {
  ApiToken, AuditAction, AuditEntry, CellarItem, CellarStatus, Intensity,
  PrefLists, Review, Sweetness, User, UserPrefs, UserRole, UserStatus, Wine, WineType,
} from '../types.js';

export interface StoreState {
  users: User[];
  tokens: ApiToken[];
  prefs: UserPrefs[];
  wines: Wine[];
  cellar: CellarItem[];
  reviews: Review[];
  audit: AuditEntry[];
  auditSeq: number;
}

export const emptyState = (): StoreState => ({
  users: [], tokens: [], prefs: [], wines: [], cellar: [], reviews: [], audit: [], auditSeq: 0,
});

const now = () => new Date().toISOString();
const lower = (v: string | null | undefined) => (v ?? '').toLowerCase();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// --- constraint helpers, one per CHECK in schema.sql -------------------------------

function assertLength(value: string | null | undefined, max: number, field: string, min = 0) {
  if (value == null) return;
  if (value.length > max || value.length < min) {
    throw new DbError('bounds', `${field} must be ${min}-${max} characters; got ${value.length}.`);
  }
}

function assertRange(value: number | null | undefined, min: number, max: number, field: string) {
  if (value == null) return;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new DbError('bounds', `${field} must be between ${min} and ${max}; got ${value}.`);
  }
}

function assertDateOrder(from: string | null, until: string | null, field: string) {
  if (from && until && from > until) {
    throw new DbError('bounds', `${field}: drink_from must not be after drink_until.`);
  }
}

/** ADR-0019, as amended: a closed lot records how many bottles left, and stock is
 *  defined by status rather than by quantity being zero. Every stock read filters on
 *  status = 'in_cellar' — see holdings(). */
function assertLot(item: Pick<CellarItem, 'status' | 'quantity'>) {
  if (item.quantity < 0) {
    throw new DbError('bounds', 'quantity must be zero or more.');
  }
}

/** ADR-0016: the natural key, with NULL treated as a value on every part. */
const identityKey = (producer: string | null, name: string, vintage: number | null) =>
  `${lower(producer)}\u0000${lower(name)}\u0000${vintage ?? 'NV'}`;

// --- search (ADR-0021) -------------------------------------------------------------

const tokenize = (text: string) =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);

/** Trigram similarity, the same measure pg_trgm uses, for misspelled producers. */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const p = `  ${s.toLowerCase()} `;
    const out = new Set<string>();
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}

/** The weighted A-D fields of the schema's generated tsvector, same weights. */
const WEIGHTS: Array<[keyof Wine, number]> = [
  ['name', 1.0], ['producer', 1.0],
  ['region', 0.5], ['subregion', 0.5],
  ['country', 0.25],
  ['tasting_notes', 0.1],
];

function textRank(wine: Wine, query: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;
  let score = 0;
  for (const [field, weight] of WEIGHTS) {
    const value = wine[field];
    if (typeof value !== 'string' || value.length === 0) continue;
    const words = new Set(tokenize(value));
    for (const term of terms) if (words.has(term)) score += weight;
  }
  return score;
}

// --- the store ---------------------------------------------------------------------

export class MemoryStore {
  constructor(private state: StoreState = emptyState()) {}

  snapshot(): StoreState {
    return this.state;
  }

  load(state: StoreState) {
    this.state = state;
  }

  // --- users -----------------------------------------------------------------------

  /** ADR-0017: unique among accounts whose status is not deleted, case-insensitively. */
  private assertEmailFree(email: string, exceptId?: string) {
    const clash = this.state.users.find(
      (u) => u.status !== 'deleted' && lower(u.email) === lower(email) && u.id !== exceptId,
    );
    if (clash) {
      throw new DbError('email_taken', `The address '${email}' is already in use by a live account.`);
    }
  }

  createUser(input: { name: string; email: string; role?: UserRole }): User {
    assertLength(input.name, 200, 'name', 1);
    if (!EMAIL_RE.test(input.email)) {
      throw new DbError('bounds', `'${input.email}' is not a valid email address.`);
    }
    this.assertEmailFree(input.email);
    const ts = now();
    const user: User = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      role: input.role ?? 'member',
      status: 'active',
      created_at: ts,
      updated_at: ts,
    };
    this.state.users.push(user);
    return user;
  }

  getUser(id: string): User | undefined {
    return this.state.users.find((u) => u.id === id);
  }

  listUsers(includeDeleted = false): Array<User & { token_count: number; last_active_at: string | null }> {
    return this.state.users
      .filter((u) => includeDeleted || u.status !== 'deleted')
      .map((u) => {
        const tokens = this.state.tokens.filter((t) => t.user_id === u.id && !t.revoked_at);
        const lastUsed = tokens
          .map((t) => t.last_used_at)
          .filter((v): v is string => v !== null)
          .sort()
          .at(-1) ?? null;
        return { ...u, token_count: tokens.length, last_active_at: lastUsed };
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  }

  countActiveAdmins(exceptId?: string): number {
    return this.state.users.filter(
      (u) => u.role === 'admin' && u.status === 'active' && u.id !== exceptId,
    ).length;
  }

  updateUser(id: string, patch: { role?: UserRole; status?: UserStatus }): User {
    const user = this.getUser(id);
    if (!user) throw notFound('user', id);
    if (patch.role !== undefined) user.role = patch.role;
    if (patch.status !== undefined) user.status = patch.status;
    user.updated_at = now();
    return user;
  }

  /** Soft: keep the row so foreign keys resolve; revoke the tokens. (ADR-0017) */
  softDeleteUser(id: string): User {
    const user = this.updateUser(id, { status: 'deleted' });
    this.revokeTokensOf(id);
    return user;
  }

  /** Hard: drop the row and everything keyed on it — prefs included (ADR-0017).
   *  Wines the user contributed stay in the shared catalogue with created_by cleared. */
  hardDeleteUser(id: string): { cellar_items: number; reviews: number; tokens: number } {
    const counts = {
      cellar_items: this.state.cellar.filter((c) => c.user_id === id).length,
      reviews: this.state.reviews.filter((r) => r.user_id === id).length,
      tokens: this.state.tokens.filter((t) => t.user_id === id).length,
    };
    this.state.cellar = this.state.cellar.filter((c) => c.user_id !== id);
    this.state.reviews = this.state.reviews.filter((r) => r.user_id !== id);
    this.state.tokens = this.state.tokens.filter((t) => t.user_id !== id);
    this.state.prefs = this.state.prefs.filter((p) => p.user_id !== id);
    this.state.users = this.state.users.filter((u) => u.id !== id);
    for (const wine of this.state.wines) {
      if (wine.created_by === id) wine.created_by = null;
    }
    for (const entry of this.state.audit) {
      if (entry.actor_user_id === id) entry.actor_user_id = null;
      if (entry.target_user_id === id) entry.target_user_id = null;
    }
    return counts;
  }

  // --- tokens ----------------------------------------------------------------------

  createToken(input: {
    user_id: string;
    token_hash: string;
    token_last4: string;
    label: string;
    scopes?: string[] | null;
    expires_at?: string | null;
    created_by?: string | null;
  }): ApiToken {
    if (!this.getUser(input.user_id)) throw notFound('user', input.user_id);
    assertLength(input.label, 64, 'label', 1);
    if (input.token_hash.length !== 64) {
      throw new DbError('bounds', 'token_hash must be a 32-byte SHA-256 digest.');
    }
    // ADR-0018: hash uniqueness makes the auth lookup provably single-row.
    if (this.state.tokens.some((t) => t.token_hash === input.token_hash)) {
      throw new DbError('token_hash_taken', 'That token hash already exists.');
    }
    const scopes = input.scopes ?? null;
    if (scopes !== null && scopes.length === 0) {
      throw new DbError(
        'empty_scopes',
        "scopes must be omitted (inherit the role in full) or list at least one permission; [] cannot be stored.",
      );
    }
    // ADR-0018: one live token per client label, so revoking one client leaves the rest.
    const clash = this.state.tokens.find(
      (t) => t.user_id === input.user_id && !t.revoked_at && lower(t.label) === lower(input.label),
    );
    if (clash) {
      throw new DbError(
        'label_taken',
        `That user already has a live token labelled '${clash.label}'. Revoke it first, or use a different label.`,
      );
    }
    const token: ApiToken = {
      id: crypto.randomUUID(),
      user_id: input.user_id,
      token_hash: input.token_hash,
      token_last4: input.token_last4,
      label: input.label,
      scopes,
      last_used_at: null,
      expires_at: input.expires_at ?? null,
      revoked_at: null,
      created_at: now(),
      created_by: input.created_by ?? null,
    };
    this.state.tokens.push(token);
    return token;
  }

  findTokenByHash(hash: string): ApiToken | undefined {
    return this.state.tokens.find((t) => t.token_hash === hash);
  }

  listTokens(userId?: string): ApiToken[] {
    return this.state.tokens
      .filter((t) => !userId || t.user_id === userId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  }

  revokeToken(id: string): { token: ApiToken; already_revoked: boolean } {
    const token = this.state.tokens.find((t) => t.id === id);
    if (!token) throw notFound('token', id);
    const already = token.revoked_at !== null;
    if (!already) token.revoked_at = now();
    return { token, already_revoked: already };
  }

  private revokeTokensOf(userId: string) {
    const ts = now();
    for (const t of this.state.tokens) {
      if (t.user_id === userId && !t.revoked_at) t.revoked_at = ts;
    }
  }

  touchToken(id: string) {
    const token = this.state.tokens.find((t) => t.id === id);
    if (token) token.last_used_at = now();
  }

  // --- preferences -----------------------------------------------------------------

  private static emptyLists = (): PrefLists => ({ grapes: [], regions: [], styles: [] });

  /** ADR-0020: a user who has never written preferences reads back the documented
   *  empty shape, not null — the row is created on first read. */
  getPrefs(userId: string): UserPrefs {
    const existing = this.state.prefs.find((p) => p.user_id === userId);
    if (existing) return existing;
    const fresh: UserPrefs = {
      user_id: userId,
      likes: MemoryStore.emptyLists(),
      dislikes: MemoryStore.emptyLists(),
      avoid: [],
      budget_min: null, budget_max: null,
      sweetness: null, body: null, tannin: null, acidity: null,
      notes: null,
      updated_at: now(),
    };
    this.state.prefs.push(fresh);
    return fresh;
  }

  setPrefs(userId: string, patch: Partial<Omit<UserPrefs, 'user_id' | 'updated_at'>>, replace: boolean): UserPrefs {
    const current = this.getPrefs(userId);
    const next: UserPrefs = replace
      ? {
          ...current,
          likes: patch.likes ?? MemoryStore.emptyLists(),
          dislikes: patch.dislikes ?? MemoryStore.emptyLists(),
          avoid: patch.avoid ?? [],
          budget_min: patch.budget_min ?? null,
          budget_max: patch.budget_max ?? null,
          sweetness: patch.sweetness ?? null,
          body: patch.body ?? null,
          tannin: patch.tannin ?? null,
          acidity: patch.acidity ?? null,
          notes: patch.notes ?? null,
        }
      : {
          ...current,
          // Nested jsonb merge is union-by-list, deduplicated. The wiki records this as
          // an open question; union is the reading that never silently drops a stored
          // preference, and it is stated here so the choice is visible.
          likes: mergeLists(current.likes, patch.likes),
          dislikes: mergeLists(current.dislikes, patch.dislikes),
          avoid: patch.avoid ? unique([...current.avoid, ...patch.avoid]) : current.avoid,
          budget_min: patch.budget_min ?? current.budget_min,
          budget_max: patch.budget_max ?? current.budget_max,
          sweetness: patch.sweetness ?? current.sweetness,
          body: patch.body ?? current.body,
          tannin: patch.tannin ?? current.tannin,
          acidity: patch.acidity ?? current.acidity,
          notes: patch.notes ?? current.notes,
        };

    assertLength(next.notes, 4000, 'notes');
    assertRange(next.budget_min, 0, Number.MAX_SAFE_INTEGER, 'budget_min');
    assertRange(next.budget_max, 0, Number.MAX_SAFE_INTEGER, 'budget_max');
    if (next.budget_min != null && next.budget_max != null && next.budget_min > next.budget_max) {
      throw new DbError('bounds', 'budget_min must not exceed budget_max.');
    }
    next.updated_at = now();
    const i = this.state.prefs.findIndex((p) => p.user_id === userId);
    this.state.prefs[i] = next;
    return next;
  }

  // --- wines -----------------------------------------------------------------------

  getWine(id: string): Wine | undefined {
    return this.state.wines.find((w) => w.id === id);
  }

  allWines(): Wine[] {
    return this.state.wines;
  }

  /** ADR-0016: matches on the natural key with NULL as a value — the equivalent of
   *  `vintage IS NOT DISTINCT FROM $3`, never `=`. */
  findWineByIdentity(producer: string | null, name: string, vintage: number | null): Wine | undefined {
    const key = identityKey(producer, name, vintage);
    return this.state.wines.find((w) => identityKey(w.producer, w.name, w.vintage) === key);
  }

  /** ADR-0007: fills blanks, never overwrites a non-null field unless overwrite: true. */
  upsertWine(
    input: Partial<Wine>,
    opts: { wine_id?: string; overwrite?: boolean; actor: string | null },
  ): { wine: Wine; created: boolean; fields_filled: string[]; fields_refused: string[] } {
    this.validateWineFields(input);

    let target: Wine | undefined;
    if (opts.wine_id) {
      target = this.getWine(opts.wine_id);
      if (!target) throw notFound('wine', opts.wine_id);
    } else {
      if (!input.name) {
        throw new DbError('bounds', 'A wine needs a name to be created; pass wine_id to enrich an existing one.');
      }
      target = this.findWineByIdentity(input.producer ?? null, input.name, input.vintage ?? null);
    }

    const MERGEABLE: Array<keyof Wine> = [
      'name', 'producer', 'vintage', 'country', 'region', 'subregion', 'wine_type',
      'grapes', 'abv', 'sweetness', 'body', 'tannin', 'acidity', 'avg_price',
      'style_tags', 'food_pairings', 'tasting_notes',
    ];

    if (!target) {
      const ts = now();
      const wine: Wine = {
        id: crypto.randomUUID(),
        name: input.name!,
        producer: input.producer ?? null,
        vintage: input.vintage ?? null,
        country: input.country ?? null,
        region: input.region ?? null,
        subregion: input.subregion ?? null,
        wine_type: input.wine_type ?? null,
        grapes: input.grapes ?? [],
        abv: input.abv ?? null,
        sweetness: input.sweetness ?? null,
        body: input.body ?? null,
        tannin: input.tannin ?? null,
        acidity: input.acidity ?? null,
        avg_price: input.avg_price ?? null,
        style_tags: input.style_tags ?? [],
        food_pairings: input.food_pairings ?? [],
        tasting_notes: input.tasting_notes ?? null,
        created_by: opts.actor,
        created_at: ts,
        updated_at: ts,
      };
      this.state.wines.push(wine);
      const filled = MERGEABLE.filter((f) => !isBlank(wine[f]));
      return { wine, created: true, fields_filled: filled as string[], fields_refused: [] };
    }

    const filled: string[] = [];
    const refused: string[] = [];
    for (const field of MERGEABLE) {
      const incoming = input[field];
      if (incoming === undefined || isBlank(incoming)) continue;
      const current = target[field];
      if (isBlank(current)) {
        (target as unknown as Record<string, unknown>)[field] = incoming;
        filled.push(field);
      } else if (opts.overwrite) {
        if (!sameValue(current, incoming)) {
          (target as unknown as Record<string, unknown>)[field] = incoming;
          filled.push(field);
        }
      } else if (!sameValue(current, incoming)) {
        // The specification never reports what an upsert refused. It does here.
        refused.push(field);
      }
    }

    // A merge must not create a second row with the same identity.
    const key = identityKey(target.producer, target.name, target.vintage);
    const clash = this.state.wines.find(
      (w) => w.id !== target!.id && identityKey(w.producer, w.name, w.vintage) === key,
    );
    if (clash) {
      throw new DbError('wine_identity_taken', `Another wine already has that producer, name and vintage (${clash.id}).`);
    }

    if (filled.length > 0) target.updated_at = now();
    return { wine: target, created: false, fields_filled: filled, fields_refused: refused };
  }

  private validateWineFields(input: Partial<Wine> & { name?: string }) {
    assertLength(input.name, 300, 'name', 1);
    assertLength(input.producer, 300, 'producer', 1);
    assertLength(input.country, 100, 'country');
    assertLength(input.region, 200, 'region');
    assertLength(input.subregion, 200, 'subregion');
    assertLength(input.tasting_notes, 8000, 'tasting_notes');
    assertRange(input.vintage, 1800, 2100, 'vintage');
    assertRange(input.abv, 0, 100, 'abv');
    assertRange(input.avg_price, 0, Number.MAX_SAFE_INTEGER, 'avg_price');
  }

  /** ADR-0021: weighted term match first, trigram similarity as the fallback. */
  searchWines(opts: {
    query?: string;
    wine_type?: WineType;
    country?: string;
    region?: string;
    grapes?: string[];
    vintage_min?: number;
    vintage_max?: number;
    price_min?: number;
    price_max?: number;
    owned_only?: boolean;
    limit: number;
    userId: string;
  }): Array<{ wine: Wine; owned: boolean; quantity: number; rank: number }> {
    const candidates = this.state.wines.filter((w) => {
      if (opts.wine_type && w.wine_type !== opts.wine_type) return false;
      if (opts.country && lower(w.country) !== lower(opts.country)) return false;
      if (opts.region && lower(w.region) !== lower(opts.region)) return false;
      if (opts.grapes?.length) {
        const have = new Set(w.grapes.map((g) => g.toLowerCase()));
        if (!opts.grapes.some((g) => have.has(g.toLowerCase()))) return false;
      }
      if (opts.vintage_min != null && (w.vintage == null || w.vintage < opts.vintage_min)) return false;
      if (opts.vintage_max != null && (w.vintage == null || w.vintage > opts.vintage_max)) return false;
      if (opts.price_min != null && (w.avg_price == null || w.avg_price < opts.price_min)) return false;
      if (opts.price_max != null && (w.avg_price == null || w.avg_price > opts.price_max)) return false;
      return true;
    });

    const held = (wineId: string) => this.holdings(opts.userId, wineId);

    const scored = candidates.map((wine) => {
      let rank = opts.query ? textRank(wine, opts.query) : 1;
      if (opts.query && rank === 0) {
        // Fuzzy fallback: a producer misspelled off a blurry label still finds its wine.
        const fuzzy = Math.max(
          similarity(wine.name, opts.query),
          wine.producer ? similarity(wine.producer, opts.query) : 0,
        );
        rank = fuzzy > 0.3 ? fuzzy : 0;
      }
      const { quantity } = held(wine.id);
      return { wine, owned: quantity > 0, quantity, rank };
    });

    return scored
      .filter((r) => r.rank > 0 && (!opts.owned_only || r.owned))
      // Deterministic total order: rank, then name, then id (ADR-0004).
      .sort((a, b) => b.rank - a.rank || a.wine.name.localeCompare(b.wine.name) || a.wine.id.localeCompare(b.wine.id))
      .slice(0, opts.limit);
  }

  // --- cellar (ADR-0019: rows are lots) --------------------------------------------

  holdings(userId: string, wineId: string): { quantity: number; lots: CellarItem[] } {
    const lots = this.state.cellar.filter(
      (c) => c.user_id === userId && c.wine_id === wineId && c.status === 'in_cellar',
    );
    return { quantity: lots.reduce((n, l) => n + l.quantity, 0), lots };
  }

  addCellarItem(input: {
    user_id: string;
    wine_id: string;
    quantity?: number;
    purchase_price?: number | null;
    purchase_date?: string | null;
    location?: string | null;
    drink_from?: string | null;
    drink_until?: string | null;
    notes?: string | null;
  }): CellarItem {
    if (!this.getWine(input.wine_id)) throw notFound('wine', input.wine_id);
    assertLength(input.location, 200, 'location');
    assertLength(input.notes, 4000, 'notes');
    assertRange(input.purchase_price, 0, Number.MAX_SAFE_INTEGER, 'purchase_price');
    assertDateOrder(input.drink_from ?? null, input.drink_until ?? null, 'cellar_add');
    const ts = now();
    const item: CellarItem = {
      id: crypto.randomUUID(),
      user_id: input.user_id,
      wine_id: input.wine_id,
      quantity: input.quantity ?? 1,
      purchase_price: input.purchase_price ?? null,
      purchase_date: input.purchase_date ?? null,
      location: input.location ?? null,
      drink_from: input.drink_from ?? null,
      drink_until: input.drink_until ?? null,
      status: 'in_cellar',
      notes: input.notes ?? null,
      created_at: ts,
      updated_at: ts,
    };
    assertLot(item);
    this.state.cellar.push(item);
    return item;
  }

  /** Ownership is scoped by user_id from props, never from tool input — cellar_update
   *  is the one place a caller names a row, so the scope is applied at the lookup. */
  getCellarItemFor(userId: string, itemId: string): CellarItem {
    const item = this.state.cellar.find((c) => c.id === itemId && c.user_id === userId);
    if (!item) throw notFound('cellar item', itemId);
    return item;
  }

  updateCellarItem(
    userId: string,
    itemId: string,
    patch: {
      quantity?: number;
      location?: string | null;
      drink_from?: string | null;
      drink_until?: string | null;
      notes?: string | null;
      status?: CellarStatus;
    },
  ): { item: CellarItem; split: CellarItem | null; auto_closed: boolean } {
    const item = this.getCellarItemFor(userId, itemId);
    if (item.status !== 'in_cellar' && patch.status !== undefined && patch.status !== item.status) {
      throw new DbError('lot_closed', `That lot is already '${item.status}' and holds no bottles.`);
    }
    assertLength(patch.location, 200, 'location');
    assertLength(patch.notes, 4000, 'notes');

    const next = { ...item };
    if (patch.location !== undefined) next.location = patch.location;
    if (patch.notes !== undefined) next.notes = patch.notes;
    if (patch.drink_from !== undefined) next.drink_from = patch.drink_from;
    if (patch.drink_until !== undefined) next.drink_until = patch.drink_until;
    assertDateOrder(next.drink_from, next.drink_until, 'cellar_update');

    let split: CellarItem | null = null;
    let autoClosed = false;

    if (patch.status && patch.status !== 'in_cellar') {
      // ADR-0019: closing part of a lot splits it. quantity, when given, is the number
      // of bottles that LEAVE; omitted means the whole lot.
      const leaving = patch.quantity ?? item.quantity;
      if (leaving > item.quantity) {
        throw new DbError('bounds', `The lot holds ${item.quantity} bottle(s); cannot ${patch.status} ${leaving}.`);
      }
      const remaining = item.quantity - leaving;
      const ts = now();
      if (remaining > 0) {
        split = { ...next, id: crypto.randomUUID(), quantity: leaving, status: patch.status, created_at: ts, updated_at: ts };
        assertLot(split);
        this.state.cellar.push(split);
        next.quantity = remaining;
      } else {
        next.quantity = 0;
        next.status = patch.status;
        autoClosed = true;
      }
    } else if (patch.quantity !== undefined) {
      if (patch.quantity < 0) {
        throw new DbError('bounds', 'quantity must be zero or more.');
      }
      next.quantity = patch.quantity;
      // Drinking the last bottle closes the lot, on every path (ADR-0019).
      if (next.quantity === 0 && next.status === 'in_cellar') {
        next.status = 'drunk';
        autoClosed = true;
      }
    }

    assertLot(next);
    next.updated_at = now();
    Object.assign(item, next);
    return { item, split, auto_closed: autoClosed };
  }

  /** Consume n bottles of a wine from the caller's lots, oldest first. Shared by
   *  cellar_update and review_write consume:true — the transition belongs to the lot. */
  consume(userId: string, wineId: string, count: number): { consumed: number; closed: string[] } {
    const { lots } = this.holdings(userId, wineId);
    const ordered = [...lots].sort(
      (a, b) => (a.purchase_date ?? a.created_at).localeCompare(b.purchase_date ?? b.created_at) || a.id.localeCompare(b.id),
    );
    let left = count;
    const closed: string[] = [];
    for (const lot of ordered) {
      if (left <= 0) break;
      const take = Math.min(lot.quantity, left);
      const remaining = lot.quantity - take;
      left -= take;
      if (remaining === 0) {
        const ts = now();
        lot.quantity = 0;
        lot.status = 'drunk';
        lot.updated_at = ts;
        closed.push(lot.id);
      } else {
        const ts = now();
        this.state.cellar.push({
          ...lot, id: crypto.randomUUID(), quantity: take, status: 'drunk', created_at: ts, updated_at: ts,
        });
        lot.quantity = remaining;
        lot.updated_at = ts;
      }
    }
    return { consumed: count - left, closed };
  }

  listCellar(userId: string): CellarItem[] {
    return this.state.cellar.filter((c) => c.user_id === userId);
  }

  // --- reviews ---------------------------------------------------------------------

  addReview(input: {
    user_id: string;
    wine_id: string;
    rating: number;
    drank_on?: string | null;
    occasion?: string | null;
    body_text?: string | null;
    would_buy_again?: boolean | null;
  }): Review {
    if (!this.getWine(input.wine_id)) throw notFound('wine', input.wine_id);
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 100) {
      throw new DbError('bounds', `rating must be an integer between 1 and 100; got ${input.rating}.`);
    }
    assertLength(input.occasion, 200, 'occasion');
    assertLength(input.body_text, 8000, 'body_text');
    const ts = now();
    const review: Review = {
      id: crypto.randomUUID(),
      user_id: input.user_id,
      wine_id: input.wine_id,
      rating: input.rating,
      drank_on: input.drank_on ?? null,
      occasion: input.occasion ?? null,
      body_text: input.body_text ?? null,
      would_buy_again: input.would_buy_again ?? null,
      created_at: ts,
      updated_at: ts,
    };
    this.state.reviews.push(review);
    return review;
  }

  listReviews(filter: { wine_id?: string; user_id?: string; min_rating?: number; since?: string }): Review[] {
    return this.state.reviews
      .filter((r) => {
        if (filter.wine_id && r.wine_id !== filter.wine_id) return false;
        if (filter.user_id && r.user_id !== filter.user_id) return false;
        if (filter.min_rating != null && r.rating < filter.min_rating) return false;
        if (filter.since && (r.drank_on ?? r.created_at) < filter.since) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  }

  aggregateRating(wineId: string): { avg: number | null; count: number } {
    const rows = this.state.reviews.filter((r) => r.wine_id === wineId);
    if (rows.length === 0) return { avg: null, count: 0 };
    const sum = rows.reduce((n, r) => n + r.rating, 0);
    return { avg: Math.round((sum / rows.length) * 10) / 10, count: rows.length };
  }

  // --- audit -----------------------------------------------------------------------

  audit(entry: {
    actor_user_id: string | null;
    action: AuditAction;
    target_user_id?: string | null;
    metadata?: Record<string, unknown>;
  }): AuditEntry {
    const row: AuditEntry = {
      id: ++this.state.auditSeq,
      actor_user_id: entry.actor_user_id,
      action: entry.action,
      target_user_id: entry.target_user_id ?? null,
      metadata: entry.metadata ?? {},
      created_at: now(),
    };
    this.state.audit.push(row);
    return row;
  }

  auditLog(): AuditEntry[] {
    return this.state.audit;
  }
}

// --- helpers ------------------------------------------------------------------------

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.length === 0;
  return false;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

const unique = (values: string[]) => [...new Set(values)];

function mergeLists(current: PrefLists, patch: PrefLists | undefined): PrefLists {
  if (!patch) return current;
  return {
    grapes: unique([...current.grapes, ...(patch.grapes ?? [])]),
    regions: unique([...current.regions, ...(patch.regions ?? [])]),
    styles: unique([...current.styles, ...(patch.styles ?? [])]),
  };
}

export type { Intensity, Sweetness };
