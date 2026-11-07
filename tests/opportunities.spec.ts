import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("office adds an opportunity, marks it won, and the job carries it", async ({ page }) => {
  await signIn(page, "office");
  await page.getByRole("link", { name: "Opportunities", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Opportunities", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Add opportunity" }).click();

  await page.getByLabel("Opportunity name").fill("Gym scoreboard circuit");
  await page.getByLabel("Stage").selectOption({ label: "2 Assessment" });
  await page.getByLabel("Type").selectOption({ label: "High Voltage" });
  await page.getByLabel("Customer contract").selectOption({ label: "Barrow Schools" });
  await page.getByLabel("ECI quote #").fill("Q-TEST-1");
  await page.getByLabel("Customer PO #").fill("PO-TEST-1");
  await page.getByLabel("Quoted amount").fill("1250");
  await page.getByLabel("Next step", { exact: true }).fill("Walk the gym with the AD");
  await page.getByRole("button", { name: "Save opportunity" }).click();

  await expect(page.getByRole("heading", { name: "Gym scoreboard circuit" })).toBeVisible();
  await expect(page.getByText("$1,250.00")).toBeVisible();

  await page.getByRole("button", { name: "Mark won" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Customer").selectOption({ label: "Riverside Dental Group" });
  await dialog.getByRole("button", { name: "Mark won" }).click();

  // Lands on the new job: tracking panel shows PO received and the opportunity's numbers.
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(page.getByRole("heading", { name: "Tracking" })).toBeVisible();
  await expect(page.getByLabel("PO received")).toBeChecked();
  await expect(page.getByText("Q-TEST-1")).toBeVisible();
  await expect(page.getByText("PO-TEST-1")).toBeVisible();

  // Tracking edits save.
  await page.getByLabel("Health").selectOption({ label: "Watch" });
  await page.getByLabel("Material ordered").check();
  await page.reload();
  await expect(page.getByLabel("Health")).toHaveValue("Watch");
  await expect(page.getByLabel("Material ordered")).toBeChecked();

  // Back on the opportunity: closed won, links to the job, no Mark won.
  await page.getByRole("link", { name: "Gym scoreboard circuit" }).click();
  await expect(page.getByText("Closed won").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark won" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open the job" })).toBeVisible();
});

test("the owner reads opportunities but cannot add or edit", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/opportunities");
  await expect(
    page.getByRole("list", { name: "Opportunities" }).getByRole("link").first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Add opportunity" })).toHaveCount(0);
  await page.getByRole("list", { name: "Opportunities" }).getByRole("link").first().click();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark won" })).toHaveCount(0);
  await page.goto("/opportunities/new");
  await expect(page).toHaveURL(/\/opportunities$/);
});

test("a tech cannot open opportunities", async ({ page }) => {
  await signIn(page, "tech1");
  await page.goto("/opportunities");
  await expect(page).toHaveURL(/\/tech$/);
  await page.goto("/opportunities/opp-6");
  await expect(page).toHaveURL(/\/tech$/);
});

test("filters come from the address, so dashboard links open the right list", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/opportunities?attention=noNextStep");
  await expect(page.getByText("Open opportunities with no next step").first()).toBeVisible();
  const list = page.getByRole("list", { name: "Opportunities" });
  await expect(list.getByText("No next step").first()).toBeVisible();
  await expect(list.getByText("Book site visit")).toHaveCount(0);
});

test("a name of only spaces shows the message instead of saving", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/opportunities/new");
  await page.getByLabel("Opportunity name").fill("   ");
  await page.getByRole("button", { name: "Save opportunity" }).click();
  await expect(page.getByRole("alert")).toHaveText("Give the opportunity a name.");
  await expect(page).toHaveURL(/\/opportunities\/new$/);
});
