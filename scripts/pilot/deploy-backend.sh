#!/usr/bin/env bash
# Deploys the Serv1 pilot backend (docs/PILOT-DEPLOY.md, step 1): Cognito, AppSync/DynamoDB,
# S3 and the functions, as one Amplify sandbox named "serv1" in us-east-1, with the
# serv1-builder role (infra/serv1-builder/RUNBOOK.md). Writes amplify_outputs.json (git-ignored).
#
#   AWS_PROFILE=serv1-builder bash scripts/pilot/deploy-backend.sh
#
# The pilot is demo data only. The Spectrum connector and the ECI1 tech bridge stay OFF: their
# switches are cleared here, so this deploy creates no bridge URL, caller role or trail and the
# Spectrum function refuses every call ("not connected yet").
set -euo pipefail
cd "$(dirname "$0")/../.."

unset SPECTRUM_CONNECTOR_URL SPECTRUM_INVOKE_RESOURCE ECI1_BRIDGE_DEPLOY ECI1_BRIDGE_ENABLED
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1

echo "Deploying as: $(aws sts get-caller-identity --query Arn --output text)"
npm ci
npx ampx sandbox --once --identifier serv1 --outputs-out-dir .
test -f amplify_outputs.json
echo "Backend deployed. amplify_outputs.json written (do not commit it)."
