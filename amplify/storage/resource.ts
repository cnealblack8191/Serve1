import { defineStorage } from "@aws-amplify/backend";

/**
 * Private bucket (SPEC.md section 7.7): files are reached only through
 * short-lived signed links that src/data/files.ts asks for.
 *
 * Prefixes:
 *  - jobs/{jobId}/...                 office uploads; office read/write, owner read, techs none.
 *  - tech-files/{entity_id}/{jobId}/... a tech's own photos and signatures. {entity_id} is the
 *    caller's Cognito identity, so a tech can never read or write another tech's files.
 *  - invoices/{invoiceId}/...          invoice PDFs; office read/write, owner read.
 */
export const storage = defineStorage({
  name: "serv1Files",
  access: (allow) => ({
    "jobs/*": [
      allow.groups(["Admin", "Office"]).to(["read", "write", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
    ],
    "tech-files/{entity_id}/*": [
      allow.entity("identity").to(["read", "write"]),
      allow.groups(["Admin", "Office"]).to(["read", "write", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
    ],
    "invoices/*": [
      allow.groups(["Admin", "Office"]).to(["read", "write", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
    ],
  }),
});
