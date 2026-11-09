import { expect, test } from "@playwright/test";

import { SEED_VISITS } from "../src/data/local/seed";
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

test("office: Reschedule on the job page moves the current visit, not the job's old time", async ({
  page,
}) => {
  await signIn(page, "office");
  await page.goto("/jobs/job-20");
  await page.getByRole("button", { name: "Reschedule or reassign" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Remove this visit" })).toBeVisible();
  await dialog.getByRole("combobox").first().selectOption({ label: "Tess Tech" });
  await dialog.getByRole("button", { name: /^Schedule/ }).click();
  const panel = page.getByRole("region", { name: "Job visits" });
  // Visit 2 (the current one) is now Tess's; visits 1 and 3 are as they were.
  await expect(panel.getByTestId("visit-row").nth(1)).toContainText("Tess Tech");
  await expect(panel.getByTestId("visit-row").nth(0)).toContainText("Tara Tech");
  await expect(panel.getByTestId("visit-row").nth(2)).toContainText("Tara Tech");
});

test("office: adding a visit over the job's own visit warns of double booking", async ({
  page,
}) => {
  await signIn(page, "office");
  await page.goto("/jobs/job-20");
  await page.getByRole("button", { name: "Reschedule or reassign" }).click();
  const dialog = page.getByRole("dialog");
  // The defaults are the current visit's own tech and time: rescheduling to them is no clash,
  // but adding a visit there would book the tech twice (Codex review of PR #21).
  await expect(dialog.getByRole("alert")).toContainText("it would overlap this job's own visit");
  await expect(dialog.getByRole("button", { name: "Add as another visit anyway" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Schedule", exact: true })).toBeVisible();
});

test("office: the Visits panel warns before adding a visit over the tech's own appointment", async ({
  page,
}) => {
  await signIn(page, "office");
  await page.goto("/jobs/job-20");
  const panel = page.getByRole("region", { name: "Job visits" });
  const rows = panel.getByTestId("visit-row");
  await expect(rows).toHaveCount(3);
  // Visit 3 is Tara's; put a new visit for Tara on the same day and start time.
  const start = new Date(SEED_VISITS.find((x) => x.id === "visit-20-3")!.scheduledStart!);
  const pad = (n: number) => String(n).padStart(2, "0");
  await panel.getByRole("button", { name: "Add visit" }).click();
  await panel.getByLabel("Visit tech").selectOption({ label: "Tara Tech" });
  await panel
    .getByLabel("Visit date")
    .fill(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
  await panel
    .getByLabel("Visit start")
    .selectOption(String(start.getHours() * 60 + start.getMinutes()));
  await expect(panel.getByRole("alert")).toContainText("Double booking");
  await expect(panel.getByRole("button", { name: "Save visit anyway" })).toBeVisible();
});
