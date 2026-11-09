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
  VisitStatus: a.enum(["Scheduled", "EnRoute", "InProgress", "OnHold", "Done", "Cancelled"]),
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
          allow.ownersDefinedIn("visitTechIds").to(["read"]),
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
      // ECI1 tech module (docs/ECI1-BRIDGE.md). officeChangedAt moves only on office edits.
      holdNote: a.string(),
      officeChangedAt: a.datetime(),
      officeNote: a.string(),
      noSignatureReason: a.string(),
      noSignatureNote: a.string(),
      // [{ name, qty, unit }], replaced whole by the tech; materialsAt is the phone time of
      // the list saved, techStatusAt of the last tech status change (late sends are ignored).
      materials: a.json(),
      materialsAt: a.datetime(),
      techStatusAt: a.datetime(),
      // Multi-visit jobs (docs/VISITS.md): every tech with a visit on the job. Only the office
      // sets it (src/data/visits.ts keeps it in step with the Visit rows); those techs may read
      // the job and update its work fields, as the assigned tech may.
      visitTechIds: a
        .string()
        .array()
        .authorization((allow) => [
          allow.groups(office).to(["create", "read", "update"]),
          allow.groups(["Owner"]).to(["read"]),
          allow.ownerDefinedIn("assignedTechId").to(["read"]),
          allow.ownersDefinedIn("visitTechIds").to(["read"]),
        ]),
      attachments: a.hasMany("Attachment", "jobId"),
      signatures: a.hasMany("Signature", "jobId"),
      invoice: a.hasOne("Invoice", "jobId"),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
      // A tech sees and updates only jobs whose assignedTechId is their identity, or on which
      // they have a visit (visitTechIds).
      allow.ownerDefinedIn("assignedTechId").to(["read", "update"]),
      allow.ownersDefinedIn("visitTechIds").to(["read", "update"]),
    ]),

  // One trip to the site for a job (docs/VISITS.md). Additive: a job with no visits is one visit
  // built from its own schedule fields. The office plans visits; the visit's tech moves its
  // status; every tech on the job reads every visit (jobTechIds, copied from the job).
  Visit: a
    .model({
      jobId: a
        .id()
        .required()
        .authorization((allow) => [
          allow.groups(office).to(["create", "read", "update"]),
          allow.groups(["Owner"]).to(["read"]),
          allow.ownerDefinedIn("assignedTechId").to(["read"]),
          allow.ownersDefinedIn("jobTechIds").to(["read"]),
        ]),
      number: a
        .integer()
        .required()
        .authorization((allow) => [
          allow.groups(office).to(["create", "read", "update"]),
          allow.groups(["Owner"]).to(["read"]),
          allow.ownerDefinedIn("assignedTechId").to(["read"]),
          allow.ownersDefinedIn("jobTechIds").to(["read"]),
        ]),
      scheduledStart: a
        .datetime()
        .authorization((allow) => [
          allow.groups(office).to(["create", "read", "update"]),
          allow.groups(["Owner"]).to(["read"]),
          allow.ownerDefinedIn("assignedTechId").to(["read"]),
          allow.ownersDefinedIn("jobTechIds").to(["read"]),
        ]),
      scheduledEnd: a
        .datetime()
        .authorization((allow) => [
          allow.groups(office).to(["create", "read", "update"]),
          allow.groups(["Owner"]).to(["read"]),
          allow.ownerDefinedIn("assignedTechId").to(["read"]),
          allow.ownersDefinedIn("jobTechIds").to(["read"]),
        ]),
      // Field-level rule: only the office sets or changes who does the visit.
      assignedTechId: a
        .string()
        .authorization((allow) => [
          allow.groups(office).to(["create", "read", "update"]),
          allow.groups(["Owner"]).to(["read"]),
          allow.ownerDefinedIn("assignedTechId").to(["read"]),
          allow.ownersDefinedIn("jobTechIds").to(["read"]),
        ]),
      jobTechIds: a
        .string()
        .array()
        .authorization((allow) => [
          allow.groups(office).to(["create", "read", "update"]),
          allow.groups(["Owner"]).to(["read"]),
          allow.ownerDefinedIn("assignedTechId").to(["read"]),
          allow.ownersDefinedIn("jobTechIds").to(["read"]),
        ]),
      status: a.ref("VisitStatus").required(),
      startedAt: a.datetime(),
      completedAt: a.datetime(),
      holdReason: a.string(),
      note: a.string(),
    })
    .secondaryIndexes((index) => [index("jobId")])
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
      // The visit's own tech moves its status (the fields above stay office-only).
      allow.ownerDefinedIn("assignedTechId").to(["read", "update"]),
      allow.ownersDefinedIn("jobTechIds").to(["read"]),
    ]),

  Attachment: a
    .model({
      jobId: a.id().required(),
      // The job's visitTechIds when the row was added (docs/VISITS.md): read-only for them.
      jobTechIds: a.string().array(),
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
      // A tech sees and adds only rows carrying their own identity, and reads rows on jobs they
      // have a visit on.
      allow.ownerDefinedIn("assignedTechId").to(["create", "read"]),
      allow.ownersDefinedIn("jobTechIds").to(["read"]),
    ]),

  Signature: a
    .model({
      jobId: a.id().required(),
      // The job's visitTechIds when the row was added (docs/VISITS.md): read-only for them.
      jobTechIds: a.string().array(),
      job: a.belongsTo("Job", "jobId"),
      assignedTechId: a.string(),
      signerName: a.string().required(),
      storagePath: a.string().required(),
      signedAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
      // A tech sees and adds only rows carrying their own identity, and reads rows on jobs they
      // have a visit on.
      allow.ownerDefinedIn("assignedTechId").to(["create", "read"]),
      allow.ownersDefinedIn("jobTechIds").to(["read"]),
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

  // ECI1 tech module (docs/ECI1-BRIDGE.md). Written by the eci1-tech-bridge function for a
  // linked tech, on that tech's assigned job only; office reads and reviews.
  TechNote: a
    .model({
      jobId: a.id().required(),
      assignedTechId: a.string(),
      // The job's visitTechIds (docs/VISITS.md): other techs on the job read the note.
      jobTechIds: a.string().array(),
      text: a.string().required(),
      by: a.string(),
      at: a.datetime().required(),
      actionId: a.string(),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
      allow.ownerDefinedIn("assignedTechId").to(["read"]),
      allow.ownersDefinedIn("jobTechIds").to(["read"]),
    ]),

  // A receipt for office review: never paid or approved by the tech. "personal" means the tech
  // is owed the money back.
  TechReceipt: a
    .model({
      jobId: a.id().required(),
      assignedTechId: a.string(),
      kind: a.string().required(), // materials | other
      vendor: a.string(),
      date: a.date(),
      amount: a.float().required(),
      paidWith: a.string().required(), // company_card | personal
      note: a.string(),
      storagePath: a.string(),
      at: a.datetime().required(),
      actionId: a.string(),
      reviewStatus: a.string().required(), // Pending | Approved | Rejected
      reviewNote: a.string(),
      reviewedBy: a.string(),
      reviewedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
      allow.ownerDefinedIn("assignedTechId").to(["read"]),
    ]),

  // One row per tech change the bridge saved, keyed by the phone's actionId (the repeat check).
  TechAction: a
    .model({
      jobId: a.id().required(),
      route: a.string().required(),
      serv1UserId: a.string().required(),
      at: a.datetime().required(),
      result: a.string().required(), // applied | stale_ignored
    })
    .authorization((allow) => [allow.groups(["Admin"]).to(["read"])]),

  // Every bridge call, allowed or refused (design safeguard: the bridge's own audit rows).
  BridgeAudit: a
    .model({
      eciUserId: a.string(),
      serv1UserId: a.string(),
      route: a.string().required(),
      actionId: a.string(),
      jobId: a.string(),
      result: a.string().required(),
      at: a.datetime().required(),
    })
    .authorization((allow) => [allow.groups(["Admin"]).to(["read"])]),

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
