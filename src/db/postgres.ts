// The real storage: Neon Postgres, reached through Cloudflare Hyperdrive.
//
// This implements the same contract as src/db/memory.ts, method for method, so the seam
// in ./client.ts is the only thing that knows which one is live. Where the mock enforced
// a rule in TypeScript, the database now enforces it in a CHECK or an index — and the
// error codes below translate those back into the same named DbError the tools already
// handle, so a violation reads the same to an agent whichever layer caught it.
//
// Hyperdrive pools connections at the edge (ADR-0022 aside, this is why we use node-
// postgres rather than the Neon HTTP driver: interactive transactions. The last-admin
// guard needs SELECT ... FOR UPDATE, which HTTP cannot express).

import { Client, types } from 'pg';
import { DbError, notFound } from './errors.js';
import type {
  ApiToken, AuditAction, AuditEntry, CellarItem, CellarStatus,
  PrefLists, Review, User, UserPrefs, UserRole, UserStatus, Wine, WineType,
} from '../types.js';

// Postgres hands back Dates and strings where our types want ISO strings and numbers.
// Fixing it here, once, keeps every row shape identical to the mock's.
types.setTypeParser(1082, (v) => v);                              // date  -> 'YYYY-MM-DD'
types.setTypeParser(1184, (v) => new Date(v).toISOString());      // timestamptz -> ISO
types.setTypeParser(1114, (v) => new Date(v + 'Z').toISOString()); // timestamp
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric -> number
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // int8 -> number

// One connection per Db instance, opened on first use and closed by dispose().
//
// A module-level Pool does NOT work here, and the failure is nasty: the Workers runtime
// closes sockets when a request ends, so the next request reuses a dead pooled client and
// the query never returns — the runtime then kills it with "your Worker's code had hung".
// Hyperdrive pools at the edge, which is what makes a fresh client per request cheap.

/** Postgres constraint names -> the DbError codes the tools already report. */
function translate(err: unknown): never {
  const e = err as { code?: string; constraint?: string; message?: string };
  const constraint = e.constraint ?? '';
  if (e.code === '23505') {
    if (constraint === 'users_email_live_uniq') {
      throw new DbError('email_taken', 'That address is already in use by a live account.');
    }
    if (constraint === 'api_tokens_hash_uniq') {
      throw new DbError('token_hash_taken', 'That token hash already exists.');
    }
    if (constraint === 'api_tokens_label_uniq') {
      throw new DbError('label_taken', 'That user already has a live token with that label. Revoke it first, or use a different label.');
    }
    if (constraint === 'wines_identity_uniq') {
      throw new DbError('wine_identity_taken', 'Another wine already has that producer, name and vintage.');
    }
    throw new DbError('conflict', e.message ?? 'Uniqueness violation.');
  }
  if (e.code === '23514') {
    throw new DbError('bounds', `A stored bound was violated (${constraint || 'check constraint'}).`);
  }
  if (e.code === '23503') {
    throw new DbError('not_found', 'That referenced row does not exist, or is still referenced by another.');
  }
  if (e.code === '22P02' || e.code === '22007') {
    throw new DbError('bounds', e.message ?? 'Invalid value for its column type.');
  }
  throw err;
}

export function createPgDb(env: Env) {
  let client: Client | null = null;
  let connecting: Promise<Client> | null = null;

  const connect = async (): Promise<Client> => {
    if (client) return client;
    if (!connecting) {
      const c = new Client({ connectionString: env.HYPERDRIVE.connectionString });
      connecting = c.connect().then(() => {
        client = c;
        return c;
      });
    }
    return connecting;
  };

  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    try {
      const c = await connect();
      const r = await c.query(sql, params as never[]);
      return r.rows as T[];
    } catch (err) {
      translate(err);
    }
  };
  const one = async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
    (await query<T>(sql, params))[0];

  /** Interactive transaction. Used where a read must not race a write. */
  const tx = async <T>(fn: (q: <R>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> => {
    const c = await connect();
    try {
      await c.query('BEGIN');
      const q = async <R>(sql: string, params: unknown[] = []): Promise<R[]> => {
        const r = await c.query(sql, params as never[]);
        return r.rows as R[];
      };
      const out = await fn(q);
      await c.query('COMMIT');
      return out;
    } catch (err) {
      await c.query('ROLLBACK').catch(() => undefined);
      translate(err);
    }
  };

  const USER_COLS = 'id, name, email::text as email, role, status, created_at, updated_at';
  const TOKEN_COLS =
    "id, user_id, encode(token_hash,'hex') as token_hash, token_last4, label, scopes, " +
    'last_used_at, expires_at, revoked_at, created_at, created_by';
  const WINE_COLS =
    'id, name, producer, vintage, country, region, subregion, wine_type, grapes, abv, ' +
    'sweetness, body, tannin, acidity, avg_price, style_tags, food_pairings, tasting_notes, ' +
    'created_by, created_at, updated_at';

  const MERGEABLE: Array<keyof Wine> = [
    'name', 'producer', 'vintage', 'country', 'region', 'subregion', 'wine_type',
    'grapes', 'abv', 'sweetness', 'body', 'tannin', 'acidity', 'avg_price',
    'style_tags', 'food_pairings', 'tasting_notes',
  ];

  const api = {
    // --- users -------------------------------------------------------------------

    async createUser(input: { name: string; email: string; role?: UserRole }): Promise<User> {
      const row = await one<User>(
        `INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING ${USER_COLS}`,
        [input.name, input.email, input.role ?? 'member'],
      );
      return row!;
    },

    async getUser(id: string): Promise<User | undefined> {
      return one<User>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
    },

    async listUsers(includeDeleted = false) {
      return query<User & { token_count: number; last_active_at: string | null }>(
        `SELECT ${USER_COLS.split(', ').map((c) => 'u.' + c.replace('email::text as email', 'email::text as email')).join(', ')},
                (SELECT count(*)::int FROM api_tokens t WHERE t.user_id = u.id AND t.revoked_at IS NULL) AS token_count,
                (SELECT max(t.last_used_at) FROM api_tokens t WHERE t.user_id = u.id) AS last_active_at
           FROM users u
          WHERE ($1::bool OR u.status <> 'deleted')
          ORDER BY u.created_at, u.id`,
        [includeDeleted],
      );
    },

    async countActiveAdmins(exceptId?: string): Promise<number> {
      const r = await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM users
          WHERE role = 'admin' AND status = 'active' AND ($1::uuid IS NULL OR id <> $1::uuid)`,
        [exceptId ?? null],
      );
      return r?.n ?? 0;
    },

    async updateUser(id: string, patch: { role?: UserRole; status?: UserStatus }): Promise<User> {
      const row = await one<User>(
        `UPDATE users SET role = COALESCE($2, role), status = COALESCE($3, status)
          WHERE id = $1 RETURNING ${USER_COLS}`,
        [id, patch.role ?? null, patch.status ?? null],
      );
      if (!row) throw notFound('user', id);
      return row;
    },

    async softDeleteUser(id: string): Promise<User> {
      return tx(async (q) => {
        const rows = await q<User>(
          `UPDATE users SET status = 'deleted' WHERE id = $1 RETURNING ${USER_COLS}`, [id],
        );
        if (!rows[0]) throw notFound('user', id);
        await q('UPDATE api_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
        return rows[0];
      });
    },

    async hardDeleteUser(id: string) {
      return tx(async (q) => {
        const counts = (await q<{ cellar_items: number; reviews: number; tokens: number }>(
          `SELECT (SELECT count(*)::int FROM cellar_items WHERE user_id = $1) AS cellar_items,
                  (SELECT count(*)::int FROM reviews      WHERE user_id = $1) AS reviews,
                  (SELECT count(*)::int FROM api_tokens   WHERE user_id = $1) AS tokens`,
          [id],
        ))[0]!;
        // wines.created_by and audit_log both ON DELETE SET NULL, so contributed wines
        // survive and the audit trail keeps its rows. prefs, cellar, reviews, tokens
        // all cascade.
        await q('DELETE FROM users WHERE id = $1', [id]);
        return counts;
      });
    },

    // --- tokens ------------------------------------------------------------------

    async createToken(input: {
      user_id: string; token_hash: string; token_last4: string; label: string;
      scopes?: string[] | null; expires_at?: string | null; created_by?: string | null;
    }): Promise<ApiToken> {
      if (input.scopes !== null && input.scopes !== undefined && input.scopes.length === 0) {
        throw new DbError('empty_scopes',
          'scopes must be omitted (inherit the role in full) or list at least one permission; [] cannot be stored.');
      }
      if (input.token_hash.length !== 64) {
        throw new DbError('bounds', 'token_hash must be a 32-byte SHA-256 digest.');
      }
      const row = await one<ApiToken>(
        `INSERT INTO api_tokens (user_id, token_hash, token_last4, label, scopes, expires_at, created_by)
         VALUES ($1, decode($2,'hex'), $3, $4, $5, $6, $7) RETURNING ${TOKEN_COLS}`,
        [input.user_id, input.token_hash, input.token_last4, input.label,
         input.scopes ?? null, input.expires_at ?? null, input.created_by ?? null],
      );
      return row!;
    },

    async findTokenByHash(hash: string): Promise<ApiToken | undefined> {
      return one<ApiToken>(`SELECT ${TOKEN_COLS} FROM api_tokens WHERE token_hash = decode($1,'hex')`, [hash]);
    },

    async listTokens(userId?: string): Promise<ApiToken[]> {
      return query<ApiToken>(
        `SELECT ${TOKEN_COLS} FROM api_tokens
          WHERE ($1::uuid IS NULL OR user_id = $1::uuid) ORDER BY created_at, id`,
        [userId ?? null],
      );
    },

    async revokeToken(id: string): Promise<{ token: ApiToken; already_revoked: boolean }> {
      return tx(async (q) => {
        const before = (await q<ApiToken>(
          `SELECT ${TOKEN_COLS} FROM api_tokens WHERE id = $1 FOR UPDATE`, [id],
        ))[0];
        if (!before) throw notFound('token', id);
        if (before.revoked_at) return { token: before, already_revoked: true };
        const after = (await q<ApiToken>(
          `UPDATE api_tokens SET revoked_at = now() WHERE id = $1 RETURNING ${TOKEN_COLS}`, [id],
        ))[0]!;
        return { token: after, already_revoked: false };
      });
    },

    async touchToken(id: string): Promise<void> {
      await query('UPDATE api_tokens SET last_used_at = now() WHERE id = $1', [id]);
    },

    // --- preferences -------------------------------------------------------------

    async getPrefs(userId: string): Promise<UserPrefs> {
      // Created on first read, so every user reads back the documented empty shape.
      const row = await one<UserPrefs>(
        `INSERT INTO user_prefs (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING *`,
        [userId],
      );
      return row!;
    },

    async setPrefs(
      userId: string,
      patch: Partial<Omit<UserPrefs, 'user_id' | 'updated_at'>>,
      replace: boolean,
    ): Promise<UserPrefs> {
      return tx(async (q) => {
        await q(`INSERT INTO user_prefs (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
        const cur = (await q<UserPrefs>('SELECT * FROM user_prefs WHERE user_id = $1 FOR UPDATE', [userId]))[0]!;

        const empty = (): PrefLists => ({ grapes: [], regions: [], styles: [] });
        const merge = (a: PrefLists, b?: PrefLists): PrefLists =>
          !b ? a : {
            grapes: [...new Set([...a.grapes, ...(b.grapes ?? [])])],
            regions: [...new Set([...a.regions, ...(b.regions ?? [])])],
            styles: [...new Set([...a.styles, ...(b.styles ?? [])])],
          };

        const next: UserPrefs = replace
          ? {
              ...cur,
              likes: patch.likes ?? empty(),
              dislikes: patch.dislikes ?? empty(),
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
              ...cur,
              likes: merge(cur.likes, patch.likes),
              dislikes: merge(cur.dislikes, patch.dislikes),
              avoid: patch.avoid ? [...new Set([...cur.avoid, ...patch.avoid])] : cur.avoid,
              budget_min: patch.budget_min ?? cur.budget_min,
              budget_max: patch.budget_max ?? cur.budget_max,
              sweetness: patch.sweetness ?? cur.sweetness,
              body: patch.body ?? cur.body,
              tannin: patch.tannin ?? cur.tannin,
              acidity: patch.acidity ?? cur.acidity,
              notes: patch.notes ?? cur.notes,
            };

        const rows = await q<UserPrefs>(
          `UPDATE user_prefs SET likes=$2, dislikes=$3, avoid=$4, budget_min=$5, budget_max=$6,
                  sweetness=$7, body=$8, tannin=$9, acidity=$10, notes=$11
            WHERE user_id=$1 RETURNING *`,
          [userId, JSON.stringify(next.likes), JSON.stringify(next.dislikes), JSON.stringify(next.avoid),
           next.budget_min, next.budget_max, next.sweetness, next.body, next.tannin, next.acidity, next.notes],
        );
        return rows[0]!;
      });
    },

    // --- wines -------------------------------------------------------------------

    async getWine(id: string): Promise<Wine | undefined> {
      return one<Wine>(`SELECT ${WINE_COLS} FROM wines WHERE id = $1`, [id]);
    },

    async allWines(): Promise<Wine[]> {
      return query<Wine>(`SELECT ${WINE_COLS} FROM wines ORDER BY name, id`);
    },

    /** ADR-0016: IS NOT DISTINCT FROM, never `=`. A plain `=` misses the NV row the
     *  unique index would refuse to duplicate, turning a merge into a violation. */
    async findWineByIdentity(producer: string | null, name: string, vintage: number | null) {
      return one<Wine>(
        `SELECT ${WINE_COLS} FROM wines
          WHERE lower(producer) IS NOT DISTINCT FROM lower($1)
            AND lower(name) = lower($2)
            AND vintage IS NOT DISTINCT FROM $3`,
        [producer, name, vintage],
      );
    },

    async upsertWine(
      input: Partial<Wine>,
      opts: { wine_id?: string; overwrite?: boolean; actor: string | null },
    ) {
      return tx(async (q) => {
        let target: Wine | undefined;
        if (opts.wine_id) {
          target = (await q<Wine>(`SELECT ${WINE_COLS} FROM wines WHERE id = $1 FOR UPDATE`, [opts.wine_id]))[0];
          if (!target) throw notFound('wine', opts.wine_id);
        } else {
          if (!input.name) {
            throw new DbError('bounds', 'A wine needs a name to be created; pass wine_id to enrich an existing one.');
          }
          target = (await q<Wine>(
            `SELECT ${WINE_COLS} FROM wines
              WHERE lower(producer) IS NOT DISTINCT FROM lower($1)
                AND lower(name) = lower($2)
                AND vintage IS NOT DISTINCT FROM $3
              FOR UPDATE`,
            [input.producer ?? null, input.name, input.vintage ?? null],
          ))[0];
        }

        if (!target) {
          const rows = await q<Wine>(
            `INSERT INTO wines (name, producer, vintage, country, region, subregion, wine_type,
                                grapes, abv, sweetness, body, tannin, acidity, avg_price,
                                style_tags, food_pairings, tasting_notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::text[],'{}'::text[]),$9,$10,$11,$12,$13,$14,
                     COALESCE($15::text[],'{}'::text[]),COALESCE($16::text[],'{}'::text[]),$17,$18)
             RETURNING ${WINE_COLS}`,
            [input.name, input.producer ?? null, input.vintage ?? null, input.country ?? null,
             input.region ?? null, input.subregion ?? null, input.wine_type ?? null,
             input.grapes ?? null, input.abv ?? null, input.sweetness ?? null, input.body ?? null,
             input.tannin ?? null, input.acidity ?? null, input.avg_price ?? null,
             input.style_tags ?? null, input.food_pairings ?? null, input.tasting_notes ?? null,
             opts.actor],
          );
          const wine = rows[0]!;
          const filled = MERGEABLE.filter((f) => !isBlank(wine[f])).map(String);
          return { wine, created: true, fields_filled: filled, fields_refused: [] as string[] };
        }

        // ADR-0007: fill blanks, never overwrite unless asked.
        const filled: string[] = [];
        const refused: string[] = [];
        const sets: string[] = [];
        const vals: unknown[] = [target.id];

        for (const field of MERGEABLE) {
          const incoming = input[field];
          if (incoming === undefined || isBlank(incoming)) continue;
          const current = target[field];
          if (isBlank(current)) {
            vals.push(incoming);
            sets.push(`${field} = $${vals.length}`);
            filled.push(field);
          } else if (opts.overwrite) {
            if (!sameValue(current, incoming)) {
              vals.push(incoming);
              sets.push(`${field} = $${vals.length}`);
              filled.push(field);
            }
          } else if (!sameValue(current, incoming)) {
            refused.push(field);
          }
        }

        let wine = target;
        if (sets.length > 0) {
          wine = (await q<Wine>(
            `UPDATE wines SET ${sets.join(', ')} WHERE id = $1 RETURNING ${WINE_COLS}`, vals,
          ))[0]!;
        }
        return { wine, created: false, fields_filled: filled, fields_refused: refused };
      });
    },

    /** ADR-0021: weighted full-text first, trigram similarity as the fallback. */
    async searchWines(opts: {
      query?: string; wine_type?: WineType; country?: string; region?: string;
      grapes?: string[]; vintage_min?: number; vintage_max?: number;
      price_min?: number; price_max?: number; owned_only?: boolean;
      limit: number; userId: string;
    }) {
      const rows = await query<Wine & { owned: boolean; quantity: number; rank: number }>(
        `WITH held AS (
           SELECT wine_id, SUM(quantity)::int AS qty
             FROM cellar_items
            WHERE user_id = $1 AND status = 'in_cellar'
            GROUP BY wine_id
         ),
         scored AS (
           SELECT w.*,
                  COALESCE(h.qty, 0) AS quantity,
                  CASE
                    WHEN $2::text IS NULL OR $2 = '' THEN 1.0
                    WHEN w.search_tsv @@ websearch_to_tsquery('simple', $2)
                      THEN ts_rank(w.search_tsv, websearch_to_tsquery('simple', $2)) + 1.0
                    ELSE GREATEST(similarity(w.name, $2), similarity(COALESCE(w.producer,''), $2))
                  END AS rank
             FROM wines w
             LEFT JOIN held h ON h.wine_id = w.id
            WHERE ($3::wine_type IS NULL OR w.wine_type = $3::wine_type)
              AND ($4::text IS NULL OR lower(w.country) = lower($4))
              AND ($5::text IS NULL OR lower(w.region) = lower($5))
              AND ($6::text[] IS NULL OR w.grapes && $6::text[])
              AND ($7::int  IS NULL OR w.vintage >= $7)
              AND ($8::int  IS NULL OR w.vintage <= $8)
              AND ($9::numeric  IS NULL OR w.avg_price >= $9)
              AND ($10::numeric IS NULL OR w.avg_price <= $10)
         )
         SELECT ${WINE_COLS}, quantity, quantity > 0 AS owned, rank
           FROM scored
          WHERE rank > CASE WHEN $2::text IS NULL OR $2 = '' THEN -1 ELSE 0.3 END
            AND (NOT $11::bool OR quantity > 0)
          ORDER BY rank DESC, name, id
          LIMIT $12`,
        [opts.userId, opts.query ?? null, opts.wine_type ?? null, opts.country ?? null,
         opts.region ?? null, opts.grapes?.length ? opts.grapes.map((g) => g.toLowerCase()) : null,
         opts.vintage_min ?? null, opts.vintage_max ?? null,
         opts.price_min ?? null, opts.price_max ?? null, opts.owned_only ?? false, opts.limit],
      );
      return rows.map((r) => {
        const { owned, quantity, rank, ...wine } = r as never as Wine & { owned: boolean; quantity: number; rank: number };
        return { wine: wine as Wine, owned, quantity, rank: Number(rank) };
      });
    },

    // --- cellar (ADR-0019: rows are lots; stock is status = 'in_cellar') ----------

    async holdings(userId: string, wineId: string) {
      const lots = await query<CellarItem>(
        `SELECT * FROM cellar_items
          WHERE user_id = $1 AND wine_id = $2 AND status = 'in_cellar'
          ORDER BY COALESCE(purchase_date::text, created_at::text), id`,
        [userId, wineId],
      );
      return { quantity: lots.reduce((n, l) => n + l.quantity, 0), lots };
    },

    async addCellarItem(input: {
      user_id: string; wine_id: string; quantity?: number;
      purchase_price?: number | null; purchase_date?: string | null; location?: string | null;
      drink_from?: string | null; drink_until?: string | null; notes?: string | null;
    }): Promise<CellarItem> {
      const row = await one<CellarItem>(
        `INSERT INTO cellar_items
           (user_id, wine_id, quantity, purchase_price, purchase_date, location, drink_from, drink_until, notes)
         VALUES ($1,$2,COALESCE($3,1),$4,$5,$6,$7,$8,$9) RETURNING *`,
        [input.user_id, input.wine_id, input.quantity ?? 1, input.purchase_price ?? null,
         input.purchase_date ?? null, input.location ?? null, input.drink_from ?? null,
         input.drink_until ?? null, input.notes ?? null],
      );
      return row!;
    },

    /** Scoped by user_id from props — the one place a caller names a row of their own. */
    async getCellarItemFor(userId: string, itemId: string): Promise<CellarItem> {
      const row = await one<CellarItem>('SELECT * FROM cellar_items WHERE id = $1 AND user_id = $2', [itemId, userId]);
      if (!row) throw notFound('cellar item', itemId);
      return row;
    },

    async updateCellarItem(
      userId: string,
      itemId: string,
      patch: {
        quantity?: number; location?: string | null; drink_from?: string | null;
        drink_until?: string | null; notes?: string | null; status?: CellarStatus;
      },
    ) {
      return tx(async (q) => {
        const item = (await q<CellarItem>(
          'SELECT * FROM cellar_items WHERE id = $1 AND user_id = $2 FOR UPDATE', [itemId, userId],
        ))[0];
        if (!item) throw notFound('cellar item', itemId);
        if (item.status !== 'in_cellar' && patch.status !== undefined && patch.status !== item.status) {
          throw new DbError('lot_closed', `That lot is already '${item.status}' and holds no bottles.`);
        }

        const next: CellarItem = { ...item };
        if (patch.location !== undefined) next.location = patch.location;
        if (patch.notes !== undefined) next.notes = patch.notes;
        if (patch.drink_from !== undefined) next.drink_from = patch.drink_from;
        if (patch.drink_until !== undefined) next.drink_until = patch.drink_until;

        let split: CellarItem | null = null;
        let autoClosed = false;

        if (patch.status && patch.status !== 'in_cellar') {
          const leaving = patch.quantity ?? item.quantity;
          if (leaving > item.quantity) {
            throw new DbError('bounds', `The lot holds ${item.quantity} bottle(s); cannot ${patch.status} ${leaving}.`);
          }
          const remaining = item.quantity - leaving;
          if (remaining > 0) {
            split = (await q<CellarItem>(
              `INSERT INTO cellar_items
                 (user_id, wine_id, quantity, purchase_price, purchase_date, location, drink_from, drink_until, status, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
              [userId, item.wine_id, leaving, item.purchase_price, item.purchase_date,
               next.location, next.drink_from, next.drink_until, patch.status, next.notes],
            ))[0]!;
            next.quantity = remaining;
          } else {
            next.quantity = 0;
            next.status = patch.status;
            autoClosed = true;
          }
        } else if (patch.quantity !== undefined) {
          if (patch.quantity < 0) throw new DbError('bounds', 'quantity must be zero or more.');
          next.quantity = patch.quantity;
          if (next.quantity === 0 && next.status === 'in_cellar') {
            next.status = 'drunk';
            autoClosed = true;
          }
        }

        const updated = (await q<CellarItem>(
          `UPDATE cellar_items SET quantity=$2, location=$3, drink_from=$4, drink_until=$5, notes=$6, status=$7
            WHERE id=$1 RETURNING *`,
          [itemId, next.quantity, next.location, next.drink_from, next.drink_until, next.notes, next.status],
        ))[0]!;

        return { item: updated, split, auto_closed: autoClosed };
      });
    },

    /** Oldest lot first. Shared by cellar_update and review_write consume:true. */
    async consume(userId: string, wineId: string, count: number) {
      return tx(async (q) => {
        const lots = await q<CellarItem>(
          `SELECT * FROM cellar_items
            WHERE user_id=$1 AND wine_id=$2 AND status='in_cellar'
            ORDER BY COALESCE(purchase_date::text, created_at::text), id
            FOR UPDATE`,
          [userId, wineId],
        );
        let left = count;
        const closed: string[] = [];
        for (const lot of lots) {
          if (left <= 0) break;
          const take = Math.min(lot.quantity, left);
          const remaining = lot.quantity - take;
          left -= take;
          if (remaining === 0) {
            await q(`UPDATE cellar_items SET quantity=0, status='drunk' WHERE id=$1`, [lot.id]);
            closed.push(lot.id);
          } else {
            await q(
              `INSERT INTO cellar_items
                 (user_id, wine_id, quantity, purchase_price, purchase_date, location, drink_from, drink_until, status, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'drunk',$9)`,
              [userId, wineId, take, lot.purchase_price, lot.purchase_date, lot.location,
               lot.drink_from, lot.drink_until, lot.notes],
            );
            await q('UPDATE cellar_items SET quantity=$2 WHERE id=$1', [lot.id, remaining]);
          }
        }
        return { consumed: count - left, closed };
      });
    },

    async listCellar(userId: string): Promise<CellarItem[]> {
      return query<CellarItem>('SELECT * FROM cellar_items WHERE user_id = $1', [userId]);
    },

    // --- reviews -----------------------------------------------------------------

    async addReview(input: {
      user_id: string; wine_id: string; rating: number; drank_on?: string | null;
      occasion?: string | null; body_text?: string | null; would_buy_again?: boolean | null;
    }): Promise<Review> {
      if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 100) {
        throw new DbError('bounds', `rating must be an integer between 1 and 100; got ${input.rating}.`);
      }
      const row = await one<Review>(
        `INSERT INTO reviews (user_id, wine_id, rating, drank_on, occasion, body_text, would_buy_again)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [input.user_id, input.wine_id, input.rating, input.drank_on ?? null,
         input.occasion ?? null, input.body_text ?? null, input.would_buy_again ?? null],
      );
      return row!;
    },

    async listReviews(filter: { wine_id?: string; user_id?: string; min_rating?: number; since?: string }) {
      return query<Review>(
        `SELECT * FROM reviews
          WHERE ($1::uuid IS NULL OR wine_id = $1::uuid)
            AND ($2::uuid IS NULL OR user_id = $2::uuid)
            AND ($3::int  IS NULL OR rating >= $3)
            AND ($4::text IS NULL OR COALESCE(drank_on::text, created_at::text) >= $4)
          ORDER BY created_at DESC, id`,
        [filter.wine_id ?? null, filter.user_id ?? null, filter.min_rating ?? null, filter.since ?? null],
      );
    },

    async aggregateRating(wineId: string): Promise<{ avg: number | null; count: number }> {
      const r = await one<{ avg: number | null; count: number }>(
        `SELECT round(avg(rating), 1)::float8 AS avg, count(*)::int AS count FROM reviews WHERE wine_id = $1`,
        [wineId],
      );
      return { avg: r?.avg ?? null, count: r?.count ?? 0 };
    },

    // --- audit -------------------------------------------------------------------

    async audit(entry: {
      actor_user_id: string | null; action: AuditAction;
      target_user_id?: string | null; metadata?: Record<string, unknown>;
    }): Promise<AuditEntry> {
      const row = await one<AuditEntry>(
        `INSERT INTO audit_log (actor_user_id, action, target_user_id, metadata)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [entry.actor_user_id, entry.action, entry.target_user_id ?? null,
         JSON.stringify(entry.metadata ?? {})],
      );
      return row!;
    },

    async auditLog(): Promise<AuditEntry[]> {
      return query<AuditEntry>('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200');
    },

    // --- diagnostics -------------------------------------------------------------

    /** Close the connection. Safe to call more than once, and safe if none was opened. */
    async dispose(): Promise<void> {
      const c = client;
      client = null;
      connecting = null;
      if (c) await c.end().catch(() => undefined);
    },

    async stats(): Promise<Record<string, number>> {
      const r = await one<Record<string, number>>(
        `SELECT (SELECT count(*)::int FROM users)        AS users,
                (SELECT count(*)::int FROM api_tokens)   AS tokens,
                (SELECT count(*)::int FROM wines)        AS wines,
                (SELECT count(*)::int FROM cellar_items) AS cellar_items,
                (SELECT count(*)::int FROM reviews)      AS reviews,
                (SELECT count(*)::int FROM audit_log)    AS audit_entries`,
      );
      return r!;
    },
  };

  return api;
}

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
