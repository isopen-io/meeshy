#!/bin/bash
# `any` debt ratchet — gateway + shared (#3679)
#
# Fails (exit 1) if `services/gateway/src` or `packages/shared` carries MORE
# explicit `any` usage in PRODUCTION source than the recorded baseline, or
# FEWER without the baseline having been lowered. Mirrors
# `scripts/check-type-debt.sh` and `scripts/check-lint-debt.sh` — same shape,
# same reasoning, applied to the "no `any`" rule that `CLAUDE.md` already
# states (`No \`any\` types - ever`) but that nothing in CI enforced.
#
# WHY A REGEX, AND NOT ESLINT
#
# `apps/web` has an ESLint config, so its debt ratchet asks `eslint` directly
# (AST-aware, immune to comments and string literals). Neither
# `services/gateway` nor `packages/shared` has an ESLint config at all — there
# is no `@typescript-eslint/no-explicit-any` to ask. Standing one up is a
# larger, separate lift (config, plugin versions, a first full-repo baseline
# of every other rule it would also start reporting) that this issue does not
# ask for. A regex over the TypeScript source is the same crude-but-honest
# tool `check-type-debt.sh`'s own header calls itself: "A count is a crude
# ratchet" — accepted there for the same reason it is accepted here, it only
# has to get MONOTONICALLY stricter, not be exact on day one.
#
# WHAT COUNTS AS `any`, AND WHY THAT SHAPE
#
#   : any        an explicit type annotation ("x: any", "(x: any) => …")
#   as any       an assertion that silences the checker
#   <any>        a generic argument ("Map<string, any>", "jest.fn<any>()")
#   Array<any>   the array form of the above, named explicitly because the
#                generic pattern above already covers it — kept for clarity
#                at the call site, not because it adds a match
#   any[]        the array shorthand
#
# A bare `\bany\b` was tried first and rejected: measured on this tree it
# returns 22126 for the gateway alone, because it also matches the English
# word "any" inside comments and doc-comments ("any other active
# conversation", "before any await") — prose, not a type. The five patterns
# above match only positions where `any` is TypeScript syntax.
#
# WHY TESTS ARE EXCLUDED
#
# `__tests__/` and `*.test.*`/`*.spec.*` files mock third-party surfaces
# (`jest.fn<any>()`, `{ ... } as any` on a partial Prisma client) where a
# precise type would fight the test rather than protect anything — the same
# judgment call the CLAUDE.md testing principles make implicitly by not
# demanding strict typing of mocks. Measured on this tree: including tests
# raises the gateway count from 650 to 4720+, almost entirely mock
# boilerplate, which would make the ratchet impossible to move by fixing real
# production code and just as impossible to regress by writing a bad mock —
# neither is the signal this gate exists to catch.
#
# WHY COMMENT LINES ARE EXCLUDED
#
# A single line-based regex cannot tell "as any" the assertion from "as any"
# the words inside a doc-comment warning readers not to write it (this file's
# own kind of sentence, and one exists verbatim in
# `packages/shared/utils/notification-banner.ts`). Excluding lines whose
# trimmed content starts with `//`, `*`, or `/*` removes that class of false
# positive; it does not catch a trailing `// comment` after real code on the
# same line, which is a known, accepted gap of this crude tool — consistent
# with `check-type-debt.sh` accepting a analogous gap for `.next/` typed
# output rather than pretending a text-based count can be exact.
#
# WHY GATEWAY AND SHARED HAVE DIFFERENT BASELINES
#
# `packages/shared` measures 0 today: production `any` there is already
# clean. Held at 0 rather than given a budget — CLAUDE.md already says "NO
# `any` in shared package - use `unknown` with validation" for exactly this
# package. `services/gateway/src` measures 650: real, scattered debt that
# this lot does not attempt to pay down (see below), so its baseline pins the
# CURRENT count rather than pretending to a number nobody has earned.
#
# WHAT THIS LOT DELIBERATELY DOES NOT DO
#
# It does not reduce the 650 gateway sites. Several of the heaviest carriers
# (`services/notifications/NotificationService.ts`, 6119 lines;
# `services/message-translation/MessageTranslationService.ts`, 3303 lines)
# are already OVER the repo's 1000–1200 line budget (#4426) — adding a
# `unknown` + a type guard to either would add lines to a file the budget
# already forbids touching without extracting first. Reducing the 650 is real
# work for a separate lot, once those files are split. This ratchet's job is
# narrower and immediate: stop the number from growing while nobody is
# watching it.
#
# `apps/web` (827 at the source issue's 2026-08-26 measurement) and iOS's
# `try?` count are OUT OF SCOPE for this script — no ESLint-free regex
# ratchet was built for web (it already has a real ESLint-based one, a
# different tool would fork the "what counts" definition in two places for no
# reason), and iOS is unreachable from this environment (no Xcode). Issue
# #3679 stays open for both.
#
# --self-test: exercises `count_any_usages`, the actual counting mechanism
# used below, against throwaway fixture files: one with real `any` usage in
# production code (counted), one whose only `any` sits in a `__tests__/`
# file (excluded), one whose only `any` sits inside comment lines (excluded),
# and one clean file (zero). A ratchet that can go silently blind is worse
# than no ratchet, so this fails loudly (non-zero) if its own counting is
# broken.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# La regex qui définit ce qui COMPTE comme usage explicite de `any` — cf.
# en-tête « WHAT COUNTS AS `any` ». Un seul endroit : le self-test et la
# mesure réelle doivent voir exactement le même motif.
readonly ANY_PATTERN=': *any\b|\bas any\b|<any>|Array<any>|any\[\]'

# `packages/shared` — déjà à zéro en production. Tenu à zéro, pas doté d'un
# budget : c'est la règle que `CLAUDE.md` énonce déjà pour ce paquet
# spécifiquement.
readonly SHARED_BASELINE=0

# `services/gateway/src` — dette réelle, mesurée aujourd'hui. Ne peut que
# descendre. Pour la baisser : lancer ce script, il nomme la valeur à écrire
# ici.
readonly GATEWAY_BASELINE=650

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT

# Compte les usages explicites de `any` en source de PRODUCTION d'un
# répertoire (récursif, `.ts`/`.tsx`) : hors tests, hors lignes de
# commentaire. Cf. en-tête pour les deux exclusions et leurs raisons.
# Les répertoires de code GÉNÉRÉ à exclure de tout balayage — communs aux
# deux fonctions ci-dessous, un seul endroit pour ne pas diverger.
#
# `prisma/client` (et non un simple `-name client`) : `packages/shared` a un
# répertoire `providers/` important pour la dette réelle, mais aussi un
# `prisma/client/` — le client Prisma généré, `.gitignore`é
# (`packages/shared/prisma/.gitignore:11`), dont les `.d.ts` portent près de
# 260 usages de `any` légitimes (la forme du client généré par Prisma, pas de
# la dette écrite à la main). Un `-name client` aurait exclu n'importe quel
# répertoire nommé ainsi n'importe où dans l'arbre ; le chemin complet
# n'exclut que celui-là. Trouvé en lançant ce garde une fois `packages/shared`
# construit : la baseline à zéro mesurée sans le client généré est restée
# fausse jusqu'à cette exclusion.
find_source_files() {
  local target_dir="$1"
  find "$target_dir" \
    \( -name node_modules -o -name dist -o -name generated -o -path '*/prisma/client' \) -prune \
    -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0
}

count_any_usages() {
  local target_dir="$1"
  local file
  local total=0
  while IFS= read -r -d '' file; do
    case "$file" in
      */__tests__/*|*.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) continue ;;
    esac
    local n
    n="$(grep -nE "$ANY_PATTERN" "$file" \
      | sed -E 's/^[0-9]+://' \
      | sed -E 's/^[[:space:]]+//' \
      | grep -vE '^(//|\*|/\*)' \
      | wc -l | tr -d ' ')"
    total=$((total + n))
  done < <(find_source_files "$target_dir")
  echo "$total"
}

# Les fichiers qui portent le plus d'usages — pour qu'un échec soit
# actionnable et non seulement rouge.
top_offenders() {
  local target_dir="$1"
  local file
  while IFS= read -r -d '' file; do
    case "$file" in
      */__tests__/*|*.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) continue ;;
    esac
    local n
    n="$(grep -nE "$ANY_PATTERN" "$file" \
      | sed -E 's/^[0-9]+://' \
      | sed -E 's/^[[:space:]]+//' \
      | grep -vE '^(//|\*|/\*)' \
      | wc -l | tr -d ' ')"
    if [ "$n" -gt 0 ]; then
      echo "$n ${file#"$target_dir"/}"
    fi
  done < <(find_source_files "$target_dir") \
    | sort -rn \
    | head -10 \
    | awk '{ printf "  %5d %s\n", $1, $2 }'
}

self_test() {
  local tmp
  tmp="$(mktemp -d)"

  local failures=0
  local assert_eq
  assert_eq() {
    local label="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then
      echo -e "  ${GREEN}✓${NC} $label (=$actual)"
    else
      echo -e "  ${RED}✗${NC} $label — attendu $expected, obtenu $actual"
      failures=$((failures + 1))
    fi
  }

  # 1. Du code de production avec trois formes réelles : compté.
  mkdir -p "$tmp/dirty"
  cat > "$tmp/dirty/broken.ts" <<'EOF'
export function handle(payload: any): void {
  const cast = payload as any;
  const bag: Promise<any> = Promise.resolve(cast);
  console.log(bag);
}
EOF
  assert_eq "trois usages réels de production sont comptés" "3" "$(count_any_usages "$tmp/dirty")"

  # 2. Un fichier propre : zéro.
  mkdir -p "$tmp/clean"
  echo 'export const ok: number = 1;' > "$tmp/clean/fine.ts"
  assert_eq "un fichier propre rend zéro" "0" "$(count_any_usages "$tmp/clean")"

  # 3. Le même usage, mais sous __tests__/ : exclu.
  mkdir -p "$tmp/withtests/__tests__"
  echo 'export const ok = 1;' > "$tmp/withtests/fine.ts"
  echo 'export const mocked = {} as any;' > "$tmp/withtests/__tests__/mock.ts"
  assert_eq "un usage sous __tests__/ est exclu" "0" "$(count_any_usages "$tmp/withtests")"

  # 3bis. Le même usage, dans un fichier *.test.ts en dehors de __tests__/ :
  # exclu aussi (convention alternative du dépôt).
  mkdir -p "$tmp/withtestsuffix"
  echo 'export const mocked = {} as any;' > "$tmp/withtestsuffix/thing.test.ts"
  assert_eq "un usage dans *.test.ts est exclu" "0" "$(count_any_usages "$tmp/withtestsuffix")"

  # 4. Le mot `any` uniquement dans des commentaires (ligne // et bloc
  #    doc-comment `*`) : exclu — c'est la classe de faux positif que ce
  #    garde existe pour éviter (cf. en-tête).
  mkdir -p "$tmp/commented"
  cat > "$tmp/commented/documented.ts" <<'EOF'
// on ne doit jamais écrire `as any` ici
/**
 * Cette fonction n'accepte jamais un `: any` en paramètre.
 */
export const ok: number = 1;
EOF
  assert_eq "un any en commentaire est exclu" "0" "$(count_any_usages "$tmp/commented")"

  rm -rf "$tmp"

  if [ "$failures" -ne 0 ]; then
    echo -e "${RED}Self-test ÉCHOUÉ : le compteur de ce garde est cassé.${NC}"
    return 1
  fi
  echo -e "${GREEN}Self-test OK${NC}"
  return 0
}

# Évalue un paquet contre sa baseline ; rend 1 si le paquet doit faire
# échouer le cliquet (régression OU amélioration non enregistrée).
check_package() {
  local label="$1" dir="$2" baseline="$3" baseline_var="$4"
  local actual
  actual="$(count_any_usages "$dir")"

  echo "  $label : $actual usages (baseline $baseline)"

  if [ "$actual" -gt "$baseline" ]; then
    echo -e "${RED}  ✗ RÉGRESSION sur $label : $actual usages de \`any\`, baseline $baseline (+$((actual - baseline))).${NC}"
    echo ""
    echo "  Fichiers les plus touchés :"
    top_offenders "$dir" | sed 's/^/  /'
    echo ""
    return 1
  fi

  if [ "$actual" -lt "$baseline" ]; then
    echo -e "${YELLOW}  ✗ AMÉLIORATION NON ENREGISTRÉE sur $label : $actual usages, baseline $baseline (-$((baseline - actual))).${NC}"
    echo ""
    echo "  Écrire dans scripts/check-any-debt.sh :"
    echo ""
    echo "      readonly $baseline_var=$actual"
    echo ""
    return 1
  fi

  return 0
}

main() {
  if [ "${1:-}" = "--self-test" ]; then
    echo "any debt ratchet — self-test"
    self_test
    return $?
  fi

  echo "any debt ratchet — gateway + shared"

  local status=0
  check_package "packages/shared" "$REPO_ROOT/packages/shared" "$SHARED_BASELINE" "SHARED_BASELINE" || status=1
  check_package "services/gateway/src" "$REPO_ROOT/services/gateway/src" "$GATEWAY_BASELINE" "GATEWAY_BASELINE" || status=1

  if [ "$status" -eq 0 ]; then
    echo -e "${GREEN}✓ la dette \`any\` de gateway et shared n'a pas bougé.${NC}"
  else
    echo ""
    echo "La dette \`any\` de gateway et shared ne peut que DESCENDRE. Corriger"
    echo "les usages introduits, ou — si la mesure a changé de forme —"
    echo "expliquer la hausse dans le message de commit avant de relever une"
    echo "baseline."
  fi

  return "$status"
}

main "$@"
