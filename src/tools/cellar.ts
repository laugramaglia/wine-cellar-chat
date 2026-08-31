import { z } from 'zod';
import { defineTool } from './define.js';
import { CELLAR_STATUSES, WINE_TYPES, type CellarItem } from '../types.js';
import { DRINK_SOON_MONTHS } from '../engine/weights.js';
import { askForMissingFields } from './followup.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const cellarAdd = defineTool({
  name: 'cellar_add',
  title: 'Put bottles in the cellar',
  description:
    'Add bottles to the calling user\'s cellar. Pass wine_id, or inline wine fields which are upserted first. ' +
    'Each call creates a lot — bottles acquired together — so two purchases of the same wine at two prices stay distinct. ' +
    'If the wine is too sparse to recommend well, the response carries a `follow_up` question worth answering.',
  input: {
    wine_id: z.string().uuid().optional(),
    name: z.string().min(1).max(300).optional().describe('Required when wine_id is omitted'),
    producer: z.string().min(1).max(300).optional(),
    vintage: z.number().int().min(1800).max(2100).nullable().optional(),
    quantity: z.number().int().min(0).max(10000).optional().default(1),
    purchase_price: z.number().min(0).optional(),
    purchase_date: isoDate.optional(),
    location: z.string().max(200).optional(),
    drink_from: isoDate.optional(),
    drink_until: isoDate.optional(),
    notes: z.string().max(4000).optional(),
  },
  async handler(args, { db, props }) {
    let wineId = args.wine_id;
    let created = false;
    if (!wineId) {
      if (!args.name) throw new Error('Pass wine_id, or a name to create the wine with.');
      const up = await db.upsertWine(
        { name: args.name, producer: args.producer ?? null, vintage: args.vintage ?? null } as never,
        { actor: props.userId },
      );
      wineId = up.wine.id;
      created = up.created;
    }
    const item = await db.addCellarItem({
      user_id: props.userId,
      wine_id: wineId,
      quantity: args.quantity,
      purchase_price: args.purchase_price ?? null,
      purchase_date: args.purchase_date ?? null,
      location: args.location ?? null,
      drink_from: args.drink_from ?? null,
      drink_until: args.drink_until ?? null,
      notes: args.notes ?? null,
    });
    const wine = await db.getWine(wineId);
    return {
      item,
      wine,
      wine_created: created,
      follow_up: wine ? askForMissingFields(wine) : null,
    };
  },
});

export const cellarUpdate = defineTool({
  name: 'cellar_update',
  title: 'Change or close a cellar lot',
  description:
    'Change quantity, location, drink window or notes on one of the caller\'s lots, or close it as drunk or gifted. ' +
    'Closing part of a lot splits it, leaving the rest in the cellar. Drinking the last bottle closes the lot automatically.',
  input: {
    item_id: z.string().uuid(),
    quantity: z.number().int().min(0).max(10000).optional()
      .describe('With a status change, the number of bottles leaving the cellar; otherwise the new quantity'),
    location: z.string().max(200).nullable().optional(),
    drink_from: isoDate.nullable().optional(),
    drink_until: isoDate.nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    status: z.enum(CELLAR_STATUSES).optional(),
  },
  async handler(args, { db, props }) {
    const { item_id, ...patch } = args;
    // Scoped by user_id from props, never from tool input.
    const result = await db.updateCellarItem(props.userId, item_id, patch as never);
    return {
      item: result.item,
      split_lot: result.split,
      auto_closed: result.auto_closed,
    };
  },
});

export const cellarList = defineTool({
  name: 'cellar_list',
  title: 'List the cellar',
  description:
    'The calling user\'s cellar, grouped by wine across lots. Filters by type, region, readiness and closing window.',
  input: {
    wine_type: z.enum(WINE_TYPES).optional(),
    region: z.string().max(200).optional(),
    ready_to_drink: z.boolean().optional().describe('Now inside the drink window'),
    drink_soon: z.boolean().optional().describe(`Window closes within ${DRINK_SOON_MONTHS} months`),
    drink_soon_months: z.number().int().min(1).max(120).optional().default(DRINK_SOON_MONTHS),
    include_closed: z.boolean().optional().default(false),
    sort: z.enum(['drink_until', 'purchase_date', 'price', 'name']).optional().default('name'),
    limit: z.number().int().min(1).max(200).optional().default(50),
  },
  async handler(args, { db, props }) {
    const items = await db.listCellar(props.userId);
    const today = new Date().toISOString().slice(0, 10);
    const soonCutoff = new Date();
    soonCutoff.setMonth(soonCutoff.getMonth() + (args.drink_soon_months ?? DRINK_SOON_MONTHS));
    const soonIso = soonCutoff.toISOString().slice(0, 10);

    const wines = new Map<string, Awaited<ReturnType<typeof db.getWine>>>();
    for (const item of items) {
      if (!wines.has(item.wine_id)) wines.set(item.wine_id, await db.getWine(item.wine_id));
    }

    const kept = items.filter((item) => {
      if (!args.include_closed && item.status !== 'in_cellar') return false;
      const wine = wines.get(item.wine_id);
      if (args.wine_type && wine?.wine_type !== args.wine_type) return false;
      if (args.region && (wine?.region ?? '').toLowerCase() !== args.region.toLowerCase()) return false;
      if (args.ready_to_drink) {
        // A null bound is an open end, not a closed one: a bottle with no window is
        // drinkable now. That is the common case for a bottle added from a photo.
        if (item.drink_from && item.drink_from > today) return false;
        if (item.drink_until && item.drink_until < today) return false;
      }
      if (args.drink_soon) {
        if (!item.drink_until) return false;
        if (item.drink_until > soonIso) return false;
      }
      return true;
    });

    const sorted = [...kept].sort((a, b) => cmp(a, b, args.sort ?? 'name', wines));

    // Grouped by wine, because lots are a storage shape and not what a person asked for.
    const groups = new Map<string, { wine: unknown; quantity: number; lots: CellarItem[] }>();
    for (const item of sorted.slice(0, args.limit)) {
      const key = item.wine_id;
      const group = groups.get(key) ?? { wine: wines.get(key), quantity: 0, lots: [] };
      group.quantity += item.status === 'in_cellar' ? item.quantity : 0;
      group.lots.push(item);
      groups.set(key, group);
    }

    return {
      bottle_count: kept.reduce((n, i) => n + (i.status === 'in_cellar' ? i.quantity : 0), 0),
      lot_count: kept.length,
      wines: [...groups.values()],
    };
  },
});

function cmp(
  a: CellarItem,
  b: CellarItem,
  sort: string,
  wines: Map<string, { name: string; avg_price: number | null } | undefined>,
): number {
  switch (sort) {
    case 'drink_until':
      return (a.drink_until ?? '9999').localeCompare(b.drink_until ?? '9999') || a.id.localeCompare(b.id);
    case 'purchase_date':
      return (b.purchase_date ?? '').localeCompare(a.purchase_date ?? '') || a.id.localeCompare(b.id);
    case 'price':
      return (b.purchase_price ?? 0) - (a.purchase_price ?? 0) || a.id.localeCompare(b.id);
    default:
      return (wines.get(a.wine_id)?.name ?? '').localeCompare(wines.get(b.wine_id)?.name ?? '')
        || a.id.localeCompare(b.id);
  }
}
