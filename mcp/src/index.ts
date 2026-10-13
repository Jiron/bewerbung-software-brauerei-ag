/**
 * Starts the MCP server on stdio. From a clone of the repository (Node 24 runs
 * the TypeScript directly, no build needed):
 *
 *   npm install
 *   claude mcp add load-manasses -- node "$PWD/mcp/src/index.ts"
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Backend } from "./backend.ts";
import { createServer } from "./server.ts";

/** The deployed C64. Override with LOAD_MANASSES_URL, e.g. for a local server. */
const DEFAULT_URL = "https://brauerei.jiron.dev";

const backend = new Backend({ baseUrl: process.env.LOAD_MANASSES_URL ?? DEFAULT_URL });
await createServer(backend).connect(new StdioServerTransport());
// stdout belongs to the protocol; diagnostics go to stderr.
console.error(`load-manasses MCP server ready, talking to ${backend.baseUrl}`);
