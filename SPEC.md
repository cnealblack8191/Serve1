# Serv1 — Product Spec & Build Ops Guide (v0.3)

**Purpose:** Internal field service and operations platform, modeled on the *feature set* of BuildOps, built from scratch for internal use only.
**Platforms:** Web (office/dispatch) + iPhone/Android (field techs)
**Backend:** AWS Amplify Gen 2 (no Supabase)
**Build method:** Claude Code migrates the ECI Project Hub → Gemma 4 (local, Ollama) builds tasks → Codex tests and reviews → automated loop
**Milestone:** Shareholder pilot demo, Tuesday Nov 3, 2026

## 1. Ground Rules
1. **Build original, don't copy.** Replicate *functions* (scheduling, work orders, invoicing), never BuildOps' code, screen designs, name, logos, text, or data.
2. **Check BuildOps' Terms of Service** if anyone on the team has had an account or trial. Many SaaS terms prohibit using access to build a competing product. Not legal advice; a short lawyer review is worth it.
3. **Internal use only.** If Serv1 is ever sold, re-review points 1 and 2 first.
4. **Fresh repo.** The ECI Project Hub repo is copied from, never changed. No Supabase code is carried over.

## 2. User Roles
| Role | Can Do |
|---|---|
| Admin | Everything, incl. users, settings, pricing |
| Office / Dispatcher | Customers, jobs, scheduling, quotes, invoices |
| Technician | Assigned jobs only: notes, photos, time, signatures |
| Owner / Manager | View all, dashboard, approve quotes and invoices |

## 3. Feature Modules
### Version 1 (features 1–7)
1. **Customers & Sites** — contacts, multiple service locations, access notes
2. **Equipment / Assets** — units per site with service history
3. **Jobs & Work Orders** — status: New → Scheduled → In Progress → Complete → Invoiced
4. **Scheduling & Dispatch Board** — drag-and-drop calendar by tech
5. **Technician Mobile App** — today's jobs, clock in/out, photos, notes, signature, offline sync
6. **Quotes / Estimates** — line items, PDF, e-signature, convert to job
7. **Invoicing** — from completed work, PDF/email, QuickBooks Online sync

### Later
8. Service agreements / preventive maintenance
9. Inventory (warehouse + truck)
10. Job costing (margin per job)
11. Projects (bids, change orders, daily logs)
12. Reports & dashboard (full)
13. Live tech location map

## 4. Pilot Scope (Tuesday Demo)
### Demo story
1. A customer calls; the office creates the job.
2. The office drags it onto a tech's schedule.
3. The tech completes it on a phone screen with a photo and signature.
4. The office turns the finished job into an invoice with one click.
5. The owner's dashboard shows jobs completed and revenue.
6. Close with a roadmap slide (everything else in Section 3).

### In the pilot
- Login with roles (Admin, Office, Tech, Owner)
- Customers + sites (basic)
- Jobs + status flow
- Dispatch board with drag-and-drop
- Tech screen (runs in a phone browser for the demo)
- Photo upload + signature capture
- One-click invoice (on-screen + PDF)
- Simple owner dashboard (jobs completed, revenue)
- Realistic sample data (fake names)

### Not in the pilot (roadmap slide)
Offline mode, QuickBooks sync, app store builds, equipment history, quotes, agreements, inventory, job costing, live location.

## 5. Data Model (pilot tables marked ★)
| Table | Key Fields |
|---|---|
| users ★ | name, email, role, phone, active |
| customers ★ | name, billing address, phone, email |
| sites ★ | customer, address, access notes |
| jobs ★ | customer, site, description, priority, status, assigned tech, scheduled start/end |
| attachments ★ | job, file location (S3), type |
| signatures ★ | job, signer name, image (S3), timestamp |
| invoices ★ | job, line items, total, status, created date |
| assets | site, type, make, model, serial, install date |
| quotes | job, line items, status, signed date |
| time_entries | job, tech, start, end |

## 6. Tech Stack
| Layer | Choice | Why |
|---|---|---|
| Web + Mobile | Expo (React Native + web), TypeScript | One codebase for web, iOS, Android; ECI Hub is already Expo |
| Backend framework | AWS Amplify Gen 2 | Bundles login, data, storage, hosting; least setup |
| Login | Amazon Cognito | Roles via user groups |
| Database (pilot) | Amplify Data (AppSync + DynamoDB) | Fastest to stand up for Tuesday |
| Database (later, decide) | Stay on DynamoDB, or move to RDS Postgres | Postgres is better for job costing/reports; decide before job costing |
| Files | Amazon S3 | Photos, signatures, PDFs |
| Email | Amazon SES on cnbconnect.ai | Invoices/quotes (after pilot) |
| Web hosting | Amplify Hosting | Auto-deploys from GitHub |
| Code structure | All backend calls in `src/data/` | Easier for Gemma; backend can change without touching screens |

## 7. AWS Setup
1. **Separate dev environment.** Ideally a separate AWS account under AWS Organizations, so nothing touches existing apps.
2. **Region:** pick one (e.g., us-east-1) and use it for everything.
3. **Build tool access:** one IAM user named `serv1-builder`, used only by build tools on the Mac.
   - Permissions limited to: Amplify, Cognito, AppSync, DynamoDB, S3, CloudFormation, IAM pass-role for Amplify, CloudWatch Logs.
   - No billing, no Organizations, no access to other apps' resources.
4. **Credentials:** only in the Mac's AWS profile (`~/.aws`), never in the repo.
5. **Budget alert:** AWS Budgets alarm (e.g., $50/month) emailed to you.
6. **Cognito groups:** Admin, Office, Tech, Owner.
7. **S3:** private; files accessed only through signed links.

## 8. GitHub Setup
1. New **private** repo: `serv1`.
2. Starter files: SPEC.md, AGENTS.md, CLAUDE.md, TASKS.md, ISSUES.md, scripts/, logs/.
3. GitHub CLI (`gh`) installed and signed in on the Mac.
4. **Branch protection on `main`:** require pull requests, 0 required approvals (lets the loop merge passing tasks).
5. **Codex code review** on for the repo, with Automatic reviews. It reviews pull requests only, flags high-priority issues, and uses your Codex limits.
6. Connect **Amplify Hosting** to the repo so `main` auto-deploys the demo site.
7. ECI Project Hub repo: untouched; copy-from only.

## 9. AI Rules
See `AGENTS.md`. Every AI (Claude Code, Gemma via Aider, Codex) follows it. Its "Review guidelines" section steers Codex code review.

## 10. Automated Build & Test Loop
**How it works:** Gemma builds one task from TASKS.md → Codex starts the app and runs browser tests (Playwright) → Codex writes PASS or a list of problems to ISSUES.md → Gemma fixes → up to 3 rounds → pull request. Passing tasks are merged so the next task builds on them. A task that still fails after 3 rounds stops the loop and is flagged for Charles.

**Script:** `scripts/build_loop.sh`. Run with `caffeinate -dims ./scripts/build_loop.sh` so the Mac stays awake.

**Restarting:** finished tasks are listed in `logs/done.txt` and skipped automatically.

**Known limits:** tests run on the web version only (phone screens are checked by hand); the loop can't judge business fit; complex tasks may need Claude Code.

## 11. Research Findings: Workflows & UI
**Technician app**
- Adoption makes or breaks the system. If techs find it slow or confusing, they work around it.
- Optimize for speed of finishing the job, not number of features.
- Screens follow the real order of a service call, not database structure.
- Large tap targets (gloves, dirty hands, bright sun). Camera is one tap away.
- Home screen = today's jobs. Bottom tabs for everything else.
- Job details (site access, equipment, history) visible before arrival.
- Involve 1–2 real techs early; test with them before rollout.

**Dispatch board**
- Unscheduled jobs queue on one side, techs on a timeline.
- Drag from queue to a tech's time slot = assigned and scheduled in one move. Dragging between techs reassigns.
- Color = status, one legend, same colors everywhere.
- Optional confirm on drop to prevent accidental moves.
- Assignment pushes the job to the tech's phone.
- Completed jobs flow straight to billing.

## 12. Core Workflows & Status Colors
**W1 — Call-in to job (Office):** New Job → search/select customer (or quick-add) → pick site → job type, priority, description → Save. Status **New**. Job appears in the Unscheduled queue.

**W2 — Dispatch (Office):** Dispatch board → drag job onto tech + time → (confirm) → Status **Scheduled**. Job appears on the tech's Today screen.

**W3 — Field work (Tech):** Today → tap job → see site, access notes, equipment → Start Job (status **In Progress**) → photos and notes → Complete → customer signs → Status **Complete**.

**W4 — Billing (Office):** Completed jobs → Create Invoice (auto-fills labor + items) → review → PDF. Status **Invoiced**.

**W5 — Oversight (Owner):** Dashboard: jobs completed (today/week), revenue invoiced, open jobs by status, jobs per tech.

| Status | Color |
|---|---|
| New | Gray |
| Scheduled | Blue |
| In Progress | Orange |
| Complete | Green |
| Invoiced | Purple |

## 13. Screen Map & UI Rules
**Office (web, laptop):** Login · Dashboard · Customers list · Customer detail (sites, history) · New Job · Jobs list · Dispatch Board · Job detail · Invoice view/PDF.

**Tech (phone):** Login · Today · Job detail · Complete Job (photos, notes, signature) · Done confirmation.

**UI rules**
- Web: left sidebar navigation. Phone: bottom tabs.
- One primary button per screen, always in the same place.
- Minimum tap target ~48px on phone; large readable text.
- Status colors from Section 12 only; no other meaning for those colors.
- Every list has search; every screen has a clear empty state ("No jobs today").
- Light and dark mode.
- Company logo and colors on login and header.

**Dispatch board component**
- First choice: React Native Calendar Kit (resource view shows techs side by side, drag-and-drop). Caution: its web version is a trial, not fully optimized.
- Fallback: a simple web-only board (columns per tech, time slots) for the laptop.
- Decide during the Friday test; don't let it block the weekend.

## 14. ECI Project Hub → Serv1 Migration (Claude Code)
1. Copy the Hub's app code into `serv1` (copy, not fork; Hub stays untouched).
2. List every file that uses Supabase.
3. Create `src/data/`; all backend calls go through it.
4. Swap: Supabase login → Amplify Auth (Cognito); storage → Amplify Storage (S3); tables → Amplify Data.
5. Remove the Supabase package and keys. If keys were ever committed, rotate them.
6. Add a check that fails the build if "supabase" appears in app code.

Done by Friday night, before the loop starts. Prompt: `CLAUDE_CODE_MIGRATION_PROMPT.md`.

## 15. Mac Tool Setup
| Tool | Setup | Notes |
|---|---|---|
| Gemma 4 | `ollama pull gemma4:e4b` (16 GB Mac) or `ollama pull gemma4:26b` (32 GB+) | Bigger = better code |
| Ollama context | `launchctl setenv OLLAMA_CONTEXT_LENGTH 32768`, restart Ollama | Default is only 4K for Gemma 4; model "forgets" files |
| Aider | `aider --model ollama_chat/gemma4:<size>` | Lets Gemma edit files |
| Codex CLI | Install and sign in | Runs tests in the loop |
| Codex GitHub review | Codex settings → Code review → on for `serv1` + Automatic reviews | Pull requests only |
| Playwright | `npx playwright install` | Browser testing |
| GitHub CLI | `gh auth login` | Creates and merges pull requests |
| AWS CLI | `aws configure --profile serv1-builder` | Limited builder user |
| Amplify | `npx ampx sandbox --profile serv1-builder` | Personal cloud test backend |
| Keep awake | `caffeinate -dims` | Mac must not sleep |

## 16. Weekend Plan
**Thu–Fri (Charles + Claude Code):** AWS + GitHub setup · tools installed · Hub migrated to Amplify · one tiny test task through the loop.

**Loop tasks:** see TASKS.md (12 tasks, in order).

**Sat–Sun:** loop runs; check-ins morning and evening (logs/build.log + GitHub pull requests).

**Mon:** feature freeze midday, full rehearsal on laptop + phone, roadmap slide.

**Tue:** shareholder demo.

## 17. Risks
| Risk | Mitigation |
|---|---|
| Setup eats Friday | Start tonight; keep pilot scope fixed |
| Gemma struggles on complex tasks | Loop stops after 3 failed rounds; finish with Claude Code |
| Loop breaks working features | Tests rerun each task; every task on its own branch |
| AWS cost surprise | Budget alert; dev-only resources |
| Credentials leak | Never in repo; limited builder user; .gitignore |
| ToS / IP | Section 1 rules |

## 18. Decisions & Open Questions
1. How much memory does the Mac have? (Decides Gemma size.)
2. Separate AWS account or separate area in the existing one?
3. Company name, logo, and colors for the demo.
4. Which trade(s) the sample data shows (HVAC, electrical, plumbing).
5. Can 1–2 real techs try the phone screens Monday?
6. DynamoDB long term, or Postgres before job costing?
7. Accounting system confirmed as QuickBooks Online?
8. Any existing data to import later?
