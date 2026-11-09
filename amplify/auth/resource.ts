import { defineAuth } from "@aws-amplify/backend";

// Email + password login (the demo pilot signs in by username instead: amplify/backend.ts). Roles are Cognito groups (SPEC.md section 7.6).
// Accounts are created by an administrator; there is no self sign-up screen.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ["Admin", "Office", "Tech", "Owner"],
  userAttributes: {
    preferredUsername: { mutable: true, required: false },
    phoneNumber: { mutable: true, required: false },
  },
});
