import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

/** Office review of what a tech sent from the ECI1 phone app (seeded on job-7, synthetic). */

test("office sees the tech's notes, materials and receipt, and reviews the receipt", async ({
  page,
}) => {
  await signIn(page, "office");
  await page.goto("/jobs/job-7");
  const work = page.getByRole("region", { name: "Tech's work" });
  await expect(work.getByRole("list", { name: "Tech notes" })).toContainText(
    "Lug was heat damaged",
  );
  await expect(work.getByRole("table", { name: "Materials used" })).toContainText(
    "40A 2-pole breaker",
  );

  const receipt = work.getByRole("listitem", { name: "Receipt from Synthetic Electric Supply" });
  await expect(receipt).toContainText("$86.40");
  await expect(receipt).toContainText("Personal (pay back the tech)");
  await expect(receipt).toContainText("Waiting for review");

  // Rejecting needs a reason.
  await receipt.getByRole("button", { name: "Reject" }).click();
  await expect(receipt.getByRole("button", { name: "Reject receipt" })).toBeDisabled();
  await receipt.getByLabel("Why is it rejected?").fill("No itemised total");
  await receipt.getByRole("button", { name: "Reject receipt" }).click();
  await expect(receipt).toContainText("Rejected");
  await expect(receipt).toContainText("by Olivia Office: No itemised total");

  await receipt.getByRole("button", { name: "Undo review" }).click();
  await receipt.getByRole("button", { name: "Approve" }).click();
  await expect(receipt).toContainText("Approved");

  // Note to the tech (shown on the phone).
  await work.getByLabel("Note to the tech").fill("Customer wants the old breaker kept");
  await work.getByRole("button", { name: "Save note" }).click();
  await expect(work.getByRole("button", { name: "Save note" })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Note to the tech")).toHaveValue(
    "Customer wants the old breaker kept",
  );
});

test("owner reads the tech's work but cannot review", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/jobs/job-7");
  const work = page.getByRole("region", { name: "Tech's work" });
  await expect(work).toContainText("Synthetic Electric Supply");
  await expect(work.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(work.getByLabel("Note to the tech")).toHaveCount(0);
});
