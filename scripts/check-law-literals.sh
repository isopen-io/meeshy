#!/bin/bash
# Law literals guard — S-003 (tasks/lentille-workshop-execution.md)
#
# Fails (exit 1) if law literals appear in skin files.
# Forbidden literals: 520, 380, 0.45, 0.82, 0.40, 0.04, 900, 25, 24, 10
#
# IMPORTANT: 25, 24, 10 are ONLY forbidden as NUMERIC COMPARISONS to avoid false positives.
# Examples that trigger the guard:
#   if (x > 25)           ← forbidden (numeric comparison)
#   if (x >= 25)          ← forbidden (numeric comparison)
#   if (x < 25)           ← forbidden (numeric comparison)
#
# Examples that DON'T trigger the guard:
#   "version 25"          ← allowed (literal string)
#   fontSize: 25          ← allowed (assignment, not comparison)
#   ["pt-25"]             ← allowed (Tailwind class)
#
# Skin files (rule R15, contract §5):
#   - apps/ios/Meeshy/Features/Main/Lentille/** (except Core/LentilleMetrics.swift)
#   - apps/ios/Meeshy/Features/Main/Focal/** (except Core/**)
#   - apps/ios/Meeshy/Features/Main/Riviere/**
#   - apps/web/components/conversations/lentille/**, focal/**, riviere/**
#   - apps/web/hooks/lentille/**
#
# Test files (*.test.* and *Tests.swift) are excluded.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Directories to scan
declare -a SKIN_DIRS=(
  "apps/ios/Meeshy/Features/Main/Lentille"
  "apps/ios/Meeshy/Features/Main/Focal"
  "apps/ios/Meeshy/Features/Main/Riviere"
  "apps/web/components/conversations/lentille"
  "apps/web/components/conversations/focal"
  "apps/web/components/conversations/riviere"
  "apps/web/hooks/lentille"
)

# Exclusions
EXCLUDED_PATTERNS=(
  "LentilleMetrics.swift"        # reads tokens
  "Focal/Core"                   # hosts law mirrors
  "*test*.ts"
  "*test*.tsx"
  "*Tests.swift"
)

# Build grep exclusion flags
EXCLUDE_FLAGS=""
for pattern in "${EXCLUDED_PATTERNS[@]}"; do
  EXCLUDE_FLAGS="$EXCLUDE_FLAGS --exclude-dir=$(basename "$pattern") --exclude=$pattern"
done

# Forbidden literals (hard, no nuance)
HARD_LITERALS=("520" "380" "0.45" "0.82" "0.40" "0.04" "900")

# Forbidden only in numeric comparisons (soft, >[=] or <[=])
SOFT_LITERALS=("25" "24" "10")

has_errors=0

# === Check hard literals ===
for literal in "${HARD_LITERALS[@]}"; do
  for dir in "${SKIN_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
      continue
    fi

    # Count occurrences (exclude test files)
    matches=$(grep -rn "$literal" "$dir" \
      --exclude-dir=__tests__ \
      --exclude-dir=.test \
      --exclude="*test*.ts" \
      --exclude="*test*.tsx" \
      --exclude="*Tests.swift" \
      --exclude="LentilleMetrics.swift" \
      --exclude-dir="Core" \
      2>/dev/null || true)

    if [ -n "$matches" ]; then
      echo -e "${RED}✗ Hard literal '$literal' found in skin files:${NC}"
      echo "$matches" | sed 's/^/  /'
      has_errors=1
    fi
  done
done

# === Check soft literals (numeric comparisons only) ===
for literal in "${SOFT_LITERALS[@]}"; do
  for dir in "${SKIN_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
      continue
    fi

    # Match: > literal, >= literal, < literal, <= literal (with flexible spacing)
    # Regex: \s*(>|>=|<|<=)\s*literal\b
    matches=$(grep -rnE "\s*(>|>=|<|<=)\s*$literal\b" "$dir" \
      --exclude-dir=__tests__ \
      --exclude-dir=.test \
      --exclude="*test*.ts" \
      --exclude="*test*.tsx" \
      --exclude="*Tests.swift" \
      --exclude="LentilleMetrics.swift" \
      --exclude-dir="Core" \
      2>/dev/null || true)

    if [ -n "$matches" ]; then
      echo -e "${RED}✗ Soft literal '$literal' (numeric comparison) found in skin files:${NC}"
      echo "$matches" | sed 's/^/  /'
      has_errors=1
    fi
  done
done

if [ $has_errors -eq 0 ]; then
  echo -e "${GREEN}✓ No law literals found in skin files${NC}"
  exit 0
else
  exit 1
fi
