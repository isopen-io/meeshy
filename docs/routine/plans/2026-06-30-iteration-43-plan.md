# Iteration 43 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique de la classification temps-relatif (F18b) » : extraire l'algorithme de
classification d'un délai écoulé (now/minutes/hours/days/au-delà), réimplémenté 3 fois dans
`apps/web`, vers un building block pur `classifyRelativeTime` dans `packages/shared`, et
faire déléguer les 3 sites — **sortie préservée à l'identique** (clés i18n + queue + plafond
conservés par chaque appelant).

## Étapes (TDD : RED → GREEN)

### Phase A — Shared : building block pur + tests (gate bloquante)
- [ ] RED : `packages/shared/__tests__/utils/relative-time.test.ts` — couvre :
      `now` (< 1 min), `minutes`, `hours` (frontières 59 min / 60 min / 23 h 59 / 24 h),
      `days` (frontière 6 j / 7 j), `beyond` (≥ `beyondDays`), `beyondDays: Infinity`
      (jamais de `beyond`), délais négatifs (futur → `now`).
- [ ] GREEN : `packages/shared/utils/relative-time.ts` —
      `classifyRelativeTime(targetMs: number, nowMs: number, options?: { beyondDays?: number }): RelativeTimeBucket`,
      pur ; union discriminée `RelativeTimeBucket`
      (`{unit:'now'}` | `{unit:'minutes';value}` | `{unit:'hours';value}` | `{unit:'days';value}` | `{unit:'beyond'}`).
      Seuils : minutes via `floor(diffMs/60_000)`, hours via `floor(diffMs/3_600_000)`,
      days via `floor(diffMs/86_400_000)` ; `beyondDays` défaut 7.
- [ ] Export depuis `packages/shared/utils/index.ts`.
- [ ] `node node_modules/vitest/vitest.mjs run` → **1190 + nouveaux** verts.

### Phase B — Web : délégation des 3 sites
- [ ] `notification-helpers.ts:formatNotificationTimeAgo` → `classifyRelativeTime(date.getTime(), Date.now())` ;
      switch sur `bucket.unit` : `now`→`t('timeAgo.now')`, `minutes`/`hours`/`days`→
      `t('timeAgo.{minute|hour|day}').replace('{count}', String(value))`, `beyond`→
      `toLocaleDateString(locale,{day:'numeric',month:'short'})`. Gardes null/NaN conservées.
- [ ] `transform-conversation.ts:formatRelativeTime` → `classifyRelativeTime(...)` ;
      `now`→`t('timeCompact.now')`, `minutes`/`hours`/`days`→`t('timeCompact.{…}',{count:value})`,
      `beyond`→`toLocaleDateString(locale,{day:'numeric',month:'short'})`.
- [ ] `PostsFeedScreen.tsx:formatRelativeTime` → `classifyRelativeTime(..., { beyondDays: Infinity })` ;
      `now`→`t('time.now','Just now')`, `minutes`/`hours`/`days`→`t('time.{…}',{count:value})`.
- [ ] `node_modules/.bin/jest __tests__/utils/notification-helpers.test.ts` → **73/73** verts.

### Phase C — Vérification & livraison
- [ ] Build shared (`tsc`) ; vitest shared verts ; web jest notification-helpers vert.
- [ ] Commit + push `claude/blissful-cannon-5sgi3v`.
- [ ] PR vers `main`, CI verte (shared + web + agent), merge ; résolution de conflits si besoin.

## Hors périmètre (consigné dans l'analyse)
F2 (staging), F10 (dual-write/backfill), F18c (formateurs calendaires), F21 (sémantique
isActive/deletedAt), F23 (agrégation counts).

## Continuité
Iter 44+ : **F18c** (unification des formateurs calendaires `formatRelativeDate` /
`formatConversationDate` / `formatContentPublishedAt` / `FriendRequestCard` → shared, avec
helper calendaire midnight/yesterday) est le prolongement direct de F18b ; F23 en audit
dédié avec couverture renforcée sur les compteurs de non-lus ; F2/F10 dès qu'une fenêtre
staging existe.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `classifyRelativeTime` créé (`packages/shared/utils/relative-time.ts`),
      exporté du barrel `utils`, testé (vitest **+10**). Shared build (`tsc`) OK ;
      suite shared complète **1200/1200** verte.
- [x] Phase B — 3 sites web délèguent au bucket (clés i18n + queue + plafond préservés) :
      `notification-helpers.ts` (switch exhaustif), `transform-conversation.ts` (switch),
      `PostsFeedScreen.tsx` (`beyondDays: Infinity`). Web jest `notification-helpers`
      **73/73** vert ; `tsc --noEmit` web : aucun nouveau type error sur les fichiers
      touchés (seul l'échec préexistant `PostsFeedScreen.tsx:586` — `PostComposer`, hors
      périmètre, présent sur `main` propre).
- [ ] Phase C — CI verte, mergé dans main
