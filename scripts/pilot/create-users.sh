#!/usr/bin/env bash
# Creates the four pilot sign-ins in the deployed Cognito user pool (docs/PILOT-DEPLOY.md, step 3).
# Run by the owner in CloudShell (or as serv1-builder), from the repository root:
#
#   bash scripts/pilot/create-users.sh amplify_outputs.json [domain] [--reset-passwords]
#
# Four plain-username sign-ins (owner, 2026-11-09): admin (Admin), user (Office), tech (Tech) and
# viewer (Owner, read-only). The pool signs in by username (deploy-backend.sh sets
# SERV1_USERNAME_SIGNIN). Cognito still needs an email attribute: each gets <username>@<domain>
# (default serv1.ecinc.us), with no mailbox and no mail sent (MessageAction SUPPRESS).
#
# Password: the owner types ONE password at a hidden prompt, and all four sign-ins use it. It is
# never an argument, never echoed, and never written to a file, a log or the repository.
# Re-running keeps existing users and their password; add --reset-passwords to set the typed
# password on existing users too.
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

# demo identity | username | name | group  (PILOT_SIGN_INS in scripts/pilot/seed-plan.ts)
ACCOUNTS=(
  "local-admin|admin|Alex Admin|Admin"
  "local-office|user|Olivia Office|Office"
  "local-tech-1|tech|Tara Tech|Tech"
  "local-owner|viewer|Owen Owner|Owner"
)

# The pool's rule (Amplify's default): 8+ characters with upper case, lower case, a digit and a symbol.
valid_password() {
  local p="$1"
  [ "${#p}" -ge 8 ] && [[ "$p" =~ [A-Z] ]] && [[ "$p" =~ [a-z] ]] && [[ "$p" =~ [0-9] ]] &&
    [[ "$p" =~ [^A-Za-z0-9] ]]
}

PW=""
ask_password() {
  local again
  while :; do
    read -r -s -p "Pilot password for all four sign-ins (8+ chars, upper, lower, digit, symbol): " PW
    echo
    if ! valid_password "$PW"; then
      echo "  That does not meet the pool rule. Try again."
      continue
    fi
    read -r -s -p "Type it again: " again
    echo
    [ "$PW" = "$again" ] && break
    echo "  They did not match. Try again."
  done
}

echo "User pool $POOL ($REGION)"

# Ask only when a password will be set: a new user, or --reset-passwords.
NEED_PW="$RESET"
for row in "${ACCOUNTS[@]}"; do
  IFS='|' read -r _ LOCAL _ _ <<<"$row"
  if ! aws cognito-idp admin-get-user --region "$REGION" --user-pool-id "$POOL" \
    --username "$LOCAL" >/dev/null 2>&1; then
    NEED_PW="yes"
  fi
done
[ "$NEED_PW" = "yes" ] && ask_password

# The password goes to the AWS CLI through a temporary JSON file readable only by this user, so it
# never appears in the process list; the file is removed on exit.
PWFILE="$(mktemp)"
chmod 600 "$PWFILE"
trap 'rm -f "$PWFILE"' EXIT
set_password() {
  PW="$PW" python3 -c '
import json, os, sys
json.dump({"UserPoolId": sys.argv[1], "Username": sys.argv[2],
           "Password": os.environ["PW"], "Permanent": True}, open(sys.argv[3], "w"))' \
    "$POOL" "$1" "$PWFILE"
  aws cognito-idp admin-set-user-password --region "$REGION" --cli-input-json "file://$PWFILE"
  : >"$PWFILE"
}

JSON_ROWS=()
for row in "${ACCOUNTS[@]}"; do
  IFS='|' read -r DEMO LOCAL NAME GROUP <<<"$row"
  EMAIL="$LOCAL@$DOMAIN"
  if aws cognito-idp admin-get-user --region "$REGION" --user-pool-id "$POOL" --username "$LOCAL" >/dev/null 2>&1; then
    STATE="kept"
    if [ "$RESET" = "yes" ]; then
      set_password "$LOCAL"
      STATE="password reset"
    fi
  else
    aws cognito-idp admin-create-user --region "$REGION" --user-pool-id "$POOL" --username "$LOCAL" \
      --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true Name=name,Value="$NAME" \
      --message-action SUPPRESS >/dev/null
    set_password "$LOCAL"
    STATE="created"
  fi
  aws cognito-idp admin-add-user-to-group --region "$REGION" --user-pool-id "$POOL" \
    --username "$LOCAL" --group-name "$GROUP"
  read -r USERNAME SUB < <(aws cognito-idp admin-get-user --region "$REGION" --user-pool-id "$POOL" \
    --username "$LOCAL" --query "[Username, UserAttributes[?Name=='sub'].Value | [0]]" --output text)
  JSON_ROWS+=("{\"demoIdentityId\":\"$DEMO\",\"email\":\"$EMAIL\",\"username\":\"$USERNAME\",\"sub\":\"$SUB\",\"group\":\"$GROUP\"}")
  [ "$USERNAME" = "$LOCAL" ] || { echo "The pool did not keep username $LOCAL (got $USERNAME): is it a username pool?"; exit 1; }
  echo "  $LOCAL ($GROUP): $STATE"
done
PW=""

OUT="$(dirname "$0")/pilot-users.json"
( IFS=','; printf '{"domain":"%s","users":[%s]}\n' "$DOMAIN" "${JSON_ROWS[*]}" ) >"$OUT"
echo "Wrote $OUT (no passwords)."
echo "All four sign-ins use the password you typed. It was not saved anywhere."
