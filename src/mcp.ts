import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { AuthProps } from './auth.js';
import { getDb } from './db/client.js';
import { DbError } from './db/errors.js';
import { ROLE_PERMISSIONS, TOOL_PERMISSIONS, can, type ToolName } from './permissions.js';
import { TOOLS } from './tools/index.js';
import { denialMessage } from './tools/define.js';

export class WineMcp extends McpAgent<Env, Record<string, never>, AuthProps> {
  server = new McpServer(
    { name: 'wine-cellar', version: '0.1.0' },
    {
      instructions:
        'A wine catalogue, a personal cellar, tasting reviews and a deterministic recommendation engine. ' +
        'Identity comes from the bearer token, so no tool takes a user id except the admin ones. ' +
        'To store a wine read off a label, call wine_upsert with whatever fields you can see — only name is required — ' +
        'and call it again later with more. Recommendations always carry reasons; read them back to the user.',
    },
  );

  async init() {
    const props = this.props as AuthProps | undefined;
    if (!props) throw new Error('The agent was started without resolved identity props.');

    for (const name of Object.keys(TOOLS) as ToolName[]) {
      const tool = TOOLS[name];
      const required = TOOL_PERMISSIONS[name];

      // Layer 1 (ADR-0010): visibility. A member's session never sees user_create, so
      // the model cannot try it and cannot hallucinate that it exists.
      if (!can(props.permissions, required)) continue;

      this.server.registerTool(
        name,
        { title: tool.title, description: tool.description, inputSchema: tool.input },
        async (args: Record<string, unknown>): Promise<CallToolResult> => {
          // Layer 2 (ADR-0010): execution. This is the security boundary. A tool must
          // never rely on having been hidden.
          if (!can(props.permissions, required)) {
            const scopedOut = ROLE_PERMISSIONS[props.role].includes(required);
            return errorResult(denialMessage(name, required, props, scopedOut));
          }
          // One connection per tool call, closed before the response leaves. Leaking it
          // is what makes a later request hang — see src/db/postgres.ts.
          const db = getDb(this.env);
          try {
            const value = await tool.handler(args, { props, env: this.env, db });
            return {
              content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
              structuredContent: value as Record<string, unknown>,
            };
          } catch (err) {
            if (err instanceof DbError) return errorResult(`${err.message} (${err.code})`);
            return errorResult(err instanceof Error ? err.message : String(err));
          } finally {
            await db.dispose();
          }
        },
      );
    }
  }
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
