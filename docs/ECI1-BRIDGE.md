# ECI1 tech bridge (Serv1's side)

Serv1's end of the ECI1 technician module, built to ECI-1X `docs/SERV1-TECH-API.md` and the
owner-approved design `docs/SERV1-ECI-LINK-DESIGN.md` (PR #42, 2026-11-07).
**Nothing here is deployed, and nothing touches the ECI Prod server, the cnb-eci-webapp
repository or the live ECI API** (owner, 2026-11-07: "do not start the server change over, the
eci prod needs to stay live").

## What it does

The ECI1 server signs one request per tech action and sends it to the Serv1 function
`eci1-tech-bridge` through its function URL (AWS_IAM auth). The body is
`{ serv1UserId, eciUserId, route, body }`, where `route` is one of `jobs`, `status`, `note`,
`photos`, `materials`, `receipt` or `complete`, and `body` is the contract's request body.

On every call the bridge checks, in this order:

1. **Off switch.** It answers `not_enabled` unless it was deployed with `ECI1_BRIDGE_ENABLED=true`.
2. **Link.** The linked Serv1 user exists, is active and is in the Tech role; otherwise `not_linked`.
3. **Assignment.** Every write names a job assigned to that tech (`job_not_found`, `not_assigned`).
4. **Repeats.** An `actionId` already saved returns `ok` and changes nothing. Photos repeat per position (`actionId` + `index`).
5. **Office lock.** Reviewed, Invoiced, Paid and Cancelled jobs refuse tech changes (`job_locked`).
6. **Status rules.** The tech moves are those in contract section 5. Complete is set only through `/complete`.
7. **Late or out-of-order sends.** A status, completion or materials list older than the one already saved is recorded (`stale_ignored`) and not applied.
8. **Save, then write an audit row** (BridgeAudit) for every call, whether allowed or refused.

The bridge never creates or deletes jobs, invoices or users, and never touches office fields.
It accepts at most one photo or receipt image per call (JPEG; signatures are PNG; about
4.5 MB each). Images go to `jobs/<jobId>/…` in Serv1's bucket. The `/jobs` reply gives
15-minute signed links.

## What the office sees

On the job page, a **Tech's work** section shows:

- a **Note to the tech** (office edits; it appears on the phone),
- the tech's notes,
- materials used,
- receipts, which the office can **Approve**, **Reject** (with a reason) or **Undo review**. "Personal" means the tech is owed the money back.

The On hold banner shows the hold note. A job completed without a signature shows the reason.
Office edits set `officeChangedAt`, which drives the phone's "New to you / Changed" badge; the
tech's own changes do not set it.

## Data model (additive only)

- **Job:** `holdNote`, `officeChangedAt`, `officeNote`, `noSignatureReason`, `noSignatureNote`, `materials`, `materialsAt`, `techStatusAt`.
- **New models:**
  - `TechNote` and `TechReceipt` (office reviews; owner reads; a tech reads only their own),
  - `TechAction` (the `actionId` repeat check; Admin reads),
  - `BridgeAudit` (every call; Admin reads).

Older records without these fields load as before (`tests/old-records.spec.ts`).

## Safeguards (design: required before go-live)

| Safeguard                        | Where                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Only linked techs             | ECI1 `users.serv1_user_id`; the bridge re-checks active + Tech role                                                                                                                                                                                           |
| 2. Assigned job on every request | `core.ts` (a write with no job is refused)                                                                                                                                                                                                                    |
| 3. Per-tech counts and an alarm  | Metric lines `Serv1/Eci1Bridge` (Calls and Refused per tech, CallerSessionTechs); alarms in `amplify/backend.ts`: more than 600 calls in 5 min, more than 10 techs per caller session in 10 min, more than 50 refusals in 5 min                               |
| 4. CloudTrail data events        | Trail `amplify-serv1-eci1-bridge`, Lambda data events for this function only; the bridge's own audit rows as well                                                                                                                                             |
| 5. Three off switches            | One tech: clear `serv1_user_id` in ECI1, or turn the user off in Serv1 Users. The module: the ECI1 server switch. All traffic: remove the caller role's two Lambda statements (or deploy without `ECI1_BRIDGE_DEPLOY`). Serv1 also has `ECI1_BRIDGE_ENABLED`. |

## Owner steps before go-live (none done)

1. Update the owner's `serv1-builder` stack from `infra/serv1-builder/serv1-builder.yaml`. Its execution policy now allows CloudTrail on `amplify-*` trails only.
2. Deploy Serv1 with `ECI1_BRIDGE_DEPLOY=true`. This creates:
   - the function URL,
   - the caller role `amplify-serv1-eci1-bridge-caller`, under `serv1-permissions-boundary`, trusting only `EstimatixECIProdSSMRole`,
   - the alarms and the trail.

   The design called the role `Eci1Serv1BridgeCaller`, but the CDK execution policy creates only `amplify-*` roles. The outputs give the URL and the role ARN.

3. **Later, on the ECI side (owner step, not in this repository):** add one inline policy to `EstimatixECIProdSSMRole` allowing `sts:AssumeRole` on that caller role only.
4. **Confirm in current AWS docs before go-live.** The docs could not be reached from the build session:
   - whether a function URL caller needs both `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` with `lambda:InvokedViaFunctionUrl` (both are granted, as the design says),
   - whether CloudTrail records function URL calls as Lambda data events.
5. Link a test tech in ECI1, then deploy again with `ECI1_BRIDGE_ENABLED=true`.

## Known limits (pilot)

- **Table scans.** Lookups by job or tech scan the table once per call. Add indexes before the tables grow.
- **No live refresh.** Rows the bridge writes do not trigger live refresh on open office screens; reload to see them.
- **Customer phone only.** `site.contactName` and `contactPhone` are not in Serv1 yet, so the phone falls back to the customer phone.
