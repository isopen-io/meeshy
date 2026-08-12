# Plan — Iteration 203 : localiser le formatage de date des liens de tracking via le SSOT `formatShortDateTime`

## Objectives
Supprimer le formatage de date figé sur `'en-US'` (12h AM/PM) dans la
fonctionnalité de liens de tracking et le recâbler sur un nouveau helper SSOT
`formatShortDateTime(date, locale)` de `apps/web/utils/date-format.ts`, alimenté
par la locale d'interface déjà exposée par `useI18n`.

## Affected modules
- `apps/web/utils/date-format.ts` (SSOT — nouveau helper)
- `apps/web/components/links/expandable-tracking-link-card.tsx` (prod)
- `apps/web/components/links/tracking-link-details-modal.tsx` (prod)
- `apps/web/__tests__/utils/date-format.test.ts` (test)

## Implementation phases
1. **RED** — Ajouter 6 tests `formatShortDateTime` (locale en/fr distinctes, 24h
   sans AM/PM, défaut fr, entrée string). Vérifier l'échec (fonction absente).
2. **GREEN** — Ajouter `formatShortDateTime` au SSOT (`hour12: false`, `month:
   'short'`). Recâbler les 2 composants : destructurer `locale` de `useI18n`,
   `formatDate` délègue au SSOT ; timeline `:295` passe `locale`.
3. **Validation** — Suites vertes, aucune nouvelle erreur tsc.

## Dependencies
Aucune. `useI18n` expose déjà `locale`. Le SSOT `date-format.ts` existe.

## Estimated risks
Faible. Web-only ; aucun schéma/API/migration/clé i18n. Changement visuel
**intentionnel** (langue d'interface + 24h). Aucun test n'assertait `en-US`.

## Rollback strategy
Révert du commit unique — le nouveau helper SSOT est additif et sans consommateur
externe hors les 2 composants recâblés.

## Validation criteria
- `date-format.test.ts` : 32/32 (26 pré-existants + 6 nouveaux).
- `__tests__/components/links` + `date-format.test.ts` : 60/60.
- 0 nouvelle erreur tsc (30 pré-existantes sur `tracking-link-details-modal.tsx`
  inchangées ; 0 sur `expandable-tracking-link-card.tsx` et `date-format.ts`).

## Completion status
- [x] Phase 1 RED (6 tests ajoutés ; échec confirmé — fonction absente)
- [x] Phase 2 GREEN (helper SSOT + 2 composants recâblés + timeline)
- [x] Phase 3 validation (60/60 verts ; 0 nouvelle erreur tsc)
- [ ] Merge + delete branch (en cours)

## Progress tracking
Commit unique sur `claude/brave-archimedes-dp2gg5` depuis `main@9f031bf3`.

## Future improvements
Voir la section « Future improvements » de l'analyse 203 :
1. ~15 autres sites `formatDate`/`toLocaleDateString` ad-hoc (reste de la cible
   #3), dont `components/groups/*`, `components/contacts/*`,
   `settings/voice/VoiceProfileInfo` — plusieurs omettent la locale.
2. Cibles #1/#2 couvertes par PRs #2291/#2293.
