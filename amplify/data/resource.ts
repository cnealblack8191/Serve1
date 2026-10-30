import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Pilot tables (SPEC.md section 5, marked ★): users, customers, sites, jobs,
 * attachments, signatures, invoices. Non-pilot tables (assets, quotes,
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
 * Known limit (pilot): AppSync cannot check, inside the Attachment or Signature
 * create rule, that the referenced job is really assigned to the caller; that
 * cross-model check lives in src/data (addJobPhoto / addJobSignature). Moving it
 * server-side needs a custom mutation with a function handler (follow-up).
 */
const office = ["Admin", "Office"];
const readers = ["Admin", "Office", "Owner"];

const schema = a.schema({
  JobStatus: a.enum(["New", "Scheduled", "InProgress", "Complete", "Invoiced"]),
  JobPriority: a.enum(["Low", "Normal", "High", "Emergency"]),
  InvoiceStatus: a.enum(["Draft", "Sent", "Paid"]),
  UserRole: a.enum(["Admin", "Office", "Tech", "Owner"]),
  AttachmentType: a.enum(["Photo", "Document", "Signature", "InvoicePdf"]),

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
      // Cognito identity of the assigned tech (owner-style rule below).
      assignedTechId: a.string(),
      assignedTech: a.belongsTo("User", "assignedTechId"),
      scheduledStart: a.datetime(),
      scheduledEnd: a.datetime(),
      startedAt: a.datetime(),
      completedAt: a.datetime(),
      notes: a.string(),
      laborHours: a.float(),
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
    .authorization((allow) => [
      allow.groups(office).to(["create", "read", "update", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
