import { expect, type Page } from "@playwright/test";

/** A code that only exists for these tests. Its hash goes into the test server env. */
export const E2E_CODE = "e2e zapfhahn 64";
export const E2E_CODE_HASH =
  "scrypt:32768:8:1:xQZJd6vFkQsYawR_3pSb2A:Ko6sjs153B5uMPD2gylBYDsZbS7HPHie0bKqV8HKo8c";

const readyLines = (page: Page) => page.locator(".output .line").filter({ hasText: /^READY\.$/ });

/** Opens the app and skips the boot sequence like an impatient visitor. */
export async function boot(page: Page): Promise<void> {
  await page.goto("/");
  const skip = page.getByRole("button", { name: "Boot überspringen" });
  await skip.click();
  await expect(page.locator("#prompt")).toBeVisible();
  await expect(readyLines(page)).toHaveCount(1);
}

/** Types a line, presses Enter and waits until the C64 says READY. again. */
export async function enter(page: Page, text: string): Promise<void> {
  const before = await readyLines(page).count();
  await page.locator("#command").fill(text);
  await page.locator("#command").press("Enter");
  await expect(readyLines(page)).toHaveCount(before + 1, { timeout: 15_000 });
}

/** Text of everything printed after the last time `text` was typed. */
export async function outputAfter(page: Page, text: string): Promise<string> {
  const lines = await page.locator(".output .line").allInnerTexts();
  const index = lines.lastIndexOf(text);
  return lines.slice(index + 1).join("\n");
}
