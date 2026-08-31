// Every invariant the mock database claims, asserted. These mirror the checks run
// against the real Postgres schema, so the two implementations can be compared.

import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryStore } from '../src/db/memory.js';
import { DbError } from '../src/db/errors.js';

const fails = (fn: () => unknown, code?: string) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DbError);
    if (code) expect((err as DbError).code).toBe(code);
    return;
  }
  throw new Error('expected the store to refuse this, but it was allowed');
};

let db: MemoryStore;
let lau: string;

beforeEach(() => {
  db = new MemoryStore();
  lau = db.createUser({ name: 'Lau', email: 'lau@example.com', role: 'admin' }).id;
});

describe('ADR-0016 — non-vintage identity', () => {
  it('refuses a duplicate NV bottling, case-insensitively', () => {
    db.upsertWine({ name: 'Brut Reserve', producer: 'Krug' }, { actor: lau });
    const again = db.upsertWine({ name: 'brut reserve', producer: 'KRUG' }, { actor: lau });
    expect(again.created).toBe(false);
  });

  it('treats the same wine with a vintage as a different row', () => {
    const nv = db.upsertWine({ name: 'Brut Reserve', producer: 'Krug' }, { actor: lau });
    const vintage = db.upsertWine({ name: 'Brut Reserve', producer: 'Krug', vintage: 2008 }, { actor: lau });
    expect(vintage.created).toBe(true);
    expect(vintage.wine.id).not.toBe(nv.wine.id);
  });

  it('finds an existing NV row rather than inserting again', () => {
    db.upsertWine({ name: 'Brut Reserve', producer: 'Krug' }, { actor: lau });
    expect(db.findWineByIdentity('Krug', 'Brut Reserve', null)).toBeDefined();
    expect(db.allWines()).toHaveLength(1);
  });
});

describe('ADR-0007 — upsert fills blanks and never overwrites', () => {
  it('fills a blank and reports it', () => {
    const first = db.upsertWine({ name: 'Malbec', producer: 'Catena' }, { actor: lau });
    const second = db.upsertWine(
      { name: 'Malbec', producer: 'Catena', region: 'Mendoza', grapes: ['malbec'] },
      { actor: lau },
    );
    expect(second.created).toBe(false);
    expect(second.fields_filled.sort()).toEqual(['grapes', 'region']);
    expect(second.wine.id).toBe(first.wine.id);
  });

  it('refuses to clobber a non-null field, and says which', () => {
    db.upsertWine({ name: 'Malbec', producer: 'Catena', region: 'Mendoza' }, { actor: lau });
    const clobber = db.upsertWine({ name: 'Malbec', producer: 'Catena', region: 'Rioja' }, { actor: lau });
    expect(clobber.fields_filled).toEqual([]);
    expect(clobber.fields_refused).toEqual(['region']);
    expect(clobber.wine.region).toBe('Mendoza');
  });

  it('overwrites when explicitly asked', () => {
    db.upsertWine({ name: 'Malbec', producer: 'Catena', region: 'Mendoza' }, { actor: lau });
    const forced = db.upsertWine(
      { name: 'Malbec', producer: 'Catena', region: 'Rioja' },
      { actor: lau, overwrite: true },
    );
    expect(forced.wine.region).toBe('Rioja');
  });

  it('stores a wine that is nothing but a name', () => {
    const bare = db.upsertWine({ name: 'unidentified red' }, { actor: lau });
    expect(bare.created).toBe(true);
    expect(bare.wine.producer).toBeNull();
  });
});

describe('ADR-0017 — deletion is a status, email is unique among the living', () => {
  it('refuses a duplicate live email in any case', () => {
    fails(() => db.createUser({ name: 'dupe', email: 'LAU@example.com' }), 'email_taken');
  });

  it('frees the address once the account is soft-deleted', () => {
    const fab = db.createUser({ name: 'Fabian', email: 'fab@example.com' }).id;
    db.softDeleteUser(fab);
    expect(db.getUser(fab)?.status).toBe('deleted');
    expect(() => db.createUser({ name: 'Fabian 2', email: 'fab@example.com' })).not.toThrow();
  });

  it('revokes every token when soft-deleting', () => {
    const fab = db.createUser({ name: 'Fabian', email: 'fab@example.com' }).id;
    db.createToken({ user_id: fab, token_hash: 'a'.repeat(64), token_last4: 'aaaa', label: 'gemini' });
    db.softDeleteUser(fab);
    expect(db.listTokens(fab).every((t) => t.revoked_at !== null)).toBe(true);
  });

  it('drops preferences on a hard delete, and keeps contributed wines', () => {
    const fab = db.createUser({ name: 'Fabian', email: 'fab@example.com' }).id;
    db.getPrefs(fab);
    db.upsertWine({ name: 'Malbec', producer: 'Catena' }, { actor: fab });
    db.hardDeleteUser(fab);
    expect(db.getUser(fab)).toBeUndefined();
    expect(db.allWines()).toHaveLength(1);
    expect(db.allWines()[0]!.created_by).toBeNull();
  });

  it('rejects a malformed email', () => {
    fails(() => db.createUser({ name: 'bad', email: 'not-an-email' }), 'bounds');
  });
});

describe('ADR-0018 — token identity', () => {
  const hash = (c: string) => c.repeat(64);

  it('refuses a duplicate token hash', () => {
    db.createToken({ user_id: lau, token_hash: hash('a'), token_last4: 'aaaa', label: 'claude' });
    fails(
      () => db.createToken({ user_id: lau, token_hash: hash('a'), token_last4: 'bbbb', label: 'other' }),
      'token_hash_taken',
    );
  });

  it('refuses a hash of the wrong length', () => {
    fails(() => db.createToken({ user_id: lau, token_hash: 'short', token_last4: 'aaaa', label: 'x' }), 'bounds');
  });

  it('refuses an empty scopes array', () => {
    fails(
      () => db.createToken({ user_id: lau, token_hash: hash('b'), token_last4: 'bbbb', label: 'x', scopes: [] }),
      'empty_scopes',
    );
  });

  it('refuses a second live token for the same client, and allows it after revocation', () => {
    const first = db.createToken({ user_id: lau, token_hash: hash('c'), token_last4: 'cccc', label: 'gemini' });
    fails(
      () => db.createToken({ user_id: lau, token_hash: hash('d'), token_last4: 'dddd', label: 'Gemini' }),
      'label_taken',
    );
    db.revokeToken(first.id);
    expect(() =>
      db.createToken({ user_id: lau, token_hash: hash('e'), token_last4: 'eeee', label: 'gemini' }),
    ).not.toThrow();
  });

  it('is idempotent on an already-revoked token', () => {
    const t = db.createToken({ user_id: lau, token_hash: hash('f'), token_last4: 'ffff', label: 'x' });
    expect(db.revokeToken(t.id).already_revoked).toBe(false);
    expect(db.revokeToken(t.id).already_revoked).toBe(true);
  });
});

describe('ADR-0019 — bottles are held as lots', () => {
  let wine: string;
  beforeEach(() => {
    wine = db.upsertWine({ name: 'Malbec', producer: 'Catena' }, { actor: lau }).wine.id;
  });

  it('keeps two purchases of one wine as two lots', () => {
    db.addCellarItem({ user_id: lau, wine_id: wine, quantity: 6, purchase_price: 28 });
    db.addCellarItem({ user_id: lau, wine_id: wine, quantity: 3, purchase_price: 41.5 });
    const { quantity, lots } = db.holdings(lau, wine);
    expect(lots).toHaveLength(2);
    expect(quantity).toBe(9);
  });

  it('closes a lot automatically when the last bottle goes', () => {
    const lot = db.addCellarItem({ user_id: lau, wine_id: wine, quantity: 1 });
    const result = db.updateCellarItem(lau, lot.id, { quantity: 0 });
    expect(result.auto_closed).toBe(true);
    expect(result.item.status).toBe('drunk');
  });

  it('splits a lot when only part of it is gifted', () => {
    const lot = db.addCellarItem({ user_id: lau, wine_id: wine, quantity: 6 });
    const result = db.updateCellarItem(lau, lot.id, { status: 'gifted', quantity: 2 });
    expect(result.split).not.toBeNull();
    expect(result.split!.status).toBe('gifted');
    expect(result.split!.quantity).toBe(2);
    expect(result.item.quantity).toBe(4);
    expect(db.holdings(lau, wine).quantity).toBe(4);
  });

  it('refuses to gift more bottles than the lot holds', () => {
    const lot = db.addCellarItem({ user_id: lau, wine_id: wine, quantity: 2 });
    fails(() => db.updateCellarItem(lau, lot.id, { status: 'gifted', quantity: 5 }), 'bounds');
  });

  it('empties the lot when the whole thing is closed', () => {
    const lot = db.addCellarItem({ user_id: lau, wine_id: wine, quantity: 6 });
    const closed = db.updateCellarItem(lau, lot.id, { status: 'drunk' });
    expect(closed.item.quantity).toBe(0);
    expect(closed.item.status).toBe('drunk');
  });

  it('consumes oldest lot first and closes what it empties', () => {
    db.addCellarItem({ user_id: lau, wine_id: wine, quantity: 2, purchase_date: '2020-01-01' });
    db.addCellarItem({ user_id: lau, wine_id: wine, quantity: 5, purchase_date: '2024-01-01' });
    const result = db.consume(lau, wine, 3);
    expect(result.consumed).toBe(3);
    expect(db.holdings(lau, wine).quantity).toBe(4);
  });

  it("scopes a lot to its owner, so another user cannot name it", () => {
    const fab = db.createUser({ name: 'Fabian', email: 'fab@example.com' }).id;
    const lot = db.addCellarItem({ user_id: lau, wine_id: wine, quantity: 1 });
    fails(() => db.updateCellarItem(fab, lot.id, { quantity: 0 }), 'not_found');
  });

  it('refuses an inverted drink window', () => {
    fails(
      () => db.addCellarItem({ user_id: lau, wine_id: wine, drink_from: '2030-01-01', drink_until: '2025-01-01' }),
      'bounds',
    );
  });
});

describe('ADR-0020 — bounds below the tool schema', () => {
  let wine: string;
  beforeEach(() => {
    wine = db.upsertWine({ name: 'Malbec', producer: 'Catena' }, { actor: lau }).wine.id;
  });

  it('refuses a rating outside 1-100', () => {
    fails(() => db.addReview({ user_id: lau, wine_id: wine, rating: 0 }), 'bounds');
    fails(() => db.addReview({ user_id: lau, wine_id: wine, rating: 101 }), 'bounds');
  });

  it('allows a second review of the same wine, deliberately', () => {
    db.addReview({ user_id: lau, wine_id: wine, rating: 92 });
    db.addReview({ user_id: lau, wine_id: wine, rating: 88 });
    expect(db.aggregateRating(wine)).toEqual({ avg: 90, count: 2 });
  });

  it('refuses runaway tasting notes', () => {
    fails(() => db.upsertWine({ name: 'runaway', tasting_notes: 'x'.repeat(9000) }, { actor: lau }), 'bounds');
  });

  it('refuses a budget floor above its ceiling', () => {
    fails(() => db.setPrefs(lau, { budget_min: 80, budget_max: 20 }, false), 'bounds');
  });

  it('gives a user with no stored preferences the documented empty shape', () => {
    const prefs = db.getPrefs(lau);
    expect(prefs.likes).toEqual({ grapes: [], regions: [], styles: [] });
    expect(prefs.avoid).toEqual([]);
  });

  it('merges preference lists by union, and replaces on request', () => {
    db.setPrefs(lau, { likes: { grapes: ['malbec'], regions: [], styles: [] } }, false);
    const merged = db.setPrefs(lau, { likes: { grapes: ['syrah'], regions: [], styles: [] } }, false);
    expect(merged.likes.grapes.sort()).toEqual(['malbec', 'syrah']);
    const replaced = db.setPrefs(lau, { likes: { grapes: ['nebbiolo'], regions: [], styles: [] } }, true);
    expect(replaced.likes.grapes).toEqual(['nebbiolo']);
  });
});

describe('ADR-0021 — search', () => {
  beforeEach(() => {
    db.upsertWine(
      { name: 'Brut Reserve', producer: 'Krug', region: 'Champagne', tasting_notes: 'brioche and citrus' },
      { actor: lau },
    );
    db.upsertWine({ name: 'Malbec', producer: 'Catena', region: 'Mendoza' }, { actor: lau });
  });

  const search = (query: string) => db.searchWines({ query, limit: 10, userId: lau });

  it('matches on region', () => {
    expect(search('champagne')).toHaveLength(1);
  });

  it('ranks a name match above a tasting-note match', () => {
    const byName = search('krug')[0];
    const byNote = search('brioche')[0];
    expect(byName!.rank).toBeGreaterThan(byNote!.rank);
  });

  it('finds a misspelled producer', () => {
    const fuzzy = search('Katena');
    expect(fuzzy).toHaveLength(1);
    expect(fuzzy[0]!.wine.producer).toBe('Catena');
  });

  it('reports ownership for the calling user', () => {
    const wine = db.allWines()[1]!;
    db.addCellarItem({ user_id: lau, wine_id: wine.id, quantity: 3 });
    const found = db.searchWines({ query: 'malbec', limit: 10, userId: lau })[0]!;
    expect(found.owned).toBe(true);
    expect(found.quantity).toBe(3);
  });

  it('is deterministic', () => {
    expect(search('wine').map((r) => r.wine.id)).toEqual(search('wine').map((r) => r.wine.id));
  });
});

describe('audit log', () => {
  it('records an action without ever recording a token', () => {
    db.audit({ actor_user_id: lau, action: 'token_issued', metadata: { label: 'gemini' } });
    const entry = db.auditLog()[0]!;
    expect(entry.action).toBe('token_issued');
    expect(JSON.stringify(entry)).not.toContain('wc_');
  });
});

describe('sparse wines ask for more', () => {
  it('asks when a wine is stored with almost nothing', async () => {
    const { askForMissingFields } = await import('../src/tools/followup.js');
    const bare = db.upsertWine({ name: 'Malbec', producer: 'Catena' }, { actor: lau }).wine;
    const ask = askForMissingFields(bare);
    expect(ask).not.toBeNull();
    expect(ask!.missing_fields).toContain('wine_type');
    expect(ask!.missing_fields).toContain('grapes');
    expect(ask!.wine_id).toBe(bare.id);
    expect(ask!.question).toContain('Catena Malbec');
    expect(ask!.question).toContain('wine_upsert');
    expect(ask!.question).toMatch(/do not invent/i);
  });

  it('stops asking once the wine carries enough', async () => {
    const { askForMissingFields } = await import('../src/tools/followup.js');
    const full = db.upsertWine(
      {
        name: 'Malbec', producer: 'Catena', vintage: 2019, region: 'Mendoza', country: 'Argentina',
        wine_type: 'red', grapes: ['malbec'], body: 'medium_plus', tannin: 'medium_plus',
        acidity: 'medium', avg_price: 28, food_pairings: ['lamb'], tasting_notes: 'plum',
      },
      { actor: lau },
    ).wine;
    expect(askForMissingFields(full)).toBeNull();
  });

  it('does not nag over a couple of gaps', async () => {
    const { askForMissingFields } = await import('../src/tools/followup.js');
    const mostly = db.upsertWine(
      {
        name: 'Chablis', producer: 'Fevre', vintage: 2021, region: 'Chablis', country: 'France',
        wine_type: 'white', grapes: ['chardonnay'], acidity: 'high', body: 'medium_minus',
        avg_price: 32, food_pairings: ['oysters'],
      },
      { actor: lau },
    ).wine;
    expect(askForMissingFields(mostly)).toBeNull();
  });
});

describe('enriching by wine_id needs no name', () => {
  it('accepts an id-only enrichment, which is what follow_up asks for', () => {
    const created = db.upsertWine({ name: 'Mystery Red', producer: 'Unknown Estate' }, { actor: lau }).wine;
    const enriched = db.upsertWine(
      { wine_type: 'red', region: 'Rioja', grapes: ['tempranillo'] },
      { actor: lau, wine_id: created.id },
    );
    expect(enriched.created).toBe(false);
    expect(enriched.wine.name).toBe('Mystery Red');
    expect(enriched.fields_filled.sort()).toEqual(['grapes', 'region', 'wine_type']);
  });

  it('still refuses a create with no name', () => {
    fails(() => db.upsertWine({ region: 'Rioja' }, { actor: lau }), 'bounds');
  });
});
