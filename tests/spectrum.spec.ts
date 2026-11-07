import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/** Spectrum (Phase 4) against the local fake connector. Synthetic values only. */

/** Signs out of the demo session (data stays) and signs in as someone else. */
async function switchTo(page: Page, who: Parameters<typeof signIn>[1]) {
  await page.evaluate(() => localStorage.removeItem("serv1.local.session"));
  await signIn(page, who);
}

async function saveCredentials(page: Page, authorizationId = "synthetic-0000-1111") {
  await page.goto("/settings/integrations/spectrum");
  const form = page.getByRole("region", { name: "Save credentials" });
  await form.getByLabel("Spectrum web address").fill("https://synthetic-spectrum.example.net");
  await form.getByLabel("Company code").fill("TST");
  await form.getByLabel("Authorization ID").fill(authorizationId);
  await form.getByRole("button", { name: "Save credentials" }).click();
  await expect(form.getByRole("status")).toContainText("Saved by Alex Admin");
  return form;
}

test("admin saves credentials write-only, tests the connection and sees the last result", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Spectrum" })).toBeVisible();
  const status = page.getByRole("region", { name: "Connection" });
  await expect(status).toContainText("Not saved yet");
  await expect(status).toContainText("Not tested yet");

  // Enhanced sign-in needs an operator code.
  const form = page.getByRole("region", { name: "Save credentials" });
  await form.getByLabel("Spectrum web address").fill("http://10.0.0.1");
  await form.getByLabel("Company code").fill("TST");
  await form.getByLabel("Authorization ID").fill("synthetic-0000-1111");
  await form.getByRole("button", { name: "Save credentials" }).click();
  await expect(form.getByRole("alert")).toContainText("https://");
  await form.getByLabel("Spectrum web address").fill("https://synthetic-spectrum.example.net");
  await form.getByLabel("Sign-in type").selectOption("enhanced");
  await form.getByRole("button", { name: "Save credentials" }).click();
  await expect(form.getByRole("alert")).toContainText("operator code");
  await form.getByLabel("Operator code", { exact: true }).fill("OP1");
  await form.getByRole("button", { name: "Save credentials" }).click();

  // Saved: the form is emptied and the status shows who and when, never the values.
  await expect(form.getByRole("status")).toContainText("Saved by Alex Admin");
  await expect(form.getByLabel("Spectrum web address")).toHaveValue("");
  await expect(form.getByLabel("Company code")).toHaveValue("");
  await expect(form.getByLabel("Authorization ID")).toHaveValue("");
  await expect(form.getByLabel("Operator code (optional)")).toHaveValue("");
  await expect(status).toContainText(/Saved by Alex Admin on .*enhanced sign-in/);
  await expect(page.getByText("synthetic-spectrum")).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain("synthetic-0000-1111");

  await status.getByRole("button", { name: "Test connection" }).click();
  await expect(status).toContainText(/Last test.*Connected/s);

  // Spectrum down: the test records the failure with the fixed text.
  await page.evaluate(() =>
    localStorage.setItem("serv1.local.spectrumFail", "spectrum_unavailable"),
  );
  await status.getByRole("button", { name: "Test connection" }).click();
  await expect(status).toContainText("Failed — Spectrum unavailable, try again later");
  await page.reload();
  await expect(status).toContainText("Failed — Spectrum unavailable, try again later");
});

test("office imports Spectrum jobs once, with a warning when the list is cut short", async ({
  page,
}) => {
  await signIn(page, "admin");
  await saveCredentials(page);
  await switchTo(page, "office");
  await page.goto("/jobs");
  await page.getByRole("link", { name: "Import from Spectrum" }).click();
  await page.getByRole("button", { name: "Look up in Spectrum" }).click();
  await expect(page.getByRole("status").first()).toContainText("only part of them");

  await page.getByLabel("Spectrum status (optional)").fill("A");
  await page.getByRole("button", { name: "Look up in Spectrum" }).click();
  await expect(page.getByText("only part of them")).toHaveCount(0);
  await expect(page.getByText(/12 jobs from Spectrum: 12 new/)).toBeVisible();
  await page.getByRole("button", { name: "Import 12 new jobs" }).click();
  await expect(page.getByText("Import finished")).toBeVisible();
  await expect(page.getByText(/12 jobs, \d+ customers and 12 sites added/)).toBeVisible();
  // Each row now links to its Serv1 job; nothing is left to import.
  await expect(page.getByRole("button", { name: "Import 0 new jobs" })).toBeDisabled();
  await page
    .getByRole("link", { name: /^J-\d{6}-/ })
    .first()
    .click();
  await expect(page.getByText(/Imported from Spectrum: company TST, job 24\d\d/)).toBeVisible();

  // Work orders for one Spectrum job.
  await page.goto("/spectrum-import");
  await page.getByLabel("Import").selectOption("workOrders");
  await page.getByLabel("Spectrum job number (optional)").fill("2401");
  await page.getByRole("button", { name: "Look up in Spectrum" }).click();
  await page.getByRole("button", { name: "Import 2 new work orders" }).click();
  await expect(page.getByText(/2 jobs, 0 customers/)).toBeVisible();
});

test("Spectrum errors show plain text; office never sees the settings", async ({ page }) => {
  await signIn(page, "office");
  await page.goto("/spectrum-import");
  await page.getByRole("button", { name: "Look up in Spectrum" }).click();
  await expect(page.getByRole("alert")).toContainText("Spectrum is not set up yet");
  await page.goto("/settings/integrations/spectrum");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }),
  ).toHaveCount(0);

  await switchTo(page, "admin");
  await saveCredentials(page);
  await page.evaluate(() => localStorage.setItem("serv1.local.spectrumFail", "timeout"));
  await page.goto("/spectrum-import");
  await page.getByRole("button", { name: "Look up in Spectrum" }).click();
  await expect(page.getByRole("alert")).toHaveText("Spectrum unavailable, try again later");
});

test("owner and tech cannot open Spectrum import", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/spectrum-import");
  await expect(page).toHaveURL(/\/$/);
  await switchTo(page, "tech1");
  await page.goto("/spectrum-import");
  await expect(page).toHaveURL(/\/tech$/);
});

test("admin removes test imports: count first, then confirm with the company code", async ({
  page,
}) => {
  await signIn(page, "admin");
  await saveCredentials(page);
  await page.goto("/spectrum-import");
  await page.getByLabel("Spectrum status (optional)").fill("A");
  await page.getByRole("button", { name: "Look up in Spectrum" }).click();
  await page.getByRole("button", { name: "Import 12 new jobs" }).click();
  await expect(page.getByText("Import finished")).toBeVisible();

  await page.goto("/settings/integrations/spectrum");
  const section = page.getByRole("region", { name: "Remove test imports" });
  await section.getByLabel("Company code to remove").fill("TST");
  await section.getByRole("button", { name: "Count records" }).click();
  await expect(section.getByRole("status")).toContainText(
    /Company TST: 12 jobs, 12 sites and \d+ customers/,
  );
  await section.getByRole("button", { name: /Remove \d+ records/ }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Remove for good" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Company code").fill("TST");
  await confirm.click();
  await expect(section.getByRole("status")).toContainText(
    /Removed \d+ records imported from company TST/,
  );

  await section.getByLabel("Company code to remove").fill("TST");
  await section.getByRole("button", { name: "Count records" }).click();
  await expect(section).toContainText("Nothing to remove for this company code.");
});
