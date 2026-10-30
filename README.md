# Serv1 — Starter Kit

Internal field service app. Pilot demo: Tuesday, Nov 3, 2026.

## What's in this folder
| File | What it is |
|---|---|
| SPEC.md | The full plan. Every AI reads this. |
| AGENTS.md | Rules for every AI (Gemma, Codex, Claude Code). Also Codex review rules. |
| CLAUDE.md | Tells Claude Code to read AGENTS.md and SPEC.md. |
| CLAUDE_CODE_MIGRATION_PROMPT.md | Paste into Claude Code to move the ECI Hub off Supabase. |
| TASKS.md | Weekend task list for the loop. One task per line. No headers. |
| ISSUES.md | Codex writes test results here. Starts empty. |
| scripts/build_loop.sh | The Gemma + Codex automated loop. |
| logs/ | Loop progress (build.log) and finished tasks (done.txt). |

## Setup order (do these in order)

**1. GitHub**
- Create a new private repo named `serv1`.
- Clone it to your Mac, next to your ECI Project Hub folder:
  ```
  ~/Projects/serv1
  ~/Projects/eci-project-hub
  ```
  (If the Hub folder has a different name, change `../eci-project-hub` in the migration prompt.)
- Copy every file from this starter kit into `serv1`, then commit and push.
- Settings → Branches: protect `main`, require pull requests, **0 approvals** (so the loop can merge passing tasks).

**2. AWS**
- Create a dev account or area, an IAM user `serv1-builder` with limited permissions (SPEC.md section 7), and a $50/month budget alert.
- On the Mac: `aws configure --profile serv1-builder`

**3. Claude Code migration (Thursday–Friday)**
- Open Terminal in `serv1`, run `claude`, paste CLAUDE_CODE_MIGRATION_PROMPT.md.
- Test login yourself, then merge its pull request.

**4. Loop tools**
- `ollama list` → note your exact Gemma model name. Put it in `scripts/build_loop.sh` (GEMMA_MODEL line).
- Raise Ollama context (default is only 4K for Gemma 4):
  `launchctl setenv OLLAMA_CONTEXT_LENGTH 32768` then quit and reopen Ollama.
- Install Aider and Codex CLI; sign in to Codex.
- `gh auth login`
- In Codex settings → Code review: turn on for `serv1` and turn on Automatic reviews.

**5. Test run (Friday)**
- Make a copy of TASKS.md, then temporarily leave only ONE tiny task in it, e.g.
  `Add a footer that says Serv1 Pilot to every screen`
- Run: `caffeinate -dims ./scripts/build_loop.sh`
- Check: a pull request was made, merged, and the footer shows. Then restore the full TASKS.md.

**6. Weekend**
- Start: `caffeinate -dims ./scripts/build_loop.sh`
- Check `logs/build.log` and GitHub pull requests morning and evening.
- If it says STOPPED, fix that task with Claude Code, merge, add the task line to `logs/done.txt`, and restart the loop. Finished tasks are skipped automatically.

## Known limits
- The loop tests the web version only. Check the phone screens yourself.
- Passing tasks merge automatically so the next task can build on them. Codex code review still comments on each pull request; read those at check-ins.
- The script is a draft. Always do the Friday test run first.
