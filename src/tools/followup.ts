// Asking the agent for what the catalogue is missing.
//
// ADR-0007 makes wine_upsert a fill-blanks merge precisely so a wine can be stored from
// a blurry label and enriched later — but "later" only happens if something asks. A row
// that arrives as { name, producer } and is never revisited stays a row the engine can
// barely score, because five of its six components have nothing to read.
//
// So a write that leaves important fields blank returns a question. The agent is holding
// the context that would answer it — the photo, the conversation, a web search — and it
// is far cheaper to ask while that context is live than to discover the gap weeks later
// when a recommendation comes back thin.

import type { Wine } from '../types.js';

/** Fields the recommendation engine actually reads, and what to call them to a person. */
const WANTED: Array<{ field: keyof Wine; label: string; why: string }> = [
  { field: 'wine_type', label: 'wine type', why: 'the single most useful filter' },
  { field: 'grapes', label: 'grape(s)', why: 'drives preference matching and personal history' },
  { field: 'region', label: 'region', why: 'filtering and personal history' },
  { field: 'country', label: 'country', why: 'filtering' },
  { field: 'vintage', label: 'vintage', why: 'omit deliberately if it is a non-vintage bottling' },
  { field: 'avg_price', label: 'typical price', why: 'budget fit' },
  { field: 'food_pairings', label: 'food pairings', why: 'the largest single scoring weight' },
  { field: 'body', label: 'body', why: 'palate fit' },
  { field: 'tannin', label: 'tannin', why: 'palate fit; leave unset for most whites' },
  { field: 'acidity', label: 'acidity', why: 'palate fit' },
  { field: 'sweetness', label: 'sweetness', why: 'palate fit' },
  { field: 'tasting_notes', label: 'tasting notes', why: 'free-text search' },
];

const isBlank = (v: unknown) =>
  v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'string' && v.length === 0);

export interface FollowUp {
  question: string;
  missing_fields: string[];
  wine_id: string;
}

/**
 * Returns a question for the calling agent when a wine is too sparse to recommend well,
 * or null when it already carries enough. Deliberately quiet once the important fields
 * are present — a tool that asks for something on every call gets ignored.
 */
export function askForMissingFields(wine: Wine): FollowUp | null {
  const missing = WANTED.filter((w) => isBlank(wine[w.field]));

  // A wine carrying most of what the engine reads does not need chasing.
  if (missing.length <= 4) return null;

  const named = wine.producer ? `${wine.producer} ${wine.name}` : wine.name;
  const asked = missing.slice(0, 7);
  const list = asked.map((m) => `${m.label} (${m.why})`).join(', ');

  const question =
    `'${named}' was stored with very little detail, so recommendations for it will be weak — ` +
    `the engine scores on what a wine records, and this one records almost nothing. ` +
    `Do you know, or can you find out: ${list}? ` +
    `If you can, call wine_upsert again with wine_id '${wine.id}' and whatever you learn — ` +
    `it fills blanks and never overwrites what is already there, so partial answers are useful and safe. ` +
    `If the bottle genuinely has no vintage, leave vintage unset rather than guessing. ` +
    `Do not invent values: a wrong region is worse than an empty one, because nothing marks it as a guess.`;

  return { question, missing_fields: missing.map((m) => String(m.field)), wine_id: wine.id };
}
