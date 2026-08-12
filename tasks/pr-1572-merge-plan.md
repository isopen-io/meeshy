# PR #1572 — merge plan (branch claude/loving-fermat-w5kcb9 → main)

## What the PR does
Two gateway realtime fixes (see .changeset/realtime-handler-cache-and-typing-throttle.md):
1. MessageHandler.participantIdCache → BoundedTtlCache (unbounded Map memory leak)
2. typing:stop resets the typing:start throttle (dropped indicator)
Plus BoundedTtlCache.keys() + tests. Verified locally: 1944/1944 socketio+utils tests pass.

## Merge protocol (manual, per task mandate — NO GitHub auto-merge)
On each self check-in:
1. get_check_runs for PR 1572.
   - Any check `in_progress`/`queued` → do nothing, wait for next tick.
   - Any `failure`/`cancelled`/`timed_out` → fetch failed job logs, diagnose, fix on the branch, push, re-check. If real & out of scope or stuck after several kicks → report + stop.
   - All `success` → proceed to step 2.
2. `git fetch origin main`. If main advanced beyond the merge-base:
   - Merge origin/main INTO the branch locally (manual conflict resolution — never lose others' work).
   - Re-run affected gateway tests. Push.
   - Let CI re-run; loop back to step 1.
   - If main did NOT advance → skip to step 3.
3. Merge PR 1572 into main (merge_pull_request).
4. Delete branch claude/loving-fermat-w5kcb9.
5. Delete the polling cron. Done — notify user of the merge.

## State
- PR created: #1572. CI (Quality bun + Security) started ~14:33 UTC 2026-07-06, in_progress.
- Branch was even with main at push time.
