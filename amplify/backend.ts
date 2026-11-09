import { defineBackend } from "@aws-amplify/backend";
import { Duration } from "aws-cdk-lib";
import { ReadWriteType, Trail } from "aws-cdk-lib/aws-cloudtrail";
import { Metric, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import {
  ArnPrincipal,
  ManagedPolicy,
  PermissionsBoundary,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import { FunctionUrlAuthType } from "aws-cdk-lib/aws-lambda";

import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { eci1TechBridge } from "./functions/eci1-tech-bridge/resource";
import { spectrumCaller } from "./functions/spectrum/resource";
import { storage } from "./storage/resource";

// Serv1 backend (SPEC.md sections 5, 6, 7). Deployed with
// `npx ampx sandbox --profile serv1-builder` from the Mac, never from code.
const backend = defineBackend({
  auth,
  data,
  storage,
  spectrumCaller,
  eci1TechBridge,
});

/**
 * Pilot sign-in by plain username (owner, 2026-11-09: "just have them be simple like admin, user,
 * tech"), set only when scripts/pilot/deploy-backend.sh exports SERV1_USERNAME_SIGNIN=true.
 * Amplify's defineAuth signs in by email; removing UsernameAttributes makes Cognito sign in by
 * username instead (email stays a required attribute). Cognito fixes this when a pool is created
 * and it cannot be changed later, so every other deploy keeps email sign-in.
 */
if (process.env.SERV1_USERNAME_SIGNIN === "true") {
  backend.auth.resources.cfnResources.cfnUserPool.addPropertyDeletionOverride("UsernameAttributes");
}

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

/**
 * Spectrum connector (Phase 4). The connector accepts only the role named at its deployment
 * (Serv1BackendRoleName), so the caller's role name is published as an output for the owner
 * to pass on. execute-api:Invoke is granted only when the deployer sets
 * SPECTRUM_INVOKE_RESOURCE to the connector's Serv1InvokeResource output; no ARN in code.
 */
const spectrumRole = backend.spectrumCaller.resources.lambda.role;
const invokeResource = process.env.SPECTRUM_INVOKE_RESOURCE;
if (spectrumRole && invokeResource) {
  spectrumRole.addToPrincipalPolicy(
    new PolicyStatement({ actions: ["execute-api:Invoke"], resources: [invokeResource] }),
  );
}
if (spectrumRole) {
  backend.addOutput({ custom: { spectrumCallerRoleName: spectrumRole.roleName } });
}

/**
 * ECI1 tech bridge (docs/ECI1-BRIDGE.md; design approved 2026-11-07). The function always
 * exists but is unreachable: its URL, the one role allowed to call it, the alarms and the
 * CloudTrail data events are created only when the deployer sets ECI1_BRIDGE_DEPLOY=true, so
 * an automatic deploy of main never exposes it. Even then it answers not_enabled until
 * ECI1_BRIDGE_ENABLED=true.
 */
const bridge = backend.eci1TechBridge.resources.lambda;
const tables = backend.data.resources.tables;
const bucket = backend.storage.resources.bucket;
const TABLE_ACCESS: Record<string, "read" | "write" | "readWrite"> = {
  User: "read",
  Customer: "read",
  Site: "read",
  Job: "readWrite",
  Attachment: "readWrite",
  Signature: "readWrite",
  TechNote: "readWrite",
  TechReceipt: "readWrite",
  TechAction: "readWrite",
  BridgeAudit: "write",
};
for (const [model, access] of Object.entries(TABLE_ACCESS)) {
  const table = tables[model];
  if (!table) continue;
  backend.eci1TechBridge.addEnvironment(`TABLE_${model}`, table.tableName);
  if (access === "read") table.grantReadData(bridge);
  else if (access === "write") table.grantWriteData(bridge);
  else table.grantReadWriteData(bridge);
}
backend.eci1TechBridge.addEnvironment("SERV1_BUCKET", bucket.bucketName);
// Photos, receipts and signatures go under jobs/<jobId>/ (office reads them there).
bucket.grantPut(bridge, "jobs/*");
bucket.grantRead(bridge, "jobs/*");
// Photos and signatures taken in Serv1's own tech screens live under tech-files/; the bridge
// signs links to them only for rows on the tech's assigned job (Codex review of PR #18).
bucket.grantRead(bridge, "tech-files/*");

if (process.env.ECI1_BRIDGE_DEPLOY === "true") {
  const stack = backend.createStack("eci1-bridge");
  const url = bridge.addFunctionUrl({ authType: FunctionUrlAuthType.AWS_IAM });

  // The only caller: assumed by the ECI Prod server's instance role (owner decision A1).
  // Named amplify-* because the CDK execution policy creates only amplify-* roles.
  const account = stack.account;
  const callerOf = process.env.ECI1_CALLER_ROLE_NAME || "EstimatixECIProdSSMRole";
  const caller = new Role(stack, "Eci1Serv1BridgeCaller", {
    roleName: "amplify-serv1-eci1-bridge-caller",
    description: "ECI1 server -> Serv1 tech bridge function URL only (docs/ECI1-BRIDGE.md)",
    assumedBy: new ArnPrincipal(`arn:aws:iam::${account}:role/${callerOf}`),
    maxSessionDuration: Duration.hours(1),
  });
  PermissionsBoundary.of(caller).apply(
    ManagedPolicy.fromManagedPolicyName(stack, "Eci1CallerBoundary", "serv1-permissions-boundary"),
  );
  // Off switch 3 (all traffic): remove these two statements.
  caller.addToPolicy(
    new PolicyStatement({
      actions: ["lambda:InvokeFunctionUrl"],
      resources: [bridge.functionArn],
      conditions: { StringEquals: { "lambda:FunctionUrlAuthType": "AWS_IAM" } },
    }),
  );
  caller.addToPolicy(
    new PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [bridge.functionArn],
      conditions: { Bool: { "lambda:InvokedViaFunctionUrl": "true" } },
    }),
  );

  // Safeguard 3: unusual volume. Counts come from the function's metric log lines.
  const metric = (name: string, statistic: string) =>
    new Metric({
      namespace: "Serv1/Eci1Bridge",
      metricName: name,
      statistic,
      period: Duration.minutes(5),
    });
  metric("Calls", "Sum").createAlarm(stack, "Eci1BridgeVolume", {
    alarmDescription: "More than 600 ECI1 bridge calls in 5 minutes",
    threshold: 600,
    evaluationPeriods: 1,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  });
  metric("CallerSessionTechs", "Maximum").createAlarm(stack, "Eci1BridgeManyTechs", {
    alarmDescription: "One caller session acted for more than 10 techs within 10 minutes",
    threshold: 10,
    evaluationPeriods: 1,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  });
  metric("Refused", "Sum").createAlarm(stack, "Eci1BridgeRefusals", {
    alarmDescription: "More than 50 refused ECI1 bridge calls in 5 minutes",
    threshold: 50,
    evaluationPeriods: 1,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  });

  // Safeguard 4: CloudTrail data events for this function only (its own bucket).
  const trail = new Trail(stack, "Eci1BridgeTrail", {
    trailName: "amplify-serv1-eci1-bridge",
    isMultiRegionTrail: false,
    includeGlobalServiceEvents: false,
    managementEvents: ReadWriteType.NONE,
  });
  trail.addLambdaEventSelector([bridge], { includeManagementEvents: false });

  backend.addOutput({
    custom: {
      eci1BridgeUrl: url.url,
      eci1BridgeCallerRoleArn: caller.roleArn,
    },
  });
}
