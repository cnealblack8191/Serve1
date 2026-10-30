import type { Customer, Job, Role, Site, User } from "../types";

/**
 * Demo data for the local (no-AWS) mode. Fake names only (SPEC.md section 4).
 * The "demo" lane replaces this with the full realistic set (TASKS.md item 1).
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
const at = (dayOffset: number, hour: number) => {
  const d = new Date(t0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
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
];

export const SEED_JOBS: Job[] = [
  {
    id: "job-1",
    jobNumber: "J-1001",
    customerId: "cust-1",
    siteId: "site-1",
    description: "Replace failed exam-room lighting ballast",
    jobType: "Service call",
    priority: "Normal",
    status: "New",
    assignedTechId: null,
    scheduledStart: null,
    scheduledEnd: null,
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },
  {
    id: "job-2",
    jobNumber: "J-1002",
    customerId: "cust-2",
    siteId: "site-2",
    description: "Panel inspection and breaker replacement, unit 204",
    jobType: "Repair",
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
    jobNumber: "J-1003",
    customerId: "cust-3",
    siteId: "site-4",
    description: "Install dock door receptacles (4)",
    jobType: "Install",
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
    id: "job-4",
    jobNumber: "J-1004",
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
    id: "job-5",
    jobNumber: "J-1005",
    customerId: "cust-1",
    siteId: "site-1",
    description: "Annual safety inspection",
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
    id: "job-6",
    jobNumber: "J-1006",
    customerId: "cust-3",
    siteId: "site-4",
    description: "Add circuit for new compressor",
    jobType: "Install",
    priority: "Normal",
    status: "New",
    assignedTechId: null,
    scheduledStart: null,
    scheduledEnd: null,
    startedAt: null,
    completedAt: null,
    notes: null,
    laborHours: null,
    ...stamp,
  },
];
