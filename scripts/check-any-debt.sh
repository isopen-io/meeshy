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
# WHY GATEWAY, SHARED AND WEB HAVE DIFFERENT BASELINES
#
# `packages/shared` measures 0 today: production `any` there is already
# clean. Held at 0 rather than given a budget — CLAUDE.md already says "NO
# `any` in shared package - use `unknown` with validation" for exactly this
# package. `services/gateway/src` measures 651 and `apps/web` measures 451:
# real, scattered debt that this lot does not attempt to pay down (see
# below), so each baseline pins the CURRENT count rather than pretending to a
# number nobody has earned.
#
# WHY `apps/web` IS MEASURED BY THIS SCRIPT TOO, DESPITE HAVING ITS OWN ESLINT
#
# `apps/web` already has `check-lint-debt.sh`, a real AST-aware ESLint
# ratchet — but its config (`apps/web/eslint.config.mjs`) carries no
# `@typescript-eslint/no-explicit-any` override, and the Next.js presets it
# extends set that rule to `warn`, not `error`. `check-lint-debt.sh` counts
# ERRORS only (by its own design, matching its twin's convention) — so a file
# that trades an unrelated lint ERROR for a new `any` `warn` can lower the
# lint-debt total while `any` usage itself grows, and nothing before this lot
# would have noticed. Reusing THIS script's regex counter for web — rather
# than standing up a second, ESLint-based `any` ratchet — keeps the "what
# counts as `any`" definition in exactly one place for the three TypeScript
# packages this repo builds without duplicating it across two tools with
# potentially different edge cases.
#
# WHAT THIS LOT DELIBERATELY DOES NOT DO
#
# It does not reduce the 651 gateway sites or the 451 web sites. Several of
# the heaviest gateway carriers (`services/notifications/NotificationService.ts`,
# 6119 lines; `services/message-translation/MessageTranslationService.ts`,
# 3303 lines) are already OVER the repo's 1000–1200 line budget (#4426) —
# adding a `unknown` + a type guard to either would add lines to a file the
# budget already forbids touching without extracting first. Reducing either
# baseline is real work for a separate lot. This ratchet's job is narrower
# and immediate: stop the numbers from growing while nobody is watching them.
#
# iOS's `try?` count is OUT OF SCOPE for this script — it is unreachable from
# this environment (no Xcode) and is a different rule on a different
# language. Issue #3679 stays open for it.
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

# `services/gateway/src` — dette réelle. Ne peut que descendre. Pour la
# baisser : lancer ce script, il nomme la valeur à écrire ici.
#
# 651, pas 650 (#5945) : le commit d'introduction (`ebbb5fc8dd`, #3679)
# enregistrait 650 comme « mesurée aujourd'hui », mais une mesure
# indépendante sur ce MÊME commit — avant tout autre changement gateway —
# rend 651. Le self-test du script passe ; c'est la valeur enregistrée qui
# était fausse dès l'introduction, pas une dérive de dette réelle depuis.
#
# 639, pas 651 (#3679, premier lot de RÉDUCTION plutôt que de simple gel) :
# `services/notifications/NotificationFormatter.ts` (182 lignes, dans le
# budget de taille) typait ses douze usages sur des `any` nus — les quatre
# champs `Json` Prisma (`actor`/`context`/`metadata`/`delivery`) castés en
# `unknown` puis vers leur type de domaine (`NotificationActor` etc.), les
# entrées de méthode contre la forme réellement servie par les appelants
# (`RawNotificationInput`/`RawNotificationRow`). Aucun `unknown` nu laissé :
# chaque champ a désormais le type que son producteur (Prisma) ou son
# consommateur (`@meeshy/shared/types/notification`) déclare.
#
# 624, pas 639 (#3679, second lot de RÉDUCTION) :
# `routes/admin/broadcasts.ts` (577 lignes, dans le budget de taille) typait
# ses quinze usages sur des `any` nus — huit `catch (error: any)` jamais lus
# dans leur corps (repris en `unknown`, sans changement de comportement), deux
# `targeting?: any` et un `(broadcast.targeting || {}) as any` repris sur le
# type déjà partagé `BroadcastTargeting` (`jobs/broadcast-recipients.ts`), deux
# `where`/`updateData` Prisma nus repris sur `Prisma.AdminBroadcastWhereInput` /
# `Prisma.UserWhereInput` / `Prisma.AdminBroadcastUpdateInput`, et un
# `(err: any)` de callback de job repris en `unknown` avec narrowing
# `instanceof Error` (même patron que son jumeau `send-inapp`, déjà correct).
# Le typage honnête de `targeting.activityStatus` a fait échouer la
# compilation sur la valeur `'new'`, absente du type partagé — révélant que le
# filtre d'ENVOI réel (`activityWindow()`) ne l'implémente pas alors que la
# PREVIEW si : #6777, hors périmètre de ce lot de dette `any`.
#
# 599, pas 624 (#3679, troisième lot de RÉDUCTION) :
# `route-manifest/collect.ts` (962 lignes, dans le budget de taille) typait
# ses 25 usages sur des `any` nus — le collecteur de manifeste de routes
# (#4276), un module de TOOLING (construit un serveur Fastify assemblé sur des
# stubs pour introspecter le graphe de routes réel), jamais un chemin de
# production servant du trafic. Trois familles :
# - `(routeOptions as any).schema/.prefix/.onRequest/.preValidation/
#   .preHandler` (6 sites) étaient inutiles : le hook `onRoute` de Fastify
#   type déjà `RouteOptions & { prefix, path, routePath }` — mesuré en les
#   retirant, `tsc --noEmit` reste à 0 erreur.
# - `makeCallableStub()`/`makeDeepStub(): any` (2 sites, + un `fn: any`
#   interne) reprises en `unknown`, avec un unique cast `as PrismaClient` posé
#   UNE fois à la déclaration de `prismaStub` plutôt que redit à ses trois
#   sites d'usage (`createUnifiedAuthMiddleware`, `app.decorate('prisma', …)`,
#   `deps.prisma`).
# - Les 14 `{} as any` de décoration Fastify + du `deps: RouteRegistrationDeps`
#   (mentionService, socketIOHandler, jobMappingCache, emailService,
#   mutationLogService, callService, notificationService, socialEvents,
#   translationService, messagingService, orphanMediaCleanup) reprises en
#   `{} as unknown as <VraiType>` contre les types déjà déclarés par
#   `types/fastify.d.ts` et `RouteRegistrationDeps` — seule leur PRÉSENCE
#   compte pour que chaque module de routes se CONSTRUISE, jamais leur
#   contenu (aucune n'est appelée par ce collecteur). `presenceChecker`
#   satisfaisait déjà structurellement son type déclaré : cast retiré, pas
#   remplacé.
# `bodySchema?`/`querystringSchema?: any` sur `CollectedRoute` reprises en
# `unknown` (JSON Schema opaque, dépouillé seulement par le double `any` déjà
# existant de `route-auth-coverage.test.ts`, un fichier de test hors mesure).
#
# 559, pas 599 (#3679, quatrième lot de RÉDUCTION) :
# `routes/conversations/messages-list-query.ts` (980 lignes, dans le budget de
# taille — les aides de `GET /conversations/:id/messages` extraites par
# #4284) portait les 40 usages les plus concentrés du gateway. Trois familles :
# - Les lignes brutes (`Message`, son `sender`, sa pièce jointe, son
#   `replyTo`) reprises sur des types structurels NOMMÉS (`RawMessageRow`,
#   `RawMessageSender`, `RawMessageAttachment`, `RawReplyToRow`) — même
#   discipline que `MessageProtectionContext`/`MessageProtectionFields`
#   (`routes/admin/media-protection.ts`) : le plancher qu'une fonction exige,
#   jamais la forme Prisma exacte (le `select` de ce fichier se construit
#   dynamiquement selon `includeTranslations`/`includeReplies`, donc n'a pas
#   de type Prisma unique à dériver). `buildMessageListSelect` retourne
#   `Prisma.MessageSelect` au lieu d'un `any` local.
# - Le JSON de transcription/traduction audio (segments Whisper,
#   `speakerAnalysis`, traductions du Prisme par pièce jointe) — opaque et
#   profondément imbriqué — repris en `Record<string, unknown>` nommés
#   (`TranscriptionBlob`, `TranscriptionSegment`, `TranscriptionSpeaker`,
#   `AttachmentAudioTranslationEntry`) avec des `const` locaux capturant
#   chaque niveau AVANT narrowing, jamais un `any` nu.
# - Trois `original.sender as any` (l'aperçu d'un message TRANSFÉRÉ) repris en
#   UN cast vers un type nommé (`AvatarBearingParticipant &
#   DisplayNameBearingParticipant & {username, user.username}`) : le `select`
#   de `forwardedMessages` ne charge que `user.username` — plus étroit que ce
#   que les deux résolveurs partagés déclarent — donc un cast reste
#   nécessaire, mais un seul plutôt que trois, et nommé plutôt que `any`.
#
# `mapMessageRowForList` GARDE `: any` en sortie, DÉLIBÉRÉMENT (documenté sur
# place) : son unique appelant, `messages-list.ts` (hors périmètre de ce
# lot), lit `mappedMessages` sans annotation propre (`new Date(firstMsg.
# createdAt)`, entre autres) — un retour typé romprait sa compilation pour un
# gain hors du fichier réservé. `mappedMessage`, la variable CONSTRUITE à
# l'intérieur, est elle pleinement typée (`MappedMessageRow`) : l'annotation
# de sortie ne relâche plus aucune vérification interne, elle ne fait que
# garder le contrat vu par l'appelant inchangé. Même raison pour les
# paramètres `messages` de `loadMessageReadStatusMap` /
# `loadCurrentUserConsumptionMap` : `messages-list.ts` les construit via un
# `select` lui-même typé `any` (préexistant, sans rapport avec ce lot), d'où
# `readonly unknown[]` plutôt qu'une ligne nommée, avec un cast interne unique
# à l'usage.
#
# Gates locaux verts : `tsc --noEmit` gateway (0 erreur), les 17 suites qui
# importent ou exercent ce fichier et ses appelants (330 tests), la suite
# `routes/conversations` complète (353 tests), `check-any-debt.sh` + son
# self-test.
#
# 2026-09-17 — `services/AudioTranslateService.ts` (16 usages) et son noyau
# `services/audio-voice-profile-core.ts` (jamais compté par ce cliquet : ses
# 4 usages n'ont qu'un seul match dans la regex — `Promise<any>` — les trois
# autres étant `Record<string, any>` et `Promise<any | null>`, hors de la
# forme surveillée). Les deux écouteurs ZMQ (`transcriptionCompleted`,
# `transcriptionError`) et leurs deux handlers repris sur des interfaces
# nommées (`TranscriptionCompletedEvent`, `TranscriptionErrorEvent`) plutôt
# que le même littéral répété deux fois ; `PendingRequest.resolve`/`.reject`
# en `unknown` (la valeur traverse la file d'attente sans être lue à ce
# site) ; cinq `catch (error: any)` en `catch (error: unknown)` avec le
# patron déjà établi (`error instanceof Error ? error.message : 'Unknown
# error'`, cf. `routes/admin/broadcasts.ts`) ; les écritures Prisma sur les
# champs `Json?` `transcription`/`translations` en `as unknown as
# Prisma.InputJsonValue` (patron `PostService.ts`) ; `getVoiceProfile`/
# `saveVoiceProfile` (service ET noyau) retypés sur `UserVoiceModel` généré
# plutôt que `any`. Deux `segments: … as any` retirés PUREMENT : mesuré au
# compilateur, `VoiceTranscriptionSegment[]` (3 champs requis) est déjà
# structurellement assignable à `TranscriptionSegment[]` (mêmes 3 champs
# requis, le reste optionnel) — aucun des deux sens n'avait besoin d'un
# cast, l'un des deux directions ayant simplement été essayée sans vérifier
# l'autre.
#
# Gates locaux verts : `tsc --noEmit` gateway (0 erreur), `bash
# scripts/check-any-debt.sh` + son self-test.
#
# 2026-09-17 — `routes/conversations/messages-list.ts` (12 des 13 usages, 836
# lignes, appelant unique de `messages-list-query.ts` explicitement laissé
# hors périmètre par le lot précédent). `whereClause`/`messageSelect` repris
# sur `Prisma.MessageWhereInput`/`Prisma.MessageSelect`, `beforeFilter` sur
# `Prisma.DateTimeFilter`. Le `select` de cette route est composé
# DYNAMIQUEMENT (`buildMessageListSelect`, selon includeTranslations/
# includeReplies) : Prisma ne peut donc pas dériver un type de ligne unique de
# ce `select` — un cast UNIQUE (`rawMessages as unknown as RawMessageRow[]`,
# le type déjà nommé par `messages-list-query-types.ts`) remplace les six
# `any`/`as any` scattered sur `messages`/`msg`/`att`/`message`. `mimeType`
# ajouté aux champs NOMMÉS de `RawMessageAttachment` (chargé par
# `attachmentMediaSelect`, lu par le diagnostic audio, jusqu'ici couvert par
# son seul index `[key: string]: unknown`). `responsePayload` reçoit un type
# structurel local (`pagination`/`hasNewer` optionnels, posés après coup par
# la route) plutôt qu'un `any`.
#
# Ce que ce lot NE fait PAS, et pourquoi : `mappedMessages` reste implicite
# (`any[]`, hérité du retour `any` DÉLIBÉRÉ de `mapMessageRowForList` — son
# propre doc-comment) — mesuré au compilateur, `MappedMessageRow.createdAt`
# est un `Date` NON optionnel, et `new Date(firstMsg.createdAt)` (deux sites,
# mode `around`) n'a pas de surcharge acceptant un `Date` déjà construit ;
# annoter `mappedMessages` aurait cassé ces deux sites pour un gain hors du
# fichier réservé. `optionalAuth: any` (le SEUL restant, sur les 13) est
# partagé avec `messages.ts` et sa dizaine de registrars frères — le typer
# ICI SEUL aurait été inconsistant avec le reste du fichier appelant, hors du
# périmètre de ce lot.
#
# Gates locaux verts : `tsc --noEmit` gateway (0 erreur), `bash
# scripts/check-any-debt.sh` + son self-test.
readonly GATEWAY_BASELINE=531

# `apps/web` — dette réelle, jamais gardée avant ce lot (cf. en-tête « WHY
# `apps/web` IS MEASURED… »). Mesurée sur un checkout NON construit (pas de
# `.next/`) ; `.next` est exclu de `find_source_files` pour que la mesure
# reste identique une fois `apps/web` construit en CI.
readonly WEB_BASELINE=451

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
#
# `.next` : ajouté pour `apps/web`, dont ce garde n'a la charge que depuis ce
# lot. `.github/workflows/ci.yml` lance `bun run build` AVANT cette étape —
# `apps/web/.next/types/**/*.ts` existe donc au moment où ce script tourne en
# CI, même s'il est absent d'un checkout non construit comme celui qui a
# mesuré la baseline ci-dessous. `check-type-debt.sh` exclut la même sortie
# générée pour la même raison (cf. son en-tête « .next/ »). Sans cette
# exclusion, la baseline `apps/web` mesurée LOCALEMENT (checkout non construit)
# ne pourrait jamais correspondre à ce que CI mesure (checkout construit) —
# le cliquet rougirait au premier run, pas sur une vraie régression.
find_source_files() {
  local target_dir="$1"
  find "$target_dir" \
    \( -name node_modules -o -name dist -o -name generated -o -name .next -o -path '*/prisma/client' \) -prune \
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

  # 5. Un usage réel, mais sous `.next/` (sortie générée par `next build`,
  #    présente en CI après l'étape de build qui précède ce garde) : exclu —
  #    cf. en-tête « `.next` : ajouté pour `apps/web` ».
  mkdir -p "$tmp/withnext/.next/types"
  echo 'export const ok = 1;' > "$tmp/withnext/fine.ts"
  echo 'export const generated = {} as any;' > "$tmp/withnext/.next/types/gen.ts"
  assert_eq "un usage sous .next/ est exclu" "0" "$(count_any_usages "$tmp/withnext")"

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

  echo "any debt ratchet — gateway + shared + web"

  local status=0
  check_package "packages/shared" "$REPO_ROOT/packages/shared" "$SHARED_BASELINE" "SHARED_BASELINE" || status=1
  check_package "services/gateway/src" "$REPO_ROOT/services/gateway/src" "$GATEWAY_BASELINE" "GATEWAY_BASELINE" || status=1
  check_package "apps/web" "$REPO_ROOT/apps/web" "$WEB_BASELINE" "WEB_BASELINE" || status=1

  if [ "$status" -eq 0 ]; then
    echo -e "${GREEN}✓ la dette \`any\` de gateway, shared et web n'a pas bougé.${NC}"
  else
    echo ""
    echo "La dette \`any\` de gateway, shared et web ne peut que DESCENDRE."
    echo "Corriger les usages introduits, ou — si la mesure a changé de forme —"
    echo "expliquer la hausse dans le message de commit avant de relever une"
    echo "baseline."
  fi

  return "$status"
}

main "$@"
