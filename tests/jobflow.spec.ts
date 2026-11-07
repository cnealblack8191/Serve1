import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("office approves a completed job and can send one back with a note", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/jobs/job-4"); // Complete in the seed
  const actions = page.getByRole("group", { name: "Job actions" });
  await actions.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Reviewed", { exact: true }).first()).toBeVisible();

  await actions.getByRole("button", { name: "Send back" }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("Add a photo of the panel");
  await page.getByRole("dialog").getByRole("button", { name: "Send back" }).click();
  await expect(page.getByText("Sent back: Add a photo of the panel")).toBeVisible();
  await expect(page.getByText("In Progress").first()).toBeVisible();
});

test("office cancels with a reason and reopens", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/jobs/job-1");
  const actions = page.getByRole("group", { name: "Job actions" });
  await actions.getByRole("button", { name: "Cancel job" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel job" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Customer fixed it themselves");
  await dialog.getByRole("button", { name: "Cancel job" }).click();
  await expect(page.getByText("Cancelled: Customer fixed it themselves")).toBeVisible();
  await actions.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("New", { exact: true }).first()).toBeVisible();
});

test("office edits and schedules a job from its page", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/jobs/job-6");
  const actions = page.getByRole("group", { name: "Job actions" });
  await actions.getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Description")
    .fill("Add 30A circuit for the new compressor and a disconnect");
  await page.getByRole("dialog").getByLabel("Priority").selectOption("High");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Add 30A circuit for the new compressor and a disconnect"),
  ).toBeVisible();

  await actions.getByRole("button", { name: "Schedule" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tech").selectOption({ label: "Tom Tech" });
  await dialog.getByLabel("Start time").selectOption({ label: "1:00 PM" });
  await dialog.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText("Tom Tech").first()).toBeVisible();
  await expect(page.getByText("Scheduled", { exact: true }).first()).toBeVisible();
});

test("the owner sees no job actions", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/jobs/job-4");
  await expect(page.getByRole("group", { name: "Job actions" })).toHaveCount(0);
});
