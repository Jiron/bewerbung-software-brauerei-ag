import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";

async function staticDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "static-"));
  await mkdir(path.join(dir, "assets"));
  await writeFile(path.join(dir, "index.html"), "<title>READY.</title>");
  await writeFile(path.join(dir, "404.html"), "?FILE NOT FOUND ERROR");
  await writeFile(
    path.join(dir, "assets", "main-abc123.js"),
    "console.log('READY.');\n".repeat(200),
  );
  return dir;
}

describe("static files", () => {
  it("serves the page uncached and hashed assets cached forever and compressed", async () => {
    const { app } = await createTestApp({ config: { staticDir: await staticDir() } });

    const page = await app.request("/");
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-cache");
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");

    const asset = await app.request("/assets/main-abc123.js", {
      headers: { "accept-encoding": "gzip" },
    });
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect(asset.headers.get("content-encoding")).toBe("gzip");
  });

  it("answers unknown pages with the C64 404 page", async () => {
    const { app } = await createTestApp({ config: { staticDir: await staticDir() } });
    const response = await app.request("/jobs/println-debugger");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("?FILE NOT FOUND ERROR");
  });

  it("does not let paths escape the static folder", async () => {
    const { app } = await createTestApp({ config: { staticDir: await staticDir() } });
    const response = await app.request("/..%2f..%2fpackage.json");
    expect(response.status).toBe(404);
  });
});
