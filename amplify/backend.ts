import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";

// Serv1 backend (SPEC.md sections 5, 6, 7). Deployed with
// `npx ampx sandbox --profile serv1-builder` from the Mac, never from code.
defineBackend({
  auth,
  data,
  storage,
});
