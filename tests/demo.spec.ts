import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

import { signIn } from "./helpers";

/**
 * The full shareholder demo story (SPEC.md section 4, TASKS.md item 11), in local demo mode:
 * office creates a job, dispatch assigns it to Tara (tech1), Tara completes it on a phone with a
 * photo and signature, office makes the invoice with one click, and the owner's dashboard counts it.
 *
 * The local store lives in each browser's localStorage, so the test hands the data from one
 * browser to the next (like the real backend would) and leaves the signed-in session behind.
 */

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const DESCRIPTION = "Ice machine circuit keeps tripping the breaker";
// A new job has no labor hours yet, so the invoice uses the 2h default: 2 x $95 + $85 service call.
const INVOICE_TOTAL = 275;

const { defaultBrowserType: _ignored, ...phone } = devices["Pixel 7"];

async function handOver(from: BrowserContext, browser: Browser, options: BrowserContextOptions) {
  const state = await from.storageState();
  for (const origin of state.origins) {
    origin.localStorage = origin.localStorage.filter((i) => i.name !== "serv1.local.session");
  }
  await from.close();
  return browser.newContext({ ...options, storageState: state });
}

const card = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator("xpath=..");
const number = (text: string | null) => Number((text ?? "").replace(/[^\d.]/g, ""));

async function dashboardNumbers(page: Page) {
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const value = (label: string) => card(page, label).locator("span").nth(1).textContent();
  const tara = page.getByRole("row", { name: /Tara Tech/ }).getByRole("cell");
  await expect(tara.first()).toBeVisible();
  return {
    completedToday: number(await value("Completed today")),
    invoicedTotal: number(await value("Invoiced total")),
    taraCompleted: number(await tara.nth(2).textContent()),
  };
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

test("demo story: call in, dispatch, tech completes on a phone, invoice, dashboard", async ({
  browser,
}, testInfo) => {
  const laptop: BrowserContextOptions = { baseURL: testInfo.project.use.baseURL };
  const phoneOptions: BrowserContextOptions = { ...phone, baseURL: testInfo.project.use.baseURL };

  // 0. The owner's numbers before the story starts.
  let ctx = await browser.newContext(laptop);
  let page = await ctx.newPage();
  await signIn(page, "owner");
  const before = await dashboardNumbers(page);
  await ctx.close();

  // 1. A customer calls; the office creates the job.
  ctx = await browser.newContext(laptop);
  page = await ctx.newPage();
  await signIn(page, "office");
  await page.goto("/jobs/new");
  await page.getByLabel("Find customer").fill("sweetwater");
  await page.getByRole("button", { name: /Sweetwater Grill/ }).click();
  await page.getByLabel("Description").fill(DESCRIPTION);
  await page.getByRole("button", { name: "Save job" }).click();
  const heading = page.getByRole("heading", { name: /^J-\d+/ });
  await expect(heading).toBeVisible();
  const jobNumber = /J-\d+/.exec((await heading.textContent()) ?? "")![0];
  await expect(page.getByText(DESCRIPTION)).toBeVisible();

  // 2. The office puts it on Tara's schedule from the dispatch board.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Dispatch" })
    .click();
  const queue = page.getByRole("region", { name: "Unscheduled jobs" });
  await queue.getByRole("button", { name: `Assign ${jobNumber}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tech").selectOption({ label: "Tara Tech" });
  await dialog.getByLabel("Start time").selectOption({ label: "1:00 PM" });
  await dialog.getByRole("button", { name: "Schedule" }).click();
  await expect(dialog).toBeHidden();
  const boardCard = page
    .getByRole("region", { name: "Tara Tech schedule" })
    .getByRole("article", { name: new RegExp(jobNumber) });
  await expect(boardCard).toContainText("Scheduled");
  await expect(queue.getByRole("article", { name: new RegExp(jobNumber) })).toHaveCount(0);

  // 3. Tara opens it on her phone, starts it, adds a photo and gets the customer's signature.
  ctx = await handOver(ctx, browser, phoneOptions);
  page = await ctx.newPage();
  await signIn(page, "tech1");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  const todayCard = page
    .getByRole("region", { name: "Today's jobs" })
    .getByTestId("tech-job-card")
    .filter({ hasText: "Sweetwater Grill" });
  await expect(todayCard).toContainText("Scheduled");
  await todayCard.getByRole("link", { name: /Open job/ }).click();
  await expect(page.getByText(DESCRIPTION)).toBeVisible();

  await page.getByRole("button", { name: "Start Job" }).click();
  await expect(page.getByText("In Progress").first()).toBeVisible();
  await page.getByLabel("Add photo").setInputFiles({
    name: "breaker.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByTestId("job-photo")).toHaveCount(1);

  await page.getByRole("button", { name: "Complete" }).click();
  await sign(page);
  await page.getByLabel("Signer name").fill("Jordan Kitchen Manager");
  await page.getByRole("button", { name: "Save signature" }).click();
  await expect(page.getByRole("heading", { name: "Job complete" })).toBeVisible();

  // 4. The office turns the finished job into an invoice with one click.
  ctx = await handOver(ctx, browser, laptop);
  page = await ctx.newPage();
  await signIn(page, "office");
  await page.goto("/invoices");
  const ready = page.getByRole("listitem").filter({ hasText: jobNumber });
  await expect(ready).toContainText("Sweetwater Grill");
  await ready.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByRole("heading", { name: /^INV-/ })).toBeVisible();
  await expect(page.getByText("$275.00").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();

  // 5. The owner's dashboard counts the completed job and the new revenue.
  ctx = await handOver(ctx, browser, laptop);
  page = await ctx.newPage();
  await signIn(page, "owner");
  await expect
    .poll(() => dashboardNumbers(page))
    .toEqual({
      completedToday: before.completedToday + 1,
      invoicedTotal: before.invoicedTotal + INVOICE_TOTAL,
      taraCompleted: before.taraCompleted + 1,
    });
  await ctx.close();
});
