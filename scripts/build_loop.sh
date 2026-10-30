#!/bin/bash
# Serv1 build loop (draft v2 - test on ONE small task before the weekend)
# Gemma (via Aider) builds each task -> Codex tests it in a browser ->
# Gemma fixes -> max 3 rounds -> pull request. Passing tasks are merged
# so the next task builds on them. A task that keeps failing stops the loop.
#
# Run from the serv1 folder:   caffeinate -dims ./scripts/build_loop.sh

GEMMA_MODEL="ollama_chat/gemma4:26b"   # CHANGE to your exact model (run: ollama list)
MAX_ROUNDS=3

cd "$(dirname "$0")/.." || exit 1
mkdir -p logs
touch logs/done.txt
LOG=logs/build.log

while IFS= read -r TASK || [ -n "$TASK" ]; do
  [ -z "$TASK" ] && continue
  if grep -Fxq "$TASK" logs/done.txt; then
    echo "Skipping (already done): $TASK" | tee -a "$LOG"; continue
  fi

  BRANCH="task-$(date +%s)"
  git checkout main && git pull && git checkout -b "$BRANCH" || exit 1
  echo "=== $(date) TASK: $TASK ===" | tee -a "$LOG"

  # Gemma builds (< /dev/null stops tools from eating the task list)
  aider --model "$GEMMA_MODEL" --yes-always --no-auto-commits \
        --read SPEC.md --read AGENTS.md \
        --message "Build this task: $TASK" < /dev/null

  PASSED=false
  for ROUND in $(seq 1 $MAX_ROUNDS); do
    : > ISSUES.md   # clear old results so a stale PASS can't slip through
    codex exec --full-auto "Start the web app. Write or update Playwright tests \
for this task: '$TASK'. Run them. If all pass, write only the word PASS on the \
first line of ISSUES.md. If any fail, write each failure to ISSUES.md with \
steps to reproduce, and save screenshots in test-results/. Do not change app \
code, only test files and ISSUES.md." < /dev/null

    if head -n 1 ISSUES.md | grep -q "^PASS"; then
      PASSED=true; echo "Round $ROUND: PASS" | tee -a "$LOG"; break
    fi
    echo "Round $ROUND: issues found" | tee -a "$LOG"

    aider --model "$GEMMA_MODEL" --yes-always --no-auto-commits \
          --read SPEC.md --read AGENTS.md --read ISSUES.md \
          --message "Fix every issue listed in ISSUES.md. Do not break other features." < /dev/null
  done

  git add -A && git commit -m "$TASK" && git push -u origin "$BRANCH"

  if $PASSED; then
    gh pr create --title "$TASK" --body "Passed automated tests." --base main
    gh pr merge "$BRANCH" --squash --delete-branch
    echo "$TASK" >> logs/done.txt
    git checkout main && git pull
  else
    gh pr create --title "NEEDS REVIEW: $TASK" \
                 --body "Failed after $MAX_ROUNDS rounds. See ISSUES.md." --base main
    echo "STOPPED: needs Charles on: $TASK" | tee -a "$LOG"
    break
  fi
done < TASKS.md

echo "=== $(date) Loop finished ===" | tee -a "$LOG"
