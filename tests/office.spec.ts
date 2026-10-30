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

test("adding a site from the New job screen does not save the job", async ({ page }) => {
  await page.goto("/jobs/new");
  await page.getByLabel("Find customer").fill("peachtree");
  await page.getByRole("button", { name: /Peachtree Logistics/ }).click();
  await page.getByLabel("Description").fill("Dock heater will not start");
  await page.getByRole("button", { name: "Add new site" }).click();
  await page.getByLabel("Site name").fill("Cold storage");
  await page.getByLabel("Address").fill("11 Depot Rd, Social Circle, GA 30025");
  await page.getByRole("button", { name: "Save site" }).click();

  // Still on the form, with the new site selected, and no job saved yet.
  await expect(page).toHaveURL(/\/jobs\/new/);
  await expect(page.getByRole("combobox", { name: "Site" })).toContainText("Cold storage");
  await page.goto("/jobs");
  await page.getByLabel("Search jobs").fill("dock heater");
  await expect(page.getByText("No jobs match your filters")).toBeVisible();
});

test("an owner can read customers and jobs but not create them", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "owner");
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add customer" })).toHaveCount(0);
  await page.goto("/jobs");
  await expect(page.getByRole("link", { name: "New job" })).toHaveCount(0);
  await page.goto("/jobs/new");
  await expect(page).toHaveURL(/\/jobs$/);
  await context.close();
});
