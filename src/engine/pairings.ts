// The built-in food -> style pairing table.
//
// The specification described this with three examples and an ellipsis, which left the
// largest single weight in the engine (0.30) resting on an undocumented domain judgement
// that nobody owned. It is enumerated here as data so it can be reviewed as a domain
// artifact rather than read as code, and extended without touching the scorer.
//
// Each rule matches on keywords in the free-text `food` argument and expresses what the
// dish wants. Every field is optional; a rule scores a wine on the fields it states.

import type { Intensity, Sweetness, WineType } from '../types.js';

export interface PairingRule {
  /** Lowercase keywords; a match on any one selects the rule. */
  keywords: string[];
  /** Human-readable name of the dish family, used in the reason string. */
  family: string;
  wine_types?: WineType[];
  tannin?: Intensity[];
  acidity?: Intensity[];
  body?: Intensity[];
  sweetness?: Sweetness[];
  style_tags?: string[];
}

export const PAIRINGS: PairingRule[] = [
  {
    keywords: ['lamb', 'beef', 'steak', 'ribeye', 'sirloin', 'venison', 'game', 'roast', 'bbq', 'barbecue', 'brisket'],
    family: 'red meat',
    wine_types: ['red'],
    tannin: ['medium_plus', 'high'],
    body: ['medium_plus', 'high'],
  },
  {
    keywords: ['pork', 'veal', 'sausage', 'charcuterie', 'ham', 'bacon'],
    family: 'pork and cured meat',
    wine_types: ['red', 'rose'],
    body: ['medium', 'medium_plus'],
    acidity: ['medium', 'medium_plus'],
  },
  {
    keywords: ['chicken', 'turkey', 'poultry', 'duck'],
    family: 'poultry',
    wine_types: ['white', 'red', 'rose'],
    body: ['medium_minus', 'medium', 'medium_plus'],
  },
  {
    keywords: ['oyster', 'shellfish', 'clam', 'mussel', 'prawn', 'shrimp', 'crab', 'lobster', 'scallop'],
    family: 'shellfish',
    wine_types: ['white', 'sparkling'],
    acidity: ['medium_plus', 'high'],
    body: ['low', 'medium_minus'],
  },
  {
    keywords: ['fish', 'salmon', 'tuna', 'cod', 'sea bass', 'sushi', 'sashimi', 'ceviche'],
    family: 'fish',
    wine_types: ['white', 'sparkling', 'rose'],
    acidity: ['medium', 'medium_plus', 'high'],
  },
  {
    keywords: ['spicy', 'chilli', 'chili', 'curry', 'thai', 'szechuan', 'sichuan', 'harissa', 'vindaloo'],
    family: 'spicy food',
    wine_types: ['white', 'rose'],
    sweetness: ['off_dry', 'medium_sweet'],
    body: ['medium_minus', 'medium'],
  },
  {
    keywords: ['cheese', 'brie', 'cheddar', 'manchego', 'parmesan', 'gouda'],
    family: 'cheese',
    wine_types: ['red', 'white', 'fortified', 'sparkling'],
    acidity: ['medium', 'medium_plus'],
  },
  {
    keywords: ['blue cheese', 'roquefort', 'stilton', 'gorgonzola'],
    family: 'blue cheese',
    wine_types: ['dessert', 'fortified'],
    sweetness: ['medium_sweet', 'sweet'],
  },
  {
    keywords: ['dessert', 'cake', 'tart', 'chocolate', 'pudding', 'ice cream'],
    family: 'dessert',
    wine_types: ['dessert', 'fortified', 'sparkling'],
    sweetness: ['medium_sweet', 'sweet'],
  },
  {
    keywords: ['pasta', 'tomato', 'pizza', 'ragu', 'bolognese', 'lasagne', 'lasagna'],
    family: 'tomato-based dishes',
    wine_types: ['red'],
    acidity: ['medium_plus', 'high'],
    body: ['medium', 'medium_plus'],
  },
  {
    keywords: ['mushroom', 'truffle', 'risotto'],
    family: 'earthy dishes',
    wine_types: ['red', 'orange'],
    body: ['medium', 'medium_plus'],
  },
  {
    keywords: ['salad', 'goat cheese', 'asparagus', 'vegetable', 'vegetarian', 'greens'],
    family: 'vegetables and salads',
    wine_types: ['white', 'rose', 'orange'],
    acidity: ['medium_plus', 'high'],
    body: ['low', 'medium_minus'],
  },
  {
    keywords: ['fried', 'tempura', 'crisps', 'chips', 'fritto'],
    family: 'fried food',
    wine_types: ['sparkling', 'white'],
    acidity: ['medium_plus', 'high'],
  },
];

export function matchPairing(food: string): PairingRule | null {
  const needle = food.toLowerCase();
  // Longest keyword first, so 'blue cheese' beats 'cheese'.
  const candidates = PAIRINGS.flatMap((rule) =>
    rule.keywords.filter((k) => needle.includes(k)).map((k) => ({ rule, k })),
  ).sort((a, b) => b.k.length - a.k.length);
  return candidates[0]?.rule ?? null;
}
