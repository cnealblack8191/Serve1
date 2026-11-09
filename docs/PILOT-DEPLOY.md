# Serv1 pilot at serv1.ecinc.us (demo data, short-lived)

Owner, 2026-11-09: "use simple user names and simple passwords as I do not want this live long before
tying into our eci ecosystem, demo data, serv1.ecinc.us is fine".

This pack is **prepared, not run**. Every step below runs only on the owner's word. Nothing here
touches the ECI Prod server, `cnb-eci-webapp`, the live ECI API, TimeX or Central.

## What the pilot is

- **Demo only.** Synthetic records (the same demo data as the local demo) and a sign-in page that
  says "Demo only. Do not enter real customer, employee or pricing information."
- **One backend, one site.** The Amplify sandbox `serv1` in us-east-1 (Cognito, AppSync and DynamoDB,
  S3), deployed with the `serv1-builder` role. The web app is on Amplify Hosting at
  `https://serv1.ecinc.us`.
- **Off.** The Spectrum connector and the ECI1 tech bridge are off. The deploy script clears their
  switches, so no bridge URL, caller role or trail is created, and Spectrum calls are refused.
- **Four sign-ins, one per role** (owner, 2026-11-09): `admin@serv1.ecinc.us` (Admin),
  `office@serv1.ecinc.us` (Office), `owner@serv1.ecinc.us` (Owner) and `tech@serv1.ecinc.us` (Tech). They
  are sign-in names only; no mail is sent to them. The other demo techs stay on the roster and the
  dispatch board, with no sign-in.
- **Short-lived.** One teardown script removes the site, the sign-ins and all pilot data.

## Password

- **One simple password for all four sign-ins**, chosen by the owner when `create-users.sh` runs. The
  script asks for it twice at a hidden prompt.
- **Pool rule:** at least 8 characters with upper case, lower case, a digit and a symbol (Amplify's
  default), for example the shape `Pilot123!`. The script refuses a password that does not meet it.
- **Never stored:** it is not an argument, not shown on screen, and not written to a file, a log, the
  repository or a pull request. Hand it out in person.
- **Simpler is possible:** Cognito allows as few as 6 characters with no character classes, but that
  needs a change to `amplify/auth/resource.ts`. Not recommended, even for a pilot.

## Steps (CloudShell, us-east-1, repository root)

0. **Prerequisites.** The `serv1-builder` stack and CDK bootstrap are in place
   (`infra/serv1-builder/RUNBOOK.md`). Clone the repository at the commit the owner approves, then
   check the account:
   ```bash
   git clone https://github.com/cnealblack8191/Serve1.git && cd Serve1
   aws sts get-caller-identity
   ```
1. **Backend** (about 10 minutes):
   ```bash
   AWS_PROFILE=serv1-builder bash scripts/pilot/deploy-backend.sh
   ```
   It writes `amplify_outputs.json`, which is git-ignored.
2. **Web app and domain:**
   ```bash
   bash scripts/pilot/deploy-web.sh
   ```
   It builds the site, publishes it to the Amplify Hosting app `serv1-pilot` (a manual zip deploy,
   with no GitHub connection or build role), links `serv1.ecinc.us`, and prints the DNS records to
   add. See [DNS](#dns-what-the-owner-adds) below. The site also answers at
   `https://main.<appId>.amplifyapp.com` straight away.
3. **Sign-ins:**
   ```bash
   bash scripts/pilot/create-users.sh amplify_outputs.json
   ```
   It asks for the pilot password (hidden, typed twice), then creates the four users with it and puts
   each in its group. It writes `scripts/pilot/pilot-users.json` with emails and Cognito ids but no
   password; that file is git-ignored. Re-running keeps existing users and their password;
   `--reset-passwords` sets the newly typed password on all four.
4. **Demo data:**
   ```bash
   npx tsx scripts/pilot/seed-demo.ts amplify_outputs.json scripts/pilot/pilot-users.json
   ```
   It asks for the pilot password at a hidden prompt (it signs in as `admin@`), then writes the demo customers, sites, jobs,
   opportunities, invoices, tech notes and receipts through Serv1's normal data API. Every access rule
   applies. Jobs are assigned to the pilot tech sign-ins. Re-running skips rows already there.
5. **Check:** open `https://serv1.ecinc.us`, see the Demo only notice, sign in as each role, and check
   that `tech@` sees only Tara Tech's jobs.

## DNS at Bluehost: what the owner adds

`ecinc.us` is served by Bluehost (`ns1.bluehost.com`, `ns2.bluehost.com`). On 2026-11-09
`serv1.ecinc.us` did not exist yet (NXDOMAIN), so there is nothing to change or remove first.

**Amplify needs two CNAME records, not an A record.** Amplify Hosting sits behind CloudFront, whose
addresses change, so an A record pointing at an IP address would break. Any existing IP on `ecinc.us`
itself (the main website) is not used and is not touched.

`deploy-web.sh` prints both values at the end of step 2. They look like this:

```
certificate: _3f9c...e1.serv1.ecinc.us. CNAME _7a2b...c4.xxxxxxxx.acm-validations.aws.
site:        serv1 CNAME d1abcd2efgh3ij.cloudfront.net
```

Then, in Bluehost:

1. Sign in at `https://my.bluehost.com` with the account that owns `ecinc.us`.
2. Open **Domains**, find `ecinc.us` and choose **Manage** (or **Settings**), then the **DNS** tab.
   On an older Bluehost dashboard this is **Advanced** → **Zone Editor** (cPanel), with the domain
   `ecinc.us` selected.
3. **Record 1, the certificate check.** Choose **Add Record** (cPanel: **+ Add Record** → **Add CNAME
   Record**):
   - Type: `CNAME`
   - Host / Name: the printed certificate name **without** `.ecinc.us.` at the end, for example
     `_3f9c...e1.serv1`. Bluehost adds `.ecinc.us` itself. If its form shows the full name, check that it
     reads `_3f9c...e1.serv1.ecinc.us`, not `...ecinc.us.ecinc.us`.
   - Points to / Record: the printed value, for example `_7a2b...c4.xxxxxxxx.acm-validations.aws`
     (copy it exactly; the trailing dot is optional).
   - TTL: the lowest offered (or 1 hour). Save.
4. **Record 2, the site.** Add a second record:
   - Type: `CNAME`
   - Host / Name: `serv1`
   - Points to: the printed CloudFront name, for example `d1abcd2efgh3ij.cloudfront.net`
   - TTL: the lowest offered (or 1 hour). Save.
5. **Wait.** In the Amplify console (app `serv1-pilot` → **Hosting** → **Custom domains**) the status
   moves through `PENDING_VERIFICATION` and `PENDING_DEPLOYMENT` to `AVAILABLE`, usually within an hour,
   occasionally up to 24 hours. Re-running the last command of `deploy-web.sh`, or
   `aws amplify get-domain-association --app-id <appId> --domain-name ecinc.us`, shows the status.
   Until then the site answers at `https://main.<appId>.amplifyapp.com`.

If the status says the verification record was not found after a few hours, the usual cause is a
doubled name (`...serv1.ecinc.us.ecinc.us`) in record 1. Edit the Host field to the short form.

## Teardown (when the pilot ends)

```bash
AWS_PROFILE=serv1-builder bash scripts/pilot/teardown.sh
```

It asks the person running it to type `DELETE SERV1 PILOT`. It then removes the Amplify Hosting app
(with its domain link) and the whole `serv1` sandbox: the user pool and its sign-ins, the tables and
all pilot data, the bucket and the functions. This is irreversible, which is fine for demo data. Then
delete the two `serv1` CNAME records in Bluehost (same DNS page as above).

## Open questions

- **Who adds the two Bluehost records:** the owner, or whoever holds the Bluehost login for
  `ecinc.us`.
- **Who runs step 2:** `serv1-builder` has AWS's `AmplifyBackendDeployFullAccess`, which covers the
  backend. Amplify Hosting (create app, deploy, domain link) may need the owner to run `deploy-web.sh`
  as an administrator in CloudShell, or an owner-approved addition to the role.
- **Sign-in names:** email-shaped names on the pilot subdomain (`admin@serv1.ecinc.us`). Serv1's
  sign-in is email-based. Plain names like `admin` would need a user-pool change, which can't be made
  to an existing pool.

## Cost

At pilot scale the backend stays mostly within the free tier. Amplify Hosting is cents per day for a
small site. The SPEC.md section 7.5 budget alert covers the rest.
