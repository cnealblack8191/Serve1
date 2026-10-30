import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("office turns the completed job into an invoice with one click", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/invoices");

  const ready = page.getByRole("listitem").filter({ hasText: "J-1004" });
  await expect(ready).toBeVisible();
  await ready.getByRole("button", { name: "Create invoice" }).click();

  // Lands on the new invoice with a total (2h x $95 + $85 service call = $275).
  await expect(page.getByText("INV-1001").first()).toBeVisible();
  await expect(page.getByText("$275.00").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();

  // It shows in the list, and the job is no longer waiting to be invoiced.
  await page.goto("/invoices");
  const row = page.getByTestId("invoice-list").getByRole("row").filter({ hasText: "INV-1001" });
  await expect(row).toContainText("$275.00");
  await expect(row).toContainText("Draft");
  await expect(page.getByRole("button", { name: "Create invoice" })).toHaveCount(0);

  // The job is now Invoiced, so nothing is left waiting (the Jobs screen belongs to the office lane).
  await expect(page.getByText("Nothing to invoice")).toBeVisible();
});

test("owner dashboard shows the summary cards", async ({ page }) => {
  await signIn(page, "owner");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  for (const label of [
    "Completed today",
    "Completed this week",
    "Invoiced this week",
    "Invoiced total",
    "Open jobs",
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Jobs per tech" })).toBeVisible();
});
