import { expect, test } from "@playwright/test";

import { syntheticExports } from "./fixtures/xlsx";
import { signIn } from "./helpers";

test("office imports synthetic Smartsheet exports; a second run adds nothing", async ({ page }) => {
  const { salesFile, serviceFile, taskFile } = syntheticExports();
  const files = [
    { name: "Sales Pipeline.xlsx", buffer: Buffer.from(salesFile) },
    { name: "Service Pipeline.xlsx", buffer: Buffer.from(serviceFile) },
    { name: "HV Task Tracker.xlsx", buffer: Buffer.from(taskFile) },
  ].map((f) => ({
    ...f,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));

  await signIn(page, "office");
  await page.goto("/opportunities");
  await page.getByRole("link", { name: "Import from Smartsheet" }).click();
  await page.getByLabel("Smartsheet export files (.xlsx or .csv)").setInputFiles(files);

  const summary = page.getByRole("region", { name: "Import summary" });
  await expect(summary).toContainText("7 opportunities");
  await expect(summary).toContainText("3 Service Pipeline rows merged");
  await expect(summary).toContainText("4 jobs");
  await expect(page.getByRole("cell", { name: "Dekalb Service" })).toBeVisible();

  await page.getByRole("button", { name: "Import 9 records" }).click();
  await expect(page.getByRole("status")).toContainText("7 opportunities, 4 jobs");

  await page.getByRole("link", { name: "Open Opportunities" }).click();
  await page.getByLabel("Search opportunities").fill("Library lighting");
  await expect(page.getByRole("list", { name: "Opportunities" })).toContainText("DeKalb Gov.");

  // Running again skips everything.
  await page.goto("/import");
  await page.getByLabel("Smartsheet export files (.xlsx or .csv)").setInputFiles(files);
  await page.getByRole("button", { name: "Import 9 records" }).click();
  await expect(page.getByRole("status")).toContainText("0 opportunities, 0 jobs");
});

test("the owner cannot open the importer", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/import");
  await expect(page).toHaveURL(/\/$/);
});

test("a tech cannot open the importer", async ({ page }) => {
  await signIn(page, "tech1");
  await page.goto("/import");
  await expect(page).toHaveURL(/\/tech$/);
});
