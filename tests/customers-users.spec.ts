import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("office edits a customer", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/customers/cust-3");
  await page.getByRole("button", { name: "Edit customer" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Phone").fill("(770) 555-0999");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("(770) 555-0999")).toBeVisible();
});

test("adding a customer that already exists shows a warning but can still save", async ({
  page,
}) => {
  await signIn(page, "office");
  await page.goto("/customers");
  await page.getByRole("button", { name: /Add customer/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("riverside dental group");
  await expect(dialog.getByRole("alert")).toContainText("Riverside Dental Group");
  await expect(dialog.getByRole("button", { name: "Save anyway" })).toBeVisible();
  await dialog.getByLabel("Name").fill("Brand New Customer");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("admin adds a user, changes the role and turns them off", async ({ page }) => {
  await signIn(page, "admin");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Nina New");
  await dialog.getByLabel("Email").fill("nina@serv1.demo");
  await dialog.getByLabel("Role").selectOption("Office");
  await dialog.getByRole("button", { name: "Add user" }).click();
  const list = page.getByRole("list", { name: "Users" });
  await expect(list.getByRole("button", { name: "Edit Nina New" })).toContainText(
    "Sign-in not set up",
  );

  await list.getByRole("button", { name: "Edit Nina New" }).click();
  await page.getByRole("dialog").getByLabel("Role").selectOption("Tech");
  await page
    .getByRole("dialog")
    .getByLabel(/Active/)
    .uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(list.getByRole("button", { name: "Edit Nina New" })).toContainText("Turned off");
  await expect(list.getByRole("button", { name: "Edit Nina New" })).toContainText("Tech");
});

test("the last active admin cannot be demoted", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/users");
  await page.getByRole("button", { name: "Edit Alex Admin" }).click();
  await page.getByRole("dialog").getByLabel("Role").selectOption("Office");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "at least one active Admin",
  );
});

test("only admins open Users", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/users");
  await expect(page).toHaveURL(/\/$/);
});

test("a turned-off tech keeps their name on past jobs and can no longer sign in", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/users");
  await page.getByRole("button", { name: "Edit Tom Tech" }).click();
  await page
    .getByRole("dialog")
    .getByLabel(/Active/)
    .uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Edit Tom Tech" })).toContainText("Turned off");
  await page.goto("/jobs/job-3"); // Tom's job
  await expect(page.getByText("Tom Tech").first()).toBeVisible();

  await page.evaluate(() => localStorage.removeItem("serv1.local.session"));
  await page.goto("/auth");
  await page.getByLabel("Email").fill("tech2@serv1.demo");
  await page.getByLabel("Password", { exact: true }).fill("serv1demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This account is turned off.")).toBeVisible();
});

test("an admin with no sign-in does not count as a replacement admin", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/users");
  await page.getByRole("button", { name: "Add user" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Paper Admin");
  await dialog.getByLabel("Email").fill("paper@serv1.demo");
  await dialog.getByLabel("Role").selectOption("Admin");
  await dialog.getByRole("button", { name: "Add user" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Edit Alex Admin" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Active/).uncheck();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("alert")).toContainText("at least one active Admin");

  // A new unlinked user never shows as the tech on an unassigned job.
  await page.goto("/jobs/job-1");
  await expect(page.getByText("Unassigned").first()).toBeVisible();
  await expect(page.getByText("Paper Admin")).toHaveCount(0);
});
