import { defineBackend } from "@aws-amplify/backend";
import { ManagedPolicy, PermissionsBoundary, PolicyStatement } from "aws-cdk-lib/aws-iam";

import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";

// Serv1 backend (SPEC.md sections 5, 6, 7). Deployed with
// `npx ampx sandbox --profile serv1-builder` from the Mac, never from code.
const backend = defineBackend({
  auth,
  data,
  storage,
});

/**
 * Permissions boundary (infra/serv1-builder/serv1-builder.yaml, policy
 * serv1-permissions-boundary). Every role this backend creates carries it, and
 * the CloudFormation execution role refuses to create a role without it, so no
 * deployment can mint a role that reaches EC2, RDS, the account or IAM users.
 * The owner's stack must exist before the first deploy (RUNBOOK.md step 3).
 */
PermissionsBoundary.of(backend.stack).apply(
  ManagedPolicy.fromManagedPolicyName(
    backend.stack,
    "Serv1PermissionsBoundary",
    "serv1-permissions-boundary",
  ),
);

/**
 * Techs' own files. A signed-in user who belongs to a Cognito group assumes
 * that group's IAM role, not the generic "authenticated" role, so the
 * `allow.entity("identity")` rule in storage/resource.ts never reaches a tech
 * (Codex review of PR #1). This policy gives the Tech group role read and write
 * on tech-files/<their own identity id>/* and nothing else. The identity id
 * here is the same value src/data uses as AuthUser.storageId.
 */
const techRole = backend.auth.resources.groups["Tech"]?.role;
const bucketArn = backend.storage.resources.bucket.bucketArn;
if (techRole) {
  techRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ["s3:GetObject", "s3:PutObject"],
      // IAM resolves the variable to the caller's identity-pool id at request time.
      resources: [bucketArn + "/tech-files/${cognito-identity.amazonaws.com:sub}/*"],
    }),
  );
}
