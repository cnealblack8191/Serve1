import { fixedNumber } from "../numbers";
import {
  JOB_TRACKING_DEFAULTS,
  type Customer,
  type Invoice,
  type InvoiceLineItem,
  type Job,
  type Opportunity,
  type Role,
  type Site,
  type User,
  type Visit,
} from "../types";

/**
 * Demo data for the local (no-AWS) mode. Fake names only (SPEC.md section 4).
 * Electrical service customers around Covington, GA (ECI is an electrical contractor); every name, address,
 * phone number and email is made up. Dates are relative to "now" so the demo always
 * has work today, upcoming jobs this week and recently finished jobs.
 *
 * Tests depend on: the DEMO_ACCOUNTS emails, job-1 to job-6 (see tests/), Riverside
 * Dental having exactly one site, tech1 and tech2 having exactly one job today, and
 * job-1 / job-6 being the only unassigned New jobs. Job and invoice numbers use the same format
 * as new records (J-YYMMDD-XXXX, INV-YYMMDD-XXXX); tests read them with seedJobNumber().
 */
export const LOCAL_PASSWORD = "serv1demo";

export interface DemoAccount {
  identityId: string;
  email: string;
  name: string;
  role: Role;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { identityId: "local-admin", email: "admin@serv1.demo", name: "Alex Admin", role: "Admin" },
  { identityId: "local-office", email: "office@serv1.demo", name: "Olivia Office", role: "Office" },
  { identityId: "local-owner", email: "owner@serv1.demo", name: "Owen Owner", role: "Owner" },
  { identityId: "local-tech-1", email: "tech1@serv1.demo", name: "Tara Tech", role: "Tech" },
  { identityId: "local-tech-2", email: "tech2@serv1.demo", name: "Tom Tech", role: "Tech" },
  { identityId: "local-tech-3", email: "tech3@serv1.demo", name: "Tess Tech", role: "Tech" },
];

const t0 = new Date();
t0.setHours(8, 0, 0, 0);
/** ISO time `dayOffset` calendar days from today at `hour` (decimals allowed: 10.5 = 10:30). */
const at = (dayOffset: number, hour: number) => {
  const d = new Date(t0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d.toISOString();
};
/** Calendar-day offset of the `n`th working day (Mon to Fri) after (n > 0) or before (n < 0) today. */
const workday = (n: number) => {
  const d = new Date(t0);
  let offset = 0;
  for (let left = Math.abs(n); left > 0;) {
    offset += Math.sign(n);
    d.setDate(d.getDate() + Math.sign(n));
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return offset;
};
const stamp = { createdAt: at(-7, 9), updatedAt: at(-1, 9) };

export const SEED_USERS: User[] = DEMO_ACCOUNTS.map((a, i) => ({
  id: `user-${i + 1}`,
  name: a.name,
  email: a.email,
  role: a.role,
  phone: `(770) 555-01${String(i + 10).padStart(2, "0")}`,
  active: true,
  identityId: a.identityId,
  ...stamp,
}));

export const SEED_CUSTOMERS: Customer[] = [
  {
    id: "cust-1",
    name: "Riverside Dental Group",
    billingAddress: "120 Mill St, Covington, GA 30014",
    phone: "(770) 555-0201",
    email: "office@riversidedental.example",
    notes: "Net 30.",
    ...stamp,
  },
  {
    id: "cust-2",
    name: "Oak Hill Apartments",
    billingAddress: "4400 Oak Hill Dr, Conyers, GA 30094",
    phone: "(770) 555-0202",
    email: "manager@oakhill.example",
    notes: "Call before arrival.",
    ...stamp,
  },
  {
    id: "cust-3",
    name: "Peachtree Logistics",
    billingAddress: "9 Depot Rd, Social Circle, GA 30025",
    phone: "(770) 555-0203",
    email: "facilities@peachtreelog.example",
    notes: null,
    ...stamp,
  },
  {
    id: "cust-4",
    name: "Magnolia Family Pharmacy",
    billingAddress: "2150 Washington St, Covington, GA 30014",
    phone: "(770) 555-0204",
    email: "store@magnoliarx.example",
    notes: "Work after 6 PM if it affects the pharmacy floor.",
    ...stamp,
  },
  {
    id: "cust-5",
    name: "Covington First Community Church",
    billingAddress: "88 Church St, Covington, GA 30014",
    phone: "(770) 555-0205",
    email: "facilities@covfirstchurch.example",
    notes: "Tax exempt. PO required over $1,000.",
    ...stamp,
  },
  {
    id: "cust-6",
    name: "Lakeview Self Storage",
    billingAddress: "3100 Salem Rd, Covington, GA 30016",
    phone: "(770) 555-0206",
    email: "lakeview@storageco.example",
    notes: null,
    ...stamp,
  },
  {
    id: "cust-7",
    name: "Sweetwater Grill",
    billingAddress: "1105 Monticello St, Covington, GA 30014",
    phone: "(770) 555-0207",
    email: "kitchen@sweetwatergrill.example",
    notes: "Restaurant opens at 11 AM; kitchen work before then.",
    ...stamp,
  },
  {
    id: "cust-8",
    name: "Brightside Early Learning",
    billingAddress: "640 Brown Bridge Rd, Covington, GA 30016",
    phone: "(770) 555-0208",
    email: "director@brightsidelearning.example",
    notes: "Background-checked techs only. Sign in at the front desk.",
    ...stamp,
  },
];

export const SEED_SITES: Site[] = [
  {
    id: "site-1",
    customerId: "cust-1",
    name: "Main office",
    address: "120 Mill St, Covington, GA 30014",
    accessNotes: "Rear entrance, code 4410.",
    ...stamp,
  },
  {
    id: "site-2",
    customerId: "cust-2",
    name: "Building A",
    address: "4400 Oak Hill Dr, Bldg A, Conyers, GA 30094",
    accessNotes: "Key at leasing office.",
    ...stamp,
  },
  {
    id: "site-3",
    customerId: "cust-2",
    name: "Building C",
    address: "4400 Oak Hill Dr, Bldg C, Conyers, GA 30094",
    accessNotes: null,
    ...stamp,
  },
  {
    id: "site-4",
    customerId: "cust-3",
    name: "Warehouse",
    address: "9 Depot Rd, Social Circle, GA 30025",
    accessNotes: "Check in at guard shack.",
    ...stamp,
  },
  {
    id: "site-5",
    customerId: "cust-2",
    name: "Clubhouse and pool",
    address: "4410 Oak Hill Dr, Conyers, GA 30094",
    accessNotes: "Pool equipment room key on the leasing office ring.",
    ...stamp,
  },
  {
    id: "site-6",
    customerId: "cust-4",
    name: "Store",
    address: "2150 Washington St, Covington, GA 30014",
    accessNotes: "Rooftop ladder in the back stockroom. Ask the pharmacist on duty.",
    ...stamp,
  },
  {
    id: "site-7",
    customerId: "cust-5",
    name: "Sanctuary",
    address: "88 Church St, Covington, GA 30014",
    accessNotes: "Side door by the parking lot. Mechanical room in the basement.",
    ...stamp,
  },
  {
    id: "site-8",
    customerId: "cust-5",
    name: "Fellowship hall",
    address: "92 Church St, Covington, GA 30014",
    accessNotes: "Call Deacon Ray at (770) 555-0215 to unlock.",
    ...stamp,
  },
  {
    id: "site-9",
    customerId: "cust-6",
    name: "Salem Rd facility",
    address: "3100 Salem Rd, Covington, GA 30016",
    accessNotes: "Gate code 7731. Office closes at 5 PM.",
    ...stamp,
  },
  {
    id: "site-10",
    customerId: "cust-6",
    name: "Hwy 142 facility",
    address: "5520 Hwy 142, Covington, GA 30016",
    accessNotes: "Gate code 7731.",
    ...stamp,
  },
  {
    id: "site-11",
    customerId: "cust-7",
    name: "Restaurant",
    address: "1105 Monticello St, Covington, GA 30014",
    accessNotes: "Use the kitchen door off the alley.",
    ...stamp,
  },
  {
    id: "site-12",
    customerId: "cust-8",
    name: "Brown Bridge campus",
    address: "640 Brown Bridge Rd, Covington, GA 30016",
    accessNotes: "Sign in at the front desk. No work in classrooms during nap time (12 to 2).",
    ...stamp,
  },
  {
    id: "site-13",
    customerId: "cust-8",
    name: "Alcovy campus",
    address: "15 Alcovy Rd, Covington, GA 30014",
    accessNotes: "Sign in at the front desk.",
    ...stamp,
  },
];

const unassigned = {
  assignedTechId: null,
  scheduledStart: null,
  scheduledEnd: null,
  startedAt: null,
  completedAt: null,
  notes: null,
  laborHours: null,
};

/** Seed jobs before tracking fields; Business Services tracking is added per job below. */
type SeedJob = Omit<Job, keyof typeof JOB_TRACKING_DEFAULTS>;
const SEED_JOB_LIST: SeedJob[] = [
  // ---- New: waiting in the dispatch queue (only these two; tests empty the queue) ----
  {
    id: "job-1",
    jobNumber: null, // set below from the created date
    customerId: "cust-1",
    siteId: "site-1",
    description: "Replace failed exam-room lighting ballasts (3 fixtures)",
    jobType: "Lighting",
    priority: "Normal",
    status: "New",
    ...unassigned,
    ...stamp,
  },
  {
    id: "job-6",
    jobNumber: null, // set below from the created date
    customerId: "cust-3",
    siteId: "site-4",
    description: "Add 30A circuit for new air compressor",
    jobType: "Install/new circuit",
    priority: "Normal",
    status: "New",
    ...unassigned,
    ...stamp,
  },

  // ---- Today ----
  {
    id: "job-2",
    jobNumber: null, // set below from the created date
    customerId: "cust-2",
    siteId: "site-2",
    description: "Panel inspection and breaker replacement, unit 204",
    jobType: "Panel/breaker",
    priority: "High",
    status: "Scheduled",
    assignedTechId: "local-tech-1",
    scheduledStart: at(0, 9),
    scheduledEnd: at(0, 11),
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-3",
    jobNumber: null, // set below from the created date
    customerId: "cust-3",
    siteId: "site-4",
    description: "Install dock door receptacles (4)",
    jobType: "Install/new circuit",
    priority: "Normal",
    status: "InProgress",
    assignedTechId: "local-tech-2",
    scheduledStart: at(0, 8),
    scheduledEnd: at(0, 12),
    startedAt: at(0, 8),
    completedAt: null,
    notes: "Materials on truck.",
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-7",
    jobNumber: null, // set below from the created date
    customerId: "cust-7",
    siteId: "site-11",
    description: "Walk-in cooler lost power: tripped 40A breaker, burned lug",
    jobType: "Emergency",
    priority: "Emergency",
    status: "Complete",
    assignedTechId: "local-tech-3",
    scheduledStart: at(0, 7),
    scheduledEnd: at(0, 9),
    startedAt: at(0, 7),
    completedAt: at(0, 9),
    notes:
      "Replaced the breaker and the burned lug, torqued all connections. Cooler running before opening.",
    laborHours: 2,
    // Sent from the ECI1 phone app (synthetic): materials used, notes and a receipt below.
    materials: [
      { name: "40A 2-pole breaker", qty: 1, unit: "ea" },
      { name: "Mechanical lug", qty: 2, unit: "ea" },
    ],
    materialsAt: at(0, 9),
    ...stamp,
  },
  {
    id: "job-8",
    jobNumber: null, // set below from the created date
    customerId: "cust-4",
    siteId: "site-6",
    description: "Breakers trip on the pharmacy floor every morning",
    jobType: "Troubleshoot",
    priority: "High",
    status: "Scheduled",
    assignedTechId: "local-tech-3",
    scheduledStart: at(0, 10),
    scheduledEnd: at(0, 12),
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },

  // ---- Still in progress from an earlier day ----
  {
    id: "job-9",
    jobNumber: null, // set below from the created date
    customerId: "cust-6",
    siteId: "site-9",
    description: "Replace 12 corridor wall packs with LED, add photocell",
    jobType: "Lighting",
    priority: "Normal",
    status: "InProgress",
    assignedTechId: "local-tech-1",
    scheduledStart: at(workday(-1), 13),
    scheduledEnd: at(workday(-1), 17),
    startedAt: at(workday(-1), 13),
    completedAt: null,
    notes: "8 of 12 fixtures done. Remaining 4 need a lift; booked for later this week.",
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-10",
    jobNumber: null, // set below from the created date
    customerId: "cust-3",
    siteId: "site-4",
    description: "Warehouse dock lights flicker: find the loose neutral",
    jobType: "Troubleshoot",
    priority: "High",
    status: "InProgress",
    assignedTechId: "local-tech-3",
    scheduledStart: at(workday(-1), 9),
    scheduledEnd: at(workday(-1), 12),
    startedAt: at(workday(-1), 9),
    completedAt: null,
    notes:
      "Loose neutral in the junction box at column 14. Damaged conduit section to replace; part arrives tomorrow.",
    laborHours: null,
    ...stamp,
  },

  // ---- Upcoming ----
  {
    id: "job-11",
    jobNumber: null, // set below from the created date
    customerId: "cust-5",
    siteId: "site-7",
    description: "Annual infrared scan of main switchgear and panels",
    jobType: "Inspection",
    priority: "Normal",
    status: "Scheduled",
    assignedTechId: "local-tech-1",
    scheduledStart: at(workday(1), 8),
    scheduledEnd: at(workday(1), 12),
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-12",
    jobNumber: null, // set below from the created date
    customerId: "cust-7",
    siteId: "site-11",
    description: "Replace kitchen hood light fixtures, add GFCI receptacles at the prep line",
    jobType: "Lighting",
    priority: "Normal",
    status: "Scheduled",
    assignedTechId: "local-tech-2",
    scheduledStart: at(workday(1), 7),
    scheduledEnd: at(workday(1), 9),
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-13",
    jobNumber: null, // set below from the created date
    customerId: "cust-8",
    siteId: "site-12",
    description: "Classroom 4 receptacles dead: trace and repair the circuit",
    jobType: "Service call",
    priority: "Low",
    status: "Scheduled",
    assignedTechId: "local-tech-3",
    scheduledStart: at(workday(1), 14),
    scheduledEnd: at(workday(1), 15.5),
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-14",
    jobNumber: null, // set below from the created date
    customerId: "cust-2",
    siteId: "site-5",
    description: "Install GFCI protection on pool equipment room circuits",
    jobType: "Install/new circuit",
    priority: "High",
    status: "Scheduled",
    assignedTechId: "local-tech-1",
    scheduledStart: at(workday(2), 9),
    scheduledEnd: at(workday(2), 12),
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-15",
    jobNumber: null, // set below from the created date
    customerId: "cust-6",
    siteId: "site-10",
    description: "Install transfer switch and inlet for a portable generator at the office",
    jobType: "Generator",
    priority: "Normal",
    status: "Scheduled",
    assignedTechId: "local-tech-2",
    scheduledStart: at(workday(2), 10),
    scheduledEnd: at(workday(2), 12),
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-16",
    jobNumber: null, // set below from the created date
    customerId: "cust-8",
    siteId: "site-13",
    description: "Quarterly load test, 2 standby generators",
    jobType: "Generator",
    priority: "Low",
    status: "Scheduled",
    assignedTechId: "local-tech-3",
    scheduledStart: at(workday(3), 8),
    scheduledEnd: at(workday(3), 11),
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-17",
    jobNumber: null, // set below from the created date
    customerId: "cust-1",
    siteId: "site-1",
    description: "Run dedicated 20A circuit for new panoramic X-ray unit",
    jobType: "Install/new circuit",
    priority: "Normal",
    status: "Scheduled",
    assignedTechId: "local-tech-2",
    scheduledStart: at(workday(3), 13),
    scheduledEnd: at(workday(3), 16),
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },

  // ---- Finished, waiting to be invoiced ----
  {
    id: "job-4",
    jobNumber: null, // set below from the created date
    customerId: "cust-2",
    siteId: "site-3",
    description: "Emergency: hallway lights out, 3rd floor",
    jobType: "Emergency",
    priority: "Emergency",
    status: "Complete",
    assignedTechId: "local-tech-1",
    scheduledStart: at(-1, 13),
    scheduledEnd: at(-1, 15),
    startedAt: at(-1, 13),
    completedAt: at(-1, 15),
    notes: "Replaced tripped breaker, tested all fixtures.",
    laborHours: 2,
    ...stamp,
  },
  {
    id: "job-18",
    jobNumber: null, // set below from the created date
    customerId: "cust-5",
    siteId: "site-8",
    description: "No power to fellowship hall kitchen outlets",
    jobType: "Service call",
    priority: "High",
    status: "Complete",
    assignedTechId: "local-tech-2",
    scheduledStart: at(workday(-2), 8),
    scheduledEnd: at(workday(-2), 10),
    startedAt: at(workday(-2), 8),
    completedAt: at(workday(-2), 9.5),
    notes:
      "Failed receptacle had tripped the GFCI upstream. Replaced it and tested every kitchen circuit.",
    laborHours: 1.5,
    ...stamp,
  },

  // ---- Invoiced ----
  {
    id: "job-5",
    jobNumber: null, // set below from the created date
    customerId: "cust-1",
    siteId: "site-1",
    description: "Annual electrical safety inspection",
    jobType: "Inspection",
    priority: "Low",
    status: "Invoiced",
    assignedTechId: "local-tech-3",
    scheduledStart: at(-3, 9),
    scheduledEnd: at(-3, 12),
    startedAt: at(-3, 9),
    completedAt: at(-3, 12),
    notes: null,
    laborHours: 3,
    ...stamp,
  },
  {
    id: "job-19",
    jobNumber: null, // set below from the created date
    customerId: "cust-4",
    siteId: "site-6",
    description: "Exterior sign dark at night: replace timer and photocell",
    jobType: "Lighting",
    priority: "Normal",
    status: "Invoiced",
    assignedTechId: "local-tech-2",
    scheduledStart: at(workday(-3), 15),
    scheduledEnd: at(workday(-3), 17),
    startedAt: at(workday(-3), 15),
    completedAt: at(workday(-3), 16.5),
    notes: "Timer contacts burned. Installed new astronomic timer and photocell.",
    laborHours: 1.5,
    ...stamp,
  },

  // ---- A multi-visit job (docs/VISITS.md): its visits are in SEED_VISITS below ----
  {
    id: "job-20",
    jobNumber: null, // set below from the created date
    customerId: "cust-6",
    siteId: "site-9",
    description: "Replace parking lot pole lights (three visits)",
    jobType: "Lighting",
    priority: "Normal",
    status: "Scheduled",
    // The next open visit (visit 2), kept in step by src/data/visits.ts.
    assignedTechId: "local-tech-2",
    scheduledStart: at(workday(1), 13),
    scheduledEnd: at(workday(1), 16),
    startedAt: at(workday(-1), 8),
    completedAt: null,
    notes: "Visit 1: took down the old heads on poles 1 to 4 and checked the feeds.",
    laborHours: null,
    visitTechIds: ["local-tech-1", "local-tech-2"],
    ...stamp,
  },
];

/** Business Services tracking on a few jobs (two came from won opportunities). */
const SEED_TRACKING: Record<string, Partial<Job>> = {
  "job-9": {
    opportunityId: "opp-11",
    workType: "LowVoltage",
    health: "Watch",
    startDate: at(workday(-1), 8).slice(0, 10),
    endDate: at(workday(3), 8).slice(0, 10),
    poReceived: true,
    materialOrdered: true,
    materialDelivered: true,
    liftConnex: false,
  },
  "job-14": {
    opportunityId: "opp-12",
    workType: "HighVoltage",
    health: "OnTrack",
    startDate: at(workday(2), 8).slice(0, 10),
    endDate: at(workday(2), 8).slice(0, 10),
    poReceived: true,
    materialOrdered: true,
  },
  "job-10": {
    workType: "Service",
    health: "Behind",
    startDate: at(workday(-3), 8).slice(0, 10),
    endDate: at(workday(-1), 8).slice(0, 10),
    poReceived: true,
    materialOrdered: true,
  },
  "job-5": { workType: "Service", serviceReportApproved: true, completionPhotosOnFile: true },
};

/**
 * Give each job a believable "created" time so the Jobs list (newest first) reads naturally:
 * calls still waiting were taken this morning, everything else was booked a few days ahead.
 */
export const SEED_JOBS: Job[] = SEED_JOB_LIST.map((j, i) => {
  const created = j.scheduledStart
    ? new Date(new Date(j.scheduledStart).getTime() - 3 * 86_400_000)
    : new Date(at(0, 7));
  created.setMinutes(created.getMinutes() + i * 7);
  const createdAt = created.toISOString();
  const n = Number(j.id.replace("job-", ""));
  return {
    ...JOB_TRACKING_DEFAULTS,
    ...j,
    ...SEED_TRACKING[j.id],
    jobNumber: fixedNumber("J", created, n),
    createdAt,
    updatedAt: j.completedAt ?? j.startedAt ?? createdAt,
  };
});

/** Same line items the one-click invoice builds (src/data/billing.ts): labor at $95/h plus an $85 service call. */
function lineItems(laborHours: number): InvoiceLineItem[] {
  return [
    { description: "Labor", quantity: laborHours, unitPrice: 95, total: laborHours * 95 },
    { description: "Service call", quantity: 1, unitPrice: 85, total: 85 },
  ];
}

function seedInvoice(id: string, job: Job, n: number, status: Invoice["status"]): Invoice {
  const items = lineItems(job.laborHours ?? 2);
  const created = job.completedAt ?? stamp.createdAt;
  return {
    id,
    invoiceNumber: fixedNumber("INV", new Date(created), n),
    jobId: job.id,
    customerId: job.customerId,
    lineItems: items,
    total: items.reduce((sum, l) => sum + l.total, 0),
    status,
    pdfPath: null,
    createdAt: created,
    updatedAt: created,
  };
}

const jobById = (id: string) => SEED_JOBS.find((j) => j.id === id)!;

export const SEED_INVOICES: Invoice[] = [
  seedInvoice("inv-1", jobById("job-5"), 4127, "Paid"),
  seedInvoice("inv-2", jobById("job-19"), 4583, "Sent"),
];

/** The seeded job number for `job-<n>` (tests use this instead of hard-coding numbers). */
export const seedJobNumber = (id: string): string => SEED_JOBS.find((j) => j.id === id)!.jobNumber!;

/** Fake sales reps for the demo (the real names come from the owner's import). */
export const SEED_REPS = ["Rita Reyes", "Dan Kemp"];

const day = (offset: number) => at(offset, 8).slice(0, 10);
const opp = (
  id: string,
  o: Partial<Opportunity> & Pick<Opportunity, "name" | "stage" | "type" | "customerContract">,
): Opportunity => ({
  id,
  customerId: null,
  customerContact: null,
  invoiceContact: null,
  eciQuoteNumber: null,
  workOrderNumber: null,
  customerPoNumber: null,
  quoteDue: null,
  expectedClose: null,
  siteVisitDate: null,
  salesRep: SEED_REPS[0]!,
  priority: null,
  probability: null,
  hoursQuoted: null,
  quotedAmount: null,
  forecastAmount: null,
  jobCost: null,
  invoicedAmount: null,
  quotedMargin: null,
  completedMargin: null,
  notes: null,
  nextStep: null,
  nextStepDue: null,
  nextStepRemind: false,
  closedAt: null,
  jobId: null,
  importKey: null,
  ...stamp,
  ...o,
});

/** Sample pipeline across every stage, contract and type. All names are made up. */
export const SEED_OPPORTUNITIES: Opportunity[] = [
  opp("opp-1", {
    name: "Library branch parking lot lighting retrofit",
    stage: "Prospect",
    type: "HighVoltage",
    customerContract: "DeKalbGov",
    customerContact: "Morgan Lee",
    expectedClose: day(30),
    nextStep: "Call facilities to set a walk-through",
    nextStepDue: day(2),
    nextStepRemind: true,
  }),
  opp("opp-2", {
    name: "Middle school intercom replacement",
    stage: "Assessment",
    type: "LowVoltage",
    customerContract: "GwinnettSchools",
    customerContact: "Jamie Park",
    salesRep: SEED_REPS[1]!,
    expectedClose: day(21),
    nextStep: "Book site visit",
    nextStepDue: day(1),
  }),
  opp("opp-3", {
    name: "Fire station generator transfer switch",
    stage: "Assessment",
    type: "HighVoltage",
    customerContract: "RockdaleGov",
    siteVisitDate: day(3),
    expectedClose: day(25),
    nextStep: "Site visit with the battalion chief",
    nextStepDue: day(3),
  }),
  opp("opp-4", {
    name: "Elementary school gym LED high-bays",
    stage: "ProposalBidding",
    type: "HighVoltage",
    customerContract: "BarrowSchools",
    eciQuoteNumber: "Q-24-0412",
    quoteDue: day(-2),
    expectedClose: day(14),
    hoursQuoted: 64,
    quotedAmount: 38500,
    forecastAmount: 38500,
    probability: 50,
    nextStep: "Finish fixture count and send bid",
    nextStepDue: day(-1),
    nextStepRemind: true,
  }),
  opp("opp-5", {
    name: "Admin building access control, 12 doors",
    stage: "ProposalSent",
    type: "LowVoltage",
    customerContract: "DecaturCitySchools",
    eciQuoteNumber: "Q-24-0398",
    quoteDue: day(-6),
    expectedClose: day(-3),
    quotedAmount: 46200,
    forecastAmount: 46200,
    probability: 60,
    salesRep: SEED_REPS[1]!,
  }),
  opp("opp-6", {
    name: "Courthouse annex panel upgrade",
    stage: "CustomerReview",
    type: "HighVoltage",
    customerContract: "DeKalbGov",
    eciQuoteNumber: "Q-24-0377",
    expectedClose: day(7),
    quotedAmount: 72900,
    forecastAmount: 72900,
    probability: 70,
    nextStep: "Answer the engineer's questions on the one-line",
    nextStepDue: day(4),
  }),
  opp("opp-7", {
    name: "High school camera system expansion",
    stage: "CustomerFollowUp",
    type: "LowVoltage",
    customerContract: "DeKalbSchools",
    eciQuoteNumber: "Q-24-0350",
    expectedClose: day(-10),
    quotedAmount: 28800,
    forecastAmount: 20000,
    probability: 40,
    salesRep: SEED_REPS[1]!,
  }),
  opp("opp-8", {
    name: "Restaurant kitchen circuits and hood lights",
    stage: "CustomerFollowUp",
    type: "Service",
    customerContract: "NonContract",
    customerId: "cust-7",
    customerContact: "Jordan (kitchen manager)",
    eciQuoteNumber: "Q-24-0421",
    expectedClose: day(5),
    quotedAmount: 3400,
    nextStep: "Follow up on the quote",
    nextStepDue: day(0),
    nextStepRemind: true,
  }),
  opp("opp-9", {
    name: "Park pavilion receptacles",
    stage: "ClosedLost",
    type: "Service",
    customerContract: "RockdaleGov",
    quotedAmount: 5200,
    closedAt: at(-20, 9),
  }),
  opp("opp-10", {
    name: "Bus depot fiber run",
    stage: "NoBid",
    type: "LowVoltage",
    customerContract: "GwinnettSchools",
    closedAt: at(-15, 9),
    notes: "Outside our fiber scope this year.",
  }),
  opp("opp-11", {
    name: "Self storage corridor LED wall packs",
    stage: "ClosedWon",
    type: "LowVoltage",
    customerContract: "NonContract",
    customerId: "cust-6",
    eciQuoteNumber: "Q-24-0333",
    customerPoNumber: "PO-77812",
    workOrderNumber: "WO-5521",
    quotedAmount: 9800,
    jobCost: 6100,
    quotedMargin: 37.8,
    closedAt: at(-6, 9),
    jobId: "job-9",
  }),
  opp("opp-12", {
    name: "Pool equipment room GFCI protection",
    stage: "ClosedWon",
    type: "HighVoltage",
    customerContract: "NonContract",
    customerId: "cust-2",
    eciQuoteNumber: "Q-24-0340",
    customerPoNumber: "PO-4410-22",
    quotedAmount: 4600,
    closedAt: at(-4, 9),
    jobId: "job-14",
    salesRep: SEED_REPS[1]!,
  }),
];

/** Synthetic ECI1 tech-module rows (notes and receipts sent from the phone) for the demo. */
export const SEED_TECH_NOTES: import("../types").TechNote[] = [
  {
    ...stamp,
    id: "tnote-1",
    jobId: "job-7",
    assignedTechId: "local-tech-3",
    text: "Lug was heat damaged; replaced both on that leg.",
    by: "Tess Tech",
    at: at(0, 8),
    actionId: "seed-note-1",
  },
];
export const SEED_TECH_RECEIPTS: import("../types").TechReceipt[] = [
  {
    ...stamp,
    id: "trcpt-1",
    jobId: "job-7",
    assignedTechId: "local-tech-3",
    kind: "materials",
    vendor: "Synthetic Electric Supply",
    date: at(0, 8).slice(0, 10),
    amount: 86.4,
    paidWith: "personal",
    note: "Bought the breaker on the way",
    storagePath: null,
    at: at(0, 8),
    actionId: "seed-receipt-1",
    reviewStatus: "Pending",
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
  },
];

/** Visits of the multi-visit demo job (job-20): one done, two still to come, two techs. */
const visitStamp = { createdAt: at(-7, 9), updatedAt: at(-1, 9) };
const job20Techs = ["local-tech-1", "local-tech-2"];
export const SEED_VISITS: Visit[] = [
  {
    id: "visit-20-1",
    jobId: "job-20",
    number: 1,
    scheduledStart: at(workday(-1), 8),
    scheduledEnd: at(workday(-1), 12),
    assignedTechId: "local-tech-1",
    jobTechIds: job20Techs,
    status: "Done",
    startedAt: at(workday(-1), 8),
    completedAt: at(workday(-1), 11.5),
    holdReason: null,
    note: "Old heads off poles 1 to 4. New LED heads arrive this week.",
    ...visitStamp,
  },
  {
    id: "visit-20-2",
    jobId: "job-20",
    number: 2,
    scheduledStart: at(workday(1), 13),
    scheduledEnd: at(workday(1), 16),
    assignedTechId: "local-tech-2",
    jobTechIds: job20Techs,
    status: "Scheduled",
    startedAt: null,
    completedAt: null,
    holdReason: null,
    note: null,
    ...visitStamp,
  },
  {
    id: "visit-20-3",
    jobId: "job-20",
    number: 3,
    scheduledStart: at(workday(3), 8),
    scheduledEnd: at(workday(3), 12),
    assignedTechId: "local-tech-1",
    jobTechIds: job20Techs,
    status: "Scheduled",
    startedAt: null,
    completedAt: null,
    holdReason: null,
    note: null,
    ...visitStamp,
  },
];
