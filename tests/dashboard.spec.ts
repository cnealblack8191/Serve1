import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("dashboard shows Business Services counts and its links open filtered lists", async ({
  page,
}) => {
  await signIn(page, "owner");
  const bs = page.getByRole("region", { name: "Business Services" });
  await expect(bs).toBeVisible();
  for (const label of [
    "Open opportunities",
    "Win rate",
    "Jobs in progress",
    "Quotes with customer",
    "Site visits to schedule",
    "Past expected close",
  ]) {
    await expect(bs.getByText(label, { exact: true }).first()).toBeVisible();
  }
  for (const panel of [
    "Pipeline by stage",
    "Open opportunities by customer contract",
    "Results this year",
    "Work health",
    "Needs attention",
    "Open opportunities by sales rep",
  ]) {
    await expect(page.getByRole("region", { name: panel })).toBeVisible();
  }
  // Counts only: no dollar figures in the Business Services section.
  await expect(bs.getByText(/\$\d/)).toHaveCount(0);

  // Type filter.
  await bs.getByRole("button", { name: "Low Voltage" }).click();
  await expect(bs.getByRole("button", { name: "Low Voltage" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // A stage bar opens the matching list.
  await bs.getByRole("button", { name: "All" }).click();
  await page
    .getByRole("region", { name: "Pipeline by stage" })
    .getByRole("link", { name: /2 Assessment/ })
    .click();
  await expect(page).toHaveURL(/\/opportunities\?stage=Assessment/);
  await expect(page.getByRole("combobox", { name: "Stage" })).toHaveValue("Assessment");
});

test("needs-attention job links open the filtered jobs list", async ({ page }) => {
  await signIn(page, "office");
  await page
    .getByRole("region", { name: "Needs attention" })
    .getByRole("link", { name: /Completed jobs without completion photos/ })
    .click();
  await expect(page).toHaveURL(/\/jobs\?attention=noPhotos/);
  await expect(page.getByText("Completed jobs without completion photos").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Show all jobs" })).toBeVisible();
});
