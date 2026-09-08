#!/bin/bash
# Lint debt ratchet — apps/web (#5442)
#
# Fails (exit 1) if `apps/web` carries MORE real ESLint errors than the
# recorded baseline, or FEWER without the baseline having been lowered.
# Mirrors `scripts/check-type-debt.sh` — same shape, same reasoning, applied
# to `eslint` instead of `tsc`.
#
# WHY THIS EXISTS
#
# `.github/workflows/ci.yml` runs `bun run lint` (unfiltered, over the whole
# turbo graph) with `continue-on-error: true` — the amnesty that lets
# `apps/web` be green despite its ESLint debt, exactly like the type-check
# amnesty this ratchet's twin replaced. But unlike a plain amnesty, this one
# hides its own instability: `bun run lint` goes through Turborepo's cache, so
# whether the step ever actually RUNS `eslint` on `apps/web` depends on
# whether the turbo cache for that task is warm. Measured on 2026-09-06
# (issue #5442): a run with a cache HIT for `@meeshy/web#lint` replayed old
# logs and never re-linted; the next run, with a cache MISS, ran `eslint` for
# real and surfaced 4034 errors / 291 warnings that had been sitting
# undetected. A gate whose result depends on cache temperature is not a gate —
# it is a coin flip that happens to land on the same side most of the time.
#
# So the fix is the same one already applied to type-checking: stop asking
# turbo whether the package is clean, and ask `eslint` directly, every time,
# with a budget that can only shrink.
#
# WHY THIS SCRIPT DOES NOT NEED THE `dist/` GUARD ITS TWIN HAS
#
# `check-type-debt.sh` refuses to measure unless `packages/shared/dist` is
# built, because `apps/web`'s `tsconfig.json` resolves `@meeshy/shared` to
# shared's SOURCE via `paths`, and one test file reaches `dist/` directly by
# relative import — so the type-check count drifts by the shared build state.
#
# ESLint's flat config here (`apps/web/eslint.config.mjs`) carries no
# `languageOptions.parserOptions.project` — there is no type-aware linting,
# so `eslint` never asks the TypeScript compiler to resolve `@meeshy/shared`
# at all. Measured directly, cycle for cycle with this ratchet's introduction:
# the count is 4034 errors / 291 warnings on this tree, and it stays 4034/291
# with `packages/shared/dist` removed entirely. No guard needed because there
# is nothing here for the shared package's build state to drift.
#
# WHY ERRORS ONLY, NOT WARNINGS
#
# Same convention as the type-check ratchet: a ratchet counts what blocks, not
# everything a tool can print. `apps/web` has 291 ESLint warnings alongside
# its 4034 errors; they are unrated debt, not gated here.
#
# --self-test: exercises `count_lint_errors`, the actual counting mechanism
# used below, against a throwaway fixture directory with its own minimal flat
# config: one file with two real errors, one clean file with zero. A ratchet
# that can go silently blind is worse than no ratchet, so this fails loudly
# (non-zero) if its own counting is broken.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Le nombre d'erreurs ESLint que `apps/web` porte AUJOURD'HUI, mesuré avec
# l'ESLint du dépôt (`apps/web/node_modules/.bin/eslint`, config
# `apps/web/eslint.config.mjs`). Il ne peut que descendre. Pour le baisser :
# lancer ce script, il nomme la valeur à écrire ici.
#
# BAISSE #3646 (2026-09-07) : 4034 → 3988 (-46) — retrait du hook legacy mort
# `hooks/use-conversation-messages.ts` (532 lignes) et de son test orphelin
# `__tests__/hooks/use-conversation-messages.test.tsx` (623 lignes), aucun des
# deux n'ayant plus d'importeur en production. Mesuré par ce script (CI et
# local, même chiffre).
#
# Précédent : 4034, mesuré le 2026-09-07 par ce script ET par un run CI
# antérieur (#5442, run 34057623392, rejoué une fois — même chiffre les deux
# fois, donc non-flaky) : les deux s'accordent, comme le veut la règle
# d'ancrage du cliquet jumeau. Confirmé stable avec et sans
# `packages/shared/dist` construit (cf. en-tête) — aucun écart d'environnement
# à documenter ici.
readonly WEB_LINT_BASELINE=3988

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT

# L'ESLint DU DÉPÔT, en chemin absolu — jamais `npx eslint`, pour la même
# raison que le cliquet de types n'invoque jamais `npx tsc` (cf. son en-tête) :
# `npx` résout depuis le répertoire courant et peut retomber sur un binaire
# mis en cache hors du dépôt, ou déclencher un téléchargement réseau. Le
# binaire vit sous `apps/web/node_modules/.bin` (installation bun en mode
# isolé — il n'existe pas de binaire `eslint` à la racine du dépôt), donc
# c'est de là qu'on le lit systématiquement, même pour le self-test.
readonly ESLINT="$REPO_ROOT/apps/web/node_modules/.bin/eslint"

require_repo_eslint() {
  if [ ! -x "$ESLINT" ]; then
    echo -e "${RED}ESLint introuvable à $ESLINT — lancer l'installation des dépendances d'abord.${NC}"
    exit 1
  fi
}

# Compte les erreurs ESLint réelles d'un répertoire (récursif), warnings
# exclus. `--format json` plutôt qu'un grep sur la sortie texte : la sortie
# colorée insère des séquences ANSI que le format texte n'échappe pas
# proprement pour un comptage fiable, exactement le piège documenté par le
# cliquet de types pour `tsc --pretty false`. Le JSON n'a pas ce problème.
#
# `|| true` : eslint sort en 1 dès qu'il trouve une erreur, et c'est
# précisément ce qu'on mesure plutôt que ce qu'on propage.
count_lint_errors() {
  local target_dir="$1"
  local output
  output="$( (cd "$target_dir" && "$ESLINT" . --format json 2>/dev/null) || true )"
  printf '%s' "$output" | node -e '
    let data = "";
    process.stdin.on("data", (d) => { data += d; });
    process.stdin.on("end", () => {
      let results;
      try {
        results = JSON.parse(data || "[]");
      } catch {
        process.stdout.write("-1");
        return;
      }
      const total = results.reduce((sum, r) => sum + r.errorCount, 0);
      process.stdout.write(String(total));
    });
  '
}

# Les fichiers qui portent le plus d'erreurs — pour qu'un échec soit
# actionnable et non seulement rouge. Ne tourne que sur la voie d'échec (une
# seconde invocation d'eslint, comme le fait déjà `top_offenders` du cliquet
# de types).
top_offenders() {
  local target_dir="$1"
  local output
  output="$( (cd "$target_dir" && "$ESLINT" . --format json 2>/dev/null) || true )"
  # `TARGET_DIR` plutôt que `process.cwd()` : ce `node` tourne comme sibling
  # du pipeline, pas dans le `(cd ...)` ci-dessus — son cwd est celui du
  # script appelant, pas `target_dir`. Le préfixe à retirer doit donc être
  # transmis explicitement.
  TARGET_DIR="$target_dir" node -e '
    let data = "";
    process.stdin.on("data", (d) => { data += d; });
    process.stdin.on("end", () => {
      let results;
      try {
        results = JSON.parse(data || "[]");
      } catch {
        return;
      }
      const base = process.env.TARGET_DIR;
      results
        .filter((r) => r.errorCount > 0)
        .sort((a, b) => b.errorCount - a.errorCount)
        .slice(0, 10)
        .forEach((r) => {
          const rel = r.filePath.startsWith(base) ? r.filePath.slice(base.length + 1) : r.filePath;
          console.log(`  ${String(r.errorCount).padStart(5)} ${rel}`);
        });
    });
  ' <<< "$output"
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

  local flat_config='export default [{ rules: { "no-unused-vars": "error", "no-undef": "error" }, languageOptions: { ecmaVersion: 2022, sourceType: "module" } }];'

  # 1. Un répertoire FAUTIF : deux erreurs (une variable inutilisée, une
  #    référence non définie), comptées toutes les deux.
  mkdir -p "$tmp/dirty"
  printf '%s' "$flat_config" > "$tmp/dirty/eslint.config.mjs"
  cat > "$tmp/dirty/broken.js" <<'EOF'
const unused = 1;
undefinedThing();
EOF
  assert_eq "un répertoire fautif est compté" "2" "$(count_lint_errors "$tmp/dirty")"

  # 2. Un répertoire SAIN : zéro, et le script ne meurt pas sur un JSON vide.
  mkdir -p "$tmp/clean"
  printf '%s' "$flat_config" > "$tmp/clean/eslint.config.mjs"
  # `console` n'est pas déclaré global dans ce fixture — l'éviter plutôt que
  # de risquer un `no-undef` parasite sur un cas censé être propre.
  echo 'export const ok = 1;' > "$tmp/clean/fine.js"
  assert_eq "un répertoire sain rend zéro" "0" "$(count_lint_errors "$tmp/clean")"

  rm -rf "$tmp"

  if [ "$failures" -ne 0 ]; then
    echo -e "${RED}Self-test ÉCHOUÉ : le compteur de ce garde est cassé.${NC}"
    return 1
  fi
  echo -e "${GREEN}Self-test OK${NC}"
  return 0
}

main() {
  require_repo_eslint

  if [ "${1:-}" = "--self-test" ]; then
    echo "Lint debt ratchet — self-test (eslint $("$ESLINT" --version))"
    self_test
    return $?
  fi

  local web_dir="$REPO_ROOT/apps/web"

  echo "Lint debt ratchet — apps/web (baseline $WEB_LINT_BASELINE)"

  local actual
  actual="$(count_lint_errors "$web_dir")"

  if [ "$actual" -lt 0 ]; then
    echo -e "${RED}✗ eslint n'a rendu aucune sortie JSON exploitable — le compteur ne peut pas mesurer.${NC}"
    return 1
  fi

  if [ "$actual" -gt "$WEB_LINT_BASELINE" ]; then
    echo -e "${RED}✗ RÉGRESSION : $actual erreurs ESLint, baseline $WEB_LINT_BASELINE (+$((actual - WEB_LINT_BASELINE))).${NC}"
    echo ""
    echo "Fichiers les plus touchés :"
    top_offenders "$web_dir"
    echo ""
    echo "La dette ESLint de apps/web ne peut que DESCENDRE. Corriger les"
    echo "erreurs introduites, ou — si la config ESLint a changé — expliquer"
    echo "la hausse dans le message de commit avant de relever"
    echo "WEB_LINT_BASELINE."
    return 1
  fi

  if [ "$actual" -lt "$WEB_LINT_BASELINE" ]; then
    echo -e "${YELLOW}✗ AMÉLIORATION NON ENREGISTRÉE : $actual erreurs, baseline $WEB_LINT_BASELINE (-$((WEB_LINT_BASELINE - actual))).${NC}"
    echo ""
    echo "Écrire dans scripts/check-lint-debt.sh :"
    echo ""
    echo "    readonly WEB_LINT_BASELINE=$actual"
    echo ""
    echo "Un cliquet qui n'est pas resserré quand il peut l'être ne cliquette"
    echo "pas : la marge regagnée redeviendrait silencieusement dépensable."
    return 1
  fi

  echo -e "${GREEN}✓ $actual erreurs ESLint — la dette n'a pas bougé.${NC}"
  return 0
}

main "$@"
