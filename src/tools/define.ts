import type { z } from 'zod';
import type { AuthProps } from '../auth.js';
import type { Db } from '../db/client.js';
import type { Permission, ToolName } from '../permissions.js';

export interface ToolContext {
  props: AuthProps;
  env: Env;
  db: Db;
}

export interface ToolDef {
  name: ToolName;
  title: string;
  description: string;
  input: z.ZodRawShape;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(def: {
  name: ToolName;
  title: string;
  description: string;
  input: S;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<unknown>;
}): ToolDef {
  return def as unknown as ToolDef;
}

/** The message a denial produces. It names the role AND the token, because a denial can
 *  come from either — a message naming only the role sends an admin to fix the wrong
 *  thing when the cause is a narrowed token. */
export function denialMessage(
  tool: ToolName,
  required: Permission,
  props: AuthProps,
  scopedOut: boolean,
): string {
  const cause = scopedOut
    ? `your role '${props.role}' grants it, but the token '${props.tokenLabel}' is scoped narrower`
    : `your role is '${props.role}'`;
  return `Permission denied: '${tool}' requires '${required}'; ${cause}.`;
}
