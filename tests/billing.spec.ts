import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("office turns the completed job into an invoice with one click", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/invoices");

  const ready = page.getByRole("listitem").filter({ hasText: "J-1004" });
  await expect(ready).toBeVisible();
  await ready.getByRole("button", { name: "Create invoice" }).click();

  // Lands on the new invoice with a total (2h x $95 + $85 service call = $275).
  await expect(page.getByRole("heading", { name: /^INV-\d{6}-[A-Z0-9]{4}$/ })).toBeVisible();
  const number = (await page.getByRole("heading", { name: /^INV-/ }).textContent()) ?? "";
  await expect(page.getByText("$275.00").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();

  // It shows in the list, and the job is no longer waiting to be invoiced.
  await page.goto("/invoices");
  const row = page.getByTestId("invoice-list").getByRole("row").filter({ hasText: number });
  await expect(row).toContainText("$275.00");
  await expect(row).toContainText("Draft");

  // The job is now Invoiced, so it is no longer waiting (other seeded Complete jobs still are).
  await expect(page.getByRole("listitem").filter({ hasText: "J-1004" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create invoice" }).first()).toBeVisible();
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

test("the printed invoice keeps its own header but drops the app chrome", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/invoices");
  await page.getByRole("button", { name: "Create invoice" }).first().click();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("Serv1 Field Services")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeHidden();
  await expect(page.locator("aside")).toBeHidden();
});

test("the owner can view invoices but not create them", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "Ready to invoice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create invoice" })).toHaveCount(0);
});
