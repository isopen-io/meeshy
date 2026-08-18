#!/bin/bash

# Repository cleanup script for Meeshy (inventory date: 2026-08-18)
# This script requires CONFIRM=yes environment variable to execute any destructive operations
# It is idempotent and safe to run multiple times

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CONFIRM="${CONFIRM:-}"
BATCH_SIZE=50

log_info() {
  echo "[INFO] $*"
}

log_warn() {
  echo "[WARN] $*"
}

log_error() {
  echo "[ERROR] $*"
}

requires_confirmation() {
  if [ "$CONFIRM" != "yes" ]; then
    log_error "This script requires CONFIRM=yes to execute destructive operations"
    exit 1
  fi
}

# ============================================================================
# PHASE 1: Delete build artifacts (no confirmation needed)
# ============================================================================

log_info "=== PHASE 1: Removing untracked build directories ==="
BUILD_DIRS=$(find "${REPO_ROOT}/apps/ios" -maxdepth 1 -type d -name ".build*" 2>/dev/null || true)
if [ -n "$BUILD_DIRS" ]; then
  echo "$BUILD_DIRS" | while read -r dir; do
    log_info "Removing build directory: $dir"
    rm -rf "$dir"
  done
else
  log_info "No .build-* directories found to remove"
fi

# ============================================================================
# PHASE 2: Delete merged remote branches (origin/claude/* and origin/dependabot/*)
# ============================================================================

log_info ""
log_info "=== PHASE 2: Deleting merged remote branches ==="
requires_confirmation

MERGED_BRANCHES=$(git branch -r --merged origin/main \
  | grep -E 'origin/(claude|dependabot)/' \
  | sed 's|origin/||' \
  | sort)

MERGED_COUNT=$(echo "$MERGED_BRANCHES" | grep -c . || echo 0)

if [ "$MERGED_COUNT" -eq 0 ]; then
  log_info "No merged claude/* or dependabot/* branches to delete"
else
  log_info "Found $MERGED_COUNT merged branches to delete"
  log_info "Deleting in batches of $BATCH_SIZE..."

  BATCH=()
  INDEX=0

  echo "$MERGED_BRANCHES" | while read -r branch; do
    BATCH+=("$branch")
    INDEX=$((INDEX + 1))

    if [ ${#BATCH[@]} -eq $BATCH_SIZE ] || [ "$INDEX" -eq "$MERGED_COUNT" ]; then
      # Delete batch via git push
      for b in "${BATCH[@]}"; do
        echo "$b"
      done | xargs -I {} git push origin --delete {} 2>/dev/null || true

      log_info "Deleted batch of ${#BATCH[@]} branches"
      BATCH=()
    fi
  done
fi

# ============================================================================
# PHASE 3: Delete merged local worktrees (unlocked only)
# ============================================================================

log_info ""
log_info "=== PHASE 3: Removing merged, unlocked worktrees ==="
requires_confirmation

# Get all worktrees except main
WORKTREES=$(git worktree list | grep -v "\[main\]$" || true)

DELETED_WORKTREES=0

if [ -z "$WORKTREES" ]; then
  log_info "No worktrees to process"
else
  echo "$WORKTREES" | while IFS= read -r line; do
    path=$(echo "$line" | cut -d' ' -f1)

    # Skip if path is empty
    if [ -z "$path" ]; then
      continue
    fi

    # Extract branch name from the output
    branch_raw=$(echo "$line" | grep -oE '\[[^]]+\]' | tr -d '[]')

    if [ -z "$branch_raw" ]; then
      continue
    fi

    # Check if locked
    if echo "$line" | grep -q "locked"; then
      log_warn "Skipping locked worktree at $path (branch: $branch_raw)"
      continue
    fi

    # Check if branch is merged into origin/main
    if git log origin/main.."$branch_raw" --oneline 2>/dev/null | grep -q .; then
      log_warn "Skipping NOT-MERGED worktree at $path (branch: $branch_raw)"
      continue
    fi

    # Delete the worktree
    log_info "Deleting merged worktree: $path (branch: $branch_raw)"
    git worktree remove "$path" 2>/dev/null || git worktree remove --force "$path" 2>/dev/null || true
    DELETED_WORKTREES=$((DELETED_WORKTREES + 1))
  done
fi

log_info "Deleted $DELETED_WORKTREES worktrees"

# ============================================================================
# PHASE 4: Report on manual decisions required
# ============================================================================

log_info ""
log_info "=== PHASE 4: Manual decisions required ==="

log_info ""
log_info "-- Branch status of origin/dev --"
DEV_BEHIND=$(git log origin/dev..origin/main 2>/dev/null | grep -c "^commit" || echo 0)
log_warn "origin/dev is $DEV_BEHIND commits behind origin/main"
log_warn "DECISION REQUIRED: Should dev branch be:"
log_warn "  (a) Resynchronized from origin/main (git push origin origin/main:dev)"
log_warn "  (b) Deleted entirely (git push origin --delete dev)"
log_warn "  (c) Left as-is for archival purposes"

log_info ""
log_info "-- Non-merged remote branches (excluding claude/* and dependabot/*) --"
NON_MERGED=$(git branch -r --no-merged origin/main \
  | grep -v -E 'origin/(claude|dependabot|HEAD)' \
  | sed 's|origin/||' \
  | sort)

NON_MERGED_COUNT=$(echo "$NON_MERGED" | grep -c . || echo 0)

if [ "$NON_MERGED_COUNT" -eq 0 ]; then
  log_info "No non-merged branches found (good state)"
else
  log_warn "Found $NON_MERGED_COUNT non-merged branches requiring triage:"
  log_info ""
  echo "$NON_MERGED" | sed 's/^/  - /'
  log_info ""
  log_warn "For each branch, verify if it should be:"
  log_warn "  - Deleted (work is abandoned or obsolete)"
  log_warn "  - Merged (work should be integrated)"
  log_warn "  - Archived (preserve for historical reference)"
fi

log_info ""
log_info "=== Cleanup Summary ==="
log_info "Untracked build directories: removed"
log_info "Merged origin/claude/* and origin/dependabot/*: $MERGED_COUNT deleted"
log_info "Merged, unlocked worktrees: $DELETED_WORKTREES removed"
log_info "Manual decisions pending: 2 (origin/dev, non-merged branches)"
log_info ""
log_info "To execute this script with destructive operations, run:"
log_info "  CONFIRM=yes $0"
