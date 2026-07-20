# Plan d'implémentation — Itération 180

## Objectifs
Brancher `getUserLanguageChoices` (web) sur la SSOT `normalizeLanguageCode` afin
que le `code` émis (cible de traduction + `selectedInputLanguage`) soit canonique
et cohérent avec `getUserLanguagePreferences` / `MessageTranslation.targetLanguage`,
et corriger le blocage de `selectedInputLanguage` sur une valeur hors-plage.

## Modules affectés
- `apps/web/utils/user-language-preferences.ts` (helper `getUserLanguageChoices`)
- `apps/web/components/common/bubble-stream-page.tsx` (init + validation de
  `selectedInputLanguage`)
- `apps/web/__tests__/utils/user-language-preferences.test.ts` (RED + mock)

## Phases
1. **RED** — +5 tests de normalisation (system/regional/custom sous-tagués, dédup
   par sous-tag) ; enrichir le mock `@meeshy/shared/utils/languages` avec
   `getSupportedLanguageCodes`. ✅
2. **GREEN** — `normalizeLanguageCode` sur les 3 codes émis ; lookup meta sur code
   normalisé (repli Français lié à l'absence). ✅
3. **GREEN** — aligner `bubble-stream-page` : init `normalizeLanguageCode(...) ||
   'fr'`, réparation `languageChoices[0]?.code ?? 'fr'`, dépendance obsolète
   retirée. ✅
4. **Validation** — jest (util + ConversationLayout) + tsc. ✅

## Dépendances
`normalizeLanguageCode` (`@meeshy/shared/utils/language-normalize`) — déjà en
production. Requiert `packages/shared/dist` construit pour l'exécution des tests
web (moduleNameMapper → dist).

## Risques estimés
Très faibles — helper idempotent déjà déployé ailleurs ; type de retour inchangé ;
repli Français préservé par test.

## Stratégie de rollback
Revert du commit unique de l'itération.

## Critères de validation
- `user-language-preferences.test.ts` 46/46 ; `ConversationLayout.test.tsx` 18/18.
- Aucune nouvelle erreur `tsc` sur les lignes touchées.

## Statut
**COMPLETE** — implémenté et validé.

## Suivi de progression
- [x] RED (5 tests + mock)
- [x] GREEN util
- [x] GREEN bubble-stream-page
- [x] Validation jest + tsc
- [x] Analyse + plan
- [ ] Commit + push + merge main

## Améliorations futures
- Voir backlog de l'analyse 180 (`MeeshySocketIOManager.ts:752`, F69).
