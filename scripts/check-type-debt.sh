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
# That third bullet was TRUE OF THE ALIAS AND FALSE OF THE PACKAGE, and the gap
# is the fourth source of drift — found at cycle 108, by walking into it.
# `__tests__/lentille/shared-law-dist-parity.test.ts` reaches the built output
# by RELATIVE path (`../../../../packages/shared/dist/utils/*.js`), which never
# consults `paths` at all. A test whose whole purpose is to compare source to
# `dist/` must of course import `dist/`; the defect was the header's, not the
# test's. Without `packages/shared/dist` those imports raise TS2307 and the
# count moves — measured on one unchanged tree: 1243 without the build, 1240
# with it, a drift of exactly 3.
#
# The CI `quality` job builds shared BEFORE type-checking (`ci.yml`, "Build
# shared package first (required for type-check)"), so the recorded baseline is
# the dist-present number. A developer machine that has not built shared was
# therefore measuring something else and reading a PHANTOM REGRESSION — and the
# reverse is worse: a baseline ever recorded from such a machine would hand the
# budget 3 silently spendable points, which is precisely what this ratchet
# exists to prevent.
#
# So the state is PINNED rather than the errors excluded. Excluding them by path
# (as `.next/` is excluded) would also stabilise the number, but at the price of
# making that file free of all debt forever. Refusing to measure in an undefined
# state costs nothing and keeps every file counted.
#
# What CAN legitimately move the number is a TypeScript version bump. That is a
# feature: a bump that adds errors must be seen, and a bump that removes them
# must be recorded. Both directions fail loudly and name the number to write.
#
# --self-test: exercises `count_type_errors` — the actual counting mechanism
# used below — against throwaway fixture packages: one that must report exactly
# its errors, one clean that must report zero, and one whose only error lives
# under `.next/` and must therefore NOT be counted. It also exercises
# `shared_dist_is_built`, the guard on the fourth drift source, in both of its
# states. A ratchet that can go silently blind is worse than no ratchet, so this
# fails loudly (non-zero) if its own counting is broken.

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
# 1239 → 1209 au cycle 108 : neuf casts `(socket as unknown).emit(…)` retirés de
# `CallManager.tsx` / `VideoCallInterface.tsx` / `use-video-call.ts`, et les trois
# paramètres `socket: unknown` de `CallManager` typés `TypedSocket | null`. Le
# contrat existait déjà (`TypedSocket`, `getSocket()` le rend typé) : ces casts ne
# désactivaient aucune vérification, ils en FABRIQUAIENT l'échec — `.emit` sur un
# `unknown` est une erreur à chaque site. Aucun fichier n'a monté.
# 1209 → 1205 au train beta du 2026-08-23 : `components/common/BubbleMessage.tsx`
# 5 → 1, effet du routage des comparaisons de langue vers la SSOT (itération 251,
# PR #3375). Mesuré par FICHIER, pas déduit d'un total — c'est le seul fichier
# qui bouge entre `main` et ce train.
#
# La valeur est ancrée sur la mesure du RUNNER, jamais sur une mesure locale :
# cet arbre compte 14 erreurs de plus que la CI (1223 ici pour 1209 là-bas), un
# écart d'environnement stable, vérifié deux fois à des états différents du
# dépôt. Seul le DELTA est transportable d'une machine à l'autre ; l'absolu ne
# l'est pas. Qui remesure ici et pose ce qu'il lit fera rougir la CI de 14.
#
# 1205 → 1196 au Vague 166 (fusionné sur ce train, instruit en parallèle du
# cycle 108 sur le même suivi cycle-107-bis, sans recouvrement de fichier avec
# le fix BubbleMessage ci-dessus) : neuf erreurs restantes que le cycle 108
# avait laissées vivre sur les MÊMES fichiers de la surface d'appel —
# cinq listeners `CallManager.attachedListeners` passaient encore `data:
# unknown` tel quel aux handlers typés (`data as CallXEvent` au point
# d'écoute, où le contrat serveur garantit la forme), trois
# `VideoCallInterface.handleParticipantLeft(event: unknown)` typé
# `CallParticipantLeftEvent`, et un `(event as unknown).anonymousId` mort
# dupliqué dans `CallManager` (déjà retiré côté `VideoCallInterface` au
# Vague 133 — le champ n'existe pas sur `CallParticipantLeftEvent`).
# DELTA mesuré en LOCAL sur cette même machine, jamais l'absolu (cf. écart de
# 14 documenté ci-dessus) : 9 erreurs de moins entre l'arbre fusionné avec et
# sans ce correctif, appliquées à la baseline ancrée CI (1205 → 1196).
#
# 1196 → 1194 au train beta du 2026-08-25 : effet du lot 6 W8-W9 + lot 7 (commit
# `39e1688538`, « éditer un REEL republie le reconvertissait en POST »), déjà sur
# `main`. La marge n'avait pas été enregistrée, si bien que `main` LUI-MÊME
# rougissait — « AMÉLIORATION NON ENREGISTRÉE : 1194 erreurs, baseline 1196 » —
# et faisait rougir toute PR ouverte après lui, sans qu'aucune n'en soit la
# cause. C'est précisément le cas que ce cliquet existe pour capturer : deux
# points regagnés par un lot produit redeviennent dépensables tant qu'ils ne sont
# pas gravés.
# Valeur ancrée sur la mesure du RUNNER (1194, lue dans le log CI de `main`),
# jamais sur la mesure locale — cet arbre en lit 1208, l'écart de 14 documenté
# ci-dessus, re-vérifié à cette occasion. Le train qui grave cette valeur ne
# touche AUCUN fichier d'`apps/web` : son seul changement sous `packages/shared`
# est un `.max(5)` → `.max(6)` sur des schémas Zod, une borne de validation
# RUNTIME dont `z.string()` infère le même type — delta de types nul, par
# construction.
readonly WEB_BASELINE=1185

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

# Le `dist/` de `@meeshy/shared` est-il construit ?
#
# Le compte n'est comparable à la baseline que dans cet état (cf. en-tête, 4e
# source de dérive). On teste le RÉPERTOIRE plutôt que les trois fichiers que le
# test de parité importe aujourd'hui : cette liste bougera, la condition non.
shared_dist_is_built() {
  local repo_root="$1"
  local dist="$repo_root/packages/shared/dist"
  [ -d "$dist" ] && [ -n "$(ls -A "$dist" 2>/dev/null)" ]
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

  # 4. Le garde de la 4e source de dérive, dans SES DEUX états — un garde qui
  #    répondrait « construit » sur un arbre vide laisserait revenir en silence
  #    l'écart de 3 que ce cycle vient de mesurer.
  mkdir -p "$tmp/nodist/packages/shared"
  if shared_dist_is_built "$tmp/nodist"; then
    echo -e "  ${RED}✗${NC} un dist absent doit être vu comme absent"
    failures=$((failures + 1))
  else
    echo -e "  ${GREEN}✓${NC} un dist absent est vu comme absent"
  fi

  mkdir -p "$tmp/withdist/packages/shared/dist/utils"
  echo 'export const x = 1;' > "$tmp/withdist/packages/shared/dist/utils/focus-curve.js"
  if shared_dist_is_built "$tmp/withdist"; then
    echo -e "  ${GREEN}✓${NC} un dist construit est vu comme construit"
  else
    echo -e "  ${RED}✗${NC} un dist construit doit être vu comme construit"
    failures=$((failures + 1))
  fi

  # Un répertoire `dist/` VIDE n'est pas un build — c'est l'état que laisse un
  # `rm -rf dist/*` ou un build interrompu, et il produit les mêmes TS2307.
  mkdir -p "$tmp/emptydist/packages/shared/dist"
  if shared_dist_is_built "$tmp/emptydist"; then
    echo -e "  ${RED}✗${NC} un dist VIDE ne doit pas passer pour un build"
    failures=$((failures + 1))
  else
    echo -e "  ${GREEN}✓${NC} un dist vide n'est pas un build"
  fi

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

  # Le chiffre n'est comparable QUE dans l'état où la baseline a été prise.
  # Mesurer sans `packages/shared/dist` rend une régression fantôme (+3), et
  # enregistrer une baseline depuis cet état offrirait 3 points de budget.
  if ! shared_dist_is_built "$REPO_ROOT"; then
    echo -e "${RED}✗ packages/shared/dist est absent — refus de mesurer.${NC}"
    echo ""
    echo "Un test de parité de apps/web importe le dist de @meeshy/shared par"
    echo "chemin RELATIF, hors de l'alias \`paths\`. Sans le build, ses imports"
    echo "rendent des TS2307 et le compte monte de 3 sans qu'aucune dette"
    echo "n'ait bougé. La CI construit shared avant de type-checker, donc la"
    echo "baseline est le chiffre dist-présent."
    echo ""
    echo "    cd packages/shared && bun run build"
    echo ""
    return 1
  fi

  echo "Type debt ratchet — apps/web (baseline $WEB_BASELINE)"

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
