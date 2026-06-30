# Iteration 47 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite directe d'iter 45 (lot « Comptes de non-lus : N requêtes → 1 requête + dichotomie — F23 »,
mergé : `MessageReadStatusService.getUnreadCountsForParticipants` collapse N `message.count` en
1 `message.findMany` + bucketing dichotomique). Le créneau **iter 46** a été consommé par un
micro-refactor web code-only sans artefacts routine (`formatFileSize` unifié sur la source
canonique partagée, PR #1136, mergé `main`) — d'où la numérotation **47** ici.

La consigne de la routine : chercher d'abord dans les features **récentes**, puis remonter vers
les plus anciennes. La feature la plus récemment touchée est la **présence conditionnelle sur la
fiche profil** (`PresenceVisibilityService`, Lots 1→6, en cours de livraison). Cette itération
**ne touche pas** au lot présence en vol (risque de conflit avec le travail en cours) et cible
plutôt une **duplication transverse récurrente, à comportement non unifié et porteuse d'un bug
de cohérence latent**, entièrement testable sur ce runner Linux (gateway jest + Prisma stubbé,
packages/shared vitest) sans staging ni backfill.

Surfaces testables sur ce runner (vérifié) :
- **packages/shared vitest** : `__tests__/utils/*` (helpers purs).
- **gateway jest** : `MessageReadStatusService.test.ts` (Prisma stubbé via
  `src/__tests__/__stubs__/prisma-client.ts` — aucun engine Prisma requis).

## Audit — constat vérifié (F24)

### Duplication de la résolution d'avatar participant — 14 sites, 3 sémantiques divergentes
La règle « avatar à afficher pour un participant » = *avatar local du participant, sinon avatar
du compte utilisateur lié, sinon rien* est **réécrite à la main 14 fois**, avec **trois
variantes incohérentes** de l'opérateur et de l'ordre :

| Sémantique | Sites |
|------------|-------|
| `p.avatar ?? p.user?.avatar ?? null` (canonique : local d'abord, `??`, null final) | `MessageReadStatusService.ts:758,844` ; `routes/conversations/core.ts:550` ; `routes/conversations/search.ts:193` ; `routes/conversations/messages.ts:1088,1120,1185,2174,2482` ; `routes/conversations/participants.ts:174` |
| `p.user?.avatar ?? null` (**fallback local manquant** — bug) | `MessageReadStatusService.ts:868` (`notSeenBy`) |
| `p.user?.avatar \|\| p.avatar` / `p.avatar \|\| p.user?.avatar` (ordre inversé et/ou `\|\|`) | `socketio/CallEventsHandler.ts:513,640,972` ; `socketio/MeeshySocketIOManager.ts:1679` ; `apps/web/.../UserConversationsSection.tsx:90` |

### Bug de cohérence prouvé — `notSeenBy` (MessageReadStatusService.ts:868)
Dans `getMessageReadStatus`, les trois listes d'un même message (`receivedBy`, `readBy`,
entrées de consommation média) résolvent l'avatar via la forme canonique
`participant.avatar ?? participant.user?.avatar ?? null` (l.758, l.844). La liste `notSeenBy`
(l.868) résout, elle, `p.user?.avatar ?? null` — **sans** le fallback `participant.avatar`.

Conséquence concrète : un participant possédant un **avatar local** (champ `Participant.avatar`,
ex. avatar par conversation) mais **sans** `user.avatar` (compte sans photo, ou participant
anonyme dont l'avatar vit sur la fiche participant) apparaît **avec sa photo** dans
`receivedBy`/`readBy` mais **sans photo** (`avatarURL: null`) dans `notSeenBy` — pour le **même
message**, dans la **même réponse API**. Incohérence visible côté client (accusés de lecture).

### Pourquoi unifier maintenant
- **Pureté / source unique** (principe « Single Source of Truth » du CLAUDE.md) : la règle est
  une décision produit qui doit vivre à un seul endroit (`packages/shared/utils`), pas être
  recopiée 14 fois.
- **Correction** : la centralisation **élimine** le bug `notSeenBy` par construction (tous les
  sites passent par la même fonction).
- **Coût/risque** : helper **pur**, testable sans dépendance ; les 10 sites « canoniques » sont
  remplacés **iso-comportement** (substitution littérale d'une expression identique par un appel
  qui calcule exactement la même chose).

## Décision iter 47 — lot « Source unique de la résolution d'avatar participant (F24) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `packages/shared/utils/participant-helpers.ts` : `resolveParticipantAvatar(p) = p?.avatar ?? p?.user?.avatar ?? null`. Export via `utils/index.ts` (déjà re-exporté par `types/index.ts` → `@meeshy/shared`). Tests vitest (local d'abord, fallback user, null final, null-safe entrée undefined). | PURETÉ / source unique |
| B | Remplacer les **10 sites canoniques** gateway par `resolveParticipantAvatar(...)` (iso-comportement) **et corriger `notSeenBy:868`** (le fallback local manquant disparaît mécaniquement). Test gateway RED→GREEN : `notSeenBy[].avatarURL` doit refléter `participant.avatar`. | CORRECTION + déduplication |

### Préservation du comportement (prouvée)
- Les 10 sites canoniques : `X.avatar ?? X.user?.avatar ?? null` ≡ `resolveParticipantAvatar(X)`
  — même opérateur `??`, même ordre, même null final. Substitution exacte.
- `notSeenBy:868` : seul changement **intentionnel** — passe de `p.user?.avatar ?? null` à
  `p.avatar ?? p.user?.avatar ?? null`, alignant la liste sur `receivedBy`/`readBy` du même
  message. Couvert par un test RED dédié (participant non-vu avec `avatar` local, `user:null`).

## Consignés pour itérations futures

| # | Constat | Raison du report |
|---|---------|------------------|
| F24b | `CallEventsHandler.ts:513,640,972` + `MeeshySocketIOManager.ts:1679` : ordre **inversé** (`user?.avatar` d'abord) et/ou opérateur `\|\|` (traite `""` comme absent, pas de null final). Migrer vers le helper **change** la sémantique (`""`, priorité local/user). | Audit sémantique dédié — hors périmètre iso-comportement de ce lot |
| F24c | `apps/web/.../UserConversationsSection.tsx:90` : `p.user?.avatar \|\| p.avatar` (web, ordre inversé). Le helper partagé s'applique mais l'ordre diffère. | Idem — décision produit sur l'ordre web |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) — ~75 % BP multilingue | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | Dual-write + backfill ; fenêtre de maintenance |
| F23b | Discordance latente `senderId`/`participant.id` dans le compte batché (iter 45) | Audit sémantique dédié |

## Gain estimé
Correction d'un bug de cohérence d'accusés de lecture (avatar `notSeenBy`) **prouvé** par test, et
réduction de 11 réécritures manuelles d'une décision produit à **une seule source** pure et
testée. Base saine pour migrer ensuite les sites à sémantique divergente (F24b/F24c) après audit.
Couvert par packages/shared vitest (helper) + gateway jest (`notSeenBy` + non-régression des 139
cas existants).
