// Tunable configuration for the recommendation engine. Weights live here so they can be
// changed without touching the logic (ADR-0004).

export const WEIGHTS = {
  food_pairing: 0.30,
  palate_fit: 0.25,
  personal_history: 0.20,
  preference_match: 0.15,
  budget_fit: 0.05,
  drink_window: 0.05,
} as const;

export type ComponentName = keyof typeof WEIGHTS;

/**
 * The 5-point body/tannin/acidity scale is treated as evenly spaced: adjacent steps are
 * 0.25 apart, so the distance between 'low' and 'high' is 1.0 and a component score is
 * 1 - distance. The wiki records the numeric spacing as an open question; even spacing
 * is the reading that adds no unearned structure, and it is stated here rather than
 * buried in the comparison.
 */
export const SCALE_STEP = 0.25;

/** A candidate must reach at least this much of the score to be worth returning. */
export const MIN_SCORE = 0.0;

/** wine_search caps at 50; the engine caps at the same number for the same reason. */
export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 5;

/** "Closing soon" for the drink-window component, and the default N for drink_soon. */
export const DRINK_SOON_MONTHS = 6;
