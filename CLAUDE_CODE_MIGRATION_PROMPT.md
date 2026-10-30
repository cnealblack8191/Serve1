# Paste this into Claude Code (opened in the serv1 folder)

Read SPEC.md, especially sections 5, 6, 9, 12, 13, and 14, and follow AGENTS.md.

Task: Migrate the ECI Project Hub (in ../eci-project-hub) into this
new serv1 repo, replacing Supabase entirely with AWS Amplify Gen 2.

Rules:

- Do NOT modify ../eci-project-hub. Copy only.
- Explain each step in plain English. I have limited coding ability.
- Ask before deleting anything or creating AWS resources.
- Never put keys or secrets in code.
- Use AWS profile serv1-builder only.

Steps:

1. Copy the Hub's app code here. List every file that uses Supabase.
2. Set up Amplify Gen 2: Auth (Cognito with groups Admin, Office,
   Tech, Owner), Data (the pilot tables marked ★ in SPEC.md section 5),
   Storage (S3, private).
3. Create src/data/ as the only place that talks to the backend.
   Screens must call src/data/, never AWS directly.
4. Replace every Supabase call with Amplify through src/data/.
5. Remove the Supabase package, config, and keys. Tell me if any
   Supabase keys were ever committed to the Hub repo.
6. Add a check that fails the build if "supabase" appears anywhere
   (outside SPEC.md, AGENTS.md, and this prompt file).
7. Start an Amplify sandbox and confirm login works on web.
8. Add Playwright and confirm one simple test runs.
9. Commit on a branch and open a pull request.

When done, give me a plain-English summary: what changed, what
works, what doesn't yet, and how I can test it myself.
