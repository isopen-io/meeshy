# Iteration 44 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique de la classification calendaire (F18c) » : extraire l'algorithme de
classification calendaire « différence de jours à minuit » (today/yesterday/thisWeek/older),
réimplémenté 3 fois dans `apps/web`, vers un building block pur `classifyCalendarDay` dans
`packages/shared` (symétrique de `classifyRelativeTime`, F18b), et faire déléguer les 3 sites —
**sortie préservée à l'identique** (queues + clés i18n + composition `classifyRelativeTime`
conservées par chaque appelant).

## Étapes (TDD : RED → GREEN)

### Phase A — Shared : building block pur + tests (gate bloquante)
- [ ] RED : `packages/shared/__tests__/utils/calendar-day.test.ts` — couvre :
      `today` (même jour calendaire, y compris cible plus tard dans la journée → futur),
      `yesterday` (exactement 1 jour calendaire), `thisWeek` (2..6 jours, avec `diffDays`),
      `older` (≥ `weekDays`), frontières de minuit (23:59 hier vs 00:01 aujourd'hui = 1 jour),
      `weekDays` custom, cible dans le futur (`diffDays < 0` → `today`).
- [ ] GREEN : `packages/shared/utils/calendar-day.ts` —
      `classifyCalendarDay(targetMs: number, nowMs: number, options?: { weekDays?: number }): CalendarDayBucket`,
      pur ; union discriminée `CalendarDayBucket`
      (`{unit:'today'}` | `{unit:'yesterday'}` | `{unit:'thisWeek'; diffDays}` | `{unit:'older'}`).
      Calcul : `todayStart = midnight(nowMs)`, `targetStart = midnight(targetMs)`,
      `diffDays = floor((todayStart - targetStart) / 86_400_000)`. `weekDays` défaut 7.
      Helper `midnight(ms)` via `new Date(d.getFullYear(), d.getMonth(), d.getDate())`.
- [ ] Export depuis `packages/shared/utils/index.ts`.
- [ ] vitest shared → **1200 + nouveaux** verts.

### Phase B — Web : délégation des 3 sites
- [ ] `date-format.ts:formatRelativeDate` → `classifyCalendarDay(...)` ;
      `today`→compose `classifyRelativeTime` (justNow/minutesAgo/hoursAgo, gardé à l'identique),
      `yesterday`→`t('yesterday',{time})`, `thisWeek`→weekday+heure capitalisé,
      `older`→`formatShortFullDate`.
- [ ] `date-format.ts:formatConversationDate` → `classifyCalendarDay(...)` ;
      `today`→`formatTime`, `yesterday`→`t('yesterday',{time})`, `thisWeek`→weekday+heure,
      `older`→`formatShortFullDate`.
- [ ] `notification-helpers.ts:formatContentPublishedAt` → `classifyCalendarDay(...)` pour
      today/yesterday/older + `classifyRelativeTime` pour la granularité intra-journée ;
      futur (`diffMinutes < 0`)→date+heure absolues (conservé), `today`→now/min/h,
      `yesterday`→`t('timeAgo.yesterdayAt',{time})`, `older`→date+heure absolues.
- [ ] web jest `date-format.test.ts` + `notification-helpers.test.ts` → verts.

### Phase C — Vérification & livraison
- [ ] Build shared (`tsc`) ; vitest shared verts ; web jest verts.
- [ ] `tsc --noEmit` web : aucun nouveau type error sur les fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-npfey5`.
- [ ] PR vers `main`, CI verte (shared + web + agent), merge ; résolution de conflits si besoin.

## Hors périmètre (consigné dans l'analyse)
F2 (staging), F10 (dual-write/backfill), F18d (`FriendRequestCard` ms→calendaire),
F21 (sémantique isActive/deletedAt), F23 (agrégation counts).

## Continuité
Iter 45+ : **F18d** (`FriendRequestCard.formatRelativeDate` → `classifyCalendarDay`, changement
de sémantique ms→calendaire) avec tests dédiés ; F23 en audit dédié ; F2/F10 dès qu'une fenêtre
staging existe.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `classifyCalendarDay` créé (`packages/shared/utils/calendar-day.ts`),
      exporté du barrel `utils`, testé (vitest **+8**). Shared build (`tsc`) OK ;
      suite shared complète **1208/1208** verte.
- [x] Phase B — 3 sites web délèguent au bucket calendaire (queues + clés i18n +
      composition `classifyRelativeTime` préservées) : `formatRelativeDate` &
      `formatConversationDate` (`date-format.ts`, helper `formatWeekday` factorisé),
      `formatContentPublishedAt` (`notification-helpers.ts`, futur + today/yesterday/older).
      Web jest `date-format` + `notification-helpers` **98/98** vert ; `tsc --noEmit`
      web : aucune erreur sur les fichiers touchés.
- [ ] Phase C — CI verte, mergé dans main
</content>
