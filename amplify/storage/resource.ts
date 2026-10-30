import { defineStorage } from "@aws-amplify/backend";

// Private bucket (SPEC.md section 7.7): files are reached only through
// short-lived signed links that src/data/files.ts asks for.
export const storage = defineStorage({
  name: "serv1Files",
  access: (allow) => ({
    "jobs/*": [
      allow.groups(["Admin", "Office"]).to(["read", "write", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
      allow.groups(["Tech"]).to(["read", "write"]),
    ],
    "invoices/*": [
      allow.groups(["Admin", "Office"]).to(["read", "write", "delete"]),
      allow.groups(["Owner"]).to(["read"]),
    ],
  }),
});
