# Serv1 build plan (from SPEC.md v0.3) — written 2026-10-30

Demo: Tuesday Nov 3. This plan turns the copied ECI Project Hub into the Serv1 pilot in two stages.

## Stage A — foundation (one session, this branch, PR 1)

Goal: a clean app skeleton that builds, signs in, and talks to the backend only through `src/data/`.

1. Plain web app. The Hub ran as a TanStack Start server app (Lovable's config, Cloudflare target,
   server functions). Serv1 is a client-only Vite + React + TanStack Router app: Amplify Hosting serves
   static files and the browser talks to Cognito, AppSync and S3 directly through `src/data/`.
   No server code remains.
2. Amplify Gen 2 backend in `amplify/`: Auth (email login, groups Admin, Office, Tech, Owner), Data
   (the seven ★ tables: users, customers, sites, jobs, attachments, signatures, invoices), Storage
   (private S3, signed links only).
3. `src/data/` is the only backend boundary. It has two interchangeable back ends behind one API:
   - `amplify` (real) when `amplify_outputs.json` exists;
   - `local` (in-browser, seeded with fake data) when it does not, so screens and Playwright tests run
     without AWS credentials. Switching back ends never touches a screen.
4. Login page and app shell reuse the Hub's design (components/ui, styling, logo). Navigation follows
   SPEC section 13: Office gets Dashboard, Customers, Jobs, Dispatch, Invoices; Tech gets Today.
5. Hub modules outside the pilot are removed from this repo: CRM and opportunities, estimating and bids,
   materials, AP receipts, communications and shared mailbox, bid intake, SharePoint documents,
   Microsoft 365 settings, reminders and the cron webhook, Smartsheet import, team and permission
   editing. They remain unchanged in the Hub repo and in this repo's `main` baseline commit. They all
   depended on Supabase tables that are not in the pilot model.
6. Guard rails: `scripts/check-no-supabase.sh` fails `npm run build` if "supabase" appears in app
   code; a GitHub Actions `check` workflow runs typecheck, the guard, the build and the Playwright smoke
   test on every push.

## Stage B — pilot screens (parallel lane sessions, one branch and PR each)

Each lane owns its own route files and component folder, calls `src/data/` only, and adds any new data
function in its own `src/data/<lane>.ts` file. Lanes branch from the foundation branch.

| Lane     | TASKS.md items                                              | Owns                                                                                 |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| office   | 2, 3, 4: customers and sites, new job, jobs list            | `src/routes/_authenticated/customers.*`, `jobs.*`, `src/components/serv1/office/`    |
| dispatch | 5: dispatch board                                           | `src/routes/_authenticated/dispatch.tsx`, `src/components/serv1/dispatch/`           |
| tech     | 6, 7, 8: Today, job detail, photos, notes, signature        | `src/routes/_authenticated/tech.*`, `src/components/serv1/tech/`                     |
| billing  | 9, 10: one-click invoice with PDF, owner dashboard          | `src/routes/_authenticated/invoices.*`, `index.tsx`, `src/components/serv1/billing/` |
| demo     | 1 (seed data), 11 (demo-story Playwright test), 12 (polish) | `src/data/local/seed.ts`, `tests/`                                                   |

Shared files (`AppShell.tsx`, `src/data/*` core, `package.json`) belong to the foundation session; lanes
ask for changes there instead of editing them.

## Decisions taken here (owner to confirm)

- Web stack stays Vite + React (the Hub's), not Expo. SPEC 6 assumed the Hub was Expo; it is not.
  The pilot runs the tech screens in a phone browser (SPEC 4), so nothing in the demo needs Expo.
- Cognito groups are the permission source (owner's words, 2026-10-30: "Cognito is the decision").
  A user record also carries a `role` field for display and seeding; access is decided by group.
- Techs see only jobs assigned to them. The Amplify data rules enforce this server-side.
