import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

import { spectrumCaller } from "../functions/spectrum/resource";

/**
 * Pilot tables (SPEC.md section 5, marked ★): users, customers, sites, jobs,
 * attachments, signatures, invoices. Phase 2 (owner-approved Serv1 plan, decision 95)
 * adds opportunities and job tracking fields. Non-pilot tables (assets, quotes,
 * time_entries) are added later, by decision.
 *
 * Access (SPEC.md section 2):
 *  - Admin: everything.
 *  - Office: customers, sites, jobs, attachments, signatures, invoices.
 *  - Owner: read everything; invoice approval is a later task.
 *  - Tech: only jobs assigned to them (ownerDefinedIn 'assignedTechId' holds the
 *    tech's Cognito identity). Attachments and signatures carry the same field,
 *    copied from the job when they are created, so a tech reads and creates only
 *    rows tagged with their own identity (never group-wide access).
 *
 * Reassignment: when a job's assignedTechId changes, src/data updates the
 * assignedTechId on its attachments and signatures so access follows the job.
 *
 * Phase 4 (Spectrum): customers, sites and jobs imported from Spectrum keep the Spectrum
 * company code and record numbers (match key: company code + job or work order number), and
 * "Remove test imports" deletes by company code. SpectrumCheck keeps the last connection tests
 * (Admin only). The `spectrum` query runs amplify/functions/spectrum on the server.
 *
 * Known limit (pilot): AppSync cannot check, inside the Attachment or Signature
 * create rule, that the referenced job is really assigned to the caller; that
 * cross-model check lives in src/data (addJobPhoto / addJobSignature). Moving it
 * server-side needs a custom mutation with a function handler (follow-up).
 */
const office = ["Admin", "Office"];
const readers = ["Admin", "Office", "Owner"];

const schema = a.schema({
  JobStatus: a.enum([
    "New",
    "Scheduled",
    "EnRoute",
    "InProgress",
    "OnHold",
    "Complete",
    "Reviewed",
    "Invoiced",
    "Paid",
    "Cancelled",
  ]),
  JobPriority: a.enum(["Low", "Normal", "High", "Emergency"]),
  InvoiceStatus: a.enum(["Draft", "Sent", "Paid"]),
  UserRole: a.enum(["Admin", "Office", "Tech", "Owner"]),
  AttachmentType: a.enum(["Photo", "Document", "Signature", "InvoicePdf"]),
  WorkType: a.enum(["HighVoltage", "LowVoltage", "Service"]),
  JobHealth: a.enum(["OnTrack", "Watch", "Behind"]),
  OpportunityStage: a.enum([
    "Prospect",
    "Assessment",
    "ProposalBidding",
    "ProposalSent",
    "CustomerReview",
    "CustomerFollowUp",
    "ClosedWon",
    "ClosedLost",
    "NoBid",
  ]),
  CustomerContract: a.enum([
    "DeKalbGov",
    "GwinnettSchools",
    "RockdaleGov",
    "BarrowSchools",
    "DecaturCitySchools",
    "DeKalbSchools",
    "NonContract",
  ]),

  User: a
    .model({
      name: a.string().required(),
      email: a.email().required(),
      role: a.ref("UserRole").required(),
      phone: a.phone(),
      active: a.boolean().required().default(true),
      // Cognito identity (sub::username) so a tech's jobs can be matched to a login.
      identityId: a.string(),
      jobs: a.hasMany("Job", "assignedTechId"),
    })
    .authorization((allow) => [
      allow.groups(["Admin"]).to(["create", "read", "update", "delete"]),
      allow.groups(["Office", "Owner", "Tech"]).to(["read"]),
    ]),

  Customer: a
    .model({
      name: a.string().required(),
      billingAddress: a.string(),
      phone: a.phone(),
      email: a.email(),
      notes: a.string(),
      // Spectrum import (Phase 4): company code and Spectrum customer code.
      spectrumCompanyCode: a.string(),
      spectrumCustomerCode: a.string(),
      sites: a.hasMany("Site", "customerId"),
      jobs: a.hasMany("Job", "customerId"),
      invoices: a.hasMany("Invoice", "customerId"),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner", "Tech"]).to(["read"]),
    ]),

  Site: a
    .model({
      customerId: a.id().required(),
      customer: a.belongsTo("Customer", "customerId"),
      name: a.string(),
      address: a.string().required(),
      accessNotes: a.string(),
      spectrumCompanyCode: a.string(),
      jobs: a.hasMany("Job", "siteId"),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner", "Tech"]).to(["read"]),
    ]),

  Job: a
    .model({
      jobNumber: a.string(),
      customerId: a.id().required(),
      customer: a.belongsTo("Customer", "customerId"),
      siteId: a.id(),
      site: a.belongsTo("Site", "siteId"),
      description: a.string().required(),
      jobType: a.string(),
      priority: a.ref("JobPriority").required(),
      status: a.ref("JobStatus").required(),
      // Cognito identity of the assigned tech (owner-style rule below). Field-level
      // rule: only office roles may set or change it; the tech reads it. Without this,
      // the owner-style update rule would let a tech hand the job to someone else.
      assignedTechId: a
        .string()
        .authorization((allow) => [
          allow.groups(office).to(["create", "read", "update"]),
          allow.groups(["Owner"]).to(["read"]),
          allow.ownerDefinedIn("assignedTechId").to(["read"]),
        ]),
      assignedTech: a.belongsTo("User", "assignedTechId"),
      scheduledStart: a.datetime(),
      scheduledEnd: a.datetime(),
      startedAt: a.datetime(),
      completedAt: a.datetime(),
      notes: a.string(),
      laborHours: a.float(),
      // Phase 3: on-hold or cancel reason, and the office review.
      holdReason: a.string(),
      reviewNote: a.string(),
      reviewedAt: a.datetime(),
      // Business Services tracking (Phase 2). No money here: techs read their jobs.
      opportunityId: a.id(),
      workType: a.ref("WorkType"),
      health: a.ref("JobHealth"),
      startDate: a.date(),
      endDate: a.date(),
      poReceived: a.boolean().default(false),
      materialOrdered: a.boolean().default(false),
      materialDelivered: a.boolean().default(false),
      liftConnex: a.boolean().default(false),
      serviceReportApproved: a.boolean().default(false),
      completionPhotosOnFile: a.boolean().default(false),
      // Spectrum import (Phase 4). No amounts: Spectrum records carry none.
      spectrumCompanyCode: a.string(),
      spectrumJobNumber: a.string(),
      spectrumWorkOrderNumber: a.string(),
      attachments: a.hasMany("Attachment", "jobId"),
      signatures: a.hasMany("Signature", "jobId"),
      invoice: a.hasOne("Invoice", "jobId"),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
      // A tech sees and updates only jobs whose assignedTechId is their identity.
      allow.ownerDefinedIn("assignedTechId").to(["read", "update"]),
    ]),

  Attachment: a
    .model({
      jobId: a.id().required(),
      job: a.belongsTo("Job", "jobId"),
      // Identity of the job's assigned tech at creation time (owner-style rule below).
      assignedTechId: a.string(),
      // S3 key under jobs/{jobId}/...; never a public URL.
      storagePath: a.string().required(),
      type: a.ref("AttachmentType").required(),
      caption: a.string(),
      uploadedBy: a.string(),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
      // A tech sees and adds only rows carrying their own identity.
      allow.ownerDefinedIn("assignedTechId").to(["create", "read"]),
    ]),

  Signature: a
    .model({
      jobId: a.id().required(),
      job: a.belongsTo("Job", "jobId"),
      assignedTechId: a.string(),
      signerName: a.string().required(),
      storagePath: a.string().required(),
      signedAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
      // A tech sees and adds only rows carrying their own identity.
      allow.ownerDefinedIn("assignedTechId").to(["create", "read"]),
    ]),

  // One invoice per job, guaranteed by the database: jobId is the primary key
  // (owner decision 2026-10-30, "add the unique index"). A second create for the
  // same job fails at DynamoDB, so src/data falls back to reading the existing one.
  Invoice: a
    .model({
      invoiceNumber: a.string(),
      jobId: a.id().required(),
      job: a.belongsTo("Job", "jobId"),
      customerId: a.id().required(),
      customer: a.belongsTo("Customer", "customerId"),
      // Line items as JSON: [{ description, quantity, unitPrice, total }]
      lineItems: a.json().required(),
      total: a.float().required(),
      // Field-level rule: owners may change the status (approve, mark paid) and
      // nothing else; office keeps full access. Field rules replace the model
      // rules for this one field, so office is repeated here.
      status: a
        .ref("InvoiceStatus")
        .required()
        .authorization((allow) => [
          allow.groups(office).to(["create", "read", "update"]),
          allow.groups(["Owner"]).to(["read", "update"]),
        ]),
      pdfPath: a.string(),
    })
    .identifier(["jobId"])
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
    ]),

  // Sales opportunity (replaces the Sales and Service Pipeline Smartsheets). Office edits,
  // owner reads; techs have no access, so quote amounts and margins never reach a tech.
  // A won opportunity links to the job it became (jobId); the job links back (opportunityId).
  Opportunity: a
    .model({
      name: a.string().required(),
      customerId: a.id(),
      customerContract: a.ref("CustomerContract").required(),
      type: a.ref("WorkType").required(),
      stage: a.ref("OpportunityStage").required(),
      customerContact: a.string(),
      invoiceContact: a.string(),
      eciQuoteNumber: a.string(),
      workOrderNumber: a.string(),
      customerPoNumber: a.string(),
      quoteDue: a.date(),
      expectedClose: a.date(),
      siteVisitDate: a.date(),
      salesRep: a.string(),
      priority: a.string(),
      probability: a.float(),
      hoursQuoted: a.float(),
      quotedAmount: a.float(),
      forecastAmount: a.float(),
      jobCost: a.float(),
      invoicedAmount: a.float(),
      quotedMargin: a.float(),
      completedMargin: a.float(),
      notes: a.string(),
      nextStep: a.string(),
      nextStepDue: a.date(),
      nextStepRemind: a.boolean().default(false),
      closedAt: a.datetime(),
      jobId: a.id(),
      importKey: a.string(),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
    ]),

  // Last Spectrum connection tests (the connector stores none). Admin only. Never credentials.
  SpectrumCheck: a
    .model({
      result: a.string().required(), // "connected" | "failed"
      reason: a.string(),
      message: a.string(),
      durationMs: a.integer(),
      checkedBy: a.string().required(),
    })
    .authorization((allow) => [allow.groups(["Admin"]).to(["create", "read", "delete"])]),

  // Server-side Spectrum call (amplify/functions/spectrum). Office may read jobs and work
  // orders; the function itself allows credentials.* to Admin only.
  spectrum: a
    .query()
    .arguments({ operation: a.string().required(), params: a.json() })
    .returns(a.json())
    .authorization((allow) => [allow.groups(office)])
    .handler(a.handler.function(spectrumCaller)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
