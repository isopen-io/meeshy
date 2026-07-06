# Iteration 44 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 43 (lot « Source unique de la classification temps-relatif — F18b », mergé dans
`main` : PR #1081 / commit `b0c15b6`, `packages/shared/utils/relative-time.ts`
`classifyRelativeTime` consommé par `notification-helpers.ts`, `transform-conversation.ts`
et `PostsFeedScreen.tsx`). Le plan iter 43 désigne explicitement **F18c** (unification des
formateurs **calendaires** restants → `packages/shared`, avec helper midnight/yesterday)
comme « le prolongement direct de F18b ».

Surfaces testables sur ce runner Linux :
- **shared vitest** : baseline **1200/1200 vert** (gate bloquante).
- **web jest** : `date-format.test.ts` **25/25 vert**, `notification-helpers.test.ts`
  **73/73 vert** (couvre `formatContentPublishedAt`).
- gateway/iOS : hors périmètre F18c (aucun formateur de date relatif).

## Audit — constats vérifiés (F18c)

### 1. Bloc de différence de jours calendaire dupliqué à l'identique (date-format.ts)
`formatRelativeDate` (l.44-52) et `formatConversationDate` (l.110-118) répètent **mot pour
mot** le même calcul de différence en jours par comparaison des minuits locaux :
```ts
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const messageDateStart = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
const diffDays = Math.floor((todayStart.getTime() - messageDateStart.getTime()) / 86_400_000);
```
`formatContentPublishedAt` (`notification-helpers.ts:264-265`) recalcule le même `startOfToday`
(et en dérive `startOfYesterday`). Trois sites réimplémentent donc l'arithmétique « début de
jour local / différence calendaire ». Violation de Single Source of Truth.

### 2. 4ᵉ réimplémentation de la classification temps-écoulé (FriendRequestCard)
`FriendRequestCard.tsx:34` `formatRelativeDate` réimplémente une classification en **jours
écoulés** (`floor(diffMs/86_400_000)`) : `0 → justNow`, `1 → daysAgo(1)`, `<7 → daysAgo(n)`,
`≥7 → toLocaleDateString(locale)`. C'est exactement le bucket de `classifyRelativeTime`
(iter 43) — les paliers `now`/`minutes`/`hours` correspondent tous à `diffDays === 0`
(→ `justNow`), `days` → `daysAgo(value)`, `beyond` → date absolue. Mappable **octet pour
octet**, échappé au lot iter 43 (granularité jours uniquement) mais consommable par le même
building block.

## Décision iter 44 — lot « Source unique de l'arithmétique calendaire (F18c) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Créer `packages/shared/utils/calendar-date.ts` : `startOfLocalDayMs(ms)` + `calendarDayDiff(targetMs, nowMs)` purs ; TDD vitest ; exportés du barrel | Pureté / SSOT — gate bloquante shared |
| B | `date-format.ts` : `formatRelativeDate` + `formatConversationDate` utilisent `calendarDayDiff` (bloc minuit dédupliqué ×2) | Dédup ; web jest `date-format` 25/25 |
| C | `notification-helpers.ts:formatContentPublishedAt` : `startOfToday`/`startOfYesterday` via `startOfLocalDayMs` | Dédup ; web jest `notification-helpers` 73/73 |
| D | `FriendRequestCard.tsx:formatRelativeDate` → délègue à `classifyRelativeTime` (iter 43) | Élimine la 4ᵉ réimplémentation |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill ; fenêtre de maintenance |
| F18d | Unifier la **queue de présentation** (weekday + heure, date courte/absolue) entre `formatRelativeDate`/`formatConversationDate`/`formatContentPublishedAt` si un contrat de rendu commun émerge | FAIBLE | Queues légèrement hétérogènes (heure incluse ou non, format absolu jj/mm vs jj mois aaaa) ; gain marginal |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` (User/Community) | MOYEN | États distincts ; audit sémantique + backfill |
| F23 | `getUnreadCountsForParticipants` N counts → agrégation mono-requête | MOYEN (BP) | `floor` par participant ; risque sur donnée visible |

## Gain estimé global
Source unique pour l'arithmétique « début de jour local / différence calendaire » (3 sites
dédupliqués) et élimination de la 4ᵉ réimplémentation de la classification temps-écoulé
(FriendRequestCard → `classifyRelativeTime`). Conformité Single Source of Truth + pureté SDK,
sortie préservée octet pour octet. Couvert par la gate bloquante shared (vitest) + web jest
(`date-format` 25/25, `notification-helpers` 73/73).
