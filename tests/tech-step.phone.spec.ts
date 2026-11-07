import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * The signature step belongs to one job. Seed: tech1 has job-9 In Progress and job-2 Scheduled.
 * Moving from job-9's signature step to job-2 (same screen, new id) must show job-2's details,
 * and job-2 must not be completable before it is started.
 */
test("changing jobs resets the signature step", async ({ page }) => {
  await signIn(page, "tech1");
  await page.goto("/tech/job-9");
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("heading", { name: "Customer signature" })).toBeVisible();

  // In-app navigation to another job (no page reload).
  await page.evaluate(() => {
    history.pushState({}, "", "/tech/job-2");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/tech\/job-2$/);
  await expect(page.getByRole("heading", { name: "Customer signature" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Job" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete" })).toHaveCount(0);
});
