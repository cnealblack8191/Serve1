import { expect, test } from "@playwright/test";

import { jobRe, signIn } from "./helpers";

/** Office screens on a phone: nothing scrolls sideways, and the jobs list shows cards. */
test("office screens fit a phone screen", async ({ page }) => {
  await signIn(page, "office");
  for (const path of ["/jobs", "/customers/cust-2", "/"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }

  // Jobs list: each job is a card that opens the job, showing tech and status.
  await page.goto("/jobs");
  const card = page.getByRole("list", { name: "Jobs" }).getByRole("link", { name: jobRe(2) });
  await expect(card).toContainText("Tech: Tara Tech");
  await expect(card).toContainText("Scheduled");
  await card.click();
  await expect(page).toHaveURL(/\/jobs\/job-2$/);
});

test("the phone menu has a visible close button", async ({ page }) => {
  await signIn(page, "office");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const close = page.getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();
  const color = await close.evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe("rgb(24, 24, 27)"); // not dark-on-navy
  await close.click();
  await expect(close).toHaveCount(0);
});
