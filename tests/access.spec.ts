import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

/** Role checks on every screen (SPEC.md section 2): people are sent to their own home screen. */

const OFFICE_SCREENS = [
  "/",
  "/jobs",
  "/jobs/job-2",
  "/customers",
  "/customers/cust-1",
  "/invoices",
];

test("a tech cannot open office screens", async ({ page }) => {
  await signIn(page, "tech1");
  for (const path of [...OFFICE_SCREENS, "/dispatch", "/jobs/new"]) {
    await page.goto(path);
    await expect(page, `${path} should send a tech to Today`).toHaveURL(/\/tech$/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  }
  // No customer contact details leak onto the tech's screen.
  await expect(page.getByText("office@riversidedental.example")).toHaveCount(0);
});

test("the owner cannot open tech, dispatch or new-job screens", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/tech");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/tech/job-2");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Save notes" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Complete" })).toHaveCount(0);
  await page.goto("/dispatch");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/jobs/new");
  await expect(page).toHaveURL(/\/jobs$/);
  // Read-only: no office editing buttons.
  await expect(page.getByRole("link", { name: "New job" })).toHaveCount(0);
  await page.goto("/customers/cust-1");
  await expect(page.getByRole("button", { name: "Add site" })).toHaveCount(0);
});

test("the owner can read every office screen", async ({ page }) => {
  await signIn(page, "owner");
  for (const path of OFFICE_SCREENS) {
    await page.goto(path);
    await expect(page, `${path} should stay open for the owner`).toHaveURL(new RegExp(`${path}$`));
  }
});

test("office staff are sent away from tech screens", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/tech/job-2");
  await expect(page).toHaveURL(/\/$/);
});

test("dashboard splits money by invoice status and counts only unfinished jobs as open", async ({
  page,
}) => {
  await signIn(page, "owner");
  await expect(page.getByRole("heading", { name: "Money by invoice status" })).toBeVisible();
  await expect(page.getByText("Draft (not yet sent)")).toBeVisible();
  await expect(page.getByText("Sent, unpaid")).toBeVisible();
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting to invoice")).toBeVisible();
  await expect(page.getByText("Invoiced total")).toHaveCount(0);
});
