#!/bin/bash
# Law literals guard — S-003 (tasks/lentille-workshop-execution.md)
# Hardened REV-1 C-034 (réserve 4): self-test, targeted Core exclusion, dead
# code removed, 4 additional literals.
#
# Fails (exit 1) if law literals appear in skin files.
# Forbidden literals: 520, 380, 160, 140, 45, 0.45, 0.82, 0.40, 0.35, 0.04, 900
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
#   - apps/ios/Meeshy/Features/Main/Lentille/** (except Core/** — hosts law mirrors)
#   - apps/ios/Meeshy/Features/Main/Focal/** (except Core/** — hosts law mirrors)
#   - apps/ios/Meeshy/Features/Main/Riviere/** (except Core/** — hosts law mirrors)
#   - apps/web/components/conversations/lentille/**, focal/**, riviere/**
#   - apps/web/hooks/lentille/**
#
# The `Core/**` exclusion is TARGETED to the immediate `<skin-root>/Core/`
# subtree of Lentille/Focal/Riviere ONLY — never a repo-wide `--exclude-dir=Core`,
# which would silently skip every directory named `Core` anywhere under a skin
# root (or, if ever pointed at the whole repo, anywhere in the monorepo).
#
# Test files (*.test.* and *Tests.swift) are excluded.
#
# --self-test: exercises `list_skin_files` (the actual exclusion/detection
# mechanism used below) against a throwaway fixture tree, asserts a forbidden
# literal IS caught, and that Core/** + *test* files ARE excluded — then
# cleans up. The guard is worthless if it can go silently blind, so this
# fails loudly (non-zero) if its own detection is broken.

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

# Forbidden literals (hard, no nuance)
HARD_LITERALS=("520" "380" "160" "140" "45" "0.45" "0.82" "0.40" "0.35" "0.04" "900")

# Forbidden only in numeric comparisons (soft, >[=] or <[=])
SOFT_LITERALS=("25" "24" "10")

TMPDIR_SELFTEST=""
cleanup_selftest() {
  if [ -n "$TMPDIR_SELFTEST" ] && [ -d "$TMPDIR_SELFTEST" ]; then
    rm -rf "$TMPDIR_SELFTEST"
  fi
}
trap cleanup_selftest EXIT

# List the skin-file candidates under a scan root: TypeScript/TSX/Swift
# files, excluding test files and the immediate "<dir>/Core/**" subtree.
# This is the single mechanism both the real scan AND --self-test exercise —
# a self-test that reimplemented its own exclusion logic could pass while the
# real one silently regressed, which is exactly what R15 must never allow.
list_skin_files() {
  local dir="$1"
  [ -d "$dir" ] || return 0

  find "$dir" -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.swift' \) \
    -not -path "$dir/Core/*" \
    -not -path '*/__tests__/*' \
    -not -path '*/.test/*' \
    -not -name '*test*.ts' \
    -not -name '*test*.tsx' \
    -not -name '*Tests.swift' \
    -not -name 'LentilleMetrics.swift' \
    -not -name 'FocalPassConstants.swift'
}
# FocalPassConstants.swift : même statut que LentilleMetrics.swift — domicile
# DOCUMENTÉ des constantes hors-token de la passe (chaque entrée y porte son
# TODO contractuel, cf. F-084). L'exclure ici est ce qui permet d'interdire
# ces valeurs partout AILLEURS dans la peau.

# Recherche d'un littéral en JETON, commentaires exclus — pas en sous-chaîne.
# Deux faux positifs réels ont motivé ce durcissement (V3, F-090) :
#   indigo900        → matchait '900' en sous-chaîne nue
#   /// doc « 0.82 » → un commentaire CITANT la loi gelée matchait comme du code
# Le strip `s@//.*$@@` préserve le compte de lignes (les numéros restent vrais).
# La frontière ERE interdit chiffre/lettre/underscore/point autour du jeton :
# '45' ne matche plus dans '0.45' ni dans 'I-045', '900' plus dans 'indigo900'.
scan_hard_literal() {
  local literal="$1" f="$2"
  local esc="${literal//./\\.}"
  sed 's@//.*$@@' "$f" | grep -nE "(^|[^0-9A-Za-z_.])${esc}(\$|[^0-9.])" \
    | sed "s@^@$f:@" || true
}

run_self_test() {
  TMPDIR_SELFTEST="$(mktemp -d)"
  local root="$TMPDIR_SELFTEST/Lentille"
  mkdir -p "$root/Core"

  cat > "$root/Bad.tsx" <<'EOF'
export const BAD = 520;
EOF
  cat > "$root/Core/Mirror.tsx" <<'EOF'
export const MIRRORED_LAW_CONSTANT = 520;
EOF
  cat > "$root/Bad.test.tsx" <<'EOF'
export const IGNORED_IN_TEST_FILE = 520;
EOF

  local files
  mapfile -t files < <(list_skin_files "$root")

  local detected=1
  local core_leaked=0
  local test_leaked=0
  local f
  for f in "${files[@]}"; do
    if [ -n "$(scan_hard_literal "520" "$f")" ]; then
      detected=0
    fi
    case "$f" in
      */Core/*) core_leaked=1 ;;
    esac
    case "$f" in
      *.test.tsx) test_leaked=1 ;;
    esac
  done

  cleanup_selftest
  TMPDIR_SELFTEST=""

  local ok=1
  if [ "$detected" -ne 0 ]; then
    echo -e "${RED}✗ self-test: forbidden literal '520' was NOT detected in a scanned skin file — detection is BROKEN${NC}"
    ok=0
  fi
  if [ "$core_leaked" -ne 0 ]; then
    echo -e "${RED}✗ self-test: Lentille/Core/** leaked into the scan — targeted Core exclusion is BROKEN${NC}"
    ok=0
  fi
  if [ "$test_leaked" -ne 0 ]; then
    echo -e "${RED}✗ self-test: *.test.tsx leaked into the scan — test-file exclusion is BROKEN${NC}"
    ok=0
  fi

  if [ "$ok" -eq 1 ]; then
    echo -e "${GREEN}✓ self-test: guard mechanism intact (literal caught, Core/** and *test* excluded)${NC}"
    return 0
  fi
  return 1
}

if [ "${1:-}" == "--self-test" ]; then
  run_self_test
  exit $?
fi

has_errors=0

# === Check hard literals ===
for literal in "${HARD_LITERALS[@]}"; do
  for dir in "${SKIN_DIRS[@]}"; do
    mapfile -t files < <(list_skin_files "$dir")
    [ "${#files[@]}" -eq 0 ] && continue

    matches=""
    for f in "${files[@]}"; do
      m=$(scan_hard_literal "$literal" "$f")
      [ -n "$m" ] && matches="${matches}${m}"$'\n'
    done
    matches="${matches%$'\n'}"

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
    mapfile -t files < <(list_skin_files "$dir")
    [ "${#files[@]}" -eq 0 ] && continue

    # Match: > literal, >= literal, < literal, <= literal (with flexible spacing)
    matches=$(grep -nE "\s*(>|>=|<|<=)\s*$literal\b" "${files[@]}" 2>/dev/null || true)

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
