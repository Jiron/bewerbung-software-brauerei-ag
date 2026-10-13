import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { Backend } from "../../../mcp/src/backend.ts";
import { createServer, formatAnswer } from "../../../mcp/src/server.ts";
import { createTestApp, TEST_CODE } from "./helpers.ts";

/** MCP client, MCP server and the real Hono app, wired together without any network. */
async function connect(options: Parameters<typeof createTestApp>[0] = {}) {
  const { app } = await createTestApp(options);
  const backend = new Backend({
    baseUrl: "http://load-manasses.test/",
    fetch: async (url, init) => app.request(url, init),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(backend).connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const [first] = result.content as { type: string; text: string }[];
    return { text: first?.text ?? "", isError: result.isError === true };
  };
  return { client, call };
}

describe("MCP server", () => {
  it("offers the interview tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "ask_manasses",
      "list_knowledge",
      "new_conversation",
      "read_knowledge",
      "unlock_private",
    ]);
  });

  it("answers with sources the caller can verify", async () => {
    const { call } = await connect();
    const answer = await call("ask_manasses", { question: "Wo hast du deine Ausbildung gemacht?" });
    expect(answer.text).toContain("Informatiker EFZ");
    expect(answer.text).toContain("QUELLEN: Werdegang: Ausbildung [werdegang/ausbildung]");

    const source = await call("read_knowledge", { id: "werdegang/ausbildung" });
    expect(source.text).toContain("Lehre als Informatiker EFZ");
  });

  it("unlocks the private tier with the code and keeps the cookie", async () => {
    const { call } = await connect();
    expect((await call("list_knowledge")).text).toMatch(
      /sections locked, unlock_private opens them/,
    );
    expect((await call("read_knowledge", { id: "details/lohnvorstellung" })).isError).toBe(true);

    const wrong = await call("unlock_private", { code: "Freibier" });
    expect(wrong).toMatchObject({ isError: true });
    expect(wrong.text).toContain("wrong_code");

    expect((await call("unlock_private", { code: TEST_CODE })).text).toContain("ACCESS GRANTED");
    expect((await call("read_knowledge", { id: "details/lohnvorstellung" })).text).toContain(
      "Bier aus der Zapfanlage",
    );
  });

  it("works behind REQUIRE_ACCESS_CODE once the user gives the code", async () => {
    const { call } = await connect({ config: { requireAccessCode: true } });
    const locked = await call("ask_manasses", { question: "Wer bist du?" });
    expect(locked).toMatchObject({ isError: true });
    expect(locked.text).toMatch(/^locked:/);

    expect((await call("unlock_private", { code: TEST_CODE })).text).toContain("ACCESS GRANTED");
    const answer = await call("ask_manasses", { question: "Wo hast du deine Ausbildung gemacht?" });
    expect(answer.isError).toBe(false);
    expect(answer.text).toContain("Informatiker EFZ");
  });

  it("reports an unreachable server in character", async () => {
    const backend = new Backend({
      baseUrl: "http://offline.test",
      fetch: () => Promise.reject(new Error("ECONNREFUSED")),
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(backend).connect(serverSide);
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientSide);
    const result = await client.callTool({ name: "ask_manasses", arguments: { question: "Hoi" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("?DEVICE NOT PRESENT ERROR");
  });

  it("formats truncated answers and missing sources", () => {
    expect(formatAnswer({ text: "Nö.", sources: [], attempt: true, truncated: true })).toBe(
      "Nö.\n\n(Antwort gekürzt.)\n\nQUELLEN: keine",
    );
  });
});
