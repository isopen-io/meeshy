# Iteration 44 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite directe d'iter 43 (lot « Source unique de la classification temps-relatif — F18b »,
mergé dans `main` : commit `f45e9dc`, `packages/shared/utils/relative-time.ts:classifyRelativeTime`
consommé par `notification-helpers.ts`, `v2/transform-conversation.ts`, `feed/PostsFeedScreen.tsx`).
Le plan iter 43 désigne explicitement **F18c** (unification des formateurs **calendaires** →
`packages/shared`, avec helper calendaire midnight/yesterday) comme « le prolongement direct
de F18b ».

Audit relancé du spectre récent → ancien. Surfaces testables sur ce runner Linux :
- **shared vitest** : gate bloquante (1200/1200 vert après iter 43).
- **web jest** : opérationnel (`date-format.test.ts`, `notification-helpers.test.ts`).
- gateway/iOS : non concernés par F18c (aucun formatage calendaire serveur — vérifié).

## Audit — constat vérifié (F18c)

### Réimplémentation × 3 du même calcul calendaire « différence de jours à minuit »
Trois fonctions web réimplémentent le **même algorithme de classification calendaire** —
différence de jours calculée **à minuit local** (et non en millisecondes écoulées), puis
branchement `aujourd'hui / hier / cette semaine / plus ancien` :

| # | Fichier | Calcul `diffDays` | Buckets |
|---|---------|-------------------|---------|
| 1 | `apps/web/utils/date-format.ts:31` `formatRelativeDate` | midnight-to-midnight (`new Date(y,m,d)`) | today→`classifyRelativeTime` (min/h), yesterday→`t('yesterday')`, <7j→weekday+heure, ≥7j→date courte |
| 2 | `apps/web/utils/date-format.ts:102` `formatConversationDate` | midnight-to-midnight (**copié à l'identique**) | today→heure seule, yesterday→`t('yesterday')`, <7j→weekday+heure, ≥7j→date courte |
| 3 | `apps/web/utils/notification-helpers.ts:241` `formatContentPublishedAt` | frontières `startOfToday`/`startOfYesterday` (équivalentes à midnight) | today→`classifyRelativeTime` (min/h), yesterday→`t('yesterdayAt')`, plus ancien→date+heure absolues |

Le bloc midnight (`new Date(now.getFullYear(), now.getMonth(), now.getDate())` puis
`Math.floor(diffTime / 86_400_000)`) est **dupliqué octet pour octet** entre #1 et #2, et
exprimé en variante équivalente (`startOfToday`/`startOfYesterday`) dans #3. C'est la partie
**la plus piégeuse** du code de dates (frontières de minuit, DST, fuseau local) — la centraliser
une fois élimine la classe entière de bugs de bord. Violation directe du principe **Single Source
of Truth** (CLAUDE.md : « Each data type has ONE source. No reimplementation ») et de la pureté SDK
(le **building block** stateless — la classification calendaire — doit être partagé ; la
**présentation i18n** reste app-side).

État de l'art : une fonction pure `classifyCalendarDay(targetMs, nowMs, { weekDays? })` qui
retourne un **bucket discriminé** (`today` / `yesterday` / `thisWeek` / `older`), symétrique de
`classifyRelativeTime` (iter 43, F18b), avec le `nowMs` injecté → déterministe et trivialement
testable. Chaque site rend ensuite ses propres chaînes via son `t()` et sa queue. Pour `today`,
`formatRelativeDate` et `formatContentPublishedAt` **composent** avec `classifyRelativeTime`
(granularité minute/heure intra-journée) — les deux building blocks se complètent proprement.

Impact MOYEN (pureté/unification + suppression d'une classe de bugs de bord calendaires),
couvert par la gate bloquante (vitest) + web jest, **comportement préservable octet pour octet**
sur chaque site → risque FAIBLE.

### Écarté de ce lot (sémantique divergente — reporté F18d)
- `FriendRequestCard.tsx:34` `formatRelativeDate` (privée) : `diffDays` calculé en **ms écoulées**
  (`Math.floor(diffMs / 86_400_000)`), **pas** à minuit. Migrer vers `classifyCalendarDay`
  **changerait le comportement** (une requête créée hier 23 h, vue aujourd'hui 1 h → écoulé = 0 j
  « justNow » ; calendaire = 1 j « hier »). La sémantique calendaire est sans doute **plus correcte**
  (« envoyée hier » devrait refléter le jour calendaire), mais c'est un changement de comportement
  observable → audit dédié avec couverture, hors lot « préservation octet pour octet ».
- `formatFullDate` (`date-format.ts:152`) : format absolu pur, pas de classification → rien à unifier.

## Décision iter 44 — lot « Source unique de la classification calendaire (F18c) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Créer `packages/shared/utils/calendar-day.ts` : `classifyCalendarDay(targetMs, nowMs, { weekDays? })` pur → union `CalendarDayBucket` (`today`/`yesterday`/`thisWeek`+`diffDays`/`older`) ; midnight local injecté via `nowMs` ; TDD vitest ; exporté du barrel `utils` | Pureté / SSOT — gate bloquante shared |
| B | Web : `formatRelativeDate`, `formatConversationDate`, `formatContentPublishedAt` délèguent au bucket calendaire (queues + clés i18n + composition `classifyRelativeTime` préservées) | Dédup ; web jest |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill ; fenêtre de maintenance |
| F18d | `FriendRequestCard.formatRelativeDate` → `classifyCalendarDay` (changement de sémantique ms→calendaire) | FAIBLE | Changement de comportement observable ; audit + tests dédiés |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` (User/Community) | MOYEN | États distincts ; audit sémantique + backfill |
| F23 | `getUnreadCountsForParticipants` N counts → agrégation mono-requête | MOYEN (BP) | `floor` par participant ; risque sur donnée visible |

## Gain estimé global
Élimination de **3 réimplémentations** du même calcul calendaire « différence de jours à minuit »
(la partie la plus piégeuse du code de dates) au profit d'un building block pur, testé et partagé
dans `packages/shared`, symétrique de `classifyRelativeTime` (F18b) — conformité Single Source of
Truth + pureté SDK (classification calendaire partagée / présentation i18n app-side), sortie
préservée octet pour octet sur chaque site appelant. Couvert par la gate bloquante shared (vitest)
+ web jest (`date-format` + `notification-helpers`).
</content>
</invoke>
