import { z } from 'zod';
import { defineTool } from './define.js';
import { SWEETNESS, INTENSITY, WINE_TYPES } from '../types.js';
import { askForMissingFields } from './followup.js';

// Bounds mirror the CHECK constraints in schema.sql (ADR-0020). Zod produces the
// readable message; the column guarantees the invariant. Where they disagree, the
// column is right and this file is the bug.
const wineFields = {
  name: z.string().min(1).max(300).optional(),
  producer: z.string().min(1).max(300).optional(),
  vintage: z.number().int().min(1800).max(2100).nullable().optional()
    .describe('Omit or pass null for a non-vintage bottling'),
  country: z.string().max(100).optional(),
  region: z.string().max(200).optional(),
  subregion: z.string().max(200).optional(),
  wine_type: z.enum(WINE_TYPES).optional(),
  grapes: z.array(z.string().max(100)).max(20).optional(),
  abv: z.number().min(0).max(100).optional(),
  sweetness: z.enum(SWEETNESS).optional(),
  body: z.enum(INTENSITY).optional(),
  tannin: z.enum(INTENSITY).optional().describe('null for most whites; an absent measurement, not a low one'),
  acidity: z.enum(INTENSITY).optional(),
  avg_price: z.number().min(0).optional(),
  style_tags: z.array(z.string().max(60)).max(20).optional(),
  food_pairings: z.array(z.string().max(60)).max(20).optional(),
  tasting_notes: z.string().max(8000).optional(),
};

export const wineUpsert = defineTool({
  name: 'wine_upsert',
  title: 'Create or enrich a wine',
  description:
    'Create a wine in the shared catalogue, or add data to one that already exists. ' +
    'Only `name` is required — a wine read off a blurry label may be nothing but a name and a producer, ' +
    'and calling again later with more fields is the intended way to enrich it. ' +
    'Merge semantics: fills blanks, never overwrites a non-null field unless overwrite is true. ' +
    'If the stored wine is too sparse to recommend well, the response carries a `follow_up` question — ' +
    'answer it by calling this tool again with the same wine_id and whatever you can find out.',
  input: {
    ...wineFields,
    // Required to CREATE a wine, optional when wine_id names an existing one — otherwise
    // answering this tool's own follow_up question ("call again with wine_id and what you
    // learned") fails validation, which is exactly the trap that question walks into.
    name: z.string().min(1).max(300).optional(),
    wine_id: z.string().uuid().optional().describe('Target an existing wine directly instead of matching on producer/name/vintage'),
    overwrite: z.boolean().optional().default(false),
  },
  async handler(args, { db, props }) {
    const { wine_id, overwrite, ...fields } = args;
    if (!wine_id && !fields.name) {
      throw new Error('Pass a name to create a wine, or a wine_id to enrich an existing one.');
    }
    const result = await db.upsertWine(fields as never, {
      wine_id,
      overwrite,
      actor: props.userId,
    });
    return {
      wine: result.wine,
      created: result.created,
      fields_filled: result.fields_filled,
      // Not in the original contract: the specification never reported what an upsert
      // refused, which made a rejected value silent. It is reported here.
      fields_refused: result.fields_refused,
      // Null once the wine carries enough for the engine to work with.
      follow_up: askForMissingFields(result.wine),
    };
  },
});

export const wineSearch = defineTool({
  name: 'wine_search',
  title: 'Search the wine catalogue',
  description:
    'Find wines in the shared catalogue by free text over name, producer, region and notes, ' +
    'plus optional structured filters. Misspelled producers still match. ' +
    'Results carry an owned flag and quantity for the calling user.',
  input: {
    query: z.string().max(200).optional(),
    wine_type: z.enum(WINE_TYPES).optional(),
    country: z.string().max(100).optional(),
    region: z.string().max(200).optional(),
    grapes: z.array(z.string().max(100)).max(10).optional(),
    vintage_min: z.number().int().min(1800).max(2100).optional(),
    vintage_max: z.number().int().min(1800).max(2100).optional(),
    price_min: z.number().min(0).optional(),
    price_max: z.number().min(0).optional(),
    owned_only: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async handler(args, { db, props }) {
    const matches = await db.searchWines({ ...args, userId: props.userId } as never);
    return {
      count: matches.length,
      wines: matches.map((m) => ({ ...m.wine, owned: m.owned, quantity: m.quantity })),
    };
  },
});

export const wineGet = defineTool({
  name: 'wine_get',
  title: 'Read one wine in full',
  description:
    'Everything about one wine: its fields, the caller\'s cellar holdings of it, the caller\'s own reviews, ' +
    'and the aggregate rating across all users.',
  input: { wine_id: z.string().uuid() },
  async handler({ wine_id }, { db, props }) {
    const wine = await db.getWine(wine_id);
    if (!wine) throw new Error(`No wine with id '${wine_id}'.`);
    const { quantity, lots } = await db.holdings(props.userId, wine_id);
    const mine = await db.listReviews({ wine_id, user_id: props.userId });
    const aggregate = await db.aggregateRating(wine_id);
    return {
      wine,
      cellar: { quantity, lots },
      my_reviews: mine,
      aggregate_rating: aggregate,
    };
  },
});
