import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { findStyleViolations } from "../../src/shared/house-style.ts";
import { boot, enter, outputAfter } from "./fixtures.ts";

const sse = (...events: object[]) =>
  events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join("");

test.describe("errors stay in character", () => {
  test.beforeEach(async ({ page }) => boot(page));

  test("rate limit", async ({ page }) => {
    await page.route("/api/chat", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "rate_limited", message: "x", retryAfterSeconds: 42 }),
      }),
    );
    await enter(page, "Noch eine Frage");
    const output = await outputAfter(page, "Noch eine Frage");
    expect(output).toContain("?OVERFLOW  ERROR");
    expect(output).toContain("Hey, nicht so hastig!");
    expect(output).toContain("42 Sekunden");
  });

  test("daily spend cap", async ({ page }) => {
    await page.route("/api/chat", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: sse({ type: "error", error: "spend_cap", message: "x" }),
      }),
    );
    await enter(page, "Hoi");
    const output = await outputAfter(page, "Hoi");
    expect(output).toContain("?FASS LEER  ERROR");
    expect(output).toContain("RUN CV");
  });

  test("model API down", async ({ page }) => {
    await page.route("/api/chat", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: sse({ type: "error", error: "upstream_unavailable", message: "x" }),
      }),
    );
    await enter(page, "Hoi");
    expect(await outputAfter(page, "Hoi")).toContain("?DEVICE NOT PRESENT  ERROR");
  });

  test("server unreachable", async ({ page }) => {
    await page.route("/api/chat", (route) => route.abort("connectionrefused"));
    await enter(page, "Hoi");
    expect(await outputAfter(page, "Hoi")).toContain("Datasette");
  });

  test("long conversations say when they get compacted", async ({ page }) => {
    await page.route("/api/chat", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: sse(
          { type: "compacting" },
          { type: "delta", text: "Weiter gehts. " },
          { type: "meta", sources: [], attempt: false, truncated: false },
          { type: "done" },
        ),
      }),
    );
    await enter(page, "Noch was?");
    const output = await outputAfter(page, "Noch was?");
    expect(output).toContain("Ich fasse die älteren Fragen kurz zusammen");
    expect(output).toContain("Weiter gehts.");
  });

  test("connection lost in the middle of an answer", async ({ page }) => {
    await page.route("/api/chat", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: sse({ type: "delta", text: "Ich habe eine Lehre gem" }),
      }),
    );
    await enter(page, "Hoi");
    const output = await outputAfter(page, "Hoi");
    expect(output).toContain("Ich habe eine Lehre gem");
    expect(output).toContain("?DEVICE NOT PRESENT  ERROR");
    expect(output).not.toContain("QUELLEN");
  });
});

test("boots even when the API is down, and says so", async ({ page }) => {
  await page.route("/api/session", (route) => route.abort("connectionrefused"));
  await page.goto("/");
  await page.getByRole("button", { name: "Boot überspringen" }).click();
  await expect(page.getByText("LOAD MANASSES V1.0")).toBeVisible();
  await expect(page.locator("#output").getByText("?DEVICE NOT PRESENT  ERROR")).toBeVisible();
  await expect(page.locator("#output").getByText(/MOCK-MODUS/)).toBeHidden();
});

test("unknown pages are a C64 FILE NOT FOUND", async ({ page }) => {
  const response = await page.goto("/jobs/senior-println-debugger");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("?FILE NOT FOUND  ERROR")).toBeVisible();
  await expect(page.getByText("SEARCHING FOR JOBS/SENIOR-PRINTLN-DEBUGGER")).toBeVisible();
  await page.getByRole("link", { name: 'LOAD "MANASSES",8,1' }).click();
  await expect(page).toHaveURL("/");
});

test("no accessibility violations on the intro and after an answer", async ({ page }) => {
  await boot(page);
  const intro = await new AxeBuilder({ page }).analyze();
  expect(intro.violations).toEqual([]);

  await enter(page, "Welche Skills hast du?");
  const answer = await new AxeBuilder({ page }).analyze();
  expect(answer.violations).toEqual([]);
});

test("everything on screen follows the house style", async ({ page }) => {
  await boot(page);
  for (const command of ["HELP", "AMIGA", "ABOUT", "Welche Projekte hast du?", "BIER"]) {
    await enter(page, command);
  }
  const text = await page.locator("body").innerText();
  expect(findStyleViolations(text)).toEqual([]);
});

test("fits the screen without horizontal scrolling", async ({ page }) => {
  await boot(page);
  await enter(page, "LIST");
  const overflow = await page.evaluate(() => {
    const screen = document.getElementById("screen") as HTMLElement;
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      screen: screen.scrollWidth - screen.clientWidth,
    };
  });
  expect(overflow.page).toBeLessThanOrEqual(0);
  expect(overflow.screen).toBeLessThanOrEqual(0);
});

test("the API rejects cross-site form posts and oversized questions", async ({ request }) => {
  const form = await request.post("/api/chat", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: "message=Hoi",
  });
  expect(form.status()).toBe(415);
  const tooLong = await request.post("/api/chat", {
    data: { conversationId: "e2e-conversation", message: "x".repeat(501) },
  });
  expect(tooLong.status()).toBe(413);
});
