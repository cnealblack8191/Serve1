#!/usr/bin/env bash
# Removes the Serv1 pilot (docs/PILOT-DEPLOY.md, teardown): the hosted site, its serv1.ecinc.us
# domain link, and the whole pilot backend, including every sign-in and every demo record.
# Irreversible. Run only on the owner's word, from the repository root:
#
#   AWS_PROFILE=serv1-builder bash scripts/pilot/teardown.sh
#
# Afterwards the owner deletes the serv1 DNS records at the ecinc.us DNS host.
set -euo pipefail
cd "$(dirname "$0")/../.."
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1

read -r -p "Type DELETE SERV1 PILOT to remove the pilot site, sign-ins and data: " CONFIRM
[ "$CONFIRM" = "DELETE SERV1 PILOT" ] || { echo "Nothing removed."; exit 1; }

APP_ID="$(aws amplify list-apps --query "apps[?name=='serv1-pilot'].appId | [0]" --output text)"
if [ "$APP_ID" != "None" ] && [ -n "$APP_ID" ]; then
  aws amplify delete-app --app-id "$APP_ID" >/dev/null
  echo "Hosting app $APP_ID removed (with its domain link)."
fi
npx ampx sandbox delete --identifier serv1 --yes
rm -f amplify_outputs.json scripts/pilot/pilot-users.json
echo "Pilot backend removed. Now delete the serv1 DNS records at the ecinc.us DNS host."
