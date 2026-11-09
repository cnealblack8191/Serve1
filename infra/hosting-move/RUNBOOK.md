# Moving the hosting app out of CDKToolkit, then a standard CDK bootstrap

Owner, 2026-11-09, relayed by the planning session: "go with A". This means moving the hosting app
out of `CDKToolkit` and keeping it, then running a normal restricted CDK bootstrap in us-east-1.

This pack is **prepared, not run**. It runs only on the owner's word, step by step, after this PR's
check is green and Codex is clean. Nothing here touches ECI, `cnb-eci-webapp`, TimeX or Central.

## Why

- **`CDKToolkit` is not a standard bootstrap.** It is a custom stack from 2026-10-31, "Serv1
  deployment assets and static hosting". It holds:
  - the CDK staging bucket,
  - an ECR repository,
  - the `/cdk-bootstrap/hnb659fds/version` parameter, set to 6,
  - **the Amplify Hosting app `serv1-demo` (`d2yxtjpp0ljka2`) and its `demo` branch**.
- **The standard bootstrap failed on it.** `cdk bootstrap --cloudformation-execution-policies
serv1-cdk-execution` was refused only on `ContainerAssetsRepository`, because the stock template
  would replace that custom-named repository. The stack rolled back (`UPDATE_ROLLBACK_COMPLETE`).
  Amplify Gen 2 (`ampx`) needs that standard bootstrap.
- **What is safe to rely on.**
  - The app, branch, ECR repository and bucket are all `DeletionPolicy: Retain`, so CloudFormation
    can let go of them without deleting them.
  - The ECR repository holds 0 images, and the bucket holds 0 objects.
  - The `serv1.ecinc.us` domain link was made by CLI, not CloudFormation, so it is outside every
    stack.

## Who runs it, and where

An administrator runs it in CloudShell, us-east-1, from the repository root at the approved commit:
the owner as `charles-admin` with MFA, or the planning session on the owner's word. `serv1-builder`
cannot change `CDKToolkit`.

```bash
git clone https://github.com/cnealblack8191/Serve1.git && cd Serve1 && git checkout <approved commit>
npm ci
aws sts get-caller-identity
```

## The steps

The script saves everything in `~/serv1-hosting-move` in CloudShell, never in the repository.
Before any step changes something, the script prints it, checks it (`scripts/hosting-move/cli.ts`,
unit-tested in `tests/unit/hosting-move.test.ts`), and waits for the step's words to be typed.

| #   | Command                                      | What it changes                                                                                                                                                                         | Stops unless                                                                                                                                                                                                           |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `bash scripts/hosting-move/move.sh snapshot` | Nothing. Saves the CDKToolkit template, the app, branch, domain link, ECR repository, image count, bucket versions and bootstrap version.                                               | The live app and branch match `serv1-hosting.json`, and that template matches what CDKToolkit declared                                                                                                                 |
| 1   | `… move.sh remove`                           | A change set on CDKToolkit removes `HostingApp`, `HostingBranch` and `ContainerAssetsRepository` from the template, with their outputs. All three are **retained**; nothing is deleted. | The change set holds exactly those three, every one a `Remove` with `PolicyAction` `Retain` (or none), and nothing else                                                                                                |
| 2   | `… move.sh import`                           | A new stack `serv1-hosting` **imports** the existing app and branch (`IMPORT` change set, identifier `Arn`). Nothing about them changes. Then a drift check.                            | The live app and branch match the template, the import identifiers are `Arn`, and the change set is exactly two `Import` rows                                                                                          |
| 3   | `… move.sh drop-ecr`                         | Deletes the retained ECR repository `cdk-hnb659fds-container-assets-<account>-us-east-1`. This is the only deletion, and the stock bootstrap re-creates the repository.                 | The repository is out of CDKToolkit and holds **0 images**. No `--force` is used, so ECR itself refuses if an image arrived since the check                                                                            |
| 4   | `… move.sh bootstrap`                        | Stock `npx aws-cdk@2 bootstrap aws://<account>/us-east-1 --cloudformation-execution-policies <serv1-cdk-execution>`, then `verify`                                                      | The app is out of CDKToolkit, the repository is gone, and the policy exists                                                                                                                                            |
| -   | `… move.sh verify`                           | Nothing                                                                                                                                                                                 | Bootstrap version above 6; `cdk-hnb659fds-cfn-exec-role-…` carries **only** `serv1-cdk-execution`, with no inline policy; `serv1-hosting` holds the app and branch; app, branch and domain link unchanged since step 0 |

After each step, the script compares the app (name, rewrite rules, default domain), the branch
(stage, auto build, active job) and the domain link (status, sub-domains) with the step 0 snapshot.
If anything differs, it stops.

## Undo (newest step first)

| Step | Command                  | Effect                                                                                                                                                                          |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4    | `move.sh undo-bootstrap` | Updates CDKToolkit back to the step 1 template, which removes the roles the bootstrap added. The stock ECR repository it made may stay (Retain); delete it only if it is empty. |
| 3    | `move.sh undo-ecr`       | Re-creates the empty repository with its original settings (immutable tags, scan on push, AES256, `Project=serv1-demo`).                                                        |
| 2    | `move.sh undo-import`    | Deletes stack `serv1-hosting`. The app and branch are `Retain` and stay, unchanged.                                                                                             |
| 1    | `move.sh undo-remove`    | Imports the app, branch and repository back into CDKToolkit with its saved original template. Run `undo-import` and `undo-ecr` first.                                           |

## Afterwards

- **`serv1-builder` hosting rights.** The role gains one inline policy, `Serv1HostingDeploy`, in
  `infra/serv1-builder/serv1-builder.yaml`. It lets the role publish builds to app
  `d2yxtjpp0ljka2` and manage its domain link, which is what `scripts/pilot/deploy-web.sh` and
  `teardown.sh` call. It cannot delete, update or re-shape that app or branch. The owner re-applies
  the `serv1-builder` stack to add it (`infra/serv1-builder/RUNBOOK.md`, step 3).
- **Then the pilot.** `docs/PILOT-DEPLOY.md` step 1 (backend) can run.
