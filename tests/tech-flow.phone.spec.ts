import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("tech: on my way, start, put on hold with a reason, resume", async ({ page }) => {
  await signIn(page, "tech1");
  await page.goto("/tech/job-2");
  await page.getByRole("button", { name: "On my way" }).click();
  await expect(page.getByText("En route").first()).toBeVisible();
  await page.getByRole("button", { name: "Start Job" }).click();
  await expect(page.getByText("In Progress").first()).toBeVisible();

  await page.getByRole("button", { name: "Put on hold" }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("Waiting on a 200A main breaker");
  await page.getByRole("dialog").getByRole("button", { name: "Put on hold" }).click();
  await expect(page.getByRole("status")).toContainText("Waiting on a 200A main breaker");
  await expect(page.getByRole("button", { name: "Complete" })).toHaveCount(0);

  await page.getByRole("button", { name: "Resume job" }).click();
  await expect(page.getByRole("button", { name: "Complete" })).toBeVisible();
});
