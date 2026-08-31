// The mock database as a single Durable Object.
//
// One instance, named 'global', so every client of every user sees one catalogue and one
// cellar — which is the point of the design (identity lives in the database, not in the
// client) and is what makes the two-clients-one-cellar guarantee testable.
//
// Swapping this for Neon means replacing getDb() in ./client.ts. Nothing above the Db
// interface knows which one it is talking to.

import { DurableObject } from 'cloudflare:workers';
import { MemoryStore, emptyState, type StoreState } from './memory.js';
import { DbError } from './errors.js';

export class MockDb extends DurableObject<Env> {
  private store = new MemoryStore(emptyState());

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<StoreState>('state');
      this.store = new MemoryStore(saved ?? emptyState());
    });
  }

  /**
   * One RPC entry point rather than thirty wrappers. Each call runs a single MemoryStore
   * method to completion inside the object's single thread, then persists — so a call is
   * atomic even though a multi-call tool handler is not. That is a mock's limit and the
   * real Postgres implementation replaces it with a transaction.
   */
  async call(method: string, args: unknown[]): Promise<{ ok: true; value: unknown } | { ok: false; code: string; message: string }> {
    const fn = (this.store as unknown as Record<string, unknown>)[method];
    if (typeof fn !== 'function') {
      return { ok: false, code: 'no_such_query', message: `No query named '${method}'.` };
    }
    try {
      const value = (fn as (...a: unknown[]) => unknown).apply(this.store, args);
      await this.ctx.storage.put('state', this.store.snapshot());
      return { ok: true, value: structuredClone(value) };
    } catch (err) {
      if (err instanceof DbError) return { ok: false, code: err.code, message: err.message };
      throw err;
    }
  }

  /** Test and bootstrap support: wipe the mock back to an empty database. */
  async reset(): Promise<void> {
    this.store = new MemoryStore(emptyState());
    await this.ctx.storage.put('state', this.store.snapshot());
  }

  /** Read-only view, for diagnostics. Never exposed through a tool. */
  async stats(): Promise<Record<string, number>> {
    const s = this.store.snapshot();
    return {
      users: s.users.length,
      tokens: s.tokens.length,
      wines: s.wines.length,
      cellar_items: s.cellar.length,
      reviews: s.reviews.length,
      audit_entries: s.audit.length,
    };
  }
}
