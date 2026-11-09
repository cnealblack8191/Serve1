#!/usr/bin/env bash
# Publishes the Serv1 web app to Amplify Hosting and attaches serv1.ecinc.us
# (docs/PILOT-DEPLOY.md, step 2). Run after deploy-backend.sh, from the repository root:
#
#   bash scripts/pilot/deploy-web.sh [domain]       # domain defaults to ecinc.us
#
# Manual deployment (a zip of the built site): no GitHub connection and no build role. Re-run to
# publish a new build. At the end it prints the DNS records the owner must add.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT_DOMAIN="${1:-ecinc.us}"
PREFIX="serv1"
APP_NAME="serv1-pilot"
BRANCH="main"
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1

test -f amplify_outputs.json || { echo "Run deploy-backend.sh first (no amplify_outputs.json)."; exit 1; }
npm run build
rm -f /tmp/serv1-site.zip && (cd dist && zip -qr /tmp/serv1-site.zip .)

APP_ID="$(aws amplify list-apps --query "apps[?name=='$APP_NAME'].appId | [0]" --output text)"
if [ "$APP_ID" = "None" ] || [ -z "$APP_ID" ]; then
  APP_ID="$(aws amplify create-app --name "$APP_NAME" --platform WEB \
    --tags Project=serv1,Purpose=pilot-demo --query app.appId --output text)"
  echo "Created Amplify Hosting app $APP_ID"
fi
# A single-page app: every path without a file extension serves index.html.
aws amplify update-app --app-id "$APP_ID" --custom-rules \
  'source=</^[^.]+$|\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>,target=/index.html,status=200' >/dev/null
aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" >/dev/null 2>&1 ||
  aws amplify create-branch --app-id "$APP_ID" --branch-name "$BRANCH" --stage PRODUCTION >/dev/null

read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" \
  --query "[jobId, zipUploadUrl]" --output text)
curl -sf -X PUT -H "Content-Type: application/zip" --upload-file /tmp/serv1-site.zip "$UPLOAD_URL"
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" >/dev/null
echo "Published build (job $JOB_ID): https://$BRANCH.$APP_ID.amplifyapp.com"

if ! aws amplify get-domain-association --app-id "$APP_ID" --domain-name "$ROOT_DOMAIN" >/dev/null 2>&1; then
  aws amplify create-domain-association --app-id "$APP_ID" --domain-name "$ROOT_DOMAIN" \
    --sub-domain-settings "prefix=$PREFIX,branchName=$BRANCH" >/dev/null
  sleep 20
fi
echo
echo "DNS records to add at the DNS host of $ROOT_DOMAIN (unless Amplify says it manages them):"
aws amplify get-domain-association --app-id "$APP_ID" --domain-name "$ROOT_DOMAIN" \
  --query "domainAssociation.{status: domainStatus, certificate: certificateVerificationDNSRecord, site: subDomains[].dnsRecord}" \
  --output yaml
echo "Each line is 'name TYPE value'. Status goes to AVAILABLE once DNS and the certificate check pass."
