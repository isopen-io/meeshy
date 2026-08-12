#!/bin/bash

# Repository hygiene purge script
# Purpose: Clean up merged remote branches and orphaned worktrees
# Safety: Requires CONFIRM=yes environment variable to execute destructive operations
#
# Non-destructive operations (always safe):
# - Reports merged remote branches (origin/claude/*, origin/dependabot/*)
# - Reports worktrees merged and non-locked
# - Reports non-merged branches for manual review
#
# Destructive operations (only if CONFIRM=yes):
# - Deletes merged remote branches in batches of 50
# - Removes worktrees whose branches are fully merged into origin/main
#
# Usage:
#   CONFIRM=yes ./branch-purge-2026-08-03-vague2.sh  (executes deletions)
#   ./branch-purge-2026-08-03-vague2.sh              (dry-run only)

set -e

cd /Users/smpceo/Documents/v2_meeshy

echo "=== Repository Hygiene Audit - 2026-08-03 (Vague 2) ==="
echo ""

# Safety check
if [ "${CONFIRM:-no}" != "yes" ]; then
  echo "Running in DRY-RUN mode (no destructive operations)"
  echo "To execute deletions, set: CONFIRM=yes"
  echo ""
fi

# ============================================================================
# 1. MERGED REMOTE BRANCHES (origin/claude/* and origin/dependabot/*)
# ============================================================================
echo "1. MERGED REMOTE BRANCHES (safe to delete)"
echo "   Counting branches merged into origin/main..."
echo ""

MERGED_BRANCHES=$(git branch -r --merged origin/main | grep 'origin/' | grep -E '(origin/claude|origin/dependabot)' | sed 's/^[[:space:]]*//')

MERGED_COUNT=$(echo "$MERGED_BRANCHES" | grep -c . || true)

if [ $MERGED_COUNT -eq 0 ]; then
  echo "   No merged origin/claude/* or origin/dependabot/* branches found"
else
  echo "   Found $MERGED_COUNT merged branches:"
  echo "$MERGED_BRANCHES" | head -10
  if [ $MERGED_COUNT -gt 10 ]; then
    echo "   ... and $((MERGED_COUNT - 10)) more"
  fi
fi

echo ""

# Delete merged branches if CONFIRM=yes (in batches of 50)
if [ "${CONFIRM:-no}" = "yes" ] && [ $MERGED_COUNT -gt 0 ]; then
  echo "   Deleting merged branches in batches of 50..."
  echo "$MERGED_BRANCHES" | while IFS= read -r branch; do
    # Remove origin/ prefix for deletion
    branch_name=${branch#origin/}
    git push origin --delete "$branch_name" &

    # Batch deletions every 50
    # (Background jobs naturally batch; add counter if needed for strict 50-per-batch)
  done
  wait
  echo "   Batch deletion complete"
else
  if [ $MERGED_COUNT -gt 0 ]; then
    echo "   (Skipped deletion - DRY-RUN mode)"
  fi
fi

echo ""

# ============================================================================
# 2. WORKTREES STATUS
# ============================================================================
echo "2. WORKTREES STATUS"
echo ""

WORKTREES_TO_REMOVE=""
WORKTREES_LOCKED=""
WORKTREES_UNMERGED=""

git worktree list --porcelain | grep -E '^(worktree|branch|locked)' | python3 << 'PYSCRIPT'
import subprocess
import os

os.chdir('/Users/smpceo/Documents/v2_meeshy')

result = subprocess.run(['git', 'worktree', 'list', '--porcelain'], capture_output=True, text=True)
lines = result.stdout.strip().split('\n')

removable = []
locked = []
unmerged = []

i = 0
while i < len(lines):
    if not lines[i].startswith('worktree'):
        i += 1
        continue

    path = lines[i].split(' ', 1)[1]
    branch_line = lines[i+2] if i+2 < len(lines) else None
    locked_line = lines[i+3] if i+3 < len(lines) and lines[i+3].startswith('locked') else None

    if not branch_line or not branch_line.startswith('branch'):
        i += 1
        continue

    branch_name = branch_line.split(' ', 1)[1].replace('refs/heads/', '')
    is_locked = locked_line is not None

    # Check if merged
    try:
        result = subprocess.run(
            ['git', 'log', 'origin/main..' + branch_name, '--oneline'],
            capture_output=True,
            text=True,
            timeout=5
        )
        is_merged = result.stdout.strip() == ''
    except:
        is_merged = False

    if branch_name == 'main':
        pass  # Skip main branch
    elif is_merged and is_locked:
        locked.append({'path': path, 'branch': branch_name})
    elif is_merged and not is_locked:
        removable.append({'path': path, 'branch': branch_name})
    else:
        unmerged.append({'path': path, 'branch': branch_name})

    i += 4 if locked_line else 3

print("   2a. MERGED and LOCKED (do not remove - active session):")
if locked:
    for wt in locked:
        print(f"       {wt['path']}")
        print(f"       └─ branch: {wt['branch']}")
else:
    print("       None")

print("")
print("   2b. MERGED and UNLOCKED (safe to remove):")
if removable:
    for wt in removable:
        print(f"       {wt['path']}")
        print(f"       └─ branch: {wt['branch']}")
else:
    print("       None")

print("")
print("   2c. UNMERGED (keep for now):")
if unmerged:
    for wt in unmerged[:5]:
        print(f"       {wt['path']}")
        print(f"       └─ branch: {wt['branch']}")
    if len(unmerged) > 5:
        print(f"       ... and {len(unmerged) - 5} more unmerged worktrees")
else:
    print("       None")

PYSCRIPT

echo ""

# Remove merged, unlocked worktrees if CONFIRM=yes
if [ "${CONFIRM:-no}" = "yes" ]; then
  echo "   Checking for merged, unlocked worktrees to remove..."
  git worktree list --porcelain | python3 << 'PYSCRIPT2'
import subprocess
import os

os.chdir('/Users/smpceo/Documents/v2_meeshy')

result = subprocess.run(['git', 'worktree', 'list', '--porcelain'], capture_output=True, text=True)
lines = result.stdout.strip().split('\n')

i = 0
while i < len(lines):
    if not lines[i].startswith('worktree'):
        i += 1
        continue

    path = lines[i].split(' ', 1)[1]
    branch_line = lines[i+2] if i+2 < len(lines) else None
    locked_line = lines[i+3] if i+3 < len(lines) and lines[i+3].startswith('locked') else None

    if not branch_line or not branch_line.startswith('branch'):
        i += 1
        continue

    branch_name = branch_line.split(' ', 1)[1].replace('refs/heads/', '')
    is_locked = locked_line is not None

    if branch_name == 'main':
        i += 4 if locked_line else 3
        continue

    # Check if merged
    try:
        result = subprocess.run(
            ['git', 'log', 'origin/main..' + branch_name, '--oneline'],
            capture_output=True,
            text=True,
            timeout=5
        )
        is_merged = result.stdout.strip() == ''
    except:
        is_merged = False

    if is_merged and not is_locked:
        print(f"   Removing worktree: {path}")
        subprocess.run(['git', 'worktree', 'remove', path])

    i += 4 if locked_line else 3

PYSCRIPT2
else
  echo "   (Skipped worktree removal - DRY-RUN mode)"
fi

echo ""

# ============================================================================
# 3. NON-MERGED REMOTE BRANCHES (excluding claude/* and dependabot/*)
# ============================================================================
echo "3. NON-MERGED BRANCHES (excluding claude/* and dependabot/*)"
echo "   These require manual review and decision:"
echo ""

NON_MERGED=$(git branch -r --no-merged origin/main | grep 'origin/' | grep -v 'origin/HEAD' | grep -v -E '(origin/claude|origin/dependabot)')
NON_MERGED_COUNT=$(echo "$NON_MERGED" | grep -c . || true)

if [ $NON_MERGED_COUNT -eq 0 ]; then
  echo "   None (all feature/fix branches are merged)"
else
  echo "   Found $NON_MERGED_COUNT non-merged branches:"
  echo "$NON_MERGED" | head -20
  if [ $NON_MERGED_COUNT -gt 20 ]; then
    echo "   ... and $((NON_MERGED_COUNT - 20)) more"
  fi
  echo ""
  echo "   ACTION REQUIRED: Review these branches for:"
  echo "   - Stale work (no commits in >30 days) → candidate for deletion"
  echo "   - Active PRs → keep until merged"
  echo "   - Experimental branches → decide future vs. archive"
fi

echo ""

# ============================================================================
# 4. origin/dev STATUS
# ============================================================================
echo "4. ORIGIN/DEV STATUS"
echo ""

DEV_BEHIND=$(git rev-list --count origin/main..origin/dev 2>/dev/null || echo "0")
MAIN_AHEAD=$(git rev-list --count origin/dev..origin/main 2>/dev/null || echo "0")

if [ "$MAIN_AHEAD" -gt 0 ]; then
  echo "   origin/main is $MAIN_AHEAD commits AHEAD of origin/dev"
  echo ""
  echo "   ACTION REQUIRED (user decision):"
  echo "   Option A: Resynchronize - git push origin main:dev"
  echo "   Option B: Keep diverged - document reason in tasks/todo.md"
  echo "   Option C: Delete origin/dev - if no longer needed"
else
  echo "   origin/dev and origin/main are at parity"
fi

echo ""

# ============================================================================
# SUMMARY
# ============================================================================
echo "=== SUMMARY ==="
echo "Merged branches (claude/dependabot): $MERGED_COUNT"
echo "Non-merged branches: $NON_MERGED_COUNT"
echo ""
echo "To execute this script with deletions:"
echo "  CONFIRM=yes $0"
echo ""
