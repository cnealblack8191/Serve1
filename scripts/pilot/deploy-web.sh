#!/usr/bin/env bash
# Publishes the Serv1 pilot web app to the EXISTING Amplify Hosting app "serv1-demo"
# (appId d2yxtjpp0ljka2, branch "demo", us-east-1), which already serves serv1.ecinc.us through its
# domain association (docs/PILOT-DEPLOY.md, step 2). Run after deploy-backend.sh, from the
# repository root:
#
#   bash scripts/pilot/deploy-web.sh
#
# Manual deployment (a zip of the built site): no GitHub connection and no build role. It does not
# create or reconfigure the app; it only uploads a new build to the branch, then shows the domain
# status and the two DNS records. Re-run to publish a new build.
set -euo pipefail
cd "$(dirname "$0")/../.."
APP_NAME="serv1-demo"
BRANCH="demo"
ROOT_DOMAIN="ecinc.us"
PREFIX="serv1"
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1

test -f amplify_outputs.json || { echo "Run deploy-backend.sh first (no amplify_outputs.json)."; exit 1; }

APP_ID="$(aws amplify list-apps --query "apps[?name=='$APP_NAME'].appId | [0]" --output text)"
if [ "$APP_ID" = "None" ] || [ -z "$APP_ID" ]; then
  echo "No Amplify Hosting app named $APP_NAME in $AWS_REGION. Nothing published."
  exit 1
fi
aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" >/dev/null ||
  { echo "App $APP_ID has no branch $BRANCH. Nothing published."; exit 1; }
# The single-page-app rewrite (every path without a file extension serves index.html) is already
# set on this app; this only checks it, so the app's settings are never overwritten.
if [ "$(aws amplify get-app --app-id "$APP_ID" \
  --query "length(app.customRules[?target=='/index.html' && status=='200'])" --output text)" = "0" ]; then
  echo "Warning: app $APP_ID has no index.html rewrite rule; deep links will 404 until one is added."
fi

npm run build
ZIP="$(mktemp -d)/serv1-site.zip"
(cd dist && zip -qr "$ZIP" .)
read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" \
  --query "[jobId, zipUploadUrl]" --output text)
curl -sf -X PUT -H "Content-Type: application/zip" --upload-file "$ZIP" "$UPLOAD_URL"
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" >/dev/null
rm -f "$ZIP"
echo "Published build (job $JOB_ID): https://$BRANCH.$APP_ID.amplifyapp.com"

# The domain association (ecinc.us, prefix serv1 -> demo) already exists; create it only if absent.
if ! aws amplify get-domain-association --app-id "$APP_ID" --domain-name "$ROOT_DOMAIN" >/dev/null 2>&1; then
  aws amplify create-domain-association --app-id "$APP_ID" --domain-name "$ROOT_DOMAIN" \
    --sub-domain-settings "prefix=$PREFIX,branchName=$BRANCH" >/dev/null
  sleep 20
fi
echo
echo "Domain status and the two CNAME records for Bluehost (docs/PILOT-DEPLOY.md):"
aws amplify get-domain-association --app-id "$APP_ID" --domain-name "$ROOT_DOMAIN" \
  --query "domainAssociation.{status: domainStatus, certificate: certificateVerificationDNSRecord, site: subDomains[].dnsRecord}" \
  --output yaml
echo "Each line is 'name TYPE value'. Status goes to AVAILABLE once DNS and the certificate check pass."
