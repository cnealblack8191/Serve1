#!/usr/bin/env bash
# Creates the pilot sign-ins in the deployed Cognito user pool (docs/PILOT-DEPLOY.md, step 3).
# Run by the owner in CloudShell (or as serv1-builder), from the repository root:
#
#   bash scripts/pilot/create-users.sh amplify_outputs.json [domain]
#
# domain defaults to serv1.ecinc.us, so the sign-ins are admin@serv1.ecinc.us, office@..., etc.
# They are sign-in names only: no mail is sent to them (MessageAction SUPPRESS).
#
# Passwords: generated here, shown ONCE on this terminal for the owner to hand out, and never
# written to a file, a log or the repository. Re-running keeps existing users and their
# passwords; add --reset-passwords to issue new ones.
# Writes scripts/pilot/pilot-users.json (emails, Cognito ids, groups; no passwords), which
# seed-demo.ts reads. That file is git-ignored.
set -euo pipefail

OUTPUTS="${1:?usage: create-users.sh <amplify_outputs.json> [domain] [--reset-passwords]}"
DOMAIN="${2:-serv1.ecinc.us}"
RESET="no"
for a in "$@"; do [ "$a" = "--reset-passwords" ] && RESET="yes"; done
[ "$DOMAIN" = "--reset-passwords" ] && DOMAIN="serv1.ecinc.us"

read -r POOL REGION < <(python3 -c '
import json, sys
o = json.load(open(sys.argv[1]))
print(o["auth"]["user_pool_id"], o["auth"]["aws_region"])' "$OUTPUTS")

# demo identity | local part | name | group  (matches DEMO_ACCOUNTS in src/data/local/seed.ts)
ACCOUNTS=(
  "local-admin|admin|Alex Admin|Admin"
  "local-office|office|Olivia Office|Office"
  "local-owner|owner|Owen Owner|Owner"
  "local-tech-1|tech1|Tara Tech|Tech"
  "local-tech-2|tech2|Tom Tech|Tech"
  "local-tech-3|tech3|Tess Tech|Tech"
)

# Simple but valid for the default pool policy (8+ characters, upper, lower, digit, symbol):
# "Pilot" + 4 random digits + "!", for example Pilot4827!.
new_password() {
  printf 'Pilot%04d!' "$(( $(od -An -N2 -tu2 /dev/urandom | tr -d ' ') % 10000 ))"
}

echo "User pool $POOL ($REGION), sign-ins @$DOMAIN"
JSON_ROWS=()
SHOWN=()
for row in "${ACCOUNTS[@]}"; do
  IFS='|' read -r DEMO LOCAL NAME GROUP <<<"$row"
  EMAIL="$LOCAL@$DOMAIN"
  if aws cognito-idp admin-get-user --region "$REGION" --user-pool-id "$POOL" --username "$EMAIL" >/dev/null 2>&1; then
    STATE="kept"
    if [ "$RESET" = "yes" ]; then
      PW="$(new_password)"
      aws cognito-idp admin-set-user-password --region "$REGION" --user-pool-id "$POOL" \
        --username "$EMAIL" --password "$PW" --permanent
      SHOWN+=("$EMAIL  $PW")
      STATE="new password"
    fi
  else
    aws cognito-idp admin-create-user --region "$REGION" --user-pool-id "$POOL" --username "$EMAIL" \
      --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true Name=name,Value="$NAME" \
      --message-action SUPPRESS >/dev/null
    PW="$(new_password)"
    aws cognito-idp admin-set-user-password --region "$REGION" --user-pool-id "$POOL" \
      --username "$EMAIL" --password "$PW" --permanent
    SHOWN+=("$EMAIL  $PW")
    STATE="created"
  fi
  aws cognito-idp admin-add-user-to-group --region "$REGION" --user-pool-id "$POOL" \
    --username "$EMAIL" --group-name "$GROUP"
  read -r USERNAME SUB < <(aws cognito-idp admin-get-user --region "$REGION" --user-pool-id "$POOL" \
    --username "$EMAIL" --query "[Username, UserAttributes[?Name=='sub'].Value | [0]]" --output text)
  JSON_ROWS+=("{\"demoIdentityId\":\"$DEMO\",\"email\":\"$EMAIL\",\"username\":\"$USERNAME\",\"sub\":\"$SUB\",\"group\":\"$GROUP\"}")
  echo "  $EMAIL ($GROUP): $STATE"
done

OUT="$(dirname "$0")/pilot-users.json"
( IFS=','; printf '{"domain":"%s","users":[%s]}\n' "$DOMAIN" "${JSON_ROWS[*]}" ) >"$OUT"
echo "Wrote $OUT (no passwords)."

if [ "${#SHOWN[@]}" -gt 0 ]; then
  echo
  echo "Passwords, shown once. Copy them to the people now; they are not saved anywhere:"
  for s in "${SHOWN[@]}"; do echo "  $s"; done
  echo
  echo "Then clear this screen (Ctrl-L) or close CloudShell."
fi
