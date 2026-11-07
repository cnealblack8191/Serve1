import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * "Will not crash current work": records saved before Phases 2-4 have none of the newer fields
 * (job tracking, hold and review, Spectrum) and only the first five statuses, and the store has
 * no opportunities or Spectrum tables. Every main screen must still load them.
 */
const t = "2026-10-30T15:00:00.000Z";
const today = new Date();
today.setHours(9, 0, 0, 0);
const at = (h: number) => new Date(today.getTime() + h * 3_600_000).toISOString();
const base = { createdAt: t, updatedAt: t };
const job = (n: number, status: string, tech: string | null, extra: object = {}) => ({
  ...base,
  id: `old-${n}`,
  jobNumber: `J-261030-OLD${n}`,
  customerId: "old-cust",
  siteId: "old-site",
  description: `Old job ${n}`,
  jobType: "Panel upgrade",
  priority: "Normal",
  status,
  assignedTechId: tech,
  scheduledStart: tech ? at(n) : null,
  scheduledEnd: tech ? at(n + 1) : null,
  startedAt: null,
  completedAt: null,
  notes: null,
  laborHours: null,
  ...extra,
});

const OLD_STORE = {
  users: [
    ["user-1", "Alex Admin", "admin@serv1.demo", "Admin", "local-admin"],
    ["user-2", "Olivia Office", "office@serv1.demo", "Office", "local-office"],
    ["user-4", "Tara Tech", "tech1@serv1.demo", "Tech", "local-tech-1"],
  ].map(([id, name, email, role, identityId]) => ({
    ...base,
    id,
    name,
    email,
    role,
    phone: null,
    active: true,
    identityId,
  })),
  customers: [
    {
      ...base,
      id: "old-cust",
      name: "Old Shape Customer",
      billingAddress: null,
      phone: null,
      email: null,
      notes: null,
    },
  ],
  sites: [
    {
      ...base,
      id: "old-site",
      customerId: "old-cust",
      name: null,
      address: "1 Old Road",
      accessNotes: null,
    },
  ],
  jobs: [
    job(1, "New", null),
    job(2, "Scheduled", "local-tech-1"),
    job(3, "InProgress", "local-tech-1", { startedAt: at(3) }),
    job(4, "Complete", "local-tech-1", { completedAt: t, laborHours: 2 }),
    job(5, "Invoiced", null, { completedAt: t }),
  ],
  attachments: [],
  signatures: [],
  invoices: [
    {
      ...base,
      id: "inv-old",
      invoiceNumber: "INV-261030-OLD5",
      jobId: "old-5",
      customerId: "old-cust",
      lineItems: [{ description: "Labor", quantity: 2, unitPrice: 100, total: 200 }],
      total: 200,
      status: "Sent",
      pdfPath: null,
    },
  ],
  // No opportunities or spectrumChecks: those tables did not exist yet.
};

async function useOldStore(page: Page) {
  await page.goto("/auth");
  await page.evaluate((store) => {
    localStorage.clear();
    localStorage.setItem("serv1.local.v3", JSON.stringify(store));
  }, OLD_STORE);
}

const noCrash = async (page: Page) => expect(page.getByText("Something went wrong")).toHaveCount(0);

test("office screens load records saved before the newer fields existed", async ({ page }) => {
  await useOldStore(page);
  await signIn(page, "admin");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await noCrash(page);

  await page.goto("/jobs");
  for (const n of [1, 2, 3, 4, 5])
    await expect(page.getByText(`Old job ${n}`).filter({ visible: true }).first()).toBeVisible();
  await noCrash(page);

  for (const n of [1, 3, 5]) {
    await page.goto(`/jobs/old-${n}`);
    await expect(page.getByText(`Old job ${n}`).filter({ visible: true }).first()).toBeVisible();
    await noCrash(page);
  }
  for (const path of ["/dispatch", "/invoices", "/customers/old-cust", "/opportunities"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await noCrash(page);
  }
  // Spectrum screens with no Spectrum data yet.
  await page.goto("/settings/integrations/spectrum");
  await expect(page.getByText("Not tested yet")).toBeVisible();
  await noCrash(page);
});

test("tech screens load old-shape jobs", async ({ page }) => {
  await useOldStore(page);
  await signIn(page, "tech1");
  await expect(page.getByText("Old job 2")).toBeVisible();
  await noCrash(page);
  await page.goto("/tech/old-3");
  await expect(page.getByText("Old job 3").first()).toBeVisible();
  await noCrash(page);
});
