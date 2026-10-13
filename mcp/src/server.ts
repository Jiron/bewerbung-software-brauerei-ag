import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type Answer, type Backend, BackendError } from "./backend.ts";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (value: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: value }],
  ...(isError ? { isError } : {}),
});

/**
 * The MCP face of LOAD MANASSES: the same interview as on the C64, from any
 * MCP client. Answers keep their sources, so the calling model can verify
 * them with read_knowledge instead of trusting them.
 */
export function createServer(backend: Backend): McpServer {
  const server = new McpServer({ name: "load-manasses", version: "1.0.0" });

  server.registerTool(
    "ask_manasses",
    {
      title: "Ask Manassés",
      description:
        "Ask the AI version of Manassés Zähnler, applicant for Fullstack Developer at Software Brauerei AG, a question about his background, skills, projects or way of working. It only answers from its knowledge base and lists the sections it used. It answers in German unless asked in English. Follow-up questions keep the context.",
      inputSchema: {
        question: z.string().min(1).max(500).describe("The question, max 500 characters."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ question }) => run(async () => formatAnswer(await backend.ask(question))),
  );

  server.registerTool(
    "list_knowledge",
    {
      title: "List knowledge sections",
      description:
        "List the knowledge base sections the AI version can see, with their ids. Private sections are only counted until unlocked.",
      annotations: { readOnlyHint: true },
    },
    async () =>
      run(async () => {
        const index = await backend.knowledge();
        const lines = index.sections.map((section) => `${section.id}: ${section.title}`);
        if (index.lockedSectionCount > 0) {
          lines.push(`(${index.lockedSectionCount} private sections locked, see unlock_private)`);
        }
        return lines.join("\n");
      }),
  );

  server.registerTool(
    "read_knowledge",
    {
      title: "Read a knowledge section",
      description:
        "Read the original text of one knowledge section by id, to verify an answer. Ids come from list_knowledge or the sources of ask_manasses.",
      inputSchema: {
        id: z.string().min(1).max(200).describe('Section id, e.g. "werdegang/ausbildung".'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) =>
      run(async () => {
        const section = await backend.section(id);
        return `${section.title}\n\n${section.content}`;
      }),
  );

  server.registerTool(
    "unlock_private",
    {
      title: "Unlock private details",
      description:
        "Unlock the private knowledge tier (availability, salary expectations, references) with the access code from the application email. Only use a code the user gave you.",
      inputSchema: { code: z.string().min(1).max(200).describe("The access code from the email.") },
    },
    async ({ code }) =>
      run(async () => {
        await backend.unlock(code);
        const session = await backend.session();
        return session.tier === "private"
          ? "ACCESS GRANTED. Private sections are now part of the answers."
          : "?SYNTAX ERROR";
      }),
  );

  server.registerTool(
    "new_conversation",
    {
      title: "Start a new conversation",
      description: "Forget the previous questions and start the interview fresh.",
    },
    async () =>
      run(async () => {
        backend.newConversation();
        return "NEW. Gespräch vergessen.";
      }),
  );

  return server;
}

export function formatAnswer(answer: Answer): string {
  const lines = [answer.text];
  if (answer.truncated) lines.push("(Antwort gekürzt.)");
  lines.push(
    answer.sources.length > 0
      ? `QUELLEN: ${answer.sources.map((source) => `${source.title} [${source.id}]`).join(", ")}`
      : "QUELLEN: keine",
  );
  return lines.join("\n\n");
}

async function run(task: () => Promise<string>): Promise<ToolResult> {
  try {
    return text(await task());
  } catch (error) {
    if (error instanceof BackendError) return text(`${error.code}: ${error.message}`, true);
    throw error;
  }
}
