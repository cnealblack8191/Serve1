import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page, "office");
});

test("office adds a customer", async ({ page }) => {
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add customer" }).click();
  await page.getByLabel("Name").fill("Maple Street Bakery");
  await page.getByLabel("Phone").fill("(770) 555-0999");
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(page.getByRole("heading", { name: "Maple Street Bakery" })).toBeVisible();

  await page.getByRole("link", { name: "Customers", exact: true }).first().click();
  await page.getByLabel("Search customers").fill("maple");
  await expect(page.getByRole("link", { name: "Maple Street Bakery" })).toBeVisible();
  await page.getByLabel("Search customers").fill("zzzz");
  await expect(page.getByText("No customers match your search")).toBeVisible();
});

test("office adds a site to a customer", async ({ page }) => {
  await page.goto("/customers");
  await page.getByRole("link", { name: "Peachtree Logistics" }).click();
  await page.getByRole("button", { name: "Add site" }).click();
  await page.getByLabel("Site name").fill("Yard office");
  await page.getByLabel("Address").fill("12 Rail Ln, Social Circle, GA 30025");
  await page.getByLabel("Access notes").fill("Gate code 2468");
  await page.getByRole("button", { name: "Save site" }).click();
  await expect(page.getByText("Yard office")).toBeVisible();
  await expect(page.getByText("Access: Gate code 2468")).toBeVisible();
});

test("office creates a job that shows in the jobs list as New", async ({ page }) => {
  await page.goto("/jobs/new");
  await page.getByLabel("Find customer").fill("riverside");
  await page.getByRole("button", { name: /Riverside Dental Group/ }).click();
  // Riverside has one site, so it is picked automatically.
  await page.getByLabel("Description").fill("Thermostat not responding in waiting room");
  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page.getByText("Thermostat not responding in waiting room")).toBeVisible();

  await page.goto("/jobs");
  await page.getByLabel("Search jobs").fill("thermostat not responding");
  const row = page.getByRole("row", { name: /Thermostat not responding/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("New", { exact: true })).toBeVisible();
});
