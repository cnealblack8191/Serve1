#!/usr/bin/env bash
# Removes the Serv1 pilot (docs/PILOT-DEPLOY.md, teardown): the serv1.ecinc.us domain link and the
# whole pilot backend, including every sign-in and every demo record. Irreversible. Run only on the
# owner's word, from the repository root:
#
#   bash scripts/pilot/teardown.sh
#
# The Amplify Hosting app "serv1-demo" itself is kept: it existed before the pilot (created
# 2026-10-31). The script prints the command that deletes it, for the owner to run if they want.
# Afterwards the owner deletes the two serv1 CNAME records in Bluehost.
set -euo pipefail
cd "$(dirname "$0")/../.."
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1

read -r -p "Type DELETE SERV1 PILOT to remove the serv1.ecinc.us link, sign-ins and data: " CONFIRM
[ "$CONFIRM" = "DELETE SERV1 PILOT" ] || { echo "Nothing removed."; exit 1; }

APP_ID="$(aws amplify list-apps --query "apps[?name=='serv1-demo'].appId | [0]" --output text)"
if [ "$APP_ID" != "None" ] && [ -n "$APP_ID" ] &&
  aws amplify get-domain-association --app-id "$APP_ID" --domain-name ecinc.us >/dev/null 2>&1; then
  aws amplify delete-domain-association --app-id "$APP_ID" --domain-name ecinc.us >/dev/null
  echo "Domain link serv1.ecinc.us removed from app $APP_ID."
fi
npx ampx sandbox delete --identifier serv1 --yes
rm -f amplify_outputs.json scripts/pilot/pilot-users.json
echo "Pilot backend removed (sign-ins, data, files, functions)."
[ "$APP_ID" != "None" ] && [ -n "$APP_ID" ] &&
  echo "The hosting app is kept. To delete it too: aws amplify delete-app --app-id $APP_ID"
echo "Now delete the two serv1 CNAME records in Bluehost."
