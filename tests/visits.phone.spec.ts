import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// job-20 is the seeded three-visit job (docs/VISITS.md): visit 1 Tara (done), visit 2 Tom,
// visit 3 Tara. tech1 = Tara, tech2 = Tom.

test("tech: a multi-visit job shows its visits, and only the current visit's tech can act", async ({
  page,
}) => {
  await signIn(page, "tech1");
  await page.goto("/tech/job-20");
  await expect(page.getByText("Visit 3 of 3")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Visit 2 is Tom Tech's");
  await expect(page.getByTestId("visit-row")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Start Job" })).toHaveCount(0);
});

test("tech: Visit done, return needed on a visit that is not the last; no Job complete", async ({
  page,
}) => {
  await signIn(page, "tech2");
  await page.goto("/tech");
  await expect(page.getByTestId("tech-job-card").filter({ hasText: "Visit 2 of 3" })).toBeVisible();

  await page.goto("/tech/job-20");
  await page.getByRole("button", { name: "Start Job" }).click();
  await expect(page.getByText("In Progress").first()).toBeVisible();
  // Visit 3 is still planned, so this visit can only end with a return.
  await expect(page.getByRole("button", { name: "Job complete" })).toHaveCount(0);
  await page.getByRole("button", { name: "Visit done, return needed" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Visit 3 is planned");
  await dialog.getByLabel("What is left to do").fill("Heads on poles 5 to 8 left");
  await dialog.getByRole("button", { name: "Visit done" }).click();
  await expect(page.getByRole("heading", { name: "Visit done" })).toBeVisible();
  await expect(page.getByText("Next: visit 3")).toBeVisible();
});

test("tech: on a job's last visit both choices are offered", async ({ page }) => {
  await signIn(page, "tech1");
  await page.goto("/tech/job-2");
  await page.getByRole("button", { name: "Start Job" }).click();
  await expect(page.getByRole("button", { name: "Job complete" })).toBeVisible();
  await page.getByRole("button", { name: "Visit done, return needed" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No other visit is planned yet");
  // With nothing planned, the tech must say what is left.
  await expect(dialog.getByRole("button", { name: "Visit done" })).toBeDisabled();
  await dialog.getByLabel("What is left to do").fill("Need a 200A main breaker");
  await dialog.getByRole("button", { name: "Visit done" }).click();
  await expect(page.getByText("The office will plan the return visit.")).toBeVisible();
  await page.goto("/tech/job-2");
  await expect(page.getByText("Needs a return visit")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume job" })).toHaveCount(0);
});
