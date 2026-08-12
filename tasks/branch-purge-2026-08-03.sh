#!/bin/bash
#
# Repository hygiene script: Remove merged branches and worktrees
# Generated: 2026-08-03
#
# This script performs the following operations (when CONFIRM=yes):
# 1. Deletes merged origin/claude/* branches (in batches of 50)
# 2. Deletes merged origin/dependabot/* branches (in batches of 50)
# 3. Removes merged, unlocked worktrees
#
# USAGE:
#   CONFIRM=yes ./branch-purge-2026-08-03.sh
#
# Without CONFIRM=yes, the script runs in dry-run mode (no deletions).

set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ "${CONFIRM:-}" != "yes" ]; then
  echo "DRY RUN MODE (no changes will be made)"
  echo "To actually delete branches and worktrees, run:"
  echo "  CONFIRM=yes $0"
  echo ""
  DRY_RUN=true
else
  echo "LIVE MODE - branches and worktrees will be deleted"
  DRY_RUN=false
fi

echo ""
echo "========================================="
echo "Step 1: Fetch latest remote state"
echo "========================================="
git fetch origin 2>&1 | head -20

echo ""
echo "========================================="
echo "Step 2: Delete merged origin/claude/* branches (batch by 50)"
echo "========================================="

MERGED_CLAUDE=$(git branch -r --merged origin/main | grep "origin/claude/" | sed 's|origin/||' | sort || true)
CLAUDE_COUNT=$(echo "$MERGED_CLAUDE" | grep -c . || true)
echo "Found $CLAUDE_COUNT merged origin/claude/* branches"

if [ "$CLAUDE_COUNT" -gt 0 ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] would delete all $CLAUDE_COUNT branches (batches of 50 per push)"
    echo "$MERGED_CLAUDE" | head -10 | sed 's/^/    /'
    echo "    ..."
  else
    echo "$MERGED_CLAUDE" | xargs -n 50 git push origin --delete 2>&1 | grep -vE "^remote:|^To " || echo "    (some deletions failed, continuing)"
  fi
fi

echo ""
echo "========================================="
echo "Step 3: Delete merged origin/dependabot/* branches (batch by 50)"
echo "========================================="

MERGED_DEPENDABOT=$(git branch -r --merged origin/main | grep "origin/dependabot/" | sed 's|origin/||' | sort || true)
DEPENDABOT_COUNT=$(echo "$MERGED_DEPENDABOT" | grep -c . || true)
echo "Found $DEPENDABOT_COUNT merged origin/dependabot/* branches"

if [ "$DEPENDABOT_COUNT" -gt 0 ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] would delete all $DEPENDABOT_COUNT branches (batches of 50 per push)"
  else
    echo "$MERGED_DEPENDABOT" | xargs -n 50 git push origin --delete 2>&1 | grep -vE "^remote:|^To " || echo "    (some deletions failed, continuing)"
  fi
fi

echo ""
echo "========================================="
echo "Step 4: Remove merged, unlocked worktrees"
echo "========================================="

# Worktrees to consider (only those with merged branches, not locked)
declare -a MERGED_UNLOCKED_WORKTREES=(
  "/Users/smpceo/Documents/v2_meeshy-fix-anon-signal-cleanup|fix/calls-anon-disconnect-signal-cleanup"
  "/Users/smpceo/Documents/v2_meeshy/.claude/worktrees/fix-read-exactness|fix-read-exactness"
)

for entry in "${MERGED_UNLOCKED_WORKTREES[@]}"; do
  path="${entry%|*}"
  branch="${entry#*|}"

  if [ -d "$path" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "  [DRY RUN] would remove worktree: $path (branch: $branch)"
    else
      echo "  Removing worktree: $path"
      git worktree remove "$path" 2>&1 || echo "    (failed, continuing)"
    fi
  else
    echo "  Worktree not found: $path"
  fi
done

echo ""
echo "========================================="
echo "NOTES ON REMAINING DECISIONS"
echo "========================================="
echo ""
echo "1. LOCKED WORKTREES (active sessions - do NOT delete without manual unlock)"
echo "   - /Users/smpceo/Documents/v2_meeshy/.claude/worktrees/post-hashtags"
echo "     Branch: worktree-post-hashtags (merged, LOCKED)"
echo "   - /Users/smpceo/Documents/v2_meeshy/.claude/worktrees/story-snapshot-fidelity"
echo "     Branch: worktree-story-snapshot-fidelity (merged, LOCKED)"
echo "   - /Users/smpceo/Documents/v2_meeshy/.claude/worktrees/wf_4f6a134d-4c9-3"
echo "     Branch: worktree-wf_4f6a134d-4c9-3 (merged, LOCKED)"
echo ""
echo "   To remove these, first unlock them (via git worktree unlock <path>)"
echo "   or verify their sessions are no longer active."
echo ""
echo "2. UNMERGED BRANCHES (31 branches with active work)"
echo "   Use 'git branch -r --no-merged origin/main | grep -v claude | grep -v dependabot'"
echo "   to review. Consider:"
echo "   - If work is abandoned: manually delete with 'git push origin --delete <branch>'"
echo "   - If work is active: leave intact for continued development"
echo ""
echo "   Notable unmerged branches:"
(git branch -r --no-merged origin/main | grep -v "origin/claude" | grep -v "origin/dependabot" | head -10 || true) | while read branch; do
  if [ -n "$branch" ]; then
    echo "     $branch"
  fi
done
UNMERGED_TOTAL=$(git branch -r --no-merged origin/main 2>/dev/null | grep -v "origin/claude" | grep -v "origin/dependabot" | wc -l || echo 0)
if [ "$UNMERGED_TOTAL" -gt 10 ]; then
  echo "     ... and $(($UNMERGED_TOTAL - 10)) more"
fi
echo ""
echo "3. origin/dev STATUS"
echo "   origin/dev is 529 commits BEHIND origin/main"
echo "   Consider:"
echo "   - Resync: git push -u origin main:dev --force-with-lease"
echo "   - OR Delete: git push origin --delete dev"
echo ""

echo "========================================="
echo "Purge script completed (CONFIRM=$CONFIRM)"
echo "========================================="
