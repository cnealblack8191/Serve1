import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * Tech lane (TASKS.md 6, 7, 8) on a phone screen, local demo mode.
 * Seed: tech1 has J-1002 (Oak Hill Apartments, Scheduled today) and a Complete job yesterday;
 * tech2 has J-1003 (Peachtree Logistics, In Progress today).
 */

// 1x1 PNG, generated in the test so no binary file is checked in.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const todayCards = (page: Page) =>
  page.getByRole("region", { name: "Today's jobs" }).getByTestId("tech-job-card");

async function openFirstJob(page: Page) {
  await todayCards(page)
    .first()
    .getByRole("link", { name: /Open job/ })
    .click();
  await expect(page).toHaveURL(/\/tech\/job-/);
}

async function sign(page: Page) {
  const pad = page.getByTestId("signature-pad");
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 30, { steps: 8 });
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 30, { steps: 8 });
  await page.mouse.up();
}

test("tech1 sees exactly their own job on Today, and never tech2's", async ({ page }) => {
  await signIn(page, "tech1");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(todayCards(page)).toHaveCount(1);
  await expect(todayCards(page).first()).toContainText("Oak Hill Apartments");
  await expect(todayCards(page).first()).toContainText("Scheduled");
  await expect(todayCards(page).first().getByRole("link", { name: "Directions" })).toHaveAttribute(
    "href",
    /google\.com\/maps/,
  );
  await expect(page.getByText("Peachtree Logistics")).toHaveCount(0);

  // Opening tech2's job directly shows nothing.
  await page.goto("/tech/job-3");
  await expect(page.getByText("Job not found")).toBeVisible();
  await expect(page.getByText("Install dock door receptacles")).toHaveCount(0);
});

test("tech1 starts the job, adds a photo and notes, and the customer signs", async ({ page }) => {
  await signIn(page, "tech1");
  await openFirstJob(page);
  await expect(page.getByText("Key at leasing office.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Call/ })).toHaveAttribute("href", /^tel:/);

  // Start Job -> In Progress.
  await page.getByRole("button", { name: "Start Job" }).click();
  await expect(page.getByText("In Progress").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Job" })).toHaveCount(0);

  // Photo upload -> thumbnail.
  await page.getByLabel("Add photo").setInputFiles({
    name: "panel.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByTestId("job-photo")).toHaveCount(1);

  // Notes saved to the job.
  await page.getByLabel("Notes").fill("Replaced 20A breaker in unit 204.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Complete -> signature -> Done.
  await page.getByRole("button", { name: "Complete" }).click();
  const save = page.getByRole("button", { name: "Save signature" });
  await expect(save).toBeDisabled();
  await sign(page);
  await page.getByLabel("Signer name").fill("Pat Manager");
  await save.click();
  await expect(page.getByRole("heading", { name: "Job complete" })).toBeVisible();

  await page.getByRole("link", { name: "Back to Today" }).click();
  await expect(todayCards(page).first()).toContainText("Complete");

  // The job keeps its notes, photo and signature.
  await openFirstJob(page);
  await expect(page.getByText("Replaced 20A breaker in unit 204.")).toBeVisible();
  await expect(page.getByText(/Signed by Pat Manager/)).toBeVisible();
  await expect(page.getByTestId("job-photo")).toHaveCount(1);
});

test("tech2 sees their In Progress job with Complete, not Start", async ({ page }) => {
  await signIn(page, "tech2");
  await expect(todayCards(page)).toHaveCount(1);
  await expect(todayCards(page).first()).toContainText("Peachtree Logistics");
  await expect(page.getByText("Oak Hill Apartments")).toHaveCount(0);
  await openFirstJob(page);
  await expect(page.getByRole("button", { name: "Complete" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Job" })).toHaveCount(0);
});
