// End-to-end check against a running deployment, over the real MCP protocol.
//
//   node --experimental-strip-types scripts/smoke.ts <base-url> <bootstrap-secret> [admin-token]
//
// WARNING: this suite WRITES — wines, cellar lots, reviews, users and tokens. It is meant
// for a throwaway deployment or a local `wrangler dev`, never for one holding real data.
//
// It bootstraps an admin, exercises every one of the eighteen tools, and then asserts
// the authorization guarantees the MVP's definition of done names: a member cannot see
// or call the admin tools, a scoped token is refused by a tool its user's role allows,
// a suspended user's token stops working, and a wrong token reaches nothing.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const SECRET = process.argv[3] ?? 'dev-bootstrap-secret';
const SUPPLIED_TOKEN = process.argv[4];

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: unknown, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const openClients: Client[] = [];

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  openClients.push(client);
  return client;
}

/** Every tool returns JSON as its text content; this is what an agent would parse. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
  };
  const text = result.content?.[0]?.text ?? '';
  if (result.isError) return { error: text, data: null as unknown };
  try {
    return { error: null, data: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { error: null, data: text as unknown };
  }
}

async function main() {
  console.log(`Wine Cellar MCP smoke test against ${BASE}\n${'='.repeat(60)}`);

  section('Health');
  const health = await fetch(`${BASE}/health`).then((r) => r.json() as Promise<Record<string, unknown>>);
  check('GET /health reports ok', health.status === 'ok', health);

  section('Bootstrap');
  const bootstrapRes = await fetch(`${BASE}/bootstrap`, {
    method: 'POST',
    headers: { 'x-bootstrap-secret': SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Lau', email: `lau+${Date.now()}@example.com`, label: 'smoke-admin' }),
  });
  const bootstrap = (await bootstrapRes.json()) as {
    token?: { plaintext: string };
    user?: { id: string };
    error?: string;
  };
  if (!bootstrap.token && !SUPPLIED_TOKEN) {
    console.error('Bootstrap failed:', bootstrap.error);
    console.error('Pass an existing admin token as the third argument, or deploy fresh.');
    process.exit(1);
  }
  const adminToken = bootstrap.token?.plaintext ?? SUPPLIED_TOKEN!;
  check('have an admin token', adminToken.startsWith('wc_'));

  const refused = await fetch(`${BASE}/bootstrap`, {
    method: 'POST',
    headers: { 'x-bootstrap-secret': SECRET },
  });
  check('bootstrap refuses once an admin exists (409)', refused.status === 409, refused.status);

  const wrongSecret = await fetch(`${BASE}/bootstrap`, {
    method: 'POST',
    headers: { 'x-bootstrap-secret': 'wrong' },
  });
  check('bootstrap with a wrong secret is forbidden (403)', wrongSecret.status === 403, wrongSecret.status);

  section('Authentication');
  const noAuth = await fetch(`${BASE}/mcp`, { method: 'POST' });
  check('no token gets 401', noAuth.status === 401, noAuth.status);

  const badAuth = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { Authorization: 'Bearer wc_notarealtokenatall' },
  });
  check('an unknown token gets 401', badAuth.status === 401, badAuth.status);

  section('Admin session — tools/list');
  const admin = await connect(adminToken);
  const adminTools = (await admin.listTools()).tools.map((t) => t.name).sort();
  check('an admin sees all 18 tools', adminTools.length === 18, adminTools);
  check('admin sees user_create', adminTools.includes('user_create'));
  check('admin sees token_create', adminTools.includes('token_create'));

  section('Catalogue — the photo-to-cellar path');
  const first = await call(admin, 'wine_upsert', { name: 'Malbec', producer: 'Catena' });
  const wineId = (first.data as { wine: { id: string } }).wine.id;
  check('wine_upsert stores a wine that is only a name and a producer', Boolean(wineId), first);
  check('wine_upsert reports it created the row', (first.data as { created: boolean }).created === true);

  const enrich = await call(admin, 'wine_upsert', {
    name: 'Malbec',
    producer: 'Catena',
    region: 'Mendoza',
    country: 'Argentina',
    wine_type: 'red',
    grapes: ['malbec'],
    tannin: 'medium_plus',
    body: 'medium_plus',
    acidity: 'medium',
    avg_price: 28,
    food_pairings: ['lamb', 'beef'],
    tasting_notes: 'plum and violet',
  });
  const enriched = enrich.data as { created: boolean; fields_filled: string[]; wine: { id: string } };
  check('a second upsert fills blanks instead of creating a row', enriched.created === false, enrich);
  check('it reports which fields it filled', enriched.fields_filled.includes('region'), enriched.fields_filled);
  check('it targets the same wine', enriched.wine.id === wineId);

  const clobber = await call(admin, 'wine_upsert', { name: 'Malbec', producer: 'Catena', region: 'Rioja' });
  const clobbered = clobber.data as { fields_filled: string[]; fields_refused: string[]; wine: { region: string } };
  check('it refuses to overwrite a non-null field', clobbered.wine.region === 'Mendoza', clobbered);
  check('and reports what it refused', clobbered.fields_refused.includes('region'), clobbered.fields_refused);

  const nv1 = await call(admin, 'wine_upsert', { name: 'Brut Reserve', producer: 'Krug' });
  const nv2 = await call(admin, 'wine_upsert', { name: 'brut reserve', producer: 'KRUG' });
  check(
    'a non-vintage wine is matched, not duplicated (ADR-0016)',
    (nv2.data as { created: boolean }).created === false,
    nv2,
  );
  const nvId = (nv1.data as { wine: { id: string } }).wine.id;
  await call(admin, 'wine_upsert', {
    wine_id: nvId, wine_type: 'sparkling', acidity: 'high', body: 'medium_minus', avg_price: 180,
    region: 'Champagne', food_pairings: ['oysters'],
  });

  const search = await call(admin, 'wine_search', { query: 'mendoza' });
  check('wine_search finds by region', (search.data as { count: number }).count === 1, search.data);

  const fuzzy = await call(admin, 'wine_search', { query: 'Katena' });
  check('wine_search survives a misspelled producer', (fuzzy.data as { count: number }).count >= 1, fuzzy.data);

  const got = await call(admin, 'wine_get', { wine_id: wineId });
  check('wine_get returns the wine with holdings and aggregate', Boolean((got.data as { wine: unknown }).wine), got.error);

  section('Cellar — lots');
  const add1 = await call(admin, 'cellar_add', {
    wine_id: wineId, quantity: 6, purchase_price: 28, purchase_date: '2024-03-01',
    location: 'rack A', drink_from: '2025-01-01', drink_until: '2029-01-01',
  });
  const lotId = (add1.data as { item: { id: string } }).item.id;
  check('cellar_add creates a lot', Boolean(lotId), add1);

  await call(admin, 'cellar_add', { wine_id: wineId, quantity: 3, purchase_price: 41.5, purchase_date: '2025-06-01' });
  const listed = await call(admin, 'cellar_list', {});
  check('cellar_list counts bottles across lots', (listed.data as { bottle_count: number }).bottle_count === 9, listed.data);
  check('and groups two lots under one wine', (listed.data as { lot_count: number }).lot_count === 2);

  const gift = await call(admin, 'cellar_update', { item_id: lotId, status: 'gifted', quantity: 2 });
  const gifted = gift.data as { split_lot: { quantity: number; status: string } | null; item: { quantity: number } };
  check('a partial gift splits the lot', gifted.split_lot?.quantity === 2, gift);
  check('the gifted half records what left', gifted.split_lot?.status === 'gifted');
  check('the original lot keeps the rest', gifted.item.quantity === 4);

  const afterGift = await call(admin, 'cellar_list', {});
  check('stock excludes the gifted lot', (afterGift.data as { bottle_count: number }).bottle_count === 7, afterGift.data);

  const badWindow = await call(admin, 'cellar_add', {
    wine_id: wineId, drink_from: '2030-01-01', drink_until: '2025-01-01',
  });
  check('an inverted drink window is refused', Boolean(badWindow.error), badWindow);

  const soon = await call(admin, 'cellar_list', { ready_to_drink: true });
  check('ready_to_drink filters on the window', (soon.data as { lot_count: number }).lot_count >= 1, soon.data);

  section('Reviews');
  const review = await call(admin, 'review_write', {
    wine_id: wineId, rating: 92, drank_on: '2026-08-01', occasion: 'dinner',
    body_text: 'plum, violet, still young', would_buy_again: true, consume: true,
  });
  check('review_write records a tasting', Boolean((review.data as { review: unknown }).review), review.error);
  check('consume decrements the cellar', (review.data as { consumed: { consumed: number } | null }).consumed?.consumed === 1, review.data);

  const badRating = await call(admin, 'review_write', { wine_id: wineId, rating: 101 });
  check('a rating outside 1-100 is refused', Boolean(badRating.error), badRating);

  const reviews = await call(admin, 'review_list', { wine_id: wineId });
  check('review_list reads back by wine', (reviews.data as { count: number }).count === 1, reviews.data);
  check(
    'and carries the aggregate rating',
    (reviews.data as { aggregate_rating: { avg: number } }).aggregate_rating.avg === 92,
    reviews.data,
  );

  section('Preferences');
  const emptyPrefs = await call(admin, 'prefs_get', {});
  check(
    'a user with no profile reads the empty shape, not null',
    Array.isArray((emptyPrefs.data as { prefs: { likes: { grapes: string[] } } }).prefs.likes.grapes),
    emptyPrefs,
  );

  await call(admin, 'prefs_set', {
    likes: { grapes: ['malbec'] }, budget_min: 0, budget_max: 40,
    body: 'medium_plus', tannin: 'medium_plus', acidity: 'medium',
  });
  const merged = await call(admin, 'prefs_set', { likes: { grapes: ['syrah'] } });
  const mergedPrefs = (merged.data as { prefs: { likes: { grapes: string[] } } }).prefs;
  check('prefs_set merges lists by union', mergedPrefs.likes.grapes.length === 2, mergedPrefs.likes);

  const badBudget = await call(admin, 'prefs_set', { budget_min: 80, budget_max: 20 });
  check('an inverted budget band is refused', Boolean(badBudget.error), badBudget);

  section('The engine');
  const rec = await call(admin, 'wine_recommend', { food: 'roast lamb', price_max: 40, source: 'both', limit: 5 });
  const recs = (rec.data as { recommendations: Array<{ wine: { name: string }; score: number; reasons: string[]; in_cellar: boolean }> }).recommendations;
  check('wine_recommend returns a ranked list', recs.length >= 1, rec.error ?? rec.data);
  check('every entry carries at least one reason', recs.every((r) => r.reasons.length > 0), recs.map((r) => r.reasons));
  check('the lamb pairing is named in the reasons', recs[0]?.reasons.some((r) => /pairing/i.test(r)), recs[0]?.reasons);
  check('price_max filters out the 180 Champagne', recs.every((r) => r.wine.name !== 'Brut Reserve'), recs.map((r) => r.wine.name));

  const cellarOnly = await call(admin, 'wine_recommend', { source: 'cellar' });
  const cellarRecs = (cellarOnly.data as { recommendations: Array<{ in_cellar: boolean }> }).recommendations;
  check('source: cellar returns only owned bottles', cellarRecs.every((r) => r.in_cellar), cellarRecs);

  const runA = await call(admin, 'wine_recommend', { food: 'roast lamb', limit: 5 });
  const runB = await call(admin, 'wine_recommend', { food: 'roast lamb', limit: 5 });
  check(
    'the engine is deterministic',
    JSON.stringify((runA.data as { recommendations: unknown[] }).recommendations)
      === JSON.stringify((runB.data as { recommendations: unknown[] }).recommendations),
  );

  const unmatched = await call(admin, 'wine_recommend', { food: 'boiled turnips in aspic' });
  const unmatchedRecs = (unmatched.data as { recommendations: Array<{ penalties: string[] }> }).recommendations;
  check(
    'an unmatched food is reported rather than silently ignored',
    unmatchedRecs.every((r) => r.penalties.some((p) => /could not be scored/.test(p))),
    unmatchedRecs[0]?.penalties,
  );

  section('Administration — a member called Fabian');
  const fabian = await call(admin, 'user_create', {
    name: 'Fabian', email: `fabian+${Date.now()}@example.com`, role: 'member',
    issue_token: true, token_label: 'claude-desktop',
  });
  const fabianData = fabian.data as { user: { id: string }; token: { plaintext: string } };
  check('user_create makes an account and issues its first key', Boolean(fabianData.token?.plaintext), fabian);

  const users = await call(admin, 'user_list', {});
  check('user_list shows both accounts', (users.data as { count: number }).count === 2, users.data);

  const member = await connect(fabianData.token.plaintext);
  const memberTools = (await member.listTools()).tools.map((t) => t.name);
  check("a member's tools/list hides the admin tools", memberTools.length === 11, memberTools.sort());
  check('user_create is not visible to a member', !memberTools.includes('user_create'));
  check('token_create is not visible to a member', !memberTools.includes('token_create'));

  const forbidden = await call(member, 'user_create', { name: 'x', email: 'x@example.com' });
  check(
    'calling a hidden tool anyway is refused with a permission error',
    /Permission denied|not found|Tool.*unknown/i.test(String(forbidden.error ?? '')),
    forbidden,
  );

  section('One cellar, two clients');
  const memberWine = await call(member, 'wine_upsert', { name: 'Rioja Reserva', producer: 'La Rioja Alta' });
  const memberWineId = (memberWine.data as { wine: { id: string } }).wine.id;
  await call(member, 'cellar_add', { wine_id: memberWineId, quantity: 2 });

  const secondKey = await call(admin, 'token_create', { user_id: fabianData.user.id, label: 'gemini' });
  const secondClient = await connect((secondKey.data as { plaintext: string }).plaintext);
  const fromGemini = await call(secondClient, 'cellar_list', {});
  check(
    'a second client of the same user sees the same cellar',
    (fromGemini.data as { bottle_count: number }).bottle_count === 2,
    fromGemini.data,
  );
  const adminCellar = await call(admin, 'cellar_list', {});
  check(
    "and another user's cellar is untouched by it",
    (adminCellar.data as { bottle_count: number }).bottle_count === 6,
    adminCellar.data,
  );

  section('Token scoping and revocation');
  const dupLabel = await call(admin, 'token_create', { user_id: fabianData.user.id, label: 'Gemini' });
  check('a second live token for one client label is refused', Boolean(dupLabel.error), dupLabel);

  const scoped = await call(admin, 'token_create', {
    user_id: fabianData.user.id, label: 'read-only', scopes: ['catalog:read'],
  });
  const scopedClient = await connect((scoped.data as { plaintext: string }).plaintext);
  const scopedTools = (await scopedClient.listTools()).tools.map((t) => t.name);
  check('a scoped token sees only what it is scoped to', scopedTools.length === 2, scopedTools);
  const scopedDenied = await call(scopedClient, 'cellar_add', { wine_id: memberWineId, quantity: 1 });
  check('and is refused by a tool its user\'s role allows', Boolean(scopedDenied.error), scopedDenied);

  const overScoped = await call(admin, 'token_create', {
    user_id: fabianData.user.id, label: 'over-reach', scopes: ['catalog:read', 'admin:users'],
  });
  check(
    'a scope the role does not grant is dropped and reported',
    (overScoped.data as { refused_scopes?: string[] })?.refused_scopes?.includes('admin:users'),
    overScoped,
  );

  const tokenRows = await call(admin, 'token_list', { user_id: fabianData.user.id });
  const rows = (tokenRows.data as { tokens: Array<{ id: string; label: string }> }).tokens;
  check('token_list never returns a plaintext token', !JSON.stringify(rows).includes('wc_'), rows);

  const geminiRow = rows.find((t) => t.label === 'gemini')!;
  await call(admin, 'token_revoke', { token_id: geminiRow.id });
  const afterRevoke = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${(secondKey.data as { plaintext: string }).plaintext}` },
  });
  check('a revoked token gets 401', afterRevoke.status === 401, afterRevoke.status);

  const stillWorks = await call(member, 'cellar_list', {});
  check(
    'revoking one client leaves the other working',
    (stillWorks.data as { bottle_count: number }).bottle_count === 2,
    stillWorks.data,
  );

  const revokeAgain = await call(admin, 'token_revoke', { token_id: geminiRow.id });
  check('revoking twice is idempotent', (revokeAgain.data as { already_revoked: boolean }).already_revoked === true);

  section('Suspension and deletion');
  await call(admin, 'user_update', { user_id: fabianData.user.id, status: 'suspended' });
  const suspended = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${fabianData.token.plaintext}` },
  });
  check("suspending a user kills their live tokens immediately", suspended.status === 401, suspended.status);

  await call(admin, 'user_update', { user_id: fabianData.user.id, status: 'active' });
  const reinstated = await call(member, 'cellar_list', {});
  check('reinstating restores the tokens they held', Boolean(reinstated.data), reinstated.error);

  const selfSuspend = await call(admin, 'user_update', { user_id: bootstrap.user!.id, status: 'suspended' });
  check('an admin cannot suspend themselves', Boolean(selfSuspend.error), selfSuspend);

  const selfDemote = await call(admin, 'user_update', { user_id: bootstrap.user!.id, role: 'member' });
  check('and cannot demote themselves as the last admin', Boolean(selfDemote.error), selfDemote);

  const softDeleted = await call(admin, 'user_delete', { user_id: fabianData.user.id });
  check('user_delete soft-deletes by default', (softDeleted.data as { deleted: string }).deleted === 'soft', softDeleted);
  const afterDelete = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${fabianData.token.plaintext}` },
  });
  check('a deleted user reaches nothing', afterDelete.status === 401, afterDelete.status);

  section('Result');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    await closeAll();
    process.exit(1);
  }
  console.log('All checks passed.');
}

/** Every open MCP session holds a stream, which would keep the process alive. */
async function closeAll() {
  await Promise.allSettled(openClients.map((c) => c.close()));
}

main()
  .then(async () => {
    await closeAll();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nSmoke test crashed:', err);
    await closeAll();
    process.exit(1);
  });
