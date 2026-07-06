# Iteration 98 — Plan d'implémentation (2026-07-04)

## Objectifs
Éliminer le drift de casse entre les résolveurs de langue du Prisme Linguistique (F62) :
`resolveUserLanguage` / `resolveParticipantLanguage` renvoyaient les préférences in-app brutes
(`'EN'`) là où `resolveUserLanguagesOrdered` les lowercasait (`'en'`), causant des manqués de
traduction, des notifications dans la mauvaise langue et des doublons de cibles de traduction.

## Modules affectés
- `packages/shared/utils/conversation-helpers.ts` (source — 2 fonctions, 6 retours)
- `packages/shared/__tests__/conversation-helpers.test.ts` (tests)
- `packages/shared/__tests__/utils/resolve-participant-language.test.ts` (tests)

Aucun consommateur modifié — la correction se propage via l'import
`@meeshy/shared/utils/conversation-helpers` (gateway `messages.ts`/`NotificationService`/`auth.ts`,
web `user-language-preferences.ts`).

## Phases d'implémentation
1. **RED** — tests de casse : `resolveUserLanguage`/`resolveParticipantLanguage` lowercasent les
   préférences in-app ; `getRequiredLanguages` déduplique `'EN'`+`'en'` → `['en']`. ✅
2. **GREEN** — `.toLowerCase()` sur les 3 retours de préférence in-app dans chaque résolveur ;
   JSDoc de `resolveUserLanguage` documentant la parité et la cause racine
   (`isSupportedLanguage` valide sans transformer). ✅
3. **REFACTOR** — aucun (fix minimal, déjà DRY : `deviceLocale` reste normalisé, fallbacks
   inchangés). ✅

## Dépendances
Aucune. Disjoint des PR ouvertes #1469 / #1468 (gateway-only).

## Risques estimés
Très faible : `.toLowerCase()` est un no-op sur les codes déjà minuscules (cas nominal). Aucun
contrat public modifié. Aucun test consommateur n'assertait la casse brute.

## Stratégie de rollback
Revert du commit unique — changement isolé à un seul fichier source + 2 fichiers de test.

## Critères de validation
- [x] `conversation-helpers.test.ts` 83/83, `resolve-participant-language.test.ts` 18/18.
- [x] Suite `packages/shared` complète 1265/1265.
- [x] `bun run build` shared : 0 erreur tsc.
- [ ] CI verte après push.

## Statut de complétion
- [x] Phase 1 (RED)
- [x] Phase 2 (GREEN)
- [x] Phase 3 (REFACTOR — N/A)
- [x] Validation locale
- [ ] Push + CI verte
- [ ] Merge main

## Suivi de progression
F62 soldé. Backlog restant : F51b, F56b, F60, F63 (neuf — normalisation écriture, redondant).

## Améliorations futures
Voir l'analyse (section « Améliorations futures »).
