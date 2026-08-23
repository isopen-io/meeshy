#!/bin/bash
# Type debt ratchet — apps/web [cycle 105 bis]
#
# Fails (exit 1) if `apps/web` carries MORE type errors than the recorded
# baseline, or FEWER without the baseline having been lowered.
#
# WHY THIS EXISTS
#
# `.github/workflows/ci.yml` carried a single `Type-check` step over the whole
# monorepo, with `continue-on-error: true`. That flag is not an opinion about
# type-checking; it is the only way the step could ever be green, because
# `apps/web` has type errors and the other three TypeScript packages do not.
# One amnesty, four packages: the 1241 errors of the fourth bought silence for
# the zero of the first three.
#
# The price was not theoretical. Cycles 99–104 built an emission contract for
# the gateway's Socket.IO surface — a payload type per event, a typed emission
# door (`services/gateway/src/socketio/serverEmit.ts`), a ratchet on the door's
# own shape. A call site that violates it produces `TS2345` or `TS2322`, and
# BOTH of those codes are in the `diagnostics.ignoreCodes` of the gateway's
# `ts-jest` transform. So the contract was enforced by the test job not at all,
# and by the quality job not at all. Measured, not assumed: dropping a required
# field from a `SERVER_EVENTS.*` emission in `preferences-broadcast.ts` yields
#
#   error TS2345: Argument of type '{ userId: string; }' is not assignable to
#                 parameter of type 'UserPreferencesUpdatedEventData'.
#
# which `ts-jest` swallows and `continue-on-error: true` forgives. That is the
# exact shape of the cycle-101 defect (`message:edited` served without
# `senderId`/`messageType`/`createdAt`, silently rejected by every iOS decoder
# for months).
#
# So the amnesty is split rather than lifted: the three packages at zero become
# BLOCKING in `ci.yml`, and `apps/web` keeps a budget that can only shrink.
#
# WHY A COUNT, AND WHY IT IS STABLE
#
# A count is a crude ratchet, and it is only honest if it does not drift with
# the environment. Three sources of drift were checked and are absent here:
#
#   - `.next/types/**` is in web's `tsconfig.json` `include`. It does not exist
#     in the CI quality job (nothing builds web there), but it DOES exist on a
#     developer machine that ran `next build`. Errors under `.next/` are
#     therefore excluded from the count, by path.
#   - the Prisma client is generated in the CI *test* job, never in the quality
#     job. Web does not import it (`@prisma/client` and `@meeshy/shared/prisma`
#     appear in zero web sources), so its absence changes nothing.
#   - `@meeshy/shared` is resolved by web's `paths` to the shared package's
#     SOURCE, not to its `dist/`. That is true OF THAT SPECIFIER — and it is
#     exactly why one web suite bypasses it: `__tests__/lentille/
#     shared-law-dist-parity.test.ts` replays the frozen law vectors THROUGH the
#     build boundary, and its own header explains that reaching `dist/` is
#     impossible via `@meeshy/shared/...`, so it imports
#     `../../../../packages/shared/dist/utils/*.js` by RELATIVE path. Three
#     imports, `packages/shared/dist/` gitignored: on any fresh clone the count
#     is +3 (three TS2307) until shared is built. This bullet used to claim the
#     opposite outright, and the claim cost a cycle — the guard printed
#     "RÉGRESSION +3" on an untouched tree and named ten innocent files as the
#     most affected. The drift is therefore NOT absent; it is GUARDED, by
#     `unresolved_dist_imports` below, which refuses to report a number at all
#     while the artifacts the count depends on are missing.
#
# What CAN legitimately move the number is a TypeScript version bump. That is a
# feature: a bump that adds errors must be seen, and a bump that removes them
# must be recorded. Both directions fail loudly and name the number to write.
#
# --self-test: exercises `count_type_errors` — the actual counting mechanism
# used below — against throwaway fixture packages: one that must report exactly
# its errors, one clean that must report zero, and one whose only error lives
# under `.next/` and must therefore NOT be counted. A ratchet that can go
# silently blind is worse than no ratchet, so this fails loudly (non-zero) if
# its own counting is broken.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Le nombre d'erreurs de types que `apps/web` porte AUJOURD'HUI, mesuré avec le
# TypeScript du dépôt. Il ne peut que descendre. Pour le baisser : lancer ce
# script, il nomme la valeur à écrire ici.
# 1241 → 1239 au cycle 107 : déclarer `CallInitiatedEvent.iceServers` et rendre
# `CallEndedEvent.endedBy` optionnel a réconcilié deux sites d'`apps/web` avec le
# contrat partagé. La dette n'a pas été « travaillée » ici — elle a baissé comme
# EFFET d'un lot passerelle, ce qui est le cas que ce cliquet existe pour
# capturer : sans lui, les deux points regagnés redeviendraient dépensables en
# silence.
readonly WEB_BASELINE=1239

# Le compilateur DU DÉPÔT, en chemin absolu — jamais `npx tsc`.
#
# `npx` résout depuis le répertoire COURANT. Le self-test compile ses fixtures
# dans un `mktemp -d`, hors de tout `node_modules` : là, `npx tsc` prend ce qui
# traîne dans le cache npx (mesuré : TypeScript 6.0.2, quand le dépôt est en
# 6.0.3) ou, sur un runner neuf, part le télécharger. Un cliquet chiffré dont le
# compilateur n'est pas celui qu'il prétend mesurer ne mesure rien — et un garde
# qui ouvre le réseau pour se tester est un garde qui échouera un jour sans
# rapport avec ce qu'il garde.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT
readonly TSC="$REPO_ROOT/node_modules/.bin/tsc"

require_repo_tsc() {
  if [ ! -x "$TSC" ]; then
    echo -e "${RED}TypeScript introuvable à $TSC — lancer l'installation des dépendances d'abord.${NC}"
    exit 1
  fi
}

# Compte les erreurs de types d'un package, hors `.next/` (cf. en-tête).
#
# `grep` rend 1 quand il ne trouve rien — ce qui est le cas SAIN — donc les deux
# étages sont protégés. `tsc` rend non-zéro dès qu'il y a une erreur, et c'est
# précisément ce qu'on mesure plutôt que ce qu'on propage : `|| true`.
count_type_errors() {
  local package_dir="$1"
  local output
  output="$( (cd "$package_dir" && "$TSC" --noEmit 2>&1) || true )"
  printf '%s\n' "$output" \
    | { grep -E 'error TS[0-9]+' || true; } \
    | { grep -vE '^\.next/' || true; } \
    | wc -l \
    | tr -d ' '
}

# Les imports RELATIFS de `packages/shared/dist/**` faits depuis `apps/web`
# dont l'artefact de build est ABSENT — cf. en-tête.
#
# Un compte n'est comparable à la baseline que si le compilateur a pu résoudre
# ce que le code importe. Ces trois imports-là ne passent pas par les `paths` du
# tsconfig (c'est tout leur objet), donc rien dans la configuration ne les
# rattrape : sans build, chacun rend un TS2307 de plus.
#
# TypeScript résout un spécificateur `.js` par sa DÉCLARATION `.d.ts` — c'est
# elle, et non le `.js`, qui décide du compte.
unresolved_dist_imports() {
  local web_dir="$1" root="$2"
  { grep -rhoE 'packages/shared/dist/[A-Za-z0-9_./-]+\.js' "$web_dir" \
      --include='*.ts' --include='*.tsx' 2>/dev/null || true; } \
    | sort -u \
    | while read -r spec; do
        [ -f "$root/${spec%.js}.d.ts" ] || printf '%s\n' "$spec"
      done
}

# Les fichiers qui portent le plus d'erreurs — pour qu'un échec soit
# actionnable et non seulement rouge.
top_offenders() {
  local package_dir="$1"
  (cd "$package_dir" && "$TSC" --noEmit 2>&1) 2>/dev/null \
    | { grep -E 'error TS[0-9]+' || true; } \
    | { grep -vE '^\.next/' || true; } \
    | cut -d'(' -f1 \
    | sort \
    | uniq -c \
    | sort -rn \
    | head -10
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

  local tsconfig='{"compilerOptions":{"strict":true,"noEmit":true,"skipLibCheck":true,"target":"ES2020","module":"esnext","moduleResolution":"bundler"},"include":["**/*.ts",".next/types/**/*.ts"]}'

  # 1. Un package FAUTIF : deux erreurs, comptées toutes les deux.
  mkdir -p "$tmp/dirty"
  printf '%s' "$tsconfig" > "$tmp/dirty/tsconfig.json"
  cat > "$tmp/dirty/broken.ts" <<'EOF'
export const a: number = 'not a number';
export const b: string = 42;
EOF
  assert_eq "un package fautif est compté" "2" "$(count_type_errors "$tmp/dirty")"

  # 2. Un package SAIN : zéro, et le script ne meurt pas sur le `grep` vide.
  mkdir -p "$tmp/clean"
  printf '%s' "$tsconfig" > "$tmp/clean/tsconfig.json"
  echo 'export const ok: number = 1;' > "$tmp/clean/fine.ts"
  assert_eq "un package sain rend zéro" "0" "$(count_type_errors "$tmp/clean")"

  # 3. Une erreur sous `.next/` n'est PAS comptée — c'est l'exclusion dont
  #    dépend la stabilité du chiffre entre CI et poste de développement.
  mkdir -p "$tmp/generated/.next/types"
  printf '%s' "$tsconfig" > "$tmp/generated/tsconfig.json"
  echo 'export const ok: number = 1;' > "$tmp/generated/fine.ts"
  echo 'export const nope: number = "generated";' > "$tmp/generated/.next/types/gen.ts"
  assert_eq "une erreur sous .next/ est exclue" "0" "$(count_type_errors "$tmp/generated")"

  # 4. Un import RELATIF vers `packages/shared/dist/**` dont la DÉCLARATION est
  #    absente est DÉTECTÉ. C'est le cas qui faisait rendre au garde un « +3 »
  #    imaginaire sur tout clone frais — la mesure y était fausse, et rouge.
  mkdir -p "$tmp/root/apps/web/__tests__"
  cat > "$tmp/root/apps/web/__tests__/parity.test.ts" <<'EOF'
import { focusCurve } from '../../../packages/shared/dist/utils/focus-curve.js';
export const used = focusCurve;
EOF
  assert_eq "un dist non bâti est détecté" \
    "packages/shared/dist/utils/focus-curve.js" \
    "$(unresolved_dist_imports "$tmp/root/apps/web" "$tmp/root")"

  # 5. La MÊME arborescence, déclaration présente : plus rien à signaler. Sans
  #    ce second cas, un garde qui dirait « non résolu » de tout passerait le
  #    cas 4 et bloquerait la CI en permanence.
  mkdir -p "$tmp/root/packages/shared/dist/utils"
  : > "$tmp/root/packages/shared/dist/utils/focus-curve.d.ts"
  assert_eq "un dist bâti ne signale rien" "" \
    "$(unresolved_dist_imports "$tmp/root/apps/web" "$tmp/root")"

  # 6. Le `.js` SEUL ne suffit pas : c'est la déclaration que tsc consulte. Un
  #    build partiel (émission JS sans `declaration`) doit rester détecté.
  rm -f "$tmp/root/packages/shared/dist/utils/focus-curve.d.ts"
  : > "$tmp/root/packages/shared/dist/utils/focus-curve.js"
  assert_eq "un build sans déclarations reste détecté" \
    "packages/shared/dist/utils/focus-curve.js" \
    "$(unresolved_dist_imports "$tmp/root/apps/web" "$tmp/root")"

  rm -rf "$tmp"

  if [ "$failures" -ne 0 ]; then
    echo -e "${RED}Self-test ÉCHOUÉ : le compteur de ce garde est cassé.${NC}"
    return 1
  fi
  echo -e "${GREEN}Self-test OK${NC}"
  return 0
}

main() {
  require_repo_tsc

  if [ "${1:-}" = "--self-test" ]; then
    echo "Type debt ratchet — self-test (tsc $("$TSC" --version | awk '{print $2}'))"
    self_test
    return $?
  fi

  local web_dir="$REPO_ROOT/apps/web"

  echo "Type debt ratchet — apps/web (baseline $WEB_BASELINE)"

  # Refuser de MESURER plutôt que rendre un verdict faux. Un garde qui annonce
  # « RÉGRESSION » alors que rien n'a régressé envoie chercher une faute qui
  # n'existe pas, et discrédite les fois où il a raison.
  local unresolved
  unresolved="$(unresolved_dist_imports "$web_dir" "$REPO_ROOT")"
  if [ -n "$unresolved" ]; then
    echo -e "${RED}✗ MESURE IMPOSSIBLE : \`packages/shared\` n'est pas bâti.${NC}"
    echo ""
    echo "apps/web importe ces modules par chemin RELATIF vers le build, et"
    echo "leur déclaration est absente :"
    printf '%s\n' "$unresolved" | while read -r spec; do echo "    $spec"; done
    echo ""
    echo "Chacun ajoute un TS2307 : le compte ne vaut PAS la baseline tant"
    echo "qu'ils manquent. Bâtir shared d'abord :"
    echo ""
    echo "    (cd packages/shared && bun run build)"
    echo ""
    echo "La CI le fait avant ce garde ; ce cas ne s'y produit pas."
    return 1
  fi

  local actual
  actual="$(count_type_errors "$web_dir")"

  if [ "$actual" -gt "$WEB_BASELINE" ]; then
    echo -e "${RED}✗ RÉGRESSION : $actual erreurs de types, baseline $WEB_BASELINE (+$((actual - WEB_BASELINE))).${NC}"
    echo ""
    echo "Fichiers les plus touchés :"
    top_offenders "$web_dir"
    echo ""
    echo "La dette de types de apps/web ne peut que DESCENDRE. Corriger les"
    echo "erreurs introduites, ou — si le compilateur a changé — expliquer la"
    echo "hausse dans le message de commit avant de relever WEB_BASELINE."
    return 1
  fi

  if [ "$actual" -lt "$WEB_BASELINE" ]; then
    echo -e "${YELLOW}✗ AMÉLIORATION NON ENREGISTRÉE : $actual erreurs, baseline $WEB_BASELINE (-$((WEB_BASELINE - actual))).${NC}"
    echo ""
    echo "Écrire dans scripts/check-type-debt.sh :"
    echo ""
    echo "    readonly WEB_BASELINE=$actual"
    echo ""
    echo "Un cliquet qui n'est pas resserré quand il peut l'être ne cliquette"
    echo "pas : la marge regagnée redeviendrait silencieusement dépensable."
    return 1
  fi

  echo -e "${GREEN}✓ $actual erreurs de types — la dette n'a pas bougé.${NC}"
  return 0
}

main "$@"
