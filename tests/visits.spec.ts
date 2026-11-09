import { expect, test } from "@playwright/test";

import { jobNo, signIn } from "./helpers";

// job-20 is the seeded three-visit job (docs/VISITS.md).

test("office: the job page lists the visits and adds one", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/jobs/job-20");
  const panel = page.getByRole("region", { name: "Job visits" });
  await expect(panel.getByTestId("visit-row")).toHaveCount(3);
  await panel.getByRole("button", { name: "Add visit" }).click();
  await panel.getByLabel("Visit tech").selectOption({ label: "Tess Tech" });
  await panel.getByRole("button", { name: "Save visit" }).click();
  await expect(page.getByText("Visit 4 added")).toBeVisible();
  await expect(panel.getByTestId("visit-row")).toHaveCount(4);
  await expect(panel.getByTestId("visit-row").nth(3)).toContainText("Tess Tech");

  await panel.getByRole("button", { name: "Remove visit 4" }).click();
  await expect(page.getByText("Visit 4 removed")).toBeVisible();
  await expect(panel.getByTestId("visit-row")).toHaveCount(3);
});

test("office: a job with one visit gets a second from the job page", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/jobs/job-2");
  const panel = page.getByRole("region", { name: "Job visits" });
  await expect(panel).toContainText("One visit");
  await panel.getByRole("button", { name: "Add visit" }).click();
  await panel.getByRole("button", { name: "Save visit" }).click();
  await expect(panel.getByTestId("visit-row")).toHaveCount(2);
  await expect(panel.getByTestId("visit-row").first()).toContainText("Visit 1");
});

test("office: the board shows a visit as its own card", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/dispatch");
  // Visit 2 is the next working day; step the board forward until it shows.
  const card = page.getByRole("article", { name: new RegExp(`${jobNo(20)} · Visit 2 of 3`) });
  for (let i = 0; i < 4 && !(await card.count()); i++)
    await page.getByRole("button", { name: "Next day" }).click();
  await expect(card).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Tom Tech schedule" })
      .getByText(`${jobNo(20)} · Visit 2 of 3`),
  ).toBeVisible();
});
