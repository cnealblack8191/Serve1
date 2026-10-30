import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/** Seed (src/data/local/seed.ts): J-1001 and J-1006 are New; techs Tara, Tom and Tess. */
async function openBoard(page: Page) {
  await signIn(page, "office");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Dispatch" })
    .click();
  await expect(page.getByRole("heading", { name: "Dispatch Board" })).toBeVisible();
}

const queue = (page: Page) => page.getByRole("region", { name: "Unscheduled jobs" });
const techColumn = (page: Page, name: string) =>
  page.getByRole("region", { name: `${name} schedule` });

async function assignWithDialog(
  page: Page,
  job: string,
  tech: string,
  time: string,
  length?: string,
) {
  await queue(page)
    .getByRole("button", { name: `Assign ${job}` })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tech").selectOption({ label: tech });
  await dialog.getByLabel("Start time").selectOption({ label: time });
  if (length) await dialog.getByLabel("Length").selectOption({ label: length });
  await dialog.getByRole("button", { name: "Schedule" }).click();
  await expect(dialog).toBeHidden();
}

test("office assigns a New job to a tech with the Assign dialog", async ({ page }) => {
  await openBoard(page);
  await expect(queue(page).getByRole("article", { name: /J-1001/ })).toBeVisible();

  await assignWithDialog(page, "J-1001", "Tom Tech", "10:00 AM");

  const card = techColumn(page, "Tom Tech").getByRole("article", { name: /J-1001/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Scheduled");
  await expect(card).toContainText("10:00 AM – 12:00 PM");
  await expect(queue(page).getByRole("article", { name: /J-1001/ })).toHaveCount(0);
});

test("dragging a job onto a tech's time slot schedules it after confirming", async ({ page }) => {
  await openBoard(page);
  const source = queue(page).getByRole("article", { name: /J-1006/ });
  const slot = techColumn(page, "Tess Tech").getByLabel("Tess Tech 1:00 PM");
  await slot.scrollIntoViewIfNeeded();
  await source.dragTo(slot);

  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("J-1006");
  await expect(confirm).toContainText("Tess Tech");
  await confirm.getByRole("button", { name: "Confirm" }).click();

  const card = techColumn(page, "Tess Tech").getByRole("article", { name: /J-1006/ });
  await expect(card).toContainText("Scheduled");
  await expect(card).toContainText("1:00 PM – 3:00 PM");
});

test("the queue shows an empty state once every job is scheduled", async ({ page }) => {
  await openBoard(page);
  await assignWithDialog(page, "J-1001", "Tara Tech", "2:00 PM");
  await assignWithDialog(page, "J-1006", "Tom Tech", "1:00 PM");
  await expect(queue(page)).toContainText("No unscheduled jobs");
});

test("dragging a scheduled job to another tech reassigns it (confirm turned off)", async ({
  page,
}) => {
  await openBoard(page);
  await page.getByRole("switch", { name: "Confirm on drop" }).click();
  const source = techColumn(page, "Tara Tech").getByRole("article", { name: /J-1002/ });
  await expect(source).toBeVisible();
  const slot = techColumn(page, "Tom Tech").getByLabel("Tom Tech 3:00 PM");
  await slot.scrollIntoViewIfNeeded();
  await source.dragTo(slot);

  const card = techColumn(page, "Tom Tech").getByRole("article", { name: /J-1002/ });
  await expect(card).toContainText("3:00 PM – 5:00 PM");
  await expect(techColumn(page, "Tara Tech").getByRole("article", { name: /J-1002/ })).toHaveCount(
    0,
  );
});

test("a 30-minute job can still reopen its Assign dialog from the timeline", async ({ page }) => {
  await openBoard(page);
  await assignWithDialog(page, "J-1001", "Tom Tech", "1:00 PM", "0.5 hours");

  const card = techColumn(page, "Tom Tech").getByRole("article", { name: /J-1001/ });
  await expect(card).toHaveAttribute("title", "1:00 PM – 1:30 PM");
  await card.getByRole("button", { name: "Assign J-1001" }).click();
  await expect(page.getByRole("dialog")).toContainText("Assign J-1001");
});

test("a tech who opens /dispatch directly is sent to Today", async ({ page }) => {
  await signIn(page, "tech1");
  await page.goto("/dispatch");
  await expect(page).toHaveURL(/\/tech$/);
  await expect(page.getByRole("heading", { name: "Dispatch Board" })).toHaveCount(0);
});

test("the owner who opens /dispatch directly is sent to the Dashboard", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/dispatch");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Dispatch Board" })).toHaveCount(0);
});
