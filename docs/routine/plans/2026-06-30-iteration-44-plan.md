# Iteration 44 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique de l'arithmétique calendaire (F18c) » : extraire le calcul « début de
jour local / différence calendaire » (dupliqué dans `date-format.ts` ×2 et
`notification-helpers.ts`) vers `packages/shared`, et faire déléguer la 4ᵉ réimplémentation
de classification temps-écoulé (`FriendRequestCard`) au `classifyRelativeTime` d'iter 43 —
**sortie préservée à l'identique** partout.

## Étapes (TDD : RED → GREEN)

### Phase A — Shared : helpers calendaires purs + tests (gate bloquante)
- [ ] RED : `packages/shared/__tests__/utils/calendar-date.test.ts` — couvre
      `startOfLocalDayMs` (idempotence : début de jour d'un début de jour = lui-même ;
      même jour à des heures différentes → même valeur) et `calendarDayDiff`
      (même jour → 0 ; veille → 1 ; +6 j → 6 ; futur → négatif ; insensible à l'heure).
- [ ] GREEN : `packages/shared/utils/calendar-date.ts` —
      `startOfLocalDayMs(ms: number): number` (minuit local du jour de `ms`) ;
      `calendarDayDiff(targetMs: number, nowMs: number): number`
      (`floor((startOfLocalDayMs(nowMs) - startOfLocalDayMs(targetMs)) / 86_400_000)`).
- [ ] Export depuis `packages/shared/utils/index.ts`.
- [ ] `node node_modules/vitest/vitest.mjs run` → **1200 + nouveaux** verts.

### Phase B — Web : date-format délègue
- [ ] `date-format.ts:formatRelativeDate` : remplacer le bloc minuit (l.44-52) par
      `const diffDays = calendarDayDiff(messageDate.getTime(), now.getTime());`
      (diffMinutes/diffHours inchangés).
- [ ] `date-format.ts:formatConversationDate` : remplacer le bloc minuit (l.110-118)
      idem. Import depuis `@meeshy/shared/utils/calendar-date`.
- [ ] `node_modules/.bin/jest __tests__/utils/date-format.test.ts` → **25/25** verts.

### Phase C — Web : formatContentPublishedAt délègue
- [ ] `notification-helpers.ts:formatContentPublishedAt` : `startOfToday` via
      `startOfLocalDayMs(now.getTime())` (number) ; `startOfYesterday = startOfToday - 86_400_000` ;
      comparaisons `date.getTime() >= startOfToday`. Sortie inchangée.
- [ ] `node_modules/.bin/jest __tests__/utils/notification-helpers.test.ts` → **73/73**.

### Phase D — Web : FriendRequestCard délègue à classifyRelativeTime
- [ ] `FriendRequestCard.tsx:formatRelativeDate` → `classifyRelativeTime(date.getTime(), Date.now())` :
      `days`→`t('status.daysAgo',{count:value})`, `beyond`→`toLocaleDateString(locale)`,
      sinon (`now`/`minutes`/`hours`)→`t('status.justNow')`. Import depuis
      `@meeshy/shared/utils/relative-time`.

### Phase E — Vérification & livraison
- [ ] Build shared (`tsc`) ; vitest shared verts ; web jest `date-format` + `notification-helpers` verts ;
      `tsc --noEmit` web sans nouveau type error sur les fichiers touchés.
- [ ] Commit + push `claude/blissful-cannon-5sgi3v` ; PR vers `main` ; CI verte ; merge.

## Hors périmètre (consigné dans l'analyse)
F2 (staging), F10 (dual-write/backfill), F18d (queue de présentation), F21 (sémantique),
F23 (agrégation counts).

## Continuité
Iter 45+ : **F18d** (contrat de rendu commun pour la queue weekday/date) si un format
unifié émerge ; F23 en audit dédié ; F2/F10 dès qu'une fenêtre staging existe.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `calendar-date.ts` créé (`startOfLocalDayMs` + `calendarDayDiff`), exporté
      du barrel, testé (vitest **+8**). Shared build (`tsc`) OK ; suite complète **1208/1208**.
- [x] Phase B — `date-format.ts` : `formatRelativeDate` + `formatConversationDate` délèguent
      à `calendarDayDiff` (bloc minuit dédupliqué ×2). Web jest `date-format` **25/25**.
- [x] Phase C — `notification-helpers.ts:formatContentPublishedAt` : `startOfToday` via
      `startOfLocalDayMs`. Web jest `notification-helpers` **73/73**.
- [x] Phase D — `FriendRequestCard.tsx:formatRelativeDate` délègue à `classifyRelativeTime`
      (4ᵉ réimplémentation éliminée). `tsc --noEmit` web : aucun type error sur les fichiers
      touchés.
- [ ] Phase E — CI verte, mergé dans main
