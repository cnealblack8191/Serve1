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
