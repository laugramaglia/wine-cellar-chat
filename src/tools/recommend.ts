import { z } from 'zod';
import { defineTool } from './define.js';
import { WINE_TYPES } from '../types.js';
import { recommend } from '../engine/recommend.js';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../engine/weights.js';
import type { Candidate } from '../engine/recommend.js';

export const wineRecommend = defineTool({
  name: 'wine_recommend',
  title: 'Recommend a wine',
  description:
    'Rank wines for an occasion, a dish, a budget and a palate. Deterministic and rule-based: ' +
    'every point of score maps to a reason string, so the answer can be explained and argued with. ' +
    'source "cellar" ranks only bottles the caller actually owns.',
  input: {
    occasion: z.string().max(200).optional(),
    food: z.string().max(200).optional(),
    wine_type: z.enum(WINE_TYPES).optional(),
    price_max: z.number().min(0).nullable().optional(),
    price_min: z.number().min(0).nullable().optional(),
    grapes: z.array(z.string().max(100)).max(10).optional(),
    region: z.string().max(200).optional(),
    exclude_wine_ids: z.array(z.string().uuid()).max(50).optional().default([]),
    source: z.enum(['cellar', 'catalog', 'both']).optional().default('both'),
    use_prefs: z.boolean().optional().default(true),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  },
  async handler(args, { db, props }) {
    const [wines, prefs, reviews, cellar] = await Promise.all([
      db.allWines(),
      db.getPrefs(props.userId),
      db.listReviews({ user_id: props.userId }),
      db.listCellar(props.userId),
    ]);

    const lotsByWine = new Map<string, typeof cellar>();
    for (const lot of cellar) {
      if (lot.status !== 'in_cellar') continue;
      const list = lotsByWine.get(lot.wine_id) ?? [];
      list.push(lot);
      lotsByWine.set(lot.wine_id, list);
    }

    const pool = args.source === 'cellar' ? wines.filter((w) => lotsByWine.has(w.id)) : wines;

    const candidates: Candidate[] = pool.map((wine) => {
      const lots = lotsByWine.get(wine.id) ?? [];
      return { wine, lots, quantity: lots.reduce((n, l) => n + l.quantity, 0) };
    });

    const { recommendations, filtered } = recommend({ input: args, candidates, prefs, reviews });

    return {
      count: recommendations.length,
      considered: candidates.length,
      filtered_out: filtered,
      recommendations,
    };
  },
});
