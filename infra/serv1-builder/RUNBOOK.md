# serv1-builder role (owner applies in CloudShell)

Owner decision 2026-10-30: "create the serv1-builder role, same account, us-east-1".

The AI session cannot create IAM roles (tier 1 denies IAM writes; tier 2 is the build host only), so
the owner applies this stack as `charles-admin` with MFA in CloudShell (decision 41). About five minutes.

## What it creates
- Role `serv1-builder`: AWS's `AmplifyBackendDeployFullAccess` managed policy (what `npx ampx sandbox`
  needs, scoped to amplify-* resources) plus a guard that pins work to us-east-1 and forbids stop,
  terminate and data deletes. Trusts only the IAM user `eci-ai-session`.
- An extra inline policy on `eci-ai-session` allowing it to assume `serv1-builder`. Nothing else about
  the ai-access stack changes. Note: `infra/ai-access/test-ai-access.py` in ECI-ECOSYSTEM describes the
  user as able to assume exactly two roles; it now assumes three. Record that in the decision log.

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
3. Apply:
   ```bash
   aws cloudformation deploy --stack-name serv1-builder --template-file serv1-builder.yaml \
     --capabilities CAPABILITY_NAMED_IAM --tags Project=serv1
   ```
4. Verify and copy the role ARN:
   ```bash
   aws cloudformation describe-stacks --stack-name serv1-builder \
     --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" --output text
   aws iam list-user-policies --user-name eci-ai-session --output text   # expect AssumeServ1Builder listed
   ```
5. Add the ARN to the Serv1 cloud environment as the variable `SERV1_BUILDER_ROLE_ARN` (environment
   menu in the session's title bar, then Edit). A new session picks it up. Then tell the session
   "create the sandbox"; it assumes the role, runs `npx ampx sandbox --once --identifier serv1` in
   us-east-1, and tests login.

## Undo
`aws cloudformation delete-stack --stack-name serv1-builder` removes the role and the extra user policy.
Resources the sandbox created later are removed with `npx ampx sandbox delete --identifier serv1`.

## Cost
The role itself is free. The sandbox backend at pilot scale sits mostly within the free tier; the
SPEC.md section 7.5 budget alert covers the rest.
