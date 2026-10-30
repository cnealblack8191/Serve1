# Supabase inventory (migration steps 1 to 6)

Source: `cnealblack8191/eci-project-hub` at commit `c55ead3`, copied into this repo on 2026-10-29
without its git history, its `.env`, or its `.lovable/` folder. The Hub repo was not modified.

## Files that use Supabase (to be replaced by `src/data/`)

| File                                                          | What it does with Supabase                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/integrations/supabase/client.ts`                         | Browser client (publishable key, custom fetch, preview auth storage)                                                                                                           |
| `src/integrations/supabase/client.server.ts`                  | Server admin client using the **service-role key** (bypasses RLS)                                                                                                              |
| `src/integrations/supabase/auth-middleware.ts`                | TanStack server-function middleware: validates the bearer token with `auth.getClaims`                                                                                          |
| `src/integrations/supabase/auth-attacher.ts`                  | Attaches the session token to server-function calls                                                                                                                            |
| `src/integrations/supabase/cron-auth.ts`                      | Shared-secret check for the scheduled-reminders webhook                                                                                                                        |
| `src/integrations/supabase/previewAuthStorage.ts`             | Auth storage shim for the Lovable preview iframe                                                                                                                               |
| `src/integrations/supabase/types.ts`                          | Generated database types                                                                                                                                                       |
| `src/lib/eci/store.tsx`                                       | Main app store: `auth.getSession`, `onAuthStateChange`, `signOut`, `rpc("ensure_profile")`, `profiles`, realtime channel `eci-live`, generic `from(table)` for 14 pilot tables |
| `src/lib/eci/reminders.functions.ts` / `reminders.server.ts`  | Reminders CRUD and scheduled send (server client)                                                                                                                              |
| `src/lib/eci/email-import.functions.ts`                       | Email history import (`email_records`)                                                                                                                                         |
| `src/lib/comms/comms.functions.ts`                            | Communications API: `message_threads`, `messages`, `message_links`, `message_attachments`, `mailbox_sync_state`                                                                |
| `src/lib/comms/matching.server.ts`                            | CRM address matching against `customers` / `opportunities`                                                                                                                     |
| `src/lib/intake/intake.functions.ts`                          | Bid intake queue (`bid_intake`, `customers`, `opportunities`)                                                                                                                  |
| `src/lib/integrations/ms365.functions.ts` / `ms365.server.ts` | `ms365_settings` (service-role only), `rpc("is_owner")`                                                                                                                        |
| `src/lib/sharepoint/documents.functions.ts`                   | `document_refs`, `document_links`, `document_locations`                                                                                                                        |
| `src/routes/__root.tsx`                                       | Injects Supabase env values into the page                                                                                                                                      |
| `src/routes/auth.tsx`                                         | Sign in / sign up with email + password                                                                                                                                        |
| `src/routes/_authenticated/route.tsx`                         | Route guard: `auth.getUser()`                                                                                                                                                  |
| `src/routes/api/public/hooks/scheduled-reminders.ts`          | Webhook called by a Supabase cron                                                                                                                                              |
| `src/start.ts`                                                | Registers the auth middleware globally                                                                                                                                         |
| `package.json`, `bun.lock`                                    | `@supabase/supabase-js` dependency                                                                                                                                             |
| `supabase/config.toml`                                        | Supabase project id                                                                                                                                                            |
| `drizzle/migrations/*.sql`, `drizzle/schema.ts`               | Postgres schema, 53 RLS policies, functions `ensure_profile`, `has_permission`, `has_role`, `is_owner`                                                                         |

## Database objects the Hub depends on

Tables (29): app_owners, approval_records, bid_intake, bids, customers, document_links, document_locations,
document_refs, email_records, employees, invoices, jobs, line_items, mailbox_sync_state, material_requests,
message_attachments, message_links, message_threads, messages, ms365_settings, notifications, opportunities,
profiles, receipts, reminders, role_permissions, user_roles, work_orders, and `private.cron_settings`.

Roles enum in Supabase: Admin, Division Manager, Service Manager, Coordinator, AP/AR, Field.
Target Cognito groups (task brief): Admin, Office, Tech, Owner. The mapping needs an owner decision.

Other Supabase features in use: Auth (email + password), RPC functions, Realtime channel, cron webhook.
Supabase Storage is **not** used; documents live in SharePoint via Microsoft Graph.

## Secrets committed to the Hub repo

`.env` is tracked in the Hub repo (commit `2311630`) and contains `SUPABASE_URL`, `SUPABASE_PROJECT_ID` and
the **publishable (anon) key**. The publishable key is designed to be public and is protected by RLS, so this
is low risk, but it should still be removed from the Hub's history or rotated when Supabase is retired.
The **service-role key** is read from `process.env` only and was never committed. No other secret was found
in the Hub's git history. The `.env` was deliberately not copied into this repo.

## What happened to each file (2026-10-30, foundation branch)

Every file in the table above was removed from Serv1. None of the Hub's business modules fit the pilot
data model (SPEC.md section 5), and all of them read Supabase tables that no longer exist here. They stay
unchanged in the Hub repo and in this repo's `main` baseline commit (`66825c7`), so nothing is lost.

| Hub capability                                                                                                   | Serv1 replacement                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Auth (email + password)                                                                                 | Cognito through `src/data` (`signIn`, `completeNewPassword`, `signOut`, `getCurrentUser`); roles are Cognito groups Admin, Office, Tech, Owner |
| `profiles`, `user_roles`, `role_permissions`, `app_owners`, RPC `has_permission` / `is_owner` / `ensure_profile` | Cognito groups decide access; the `User` table holds name, role, phone, active (SPEC.md ★ users)                                               |
| `customers`, `jobs`, `invoices`, `employees`                                                                     | `Customer`, `Job`, `Invoice`, `User` models in `amplify/data/resource.ts` with group rules                                                     |
| Realtime channel `eci-live`                                                                                      | AppSync subscriptions behind `onDataChange()`; the app shell refreshes open screens                                                            |
| Server functions with the service-role key                                                                       | None. The browser talks to AppSync with the user's own token; rules are enforced server-side                                                   |
| Scheduled reminders cron webhook                                                                                 | Not in the pilot                                                                                                                               |
| Communications, intake, SharePoint documents, Microsoft 365 settings, bids, opportunities, materials, receipts   | Not in the pilot (SPEC.md section 4). Files live in SharePoint in the Hub; Serv1 stores photos, signatures and PDFs in a private S3 bucket     |
| `@supabase/supabase-js`, `supabase/config.toml`, `drizzle/`, `.env` keys                                         | Removed. `scripts/guard.sh` fails the build if "supabase" reappears                                                                            |

Key rotation: the Hub's committed publishable key should be rotated in the Supabase dashboard when the Hub
is retired (owner action; it is the Hub's key, not Serv1's).
