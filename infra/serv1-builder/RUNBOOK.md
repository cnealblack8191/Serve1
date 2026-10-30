# serv1-builder role (owner applies in CloudShell)

Owner decision 2026-10-30: "create the serv1-builder role, same account, us-east-1".

The AI session cannot create IAM roles (tier 1 denies IAM writes; tier 2 is the build host only), so
the owner applies this stack as `charles-admin` with MFA in CloudShell (decision 41). About five minutes.

## What it creates

- Role `serv1-builder`: AWS's `AmplifyBackendDeployFullAccess` managed policy (what `npx ampx sandbox`
  needs, scoped to amplify-* resources) plus a guard that pins the role's own calls to us-east-1,
  lets it assume only this account's us-east-1 CDK roles, and forbids stop, terminate and data
  deletes made by the role itself. Trusts only the IAM user `eci-ai-session`.
- Managed policy `serv1-cdk-execution`: what CloudFormation itself may do when it deploys the
  backend. Serverless services only (Cognito, AppSync, DynamoDB, S3, Lambda, logs and the like),
  IAM only on Amplify- and CDK-named roles, and explicit denies on EC2, RDS, Organizations and
  account settings. You pass it to the CDK bootstrap in step 4.
- Managed policy `serv1-permissions-boundary`: a ceiling attached to every role a deployment creates
  (`amplify/backend.ts` applies it; the execution policy refuses to create a role without it). Even a
  deployment that tried to give one of its roles broad rights would be capped at the serverless services.
  Deployments can never change `serv1-*` policies, `cdk-*` roles, `serv1-builder`, `eci-ai-*` roles or
  any IAM user.
- An extra inline policy on `eci-ai-session` allowing it to assume `serv1-builder`. Nothing else about
  the ai-access stack changes. Note: `infra/ai-access/test-ai-access.py` in ECI-ECOSYSTEM describes the
  user as able to assume exactly two roles; it now assumes three. Record that in the decision log.

## Why there is a bootstrap step you must run

Amplify deploys through CDK. CDK needs a one-time "bootstrap" in each account and region (a small
stack named `CDKToolkit` with an S3 bucket and a few roles, including the CloudFormation execution
role). The builder role is not allowed to create that; AWS expects an administrator to do it once.
Without it the first sandbox run stops and asks for an administrator. Step 4 does it, using the
`serv1-cdk-execution` policy above instead of the default AdministratorAccess, so even CloudFormation
cannot touch EC2 or RDS in this account. If a later deploy fails with an AccessDenied on a service
missing from that policy, the session reports it and the owner adds the service to the policy and
re-runs step 3; nothing is widened silently.

## Steps (CloudShell, region us-east-1)

1. Get the template into CloudShell. Either clone the repo:
   ```bash
   git clone https://github.com/cnealblack8191/Serve1.git && cd Serve1/infra/serv1-builder
   ```
   or open `infra/serv1-builder/serv1-builder.yaml` on GitHub, copy it, and paste it into a file:
   ```bash
   mkdir -p ~/serv1-builder && cd ~/serv1-builder && cat > serv1-builder.yaml   # paste, then Ctrl-D
   ```
2. Check you are the right person in the right account and region:
   ```bash
   aws sts get-caller-identity --query Arn --output text   # expect ...:user/charles-admin
   export AWS_DEFAULT_REGION=us-east-1
   ```
3. Apply the stack (role, execution policy, user policy):
   ```bash
   aws cloudformation deploy --stack-name serv1-builder --template-file serv1-builder.yaml \
     --capabilities CAPABILITY_NAMED_IAM --tags Project=serv1
   ```
4. Bootstrap CDK once for this account and region, with the restricted execution policy (required;
   the same command also updates an existing default bootstrap):
   ```bash
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   EXEC_POLICY=$(aws cloudformation describe-stacks --stack-name serv1-builder \
     --query "Stacks[0].Outputs[?OutputKey=='CdkExecutionPolicyArn'].OutputValue" --output text)
   npx --yes aws-cdk@2 bootstrap "aws://$ACCOUNT/us-east-1" --cloudformation-execution-policies "$EXEC_POLICY"
   ```
5. Verify and copy the role ARN:
   ```bash
   aws cloudformation describe-stacks --stack-name serv1-builder \
     --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" --output text
   aws cloudformation describe-stacks --stack-name CDKToolkit --query "Stacks[0].StackStatus" --output text
   aws iam list-user-policies --user-name eci-ai-session --output text   # expect AssumeServ1Builder listed
   ```
6. Add the role ARN to the Serv1 cloud environment as the variable `SERV1_BUILDER_ROLE_ARN` (environment
   menu in the session's title bar, then Edit). A new session picks it up. Then tell the session
   "create the sandbox"; it assumes the role, runs `npx ampx sandbox --once --identifier serv1` in
   us-east-1, and tests login.

## Undo

`aws cloudformation delete-stack --stack-name serv1-builder` removes the role and the extra user policy.
Resources the sandbox created later are removed with `npx ampx sandbox delete --identifier serv1`.

## Cost

The role itself is free. The sandbox backend at pilot scale sits mostly within the free tier; the
SPEC.md section 7.5 budget alert covers the rest.
