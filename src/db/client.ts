// The seam between the tools and storage.
//
// Storage is Neon Postgres, reached through Hyperdrive. The mock that preceded it still
// lives in ./memory.ts and ./mock.ts: it is what the unit tests exercise, and it is the
// reference implementation the SQL layer has to agree with — every constraint appears in
// both. Nothing above this file knows which side answered.

import type { MemoryStore } from './memory.js';
import { createPgDb } from './postgres.js';

type Methods = {
  [K in keyof MemoryStore]: MemoryStore[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : never;
};

export type Db = Omit<Methods, 'snapshot' | 'load'>;

/** A Db that owns a connection. Whoever creates one must dispose it — see postgres.ts:
 *  a connection left open past the end of a request is what makes the NEXT request hang. */
export type OwnedDb = Db & { dispose(): Promise<void> };

export function getDb(env: Env): OwnedDb {
  return createPgDb(env) as unknown as OwnedDb;
}

/** Diagnostics only — never exposed through a tool. */
export function getDbAdmin(env: Env) {
  return createPgDb(env);
}
