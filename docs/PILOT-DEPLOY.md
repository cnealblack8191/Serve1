# Serv1 pilot at serv1.ecinc.us (demo data, short-lived)

Owner, 2026-11-09: "use simple user names and simple passwords as I do not want this live long before
tying into our eci ecosystem, demo data, serv1.ecinc.us is fine", then "I will have you run it, no,
just have them be simple like admin, user, tech, share" and "instead of share, make it viewer".

This pack is **prepared, not run**. An AI session runs it on the owner's word, step by step, under
the AWS role the owner approves (see [Open questions](#open-questions)), never as an administrator. Nothing here
touches the ECI Prod server, `cnb-eci-webapp`, the live ECI API, TimeX or Central.

## What the pilot is

- **Demo only.** Synthetic records (the same demo data as the local demo) and a sign-in page that
  says "Demo only. Do not enter real customer, employee or pricing information."
- **One backend, one site.** The Amplify sandbox `serv1` in us-east-1 (Cognito, AppSync and DynamoDB,
  S3). The web app goes to the Amplify Hosting app that already exists: `serv1-demo` (appId
  `d2yxtjpp0ljka2`, branch `demo`, created 2026-10-31), which already has the single-page-app rewrite
  and the `serv1.ecinc.us` domain link (waiting for the Bluehost records). Today it serves a
  demo-mode build with no backend; step 2 replaces that build with the pilot build.
- **Off.** The Spectrum connector and the ECI1 tech bridge are off. The deploy script clears their
  switches, so no bridge URL, caller role or trail is created, and Spectrum calls are refused.
- **Four plain-username sign-ins, one per role:**

  | Username | Role             | Stands for (demo person) |
  | -------- | ---------------- | ------------------------ |
  | `admin`  | Admin            | Alex Admin               |
  | `user`   | Office           | Olivia Office            |
  | `tech`   | Tech             | Tara Tech                |
  | `viewer` | Owner, read-only | Owen Owner               |

  The other demo techs stay on the roster and the dispatch board, with no sign-in. The pilot's user
  pool signs in by username: `deploy-backend.sh` sets `SERV1_USERNAME_SIGNIN=true`, and
  `amplify/backend.ts` then removes Cognito's email-as-username setting. Cognito fixes that setting
  when a pool is created, and no Serv1 pool exists yet, so this is safe now. Every other deploy keeps
  email sign-in. Cognito still needs an email attribute, so each user gets `<username>@serv1.ecinc.us`
  with no mailbox, and no mail is sent.

- **Short-lived.** One teardown script removes the site, the sign-ins and all pilot data.

## Password

- **One simple password for all four sign-ins**, chosen by the owner when `create-users.sh` runs. The
  script asks for it twice at a hidden prompt.
- **Pool rule:** at least 8 characters with upper case, lower case, a digit and a symbol (Amplify's
  default), for example the shape `Pilot123!`. The script refuses a password that does not meet it.
- **Never stored:** it is not an argument, not shown on screen, and not written to a file, a log, the
  repository or a pull request. Hand it out in person.
- **Simpler is possible:** Cognito allows as few as 6 characters with no character classes, but that
  needs a change to the pool's password policy. Not recommended, even for a pilot.

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
2. **Web app:**
   ```bash
   AWS_PROFILE=serv1-builder bash scripts/pilot/deploy-web.sh
   ```
   It builds the site and uploads it to the existing app `serv1-demo`, branch `demo`, as a manual zip
   deploy with no GitHub connection or build role. It does not create the app or change its settings.
   The domain link already exists, so it only shows its status and the two DNS records. See
   [DNS at Bluehost](#dns-at-bluehost-what-the-owner-adds) below. The site also answers at
   `https://demo.d2yxtjpp0ljka2.amplifyapp.com` straight away.
3. **Sign-ins:**
   ```bash
   AWS_PROFILE=serv1-builder bash scripts/pilot/create-users.sh amplify_outputs.json
   ```
   It asks for the pilot password (hidden, typed twice), then creates `admin`, `user`, `tech` and
   `viewer` with it and puts each in its group. It writes `scripts/pilot/pilot-users.json` with
   usernames and Cognito ids but no password; that file is git-ignored. Re-running keeps existing users and their password;
   `--reset-passwords` sets the newly typed password on all four.
4. **Demo data:**
   ```bash
   npx tsx scripts/pilot/seed-demo.ts amplify_outputs.json scripts/pilot/pilot-users.json
   ```
   It uses no AWS credentials: it asks for the pilot password at a hidden prompt and signs in to
   Serv1 as `admin`. It then writes the
   demo customers, sites, jobs, opportunities, invoices, tech notes and receipts through Serv1's
   normal data API, so every access rule applies. Demo times are set in the company's time zone
   (America/New_York), even though CloudShell runs in UTC. Tara Tech's jobs go to `tech`. Re-running
   skips rows already there.
5. **Check:** open `https://serv1.ecinc.us`, see the Demo only notice, and sign in with each
   username. Check that `tech` sees only Tara Tech's jobs and that `viewer` can look but not change
   anything.

## DNS at Bluehost: what the owner adds

`ecinc.us` is served by Bluehost (`ns1.bluehost.com`, `ns2.bluehost.com`). On 2026-11-09
`serv1.ecinc.us` did not exist yet (NXDOMAIN), so there is nothing to change or remove first.

**Amplify needs two CNAME records, not an A record.** Amplify Hosting sits behind CloudFront, whose
addresses change, so an A record pointing at an IP address would break. Any existing IP on `ecinc.us`
itself (the main website) is not used and is not touched.

The domain link was created on 2026-11-09 and is waiting (`PENDING_VERIFICATION`). `deploy-web.sh`
prints both values at the end of step 2, and so does the status command in step 5 below. They look like this:

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
5. **Wait.** In the Amplify console (app `serv1-demo` → **Hosting** → **Custom domains**) the status
   moves through `PENDING_VERIFICATION` and `PENDING_DEPLOYMENT` to `AVAILABLE`, usually within an hour,
   occasionally up to 24 hours. Re-running the last command of `deploy-web.sh`, or
   `aws amplify get-domain-association --app-id d2yxtjpp0ljka2 --domain-name ecinc.us`, shows the
   status. Until then the site answers at `https://demo.d2yxtjpp0ljka2.amplifyapp.com`.

If the status says the verification record was not found after a few hours, the usual cause is a
doubled name (`...serv1.ecinc.us.ecinc.us`) in record 1. Edit the Host field to the short form.

## Teardown (when the pilot ends)

```bash
AWS_PROFILE=serv1-builder bash scripts/pilot/teardown.sh   # or the role the owner approves
```

It asks the person running it to type `DELETE SERV1 PILOT`. It then removes the `serv1.ecinc.us`
domain link and the whole `serv1` sandbox: the user pool and its sign-ins, the tables and all pilot
data, the bucket and the functions. This is irreversible, which is fine for demo data. The hosting
app `serv1-demo` itself is kept, because it existed before the pilot. The script prints the one
command that deletes it, for the owner to decide. Then delete the two `serv1` CNAME records in
Bluehost (same DNS page as above).

## Open questions

- **Which AWS role runs steps 1, 2 and teardown (with the owner).** No step runs as an
  administrator. As written, `infra/serv1-builder` cannot be applied: it trusts the IAM user
  `eci-ai-session`, which does not exist in the account. CDKToolkit is already in us-east-1, but
  without the restricted execution policy. The backend also expects the
  `serv1-permissions-boundary` policy from that stack. The role, and any Amplify Hosting permissions
  it needs for step 2, wait for the owner's decision.
- **Who adds the two Bluehost records:** the owner, or whoever holds the Bluehost login for
  `ecinc.us`.

## Cost

At pilot scale the backend stays mostly within the free tier. Amplify Hosting is cents per day for a
small site. The SPEC.md section 7.5 budget alert covers the rest.
