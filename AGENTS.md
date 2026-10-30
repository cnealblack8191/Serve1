# AGENTS.md — Rules for every AI working on Serv1

You are building Serv1, an internal field service app. Read SPEC.md first.

## Build rules

- Stack: Expo (React Native + web), TypeScript, AWS Amplify Gen 2
  (Cognito, Amplify Data, S3). Never use Supabase.
- All backend calls go through `src/data/`. Screens never call AWS directly.
- Work on ONE task at a time. Keep changes small.
- Never delete files, data, or AWS resources without approval.
- Never put passwords, keys, or credentials in code.
- Use AWS profile `serv1-builder` only.
- Follow the data model in SPEC.md section 5; ask before changing it.
- Use the status colors in SPEC.md section 12 everywhere.
- Do not copy code, text, or designs from any other product.
- After each task, list files changed and how to test it, in plain English.
  The owner has limited coding ability.

## Review guidelines

- Flag any use of Supabase.
- Flag credentials, keys, or secrets in code.
- Flag screens calling AWS directly instead of src/data/.
- Flag techs being able to see jobs not assigned to them.

## Repository rules (added by the migration session, 2026-10-30)

- Read `docs/PLAN.md` for the lane layout. Each lane owns the files listed there and nothing else.
- `src/data/` is the backend boundary. Import from `@/data` only. ESLint fails the build if a screen
  imports `aws-amplify` directly.
- Two backends, one API: with `amplify_outputs.json` present the app uses Cognito, AppSync and S3;
  without it the app runs on the local demo store (`src/data/local/`) with fake accounts
  (`*@serv1.demo`, password `serv1demo`). Build every screen so it works in both.
- Need a new data function? Add it in `src/data/<lane>.ts` and export it from `src/data/index.ts`
  in one line. Do not edit `src/data/backend.ts`, `types.ts`, `local/index.ts` or `amplify/index.ts`
  without the foundation session; changes to the data model go to the owner first (SPEC.md section 5).
- Status labels and colors come from `src/lib/status.ts`. Never hard-code them.
- Office-only controls (add, edit, create invoice, dispatch) render only when `useIsOffice()` from `@/data`
  is true; Owner accounts read everything and change nothing except invoice status. Routes that only
  office roles may use check `context.user.role` in `beforeLoad` and redirect others.
- Job and invoice numbers come from `newJobNumber()` / `newInvoiceNumber()` in `@/data`, never from a row count.
- Check before pushing: `npm run guard && npm run lint && npm run typecheck && npx vite build`, then
  `npx playwright test` (set `PW_CHROMIUM` to an installed Chromium if downloads are blocked).
- Never commit `amplify_outputs.json`, `.env` or any credential. The guard script fails the build on
  the word "supabase" outside the planning files.
