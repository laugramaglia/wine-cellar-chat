import { z } from 'zod';
import { defineTool } from './define.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const reviewWrite = defineTool({
  name: 'review_write',
  title: 'Record a tasting',
  description:
    'Record the calling user\'s tasting note and rating for a wine. Optionally decrement the cellar with consume: true, ' +
    'which closes the lot when it takes the last bottle.',
  input: {
    wine_id: z.string().uuid(),
    rating: z.number().int().min(1).max(100),
    drank_on: isoDate.optional(),
    occasion: z.string().max(200).optional(),
    body_text: z.string().max(8000).optional(),
    would_buy_again: z.boolean().optional(),
    consume: z.boolean().optional().default(false),
    consume_quantity: z.number().int().min(1).max(100).optional().default(1),
  },
  async handler(args, { db, props }) {
    const review = await db.addReview({
      user_id: props.userId,
      wine_id: args.wine_id,
      rating: args.rating,
      drank_on: args.drank_on ?? null,
      occasion: args.occasion ?? null,
      body_text: args.body_text ?? null,
      would_buy_again: args.would_buy_again ?? null,
    });

    let consumed: { consumed: number; closed: string[] } | null = null;
    let warning: string | null = null;
    if (args.consume) {
      const { quantity } = await db.holdings(props.userId, args.wine_id);
      if (quantity === 0) {
        // Reviewing a wine drunk at a restaurant is a normal act, so this is reported
        // rather than rejected — but reported, because silence would hide a cellar bug.
        warning = 'consume was requested but you hold no bottles of this wine; the review was still recorded.';
      } else {
        consumed = await db.consume(props.userId, args.wine_id, args.consume_quantity ?? 1);
        if (consumed.consumed < (args.consume_quantity ?? 1)) {
          warning = `Only ${consumed.consumed} bottle(s) were held, so only those were consumed.`;
        }
      }
    }

    const aggregate = await db.aggregateRating(args.wine_id);
    return { review, consumed, warning, aggregate_rating: aggregate };
  },
});

export const reviewList = defineTool({
  name: 'review_list',
  title: 'Read reviews',
  description:
    'Reviews for one wine, or the calling user\'s own recent reviews when wine_id is omitted. ' +
    'Reading by wine returns every user\'s reviews, which is what makes the aggregate rating meaningful; ' +
    'omitting wine_id is always scoped to the caller.',
  input: {
    wine_id: z.string().uuid().optional(),
    min_rating: z.number().int().min(1).max(100).optional(),
    since: z.string().optional().describe('ISO date; compares against drank_on, falling back to created_at'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async handler(args, { db, props }) {
    const filter = args.wine_id
      ? { wine_id: args.wine_id, min_rating: args.min_rating, since: args.since }
      : { user_id: props.userId, min_rating: args.min_rating, since: args.since };
    const rows = await db.listReviews(filter as never);
    const aggregate = args.wine_id ? await db.aggregateRating(args.wine_id) : null;
    return {
      scope: args.wine_id ? 'wine' : 'caller',
      count: rows.length,
      reviews: rows.slice(0, args.limit),
      aggregate_rating: aggregate,
    };
  },
});
