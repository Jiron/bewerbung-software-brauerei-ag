import { expect, test } from "@playwright/test";
import { E2E_CODE, enter, outputAfter } from "./fixtures.ts";

/**
 * REQUIRE_ACCESS_CODE from the visitor's side. The test server runs without it,
 * so only the session answer is patched to switch it on; unlock and chat stay
 * real. The server side of the gate has its own unit tests.
 */
test("with REQUIRE_ACCESS_CODE nothing reaches the AI before the code", async ({ page }) => {
  let unlocked = false;
  await page.route("/api/session", async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    const tier = unlocked ? "private" : "public";
    await route.fulfill({ response, json: { ...session, accessRequired: true, tier } });
  });
  await page.route("/api/unlock", async (route) => {
    const response = await route.fetch();
    unlocked = response.ok();
    await route.fulfill({ response });
  });
  let chatRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/chat")) chatRequests++;
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Boot überspringen" }).click();
  const output = page.locator("#output");
  await expect(output.getByText(/Bevor du die KI-Version von Max ausfragen kannst/)).toBeVisible();
  await expect(output.getByText("ENTER ACCESS CODE:")).toBeVisible();
  await expect(page.getByLabel("Zugangscode eingeben")).toBeFocused();
  await expect(page.locator("#suggestions .chip")).toHaveText(["CODE", "HELP"]);

  // Without the code the C64 still works, the AI and the knowledge do not.
  await page.keyboard.press("Escape");
  await expect(output.locator(".line").filter({ hasText: /^BREAK$/ })).toHaveCount(1);
  await enter(page, "Wer bist du?");
  expect(await outputAfter(page, "Wer bist du?")).toContain("?ACCESS DENIED  ERROR");
  await enter(page, "RUN CV");
  expect(await outputAfter(page, "RUN CV")).toContain("?ACCESS DENIED  ERROR");
  await enter(page, "HELP");
  expect(await outputAfter(page, "HELP")).toContain("Zugangscode eingeben");
  expect(chatRequests).toBe(0);

  await page.locator("#command").fill("CODE");
  await page.locator("#command").press("Enter");
  await page.locator("#secret").fill(E2E_CODE);
  await page.locator("#secret").press("Enter");
  await expect(output.getByText("ACCESS GRANTED.")).toBeVisible();
  await expect(output.getByText(/Hoi! Ich bin die KI-Version von Max/)).toBeVisible();
  await expect(page.locator("#suggestions .chip")).toHaveCount(4);

  await enter(page, "Wo hast du deine Ausbildung gemacht?");
  expect(await outputAfter(page, "Wo hast du deine Ausbildung gemacht?")).toContain(
    "Informatiker EFZ",
  );
});
