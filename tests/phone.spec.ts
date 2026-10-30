import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("a tech signs in on a phone and lands on Today with bottom tabs", async ({ page }) => {
  await signIn(page, "tech1");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Main" });
  await expect(tabs.getByRole("link", { name: "Today" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Dispatch" })).toHaveCount(0);
});
