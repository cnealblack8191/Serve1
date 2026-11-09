#!/usr/bin/env bash
# Moves the Amplify Hosting app serv1-demo out of the custom CDKToolkit stack, then bootstraps CDK
# the standard way with the restricted execution policy (owner, 2026-11-09: "go with A").
# Runbook: infra/hosting-move/RUNBOOK.md. Run from the repository root, us-east-1, one step at a time:
#
#   bash scripts/hosting-move/move.sh snapshot     # read-only: saves the "before" state
#   bash scripts/hosting-move/move.sh remove       # 1. CDKToolkit forgets app, branch, ECR repo (Retain)
#   bash scripts/hosting-move/move.sh import       # 2. stack serv1-hosting imports app and branch
#   bash scripts/hosting-move/move.sh drop-ecr     # 3. deletes the empty retained ECR repo
#   bash scripts/hosting-move/move.sh drop-bucket  # 3b. CDKToolkit drops the empty staging bucket
#   bash scripts/hosting-move/move.sh bootstrap    # 4. stock cdk bootstrap, restricted policy
#   bash scripts/hosting-move/move.sh verify       # read-only: checks the end state
#
# Undo, newest first: undo-bootstrap, undo-bucket, undo-ecr, undo-import, undo-remove (RUNBOOK.md,
# "Undo").
#
# Every change goes through a CloudFormation change set (or a single named call), is checked by
# scripts/hosting-move/cli.ts, printed, and runs only after the person types the step's words.
# The saved state lives in $WORK (default ~/serv1-hosting-move), never in the repository.
set -euo pipefail
cd "$(dirname "$0")/../.."
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 AWS_PAGER=""

APP_ID="${APP_ID:-d2yxtjpp0ljka2}"
BRANCH="demo"
DOMAIN="ecinc.us"
WORK="${WORK:-$HOME/serv1-hosting-move}"
HOSTING_TEMPLATE="infra/hosting-move/serv1-hosting.json"
CLI=(npx --no-install tsx scripts/hosting-move/cli.ts)

STEP="${1:-}"
[ -n "$STEP" ] || { sed -n '2,17p' "$0"; exit 2; }
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REPO="cdk-hnb659fds-container-assets-${ACCOUNT}-us-east-1"
CFN_EXEC_ROLE="cdk-hnb659fds-cfn-exec-role-${ACCOUNT}-us-east-1"
BUCKET="cdk-hnb659fds-assets-${ACCOUNT}-us-east-1"
echo "Account $ACCOUNT, us-east-1, as $(aws sts get-caller-identity --query Arn --output text)"

confirm() {
  local words="$1" answer
  read -r -p "Type ${words} to go ahead: " answer
  [ "$answer" = "$words" ] || { echo "Stopped. Nothing changed."; exit 1; }
}
need() { [ -f "$WORK/$1" ] || { echo "Missing $WORK/$1: run '$2' first."; exit 1; }; }
stack_status() {
  aws cloudformation describe-stacks --stack-name "$1" --query "Stacks[0].StackStatus" \
    --output text 2>/dev/null || echo "NONE"
}
in_stack() {
  aws cloudformation describe-stack-resource --stack-name "$1" --logical-resource-id "$2" \
    >/dev/null 2>&1
}
bucket_exists() { aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; }
# Stops unless the staging bucket holds no object versions, delete markers or unfinished uploads.
bucket_must_be_empty() {
  local v d u
  v="$(aws s3api list-object-versions --bucket "$BUCKET" --query "length(Versions || \`[]\`)" --output text)"
  d="$(aws s3api list-object-versions --bucket "$BUCKET" --query "length(DeleteMarkers || \`[]\`)" --output text)"
  u="$(aws s3api list-multipart-uploads --bucket "$BUCKET" --query "length(Uploads || \`[]\`)" --output text)"
  echo "Bucket $BUCKET: $v versions, $d delete markers, $u unfinished uploads."
  "${CLI[@]}" bucket-empty "$v" "$d" "$u" || { echo "Stop: nothing is deleted."; exit 1; }
}
# The bucket's settings as they are, for undo-bucket. A setting the bucket does not have is saved
# as {}, but only on S3's own "not configured" error for it; any other failure (access denied,
# expired credentials, network) stops before anything changes (Codex review of PR #24).
save_bucket() {
  local f absent err
  for f in versioning encryption public-access-block lifecycle-configuration ownership-controls tagging; do
    case "$f" in
      encryption) absent="ServerSideEncryptionConfigurationNotFoundError" ;;
      public-access-block) absent="NoSuchPublicAccessBlockConfiguration" ;;
      lifecycle-configuration) absent="NoSuchLifecycleConfiguration" ;;
      ownership-controls) absent="OwnershipControlsNotFoundError" ;;
      tagging) absent="NoSuchTagSet" ;;
      *) absent="" ;;
    esac
    local cmd="get-bucket-$f"
    [ "$f" = "public-access-block" ] && cmd="get-public-access-block"
    if ! aws s3api "$cmd" --bucket "$BUCKET" --output json >"$WORK/bucket-$f.json" 2>"$WORK/bucket-$f.err"; then
      err="$(cat "$WORK/bucket-$f.err")"
      if [ -n "$absent" ] && grep -q "($absent)" "$WORK/bucket-$f.err"; then
        echo '{}' >"$WORK/bucket-$f.json"
      else
        echo "Could not save the bucket's $f setting: $err"
        echo "Stop. Nothing changed."
        exit 1
      fi
    fi
  done
  echo "Saved the bucket's settings to $WORK/bucket-*.json."
}
# Prints one key of a saved JSON file as JSON, or nothing when it is absent.
json_at() {
  node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const x=process.argv[2]?v[process.argv[2]]:v; if(x!==undefined)process.stdout.write(JSON.stringify(x))' \
    "$1" "${2:-}"
}
template_body() {
  node -e 'const t=require(process.argv[1]); require("fs").writeFileSync(process.argv[2],
    typeof t.TemplateBody==="string"?t.TemplateBody:JSON.stringify(t.TemplateBody))' "$1" "$2"
}
image_count() {
  aws ecr list-images --repository-name "$REPO" --query "length(imageIds)" --output text
}
# The parts of the app, branch and domain that must never change during the move.
hosting_state() {
  aws amplify get-app --app-id "$APP_ID" \
    --query "app.{name:name,platform:platform,customRules:customRules,defaultDomain:defaultDomain}" \
    --output json
  aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" \
    --query "branch.{branchName:branchName,stage:stage,enableAutoBuild:enableAutoBuild,activeJobId:activeJobId}" \
    --output json
  aws amplify get-domain-association --app-id "$APP_ID" --domain-name "$DOMAIN" \
    --query "domainAssociation.{status:domainStatus,subDomains:subDomains[].subDomainSetting}" \
    --output json
}
same_hosting() {
  hosting_state >"$WORK/hosting-now.json"
  if diff -u "$WORK/hosting-before.json" "$WORK/hosting-now.json"; then
    echo "App, branch and domain link: unchanged."
  else
    echo "The app, branch or domain link differs from the snapshot (diff above). Stop and check."
    exit 1
  fi
}
# Creates a change set, waits, saves it as $WORK/$3.json; on failure shows why and deletes it.
make_change_set() {
  local stack="$1" name="$2" out="$3"
  shift 3
  aws cloudformation create-change-set --stack-name "$stack" --change-set-name "$name" "$@" >/dev/null
  if ! aws cloudformation wait change-set-create-complete --stack-name "$stack" --change-set-name "$name"; then
    aws cloudformation describe-change-set --stack-name "$stack" --change-set-name "$name" \
      --query "{status:Status,reason:StatusReason}" --output table || true
    aws cloudformation delete-change-set --stack-name "$stack" --change-set-name "$name" || true
    echo "Change set failed. Nothing changed."
    exit 1
  fi
  aws cloudformation describe-change-set --stack-name "$stack" --change-set-name "$name" \
    --output json >"$WORK/$out.json"
  aws cloudformation describe-change-set --stack-name "$stack" --change-set-name "$name" \
    --query "Changes[].ResourceChange.{Action:Action,Resource:LogicalResourceId,Type:ResourceType,Policy:PolicyAction,Replace:Replacement}" \
    --output table
}
drop_change_set() {
  aws cloudformation delete-change-set --stack-name "$1" --change-set-name "$2" || true
  echo "Change set refused by the check above and deleted. Nothing changed."
  exit 1
}

case "$STEP" in
  snapshot)
    mkdir -p "$WORK"
    chmod 700 "$WORK"
    aws cloudformation get-template --stack-name CDKToolkit --template-stage Original \
      --output json >"$WORK/cdktoolkit-before.json"
    aws cloudformation describe-stacks --stack-name CDKToolkit --output json >"$WORK/cdktoolkit-stack-before.json"
    aws amplify get-app --app-id "$APP_ID" --output json >"$WORK/app-before.json"
    aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" --output json >"$WORK/branch-before.json"
    aws amplify get-domain-association --app-id "$APP_ID" --domain-name "$DOMAIN" \
      --output json >"$WORK/domain-before.json"
    aws ecr describe-repositories --repository-names "$REPO" --output json >"$WORK/ecr-before.json"
    hosting_state >"$WORK/hosting-before.json"
    echo "Saved to $WORK:"
    echo "  CDKToolkit status: $(stack_status CDKToolkit)"
    echo "  ECR $REPO images: $(image_count)"
    echo "  Staging bucket versions: $(aws s3api list-object-versions \
      --bucket "cdk-hnb659fds-assets-${ACCOUNT}-us-east-1" --query "length(Versions || \`[]\`)" --output text)"
    echo "  Bootstrap version: $(aws ssm get-parameter --name /cdk-bootstrap/hnb659fds/version \
      --query Parameter.Value --output text)"
    echo "  Domain link: $(aws amplify get-domain-association --app-id "$APP_ID" --domain-name "$DOMAIN" \
      --query domainAssociation.domainStatus --output text)"
    "${CLI[@]}" live "$WORK/app-before.json" "$WORK/branch-before.json" "$HOSTING_TEMPLATE"
    "${CLI[@]}" match "$WORK/cdktoolkit-before.json" "$HOSTING_TEMPLATE"
    ;;

  remove) # Step 1
    need cdktoolkit-before.json snapshot
    case "$(stack_status CDKToolkit)" in
      UPDATE_ROLLBACK_COMPLETE | UPDATE_COMPLETE | CREATE_COMPLETE) ;;
      *) echo "CDKToolkit is $(stack_status CDKToolkit); expected a settled state."; exit 1 ;;
    esac
    "${CLI[@]}" strip "$WORK/cdktoolkit-before.json" "$WORK/cdktoolkit-stripped.json"
    make_change_set CDKToolkit serv1-hosting-move-remove cs-remove \
      --change-set-type UPDATE --template-body "file://$WORK/cdktoolkit-stripped.json"
    "${CLI[@]}" remove-only "$WORK/cs-remove.json" || drop_change_set CDKToolkit serv1-hosting-move-remove
    echo "CDKToolkit will stop managing the app, the branch and the ECR repo. All three are kept."
    confirm "REMOVE HOSTING FROM CDKTOOLKIT"
    aws cloudformation execute-change-set --stack-name CDKToolkit --change-set-name serv1-hosting-move-remove
    aws cloudformation wait stack-update-complete --stack-name CDKToolkit
    in_stack CDKToolkit HostingApp && { echo "HostingApp is still in CDKToolkit. Stop."; exit 1; }
    aws ecr describe-repositories --repository-names "$REPO" >/dev/null
    same_hosting
    echo "Step 1 done. Next: import."
    ;;

  import) # Step 2
    need hosting-before.json snapshot
    in_stack CDKToolkit HostingApp && { echo "HostingApp is still in CDKToolkit: run 'remove' first."; exit 1; }
    if [ "$(stack_status serv1-hosting)" = "REVIEW_IN_PROGRESS" ]; then
      # A previewed or refused IMPORT on a new stack leaves it here, holding nothing.
      N="$(aws cloudformation list-stack-resources --stack-name serv1-hosting \
        --query "length(StackResourceSummaries)" --output text)"
      echo "Stack serv1-hosting is REVIEW_IN_PROGRESS with $N resources (an import that never ran)."
      echo "If that is 0, delete it (aws cloudformation delete-stack --stack-name serv1-hosting),"
      echo "wait for stack-delete-complete, then run 'import' again. RUNBOOK.md, step 2."
      exit 1
    fi
    [ "$(stack_status serv1-hosting)" = "NONE" ] || { echo "Stack serv1-hosting already exists."; exit 1; }
    aws amplify get-app --app-id "$APP_ID" --output json >"$WORK/app-now.json"
    aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" --output json >"$WORK/branch-now.json"
    "${CLI[@]}" live "$WORK/app-now.json" "$WORK/branch-now.json" "$HOSTING_TEMPLATE"
    # The import identifiers CloudFormation expects for these types (Arn), checked, not assumed.
    IDS="$(aws cloudformation get-template-summary --template-body "file://$HOSTING_TEMPLATE" \
      --query "ResourceIdentifierSummaries[].[ResourceType, join(',', ResourceIdentifiers)]" --output text)"
    echo "$IDS"
    [ "$(echo "$IDS" | awk '{print $2}' | sort -u)" = "Arn" ] ||
      { echo "Import identifiers are not Arn as expected. Stop."; exit 1; }
    APP_ARN="$(aws amplify get-app --app-id "$APP_ID" --query app.appArn --output text)"
    BRANCH_ARN="$(aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" \
      --query branch.branchArn --output text)"
    cat >"$WORK/import.json" <<JSON
[
  {"ResourceType":"AWS::Amplify::App","LogicalResourceId":"HostingApp","ResourceIdentifier":{"Arn":"$APP_ARN"}},
  {"ResourceType":"AWS::Amplify::Branch","LogicalResourceId":"HostingBranch","ResourceIdentifier":{"Arn":"$BRANCH_ARN"}}
]
JSON
    # An import may not add outputs: import without them, add them by update afterwards.
    "${CLI[@]}" import-template "$HOSTING_TEMPLATE" "$WORK/serv1-hosting-import.json"
    make_change_set serv1-hosting serv1-hosting-import cs-import \
      --change-set-type IMPORT --template-body "file://$WORK/serv1-hosting-import.json" \
      --resources-to-import "file://$WORK/import.json" \
      --parameters "ParameterKey=AppId,ParameterValue=$APP_ID"
    "${CLI[@]}" import-only "$WORK/cs-import.json" || drop_change_set serv1-hosting serv1-hosting-import
    echo "Stack serv1-hosting will manage the existing app and branch. Nothing about them changes."
    confirm "IMPORT SERV1 HOSTING"
    aws cloudformation execute-change-set --stack-name serv1-hosting --change-set-name serv1-hosting-import
    aws cloudformation wait stack-import-complete --stack-name serv1-hosting
    echo "Adding serv1-hosting's outputs (the full template; resources unchanged)."
    aws cloudformation update-stack --stack-name serv1-hosting --template-body "file://$HOSTING_TEMPLATE" \
      --parameters "ParameterKey=AppId,ParameterValue=$APP_ID"
    aws cloudformation wait stack-update-complete --stack-name serv1-hosting
    DRIFT="$(aws cloudformation detect-stack-drift --stack-name serv1-hosting --query StackDriftDetectionId --output text)"
    for _ in $(seq 1 30); do
      S="$(aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id "$DRIFT" \
        --query DetectionStatus --output text)"
      [ "$S" = "DETECTION_IN_PROGRESS" ] || break
      sleep 5
    done
    aws cloudformation describe-stack-resource-drifts --stack-name serv1-hosting \
      --query "StackResourceDrifts[].{Resource:LogicalResourceId,Drift:StackResourceDriftStatus}" --output table
    same_hosting
    echo "Step 2 done. If any resource above shows MODIFIED, stop and report it before step 3."
    ;;

  drop-ecr) # Step 3 (deletes an empty repository CDK bootstrap re-creates)
    need ecr-before.json snapshot
    in_stack CDKToolkit ContainerAssetsRepository &&
      { echo "The ECR repo is still in CDKToolkit: run 'remove' first."; exit 1; }
    N="$(image_count)"
    [ "$N" = "0" ] || { echo "ECR $REPO holds $N images. Stop: nothing is deleted."; exit 1; }
    echo "ECR $REPO holds 0 images. It is deleted so the standard bootstrap can create its own."
    confirm "DELETE EMPTY ECR REPOSITORY"
    # No --force: ECR refuses if an image arrived since the check.
    aws ecr delete-repository --repository-name "$REPO" >/dev/null
    echo "Step 3 done. Next: drop-bucket."
    ;;

  drop-bucket) # Step 3b. The stock bootstrap sets AccessControl on this bucket, which has ACLs
    # disabled, so it cannot update it in place. The empty bucket leaves CDKToolkit and is deleted;
    # the bootstrap creates a stock one (RUNBOOK.md, step 3b).
    need hosting-before.json snapshot
    in_stack CDKToolkit HostingApp && { echo "Run 'remove' first."; exit 1; }
    case "$(stack_status CDKToolkit)" in
      UPDATE_ROLLBACK_COMPLETE | UPDATE_COMPLETE | CREATE_COMPLETE) ;;
      *) echo "CDKToolkit is $(stack_status CDKToolkit); expected a settled state."; exit 1 ;;
    esac
    if in_stack CDKToolkit StagingBucket; then
      aws cloudformation get-template --stack-name CDKToolkit --template-stage Original \
        --output json >"$WORK/cdktoolkit-prebucket.json"
      save_bucket
      bucket_must_be_empty
      "${CLI[@]}" strip-bucket "$WORK/cdktoolkit-prebucket.json" "$WORK/cdktoolkit-nobucket.json"
      make_change_set CDKToolkit serv1-hosting-move-drop-bucket cs-drop-bucket \
        --change-set-type UPDATE --template-body "file://$WORK/cdktoolkit-nobucket.json"
      "${CLI[@]}" bucket-remove-only "$WORK/cs-drop-bucket.json" ||
        drop_change_set CDKToolkit serv1-hosting-move-drop-bucket
      echo "CDKToolkit will stop managing the staging bucket (kept) and delete its bucket policy."
      confirm "REMOVE STAGING BUCKET FROM CDKTOOLKIT"
      aws cloudformation execute-change-set --stack-name CDKToolkit --change-set-name serv1-hosting-move-drop-bucket
      aws cloudformation wait stack-update-complete --stack-name CDKToolkit
      in_stack CDKToolkit StagingBucket && { echo "StagingBucket is still in CDKToolkit. Stop."; exit 1; }
    else
      echo "StagingBucket is already out of CDKToolkit."
    fi
    if bucket_exists; then
      bucket_must_be_empty
      echo "The empty bucket $BUCKET is deleted so the standard bootstrap can create its own."
      confirm "DELETE EMPTY STAGING BUCKET"
      # No --force and no 'rb --force': S3 refuses to delete a bucket that is not empty.
      aws s3api delete-bucket --bucket "$BUCKET"
      aws s3api wait bucket-not-exists --bucket "$BUCKET"
    else
      echo "Bucket $BUCKET does not exist."
    fi
    same_hosting
    echo "Step 3b done. Next: bootstrap."
    ;;

  bootstrap) # Step 4
    need hosting-before.json snapshot
    in_stack CDKToolkit HostingApp && { echo "Run 'remove' first."; exit 1; }
    aws ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1 &&
      { echo "ECR $REPO still exists: run 'drop-ecr' first."; exit 1; }
    in_stack CDKToolkit StagingBucket && { echo "Run 'drop-bucket' first."; exit 1; }
    bucket_exists && { echo "Bucket $BUCKET still exists: run 'drop-bucket' first."; exit 1; }
    EXEC_POLICY="$(aws cloudformation describe-stacks --stack-name serv1-builder \
      --query "Stacks[0].Outputs[?OutputKey=='CdkExecutionPolicyArn'].OutputValue" --output text)"
    [ -n "$EXEC_POLICY" ] && [ "$EXEC_POLICY" != "None" ] ||
      EXEC_POLICY="arn:aws:iam::${ACCOUNT}:policy/serv1-cdk-execution"
    aws iam get-policy --policy-arn "$EXEC_POLICY" >/dev/null
    echo "Standard CDK bootstrap of $ACCOUNT/us-east-1, execution policy $EXEC_POLICY only."
    confirm "BOOTSTRAP CDK"
    npx --yes aws-cdk@2 bootstrap "aws://${ACCOUNT}/us-east-1" --cloudformation-execution-policies "$EXEC_POLICY"
    bash "$0" verify
    ;;

  verify)
    echo "CDKToolkit: $(stack_status CDKToolkit); serv1-hosting: $(stack_status serv1-hosting)"
    V="$(aws ssm get-parameter --name /cdk-bootstrap/hnb659fds/version --query Parameter.Value --output text)"
    echo "Bootstrap version: $V"
    [ "$V" -gt 6 ] || { echo "Still the custom v6 bootstrap."; exit 1; }
    ATTACHED="$(aws iam list-attached-role-policies --role-name "$CFN_EXEC_ROLE" \
      --query "AttachedPolicies[].PolicyName" --output text)"
    INLINE="$(aws iam list-role-policies --role-name "$CFN_EXEC_ROLE" --query "PolicyNames" --output text)"
    echo "$CFN_EXEC_ROLE: attached [$ATTACHED], inline [$INLINE]"
    [ "$ATTACHED" = "serv1-cdk-execution" ] && [ -z "$INLINE" ] ||
      { echo "The CloudFormation execution role must carry serv1-cdk-execution only. Stop."; exit 1; }
    in_stack serv1-hosting HostingApp && in_stack serv1-hosting HostingBranch ||
      { echo "serv1-hosting does not hold the app and branch."; exit 1; }
    in_stack CDKToolkit StagingBucket && in_stack CDKToolkit StagingBucketPolicy ||
      { echo "CDKToolkit does not hold the staging bucket and its policy."; exit 1; }
    echo "Staging bucket object ownership: $(aws s3api get-bucket-ownership-controls --bucket "$BUCKET" \
      --query "OwnershipControls.Rules[0].ObjectOwnership" --output text 2>/dev/null || echo "not set")"
    need hosting-before.json snapshot
    same_hosting
    echo "Verified."
    ;;

  undo-bootstrap) # Back to CDKToolkit as step 1 left it (removes the bootstrap roles it added)
    need cdktoolkit-stripped.json remove
    make_change_set CDKToolkit serv1-hosting-move-undo-bootstrap cs-undo-bootstrap \
      --change-set-type UPDATE --template-body "file://$WORK/cdktoolkit-stripped.json" \
      --capabilities CAPABILITY_NAMED_IAM
    confirm "UNDO CDK BOOTSTRAP"
    aws cloudformation execute-change-set --stack-name CDKToolkit --change-set-name serv1-hosting-move-undo-bootstrap
    aws cloudformation wait stack-update-complete --stack-name CDKToolkit
    echo "CDKToolkit is back to its post-step-1 template. A stock ECR repo it made may remain (Retain)."
    ;;

  undo-bucket) # Before a successful bootstrap only: the empty bucket back in CDKToolkit as it was
    need cdktoolkit-prebucket.json drop-bucket
    in_stack CDKToolkit StagingBucket && in_stack CDKToolkit StagingBucketPolicy &&
      { echo "CDKToolkit holds the staging bucket and its policy already."; exit 0; }
    template_body "$WORK/cdktoolkit-prebucket.json" "$WORK/cdktoolkit-prebucket-body.json"
    # A run stopped after the import resumes at the update below (Codex review of PR #24).
    if ! in_stack CDKToolkit StagingBucket; then
      V="$(aws ssm get-parameter --name /cdk-bootstrap/hnb659fds/version --query Parameter.Value --output text)"
      [ "$V" -gt 6 ] && { echo "CDKToolkit is bootstrapped (version $V): run 'undo-bootstrap' first."; exit 1; }
      if ! bucket_exists; then
        echo "Re-creating the empty bucket $BUCKET with its saved settings."
        confirm "RECREATE STAGING BUCKET"
        aws s3api create-bucket --bucket "$BUCKET" >/dev/null
        aws s3api wait bucket-exists --bucket "$BUCKET"
        aws s3api put-bucket-versioning --bucket "$BUCKET" \
          --versioning-configuration "$(json_at "$WORK/bucket-versioning.json")"
        X="$(json_at "$WORK/bucket-encryption.json" ServerSideEncryptionConfiguration)"
        [ -z "$X" ] || aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration "$X"
        X="$(json_at "$WORK/bucket-public-access-block.json" PublicAccessBlockConfiguration)"
        [ -z "$X" ] || aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration "$X"
        X="$(json_at "$WORK/bucket-lifecycle-configuration.json" Rules)"
        [ -z "$X" ] || aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
          --lifecycle-configuration "{\"Rules\":$X}"
        X="$(json_at "$WORK/bucket-ownership-controls.json" OwnershipControls)"
        [ -z "$X" ] || aws s3api put-bucket-ownership-controls --bucket "$BUCKET" --ownership-controls "$X"
        X="$(json_at "$WORK/bucket-tagging.json" TagSet)"
        [ -z "$X" ] || aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging "{\"TagSet\":$X}"
      fi
      # Import the bucket alone (an IMPORT may not add the policy or change outputs), then the saved
      # template, which adds back the bucket policy and the outputs.
      aws cloudformation get-template --stack-name CDKToolkit --template-stage Original \
        --output json >"$WORK/cdktoolkit-current.json"
      "${CLI[@]}" reimport-bucket "$WORK/cdktoolkit-prebucket.json" "$WORK/cdktoolkit-current.json" \
        "$WORK/cdktoolkit-bucket-reimport.json"
      cat >"$WORK/bucket-reimport.json" <<JSON
[{"ResourceType":"AWS::S3::Bucket","LogicalResourceId":"StagingBucket","ResourceIdentifier":{"BucketName":"$BUCKET"}}]
JSON
      make_change_set CDKToolkit serv1-hosting-move-undo-bucket cs-undo-bucket \
        --change-set-type IMPORT --template-body "file://$WORK/cdktoolkit-bucket-reimport.json" \
        --resources-to-import "file://$WORK/bucket-reimport.json"
      confirm "UNDO REMOVE STAGING BUCKET"
      aws cloudformation execute-change-set --stack-name CDKToolkit --change-set-name serv1-hosting-move-undo-bucket
      aws cloudformation wait stack-import-complete --stack-name CDKToolkit
    else
      echo "StagingBucket is in CDKToolkit already; its policy and outputs are not. Resuming."
    fi
    echo "Restoring the bucket policy and outputs (the saved template)."
    aws cloudformation update-stack --stack-name CDKToolkit \
      --template-body "file://$WORK/cdktoolkit-prebucket-body.json"
    aws cloudformation wait stack-update-complete --stack-name CDKToolkit
    echo "CDKToolkit holds the staging bucket and its policy again, as before step 3b."
    ;;

  undo-ecr) # Re-creates the empty repository with its original settings
    need ecr-before.json snapshot
    aws ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1 &&
      { echo "ECR $REPO already exists."; exit 0; }
    confirm "RECREATE ECR REPOSITORY"
    aws ecr create-repository --repository-name "$REPO" --image-tag-mutability IMMUTABLE \
      --image-scanning-configuration scanOnPush=true --encryption-configuration encryptionType=AES256 \
      --tags Key=Project,Value=serv1-demo >/dev/null
    echo "Re-created $REPO (empty)."
    ;;

  undo-import) # serv1-hosting goes; the app and branch stay (Retain)
    [ "$(stack_status serv1-hosting)" != "NONE" ] || { echo "No serv1-hosting stack."; exit 0; }
    echo "Deleting stack serv1-hosting. The app and branch are DeletionPolicy Retain and stay."
    confirm "UNDO SERV1 HOSTING IMPORT"
    aws cloudformation delete-stack --stack-name serv1-hosting
    aws cloudformation wait stack-delete-complete --stack-name serv1-hosting
    need hosting-before.json snapshot
    same_hosting
    ;;

  undo-remove) # Imports the three resources back into CDKToolkit with its original template
    need cdktoolkit-before.json snapshot
    [ "$(stack_status serv1-hosting)" = "NONE" ] || { echo "Run 'undo-import' first."; exit 1; }
    aws ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1 ||
      { echo "Run 'undo-ecr' first."; exit 1; }
    APP_ARN="$(aws amplify get-app --app-id "$APP_ID" --query app.appArn --output text)"
    BRANCH_ARN="$(aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" --query branch.branchArn --output text)"
    # The import keeps CDKToolkit's current outputs (an IMPORT may not change them); the original
    # outputs come back in a separate update below (Codex review of PR #22).
    aws cloudformation get-template --stack-name CDKToolkit --template-stage Original \
      --output json >"$WORK/cdktoolkit-current.json"
    "${CLI[@]}" reimport "$WORK/cdktoolkit-before.json" "$WORK/cdktoolkit-current.json" \
      "$WORK/cdktoolkit-reimport.json"
    template_body "$WORK/cdktoolkit-before.json" "$WORK/cdktoolkit-before-body.json"
    cat >"$WORK/reimport.json" <<JSON
[
  {"ResourceType":"AWS::Amplify::App","LogicalResourceId":"HostingApp","ResourceIdentifier":{"Arn":"$APP_ARN"}},
  {"ResourceType":"AWS::Amplify::Branch","LogicalResourceId":"HostingBranch","ResourceIdentifier":{"Arn":"$BRANCH_ARN"}},
  {"ResourceType":"AWS::ECR::Repository","LogicalResourceId":"ContainerAssetsRepository","ResourceIdentifier":{"RepositoryName":"$REPO"}}
]
JSON
    make_change_set CDKToolkit serv1-hosting-move-undo-remove cs-undo-remove \
      --change-set-type IMPORT --template-body "file://$WORK/cdktoolkit-reimport.json" \
      --resources-to-import "file://$WORK/reimport.json"
    confirm "UNDO REMOVE FROM CDKTOOLKIT"
    aws cloudformation execute-change-set --stack-name CDKToolkit --change-set-name serv1-hosting-move-undo-remove
    aws cloudformation wait stack-import-complete --stack-name CDKToolkit
    # Then the original template as saved, which only adds back the hosting outputs.
    echo "Restoring CDKToolkit's original outputs (the saved template; resources unchanged)."
    aws cloudformation update-stack --stack-name CDKToolkit \
      --template-body "file://$WORK/cdktoolkit-before-body.json"
    aws cloudformation wait stack-update-complete --stack-name CDKToolkit
    same_hosting
    echo "CDKToolkit holds the app, branch and ECR repo again, as before the move."
    ;;

  *)
    echo "Unknown step: $STEP"
    exit 2
    ;;
esac
