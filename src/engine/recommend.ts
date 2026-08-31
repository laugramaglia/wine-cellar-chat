// The recommendation engine: hard filters, then a weighted score.
//
// ADR-0004  deterministic. Same input, same output. No LLM inside.
// ADR-0005  every point of score maps to a reason string. If it cannot be explained,
//           it is not scored.
// ADR-0006  missing data never penalizes: an unknown component is dropped and the
//           remaining weights are renormalized.

import { INTENSITY, type Intensity, type Wine } from '../types.js';
import type { CellarItem, Review, UserPrefs } from '../types.js';
import { DEFAULT_LIMIT, MAX_LIMIT, SCALE_STEP, WEIGHTS, type ComponentName } from './weights.js';
import { matchPairing } from './pairings.js';

export interface RecommendInput {
  occasion?: string;
  food?: string;
  wine_type?: Wine['wine_type'];
  price_max?: number | null;
  price_min?: number | null;
  grapes?: string[];
  region?: string;
  exclude_wine_ids?: string[];
  source?: 'cellar' | 'catalog' | 'both';
  use_prefs?: boolean;
  limit?: number;
}

export interface Candidate {
  wine: Wine;
  lots: CellarItem[];
  quantity: number;
}

export interface Recommendation {
  wine: Wine;
  score: number;
  in_cellar: boolean;
  quantity: number;
  reasons: string[];
  penalties: string[];
}

interface Scored {
  weight: number;
  value: number;
  reason: string;
  penalty?: string;
}

const lower = (v: string | null | undefined) => (v ?? '').toLowerCase();
const scalePosition = (v: Intensity) => INTENSITY.indexOf(v);

/** 1.0 for the same position, falling by SCALE_STEP for each step apart. */
function scaleCloseness(a: Intensity, b: Intensity): number {
  return Math.max(0, 1 - Math.abs(scalePosition(a) - scalePosition(b)) * SCALE_STEP);
}

const monthsUntil = (date: string, now: Date) =>
  (new Date(date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

export function recommend(args: {
  input: RecommendInput;
  candidates: Candidate[];
  prefs: UserPrefs;
  reviews: Review[];
  now?: Date;
}): { recommendations: Recommendation[]; filtered: number } {
  const { input, candidates, prefs, reviews } = args;
  const now = args.now ?? new Date();
  const usePrefs = input.use_prefs ?? true;
  const source = input.source ?? 'both';
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const excluded = new Set(input.exclude_wine_ids ?? []);
  const requestedGrapes = new Set((input.grapes ?? []).map((g) => g.toLowerCase()));

  // --- hard filters ---------------------------------------------------------------
  const kept = candidates.filter(({ wine, quantity }) => {
    if (excluded.has(wine.id)) return false;
    if (input.wine_type && wine.wine_type !== input.wine_type) return false;
    if (input.region && lower(wine.region) !== lower(input.region)) return false;
    if (input.price_max != null && wine.avg_price != null && wine.avg_price > input.price_max) return false;
    if (input.price_min != null && wine.avg_price != null && wine.avg_price < input.price_min) return false;
    if (source === 'cellar' && quantity <= 0) return false;
    if (source === 'catalog' && false) return false;

    // prefs.avoid is a SAFETY filter, not a preference: it carries allergens. It is
    // applied even when use_prefs is false, deliberately, because the alternative is a
    // user who listed an allergen being shown wines anyway.
    if (prefs.avoid.length > 0 && matchesAvoid(wine, prefs.avoid)) return false;

    if (usePrefs) {
      // A dislike loses to an explicit request for the same thing: the request wins.
      const disliked = prefs.dislikes.grapes.some(
        (g) => wine.grapes.some((wg) => wg.toLowerCase() === g.toLowerCase()) && !requestedGrapes.has(g.toLowerCase()),
      );
      if (disliked) return false;
      const dislikedRegion = prefs.dislikes.regions.some(
        (r) => lower(wine.region) === r.toLowerCase() && lower(input.region) !== r.toLowerCase(),
      );
      if (dislikedRegion) return false;
    }
    return true;
  });

  const pairing = input.food ? matchPairing(input.food) : null;

  const scored: Array<{ rec: Recommendation; wine: Wine }> = [];

  for (const candidate of kept) {
    const { wine, lots, quantity } = candidate;
    const components = new Map<ComponentName, Scored>();

    // --- 1. food pairing, 0.30 ----------------------------------------------------
    if (input.food) {
      const food = input.food.toLowerCase();
      const listed = wine.food_pairings.find((p) => food.includes(p.toLowerCase()) || p.toLowerCase().includes(food));
      if (listed) {
        components.set('food_pairing', {
          weight: WEIGHTS.food_pairing,
          value: 1,
          reason: `Food pairing: '${listed}' is listed in this wine's pairings`,
        });
      } else if (pairing) {
        const hits: string[] = [];
        const checks: number[] = [];
        if (pairing.wine_types && wine.wine_type) {
          const hit = pairing.wine_types.includes(wine.wine_type);
          checks.push(hit ? 1 : 0);
          if (hit) hits.push(`a ${wine.wine_type}`);
        }
        for (const key of ['tannin', 'acidity', 'body', 'sweetness'] as const) {
          const wanted = pairing[key];
          const have = wine[key];
          if (!wanted || !have) continue;
          const hit = (wanted as readonly string[]).includes(have);
          checks.push(hit ? 1 : 0);
          if (hit) hits.push(`${key} ${have.replace('_', ' ')}`);
        }
        if (checks.length > 0) {
          const value = checks.reduce((a, b) => a + b, 0) / checks.length;
          components.set('food_pairing', {
            weight: WEIGHTS.food_pairing,
            value,
            reason: hits.length > 0
              ? `Food pairing: ${pairing.family} wants ${hits.join(' and ')}, which this wine has`
              : `Food pairing: ${pairing.family} is a poor match for this style`,
            penalty: value < 0.5 ? `${pairing.family} usually wants a different style` : undefined,
          });
        }
      }
      // If neither branch produced a component the weight is dropped and the rest
      // renormalize — which would let "what goes with lamb" answer confidently with
      // food playing no part. The caveat below makes that visible instead of silent.
    }

    // --- 2. palate fit, 0.25 ------------------------------------------------------
    if (usePrefs) {
      const parts: number[] = [];
      const notes: string[] = [];
      const misses: string[] = [];
      for (const key of ['body', 'tannin', 'acidity'] as const) {
        const want = prefs[key];
        const have = wine[key];
        if (!want || !have) continue;   // ADR-0006: absent, never coerced to a position
        const closeness = scaleCloseness(want, have);
        parts.push(closeness);
        if (closeness >= 0.75) notes.push(`${key} ${have.replace('_', ' ')}`);
        else misses.push(`higher ${key} than your usual ${want.replace('_', ' ')}`);
      }
      if (prefs.sweetness && wine.sweetness) {
        const hit = prefs.sweetness === wine.sweetness;
        parts.push(hit ? 1 : 0);
        if (hit) notes.push(`sweetness ${wine.sweetness.replace('_', ' ')}`);
      }
      if (parts.length > 0) {
        const value = parts.reduce((a, b) => a + b, 0) / parts.length;
        components.set('palate_fit', {
          weight: WEIGHTS.palate_fit,
          value,
          reason: notes.length > 0
            ? `Palate fit: ${notes.join(', ')} matches your stored profile`
            : 'Palate fit: this sits away from your stored profile',
          penalty: misses.length > 0 && value < 0.75 ? misses[0] : undefined,
        });
      }
    }

    // --- 3. personal history, 0.20 ------------------------------------------------
    const history = scoreHistory(wine, reviews, candidates);
    if (history) components.set('personal_history', history);

    // --- 4. preference match, 0.15 ------------------------------------------------
    {
      const matches: string[] = [];
      const wineGrapes = wine.grapes.map((g) => g.toLowerCase());
      for (const grape of requestedGrapes) {
        if (wineGrapes.includes(grape)) matches.push(`you asked for ${grape}`);
      }
      if (usePrefs) {
        for (const grape of prefs.likes.grapes) {
          if (wineGrapes.includes(grape.toLowerCase())) matches.push(`${grape} is on your likes`);
        }
        for (const region of prefs.likes.regions) {
          if (lower(wine.region) === region.toLowerCase()) matches.push(`${region} is on your likes`);
        }
        for (const style of prefs.likes.styles) {
          if (wine.style_tags.some((t) => t.toLowerCase() === style.toLowerCase())) {
            matches.push(`style '${style}' is on your likes`);
          }
        }
      }
      const wanted = requestedGrapes.size + (usePrefs
        ? prefs.likes.grapes.length + prefs.likes.regions.length + prefs.likes.styles.length
        : 0);
      if (wanted > 0) {
        const value = Math.min(1, matches.length / Math.min(wanted, 2));
        components.set('preference_match', {
          weight: WEIGHTS.preference_match,
          value,
          reason: matches.length > 0
            ? `Preference match: ${matches.slice(0, 2).join(', ')}`
            : 'Preference match: nothing here overlaps what you like',
        });
      }
    }

    // --- 5. budget fit, 0.05 ------------------------------------------------------
    {
      const min = input.price_min ?? (usePrefs ? prefs.budget_min : null);
      const max = input.price_max ?? (usePrefs ? prefs.budget_max : null);
      if (wine.avg_price != null && (min != null || max != null)) {
        const price = wine.avg_price;
        const lo = min ?? 0;
        const hi = max ?? Number.POSITIVE_INFINITY;
        let value: number;
        let reason: string;
        let penalty: string | undefined;
        if (price >= lo && price <= hi) {
          value = 1;
          reason = `${price} is inside your ${lo}-${hi === Number.POSITIVE_INFINITY ? 'open' : hi} budget`;
        } else {
          const over = price > hi ? price - hi : lo - price;
          const span = hi === Number.POSITIVE_INFINITY ? Math.max(lo, 1) : Math.max(hi - lo, 1);
          value = Math.max(0, 1 - over / span);
          reason = `${price} sits outside your budget band`;
          penalty = `${price} is ${price > hi ? 'above' : 'below'} your budget`;
        }
        components.set('budget_fit', { weight: WEIGHTS.budget_fit, value, reason, penalty });
      }
    }

    // --- 6. drink-window urgency, 0.05 -------------------------------------------
    if (quantity > 0) {
      const closing = lots
        .map((l) => l.drink_until)
        .filter((d): d is string => d !== null)
        .sort()[0];
      if (closing) {
        const months = monthsUntil(closing, now);
        // Sooner is more urgent; past the window is maximal urgency.
        const value = months <= 0 ? 1 : Math.max(0, Math.min(1, 1 - months / 24));
        components.set('drink_window', {
          weight: WEIGHTS.drink_window,
          value,
          reason: months <= 0
            ? 'Drink window has already closed'
            : `Drink window closes in ${Math.round(months)} month(s)`,
        });
      }
    }

    // --- renormalize over the present components (ADR-0006) -----------------------
    const present = [...components.values()];
    if (present.length === 0) continue;   // no component, no explanation, no entry

    const totalWeight = present.reduce((n, c) => n + c.weight, 0);
    const score = present.reduce((n, c) => n + c.weight * c.value, 0) / totalWeight;

    // ADR-0005: a reason for every component that moved the score.
    const reasons = present.filter((c) => c.value > 0).map((c) => c.reason);
    const penalties = present.map((c) => c.penalty).filter((p): p is string => Boolean(p));

    if (reasons.length === 0) continue;   // nothing explicable, so nothing offered

    if (input.food && !components.has('food_pairing')) {
      penalties.push(
        `Food pairing could not be scored: nothing recorded about '${input.food}' for this wine, ` +
          'so the other components carry the whole score',
      );
    }

    scored.push({
      wine,
      rec: {
        wine,
        score: Math.round(score * 1000) / 1000,
        in_cellar: quantity > 0,
        quantity,
        reasons,
        penalties,
      },
    });
  }

  // Determinism needs a total order. Score, then name, then id — the tie-break key is
  // stated rather than implicit, which is the exemption ADR-0005 needs.
  scored.sort(
    (a, b) => b.rec.score - a.rec.score
      || a.wine.name.localeCompare(b.wine.name)
      || a.wine.id.localeCompare(b.wine.id),
  );

  return {
    recommendations: scored.slice(0, limit).map((s) => s.rec),
    filtered: candidates.length - kept.length,
  };
}

function scoreHistory(wine: Wine, reviews: Review[], candidates: Candidate[]): Scored | null {
  const byWine = new Map(candidates.map((c) => [c.wine.id, c.wine]));
  const rated = reviews.filter((r) => byWine.has(r.wine_id) || r.wine_id === wine.id);

  const same = rated.filter((r) => r.wine_id === wine.id);
  if (same.length > 0) {
    const avg = same.reduce((n, r) => n + r.rating, 0) / same.length;
    return {
      weight: WEIGHTS.personal_history,
      value: clamp01((avg - 50) / 50),
      reason: `You rated this wine ${Math.round(avg)} over ${same.length} review(s)`,
      penalty: avg < 70 ? `You have rated this wine ${Math.round(avg)} before` : undefined,
    };
  }

  for (const [dimension, label] of [['grapes', 'grape'], ['region', 'region'], ['producer', 'producer']] as const) {
    const related = rated.filter((r) => {
      const other = byWine.get(r.wine_id);
      if (!other) return false;
      if (dimension === 'grapes') {
        const mine = new Set(wine.grapes.map((g) => g.toLowerCase()));
        return other.grapes.some((g) => mine.has(g.toLowerCase()));
      }
      return lower(other[dimension]) !== '' && lower(other[dimension]) === lower(wine[dimension]);
    });
    if (related.length === 0) continue;
    const avg = related.reduce((n, r) => n + r.rating, 0) / related.length;
    const named = dimension === 'grapes' ? wine.grapes[0] : wine[dimension];
    return {
      weight: WEIGHTS.personal_history,
      value: clamp01((avg - 50) / 50),
      reason: `${named} matches a ${label} you rate ${Math.round(avg)} on average over ${related.length} review(s)`,
      penalty: avg < 70 ? `You average ${Math.round(avg)} on this ${label}` : undefined,
    };
  }
  return null;
}

/** Best-effort matching for prefs.avoid against the data a wine actually carries.
 *  The wiki records that `avoid` names things the schema has no column for — allergens,
 *  additives — so this matches style tags, grapes and tasting notes and cannot be
 *  complete. It is a filter, so it fails toward showing fewer wines, never more. */
function matchesAvoid(wine: Wine, avoid: string[]): boolean {
  const haystack = [
    ...wine.style_tags,
    ...wine.grapes,
    wine.tasting_notes ?? '',
    wine.wine_type ?? '',
  ].join(' ').toLowerCase();
  return avoid.some((term) => term.trim().length > 0 && haystack.includes(term.toLowerCase().replace(/^no\s+/, '')));
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
