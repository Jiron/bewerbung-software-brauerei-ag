/**
 * npx load-manasses
 *
 * Starts the MCP server on stdio. Add it to Claude Code with:
 *   claude mcp add load-manasses -- npx -y load-manasses
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Backend } from "./backend.ts";
import { createServer } from "./server.ts";

/** The deployed C64. Override with LOAD_MANASSES_URL, e.g. for a local server. */
const DEFAULT_URL = "https://load-manasses.example.ch";

const backend = new Backend({ baseUrl: process.env.LOAD_MANASSES_URL ?? DEFAULT_URL });
await createServer(backend).connect(new StdioServerTransport());
// stdout belongs to the protocol; diagnostics go to stderr.
console.error(`load-manasses MCP server ready, talking to ${backend.baseUrl}`);
