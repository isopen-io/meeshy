# Iteration 42 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique du formatage de durée (F18) » : extraire l'algorithme d'horloge
MM:SS / H:MM:SS réimplémenté 5 fois vers une fonction canonique pure
`formatClock` dans `packages/shared`, et faire déléguer tous les sites appelants —
**sortie préservée à l'identique** sur chaque site via options.

## Étapes (TDD : RED → GREEN)

### Phase A — Shared : fonction canonique + migration call-summary
- [ ] RED : `packages/shared/__tests__/utils/duration-format.test.ts` — couvre :
      `M:SS`, `H:MM:SS`, minutes paddées (`padMinutes`), centièmes
      (`includeCentiseconds`), entrées négatives/`NaN`/`Infinity` → clamp 0, frontières
      (59s, 60s, 3599s, 3600s).
- [ ] GREEN : `packages/shared/utils/duration-format.ts` —
      `formatClock(totalSeconds: number, options?: { padMinutes?: boolean; includeCentiseconds?: boolean }): string`,
      pur, calcul interne en millisecondes (centièmes exacts). Type `ClockFormatOptions`.
- [ ] Export depuis `packages/shared/utils/index.ts`.
- [ ] Migrer `call-summary.ts:formatCallDuration` → `formatClock(seconds, { padMinutes: true })`
      (export conservé — contrat du modèle Prisma). Tests `call-summary` verts inchangés.
- [ ] `bun run build` shared + vitest **1180+** verts.

### Phase B — Gateway : délégation NotificationService
- [ ] `NotificationService.ts:formatDuration(ms)` → `formatClock(Math.round(ms / 1000))`
      (préserve l'arrondi ms→s et la sortie `0:SS` pour < 1 min). Import depuis
      `@meeshy/shared` (ou `@meeshy/shared/utils`).
- [ ] Jest gateway sans nouvelle régression (suites notifications).

### Phase C — Web : délégation hooks/utils
- [ ] `use-call-duration.ts:formatCallDuration` → `formatClock(totalSeconds)` (non paddé).
- [ ] `audio-formatters.ts:formatDuration` → `formatClock(seconds)` ;
      `formatTime` → `formatClock(seconds, { includeCentiseconds: true })`.
      Wrappers nommés conservés (stabilité des imports existants).
- [ ] Sortie identique vérifiée par revue (parité octet pour octet documentée dans l'analyse).

### Phase D — Vérification & livraison
- [ ] Build shared ; vitest shared verts ; jest gateway sans nouvelle régression.
- [ ] Commit + push `claude/blissful-cannon-o9dhns`.
- [ ] PR vers `main`, CI verte (shared + agent), merge ; résolution de conflits si besoin.

## Hors périmètre (consigné dans l'analyse)
F2 (staging), F10 (dual-write/backfill), F18b (dates relatives i18n), F21 (sémantique
isActive/deletedAt), F23 (agrégation counts), F24 (réorg Promise.all).

## Continuité
Iter 43+ : **F18b** (unification des formateurs de date relative i18n-aware → shared) est
le prolongement naturel de F18 une fois le couplage `t()`/locale cadré ; F23 en audit
dédié avec couverture renforcée sur les compteurs de non-lus ; F2/F10 dès qu'une fenêtre
staging existe.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `formatClock` créé (`duration-format.ts`) + exporté du barrel ;
      `call-summary.ts:formatCallDuration` délègue (`{ padMinutes: true }`). Shared
      vitest **1190/1190** (+10 nouveaux tests `duration-format`), `call-summary` vert
      inchangé.
- [x] Phase B — `NotificationService.ts:formatDuration(ms)` → `formatClock(Math.round(ms/1000))`.
      Suites notifications gateway vertes (pushMessage/i18n/NotificationService = 25 ;
      protectedPreview = 27).
- [x] Phase C — `use-call-duration.ts` + `audio-formatters.ts` délèguent à `formatClock`
      (sortie préservée via options). Tests web **38/38** verts
      (`use-call-duration` + `audio-formatters`).
- [ ] Phase D — CI verte, mergé dans main
