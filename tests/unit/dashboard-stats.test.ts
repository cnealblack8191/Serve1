/** Dashboard numbers (src/components/serv1/billing/dashboardStats.ts). Run: npm run test:unit */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dashboardStats } from "../../src/components/serv1/billing/dashboardStats.ts";
import { JOB_TRACKING_DEFAULTS } from "../../src/data/types.ts";
import type { Invoice, Job, JobStatus } from "../../src/data/types.ts";

const job = (id: string, status: JobStatus, completedAt: string | null = null): Job => ({
  ...JOB_TRACKING_DEFAULTS,
  id,
  jobNumber: id,
  customerId: "c",
  siteId: null,
  description: "",
  jobType: null,
  priority: "Normal",
  status,
  assignedTechId: null,
  scheduledStart: null,
  scheduledEnd: null,
  startedAt: null,
  completedAt,
  notes: null,
  laborHours: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
});
const inv = (jobId: string, status: Invoice["status"], total: number): Invoice => ({
  id: `i-${jobId}`,
  invoiceNumber: null,
  jobId,
  customerId: "c",
  lineItems: [],
  total,
  status,
  pdfPath: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
});

describe("dashboardStats", () => {
  const now = new Date(2026, 10, 6, 15); // Friday 6 Nov 2026, 3 PM local
  const jobs = [
    job("a", "New"),
    job("b", "Scheduled"),
    job("c", "InProgress"),
    job("d", "Complete", new Date(2026, 10, 6, 9).toISOString()),
    job("e", "Complete", new Date(2026, 10, 3, 9).toISOString()),
    job("f", "Invoiced", new Date(2026, 10, 2, 9).toISOString()),
    job("g", "Invoiced", new Date(2026, 9, 20, 9).toISOString()),
  ];
  const invoices = [inv("e", "Draft", 100), inv("f", "Sent", 250), inv("g", "Paid", 400)];
  const s = dashboardStats(jobs, invoices, now);

  it("counts only unfinished work as open", () => {
    assert.equal(s.open, 3);
    assert.deepEqual(
      s.byStatus.map((b) => b.status),
      ["New", "Scheduled", "EnRoute", "InProgress", "OnHold"],
    );
  });
  it("counts Complete jobs with no invoice as waiting to invoice", () => {
    assert.equal(s.waitingToInvoice, 1); // d; e already has a draft
  });
  it("keeps draft, sent-unpaid and paid money apart", () => {
    assert.deepEqual(s.money, { draft: 100, sentUnpaid: 250, paid: 400 });
  });
  it("counts completions today and this week (Monday start)", () => {
    assert.equal(s.completedToday, 1);
    assert.equal(s.completedThisWeek, 3); // d, e, f
  });
});
