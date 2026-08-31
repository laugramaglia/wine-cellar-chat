import { TOOL_NAMES, type ToolName } from '../permissions.js';
import type { ToolDef } from './define.js';
import { wineGet, wineSearch, wineUpsert } from './catalog.js';
import { cellarAdd, cellarList, cellarUpdate } from './cellar.js';
import { reviewList, reviewWrite } from './reviews.js';
import { prefsGet, prefsSet } from './prefs.js';
import { wineRecommend } from './recommend.js';
import { userCreate, userDelete, userList, userUpdate } from './admin/users.js';
import { tokenCreate, tokenList, tokenRevoke } from './admin/tokens.js';

const ALL: ToolDef[] = [
  wineSearch, wineGet, wineUpsert,
  cellarList, cellarAdd, cellarUpdate,
  reviewList, reviewWrite,
  prefsGet, prefsSet,
  wineRecommend,
  userCreate, userList, userUpdate, userDelete,
  tokenCreate, tokenList, tokenRevoke,
];

/** Exhaustive over ToolName. A tool declared in permissions.ts with no implementation
 *  here — or an implementation with no declaration — fails at startup, loudly. */
export const TOOLS: Record<ToolName, ToolDef> = (() => {
  const map = Object.fromEntries(ALL.map((t) => [t.name, t])) as Record<ToolName, ToolDef>;
  const missing = TOOL_NAMES.filter((name) => !map[name]);
  if (missing.length > 0) {
    throw new Error(`Tools declared in TOOL_PERMISSIONS but not implemented: ${missing.join(', ')}`);
  }
  if (ALL.length !== TOOL_NAMES.length) {
    throw new Error(`Implemented ${ALL.length} tools but TOOL_PERMISSIONS declares ${TOOL_NAMES.length}`);
  }
  return map;
})();

export type { ToolDef };
