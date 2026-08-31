import { z } from 'zod';
import { defineTool } from './define.js';
import { INTENSITY, SWEETNESS } from '../types.js';

const prefLists = z.object({
  grapes: z.array(z.string().max(100)).max(50).optional().default([]),
  regions: z.array(z.string().max(200)).max(50).optional().default([]),
  styles: z.array(z.string().max(60)).max(50).optional().default([]),
});

export const prefsGet = defineTool({
  name: 'prefs_get',
  title: 'Read the palate profile',
  description:
    'The calling user\'s stored palate profile. A user who has never written one reads back the same empty shape ' +
    'as everyone else, never null. The profile is keyed on the user, so every client sees the same one.',
  input: {},
  async handler(_args, { db, props }) {
    const prefs = await db.getPrefs(props.userId);
    return { prefs };
  },
});

export const prefsSet = defineTool({
  name: 'prefs_set',
  title: 'Set or merge the palate profile',
  description:
    'Update the calling user\'s palate profile. Partial updates merge by default — lists are unioned, ' +
    'scalars are replaced by any value given. Pass replace: true to overwrite the whole profile instead.',
  input: {
    likes: prefLists.optional(),
    dislikes: prefLists.optional(),
    avoid: z.array(z.string().max(100)).max(50).optional()
      .describe('Hard filter. Best-effort: matched against style tags, grapes and tasting notes, which is all the catalogue records'),
    budget_min: z.number().min(0).nullable().optional(),
    budget_max: z.number().min(0).nullable().optional(),
    sweetness: z.enum(SWEETNESS).nullable().optional(),
    body: z.enum(INTENSITY).nullable().optional(),
    tannin: z.enum(INTENSITY).nullable().optional(),
    acidity: z.enum(INTENSITY).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    replace: z.boolean().optional().default(false),
  },
  async handler(args, { db, props }) {
    const { replace, ...patch } = args;
    const prefs = await db.setPrefs(props.userId, patch as never, replace ?? false);
    return {
      prefs,
      merged: !replace,
      note: prefs.avoid.length > 0
        ? 'avoid is matched against style tags, grapes and tasting notes only — the catalogue records no allergen or additive data, so it cannot be relied on for allergies.'
        : undefined,
    };
  },
});
