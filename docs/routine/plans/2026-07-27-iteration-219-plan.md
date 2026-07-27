# Plan — Iteration 219 : canonicalisation `customDestinationLanguage` au write boundary (SSOT)

## Objectifs
Rendre `User.customDestinationLanguage` (3e priorité du Prisme) canonique par construction en base,
via le SSOT `normalizeLanguageCode`, en supprimant la duplication du schéma faible.

## Modules affectés
- `packages/shared/utils/validation.ts` (sous-schéma partagé + 2 remplacements inline + import)
- `packages/shared/__tests__/validation.test.ts` (5 tests RED→GREEN)
- `services/gateway/src/services/preferences/PreferencesService.ts` (write boundary + import)
- `services/gateway/src/__tests__/unit/services/PreferencesService.test.ts` (3 tests RED→GREEN)
- `CHANGELOG.md`

## Phases
1. **RED** — tests validation.test.ts (`fr-FR`→`fr`, `en_US`→`en`, `bas` préservé, `''`/`null`,
   `UserSchemas.update`) + PreferencesService.test.ts (région-tag + ISO 639-3). ✅ échec confirmé
   (`fr-fr`/`en_us` reçus).
2. **GREEN** — sous-schéma `customDestinationLanguageCode` + import ; remplacement des 2 inline ;
   canonicalisation PreferencesService. ✅
3. **REFACTOR** — dédup (2 inline → 1 sous-schéma nommé documenté). ✅
4. **VALIDATION** — suites shared + gateway ciblées. ✅

## Dépendances
Aucune (SSOT `normalizeLanguageCode` déjà exporté sur `main` ; pas de dépendance aux PRs en vol).

## Risques estimés
Faible — repli `.toLowerCase()` préserve le comportement d'acceptation ; idempotent sur codes canoniques.

## Stratégie de rollback
Revert du commit unique (changements isolés à 5 fichiers, aucune migration DB).

## Critères de validation
- validation.test.ts : 44/44 (dont 5 nouveaux).
- Suites shared langue (validation, language-normalize, conversation-helpers, languages, esm) : 205/205.
- Gateway profile + PreferencesService + register(-extended) : 113/113.
- Gateway MessageTranslationService + messages-list-language + preferences e2e : 86/86.

## Statut de complétion
**COMPLET** — implémenté, testé (RED→GREEN), documenté. Prêt à merger.

## Suivi de progression
- [x] Analyse (docs/routine/analyses/2026-07-27-iteration-219-analyse.md)
- [x] Plan (ce fichier)
- [x] Tests RED
- [x] Implémentation GREEN
- [x] Déduplication schéma
- [x] Validation suites
- [x] CHANGELOG
- [ ] Commit + push + PR + merge + delete branch

## Améliorations futures
- Migration idempotente des lignes `User.customDestinationLanguage` historiques région-taggées.
- Vérifier miroir client iOS/web (aucun write non validé de `customDestinationLanguage`).
