# Iteration 143 — Plan d'implémentation (2026-07-08)

## Objectifs
Exécuter **F110** : aligner `getUserLanguagePreferences` (web) sur la SSOT du Prisme Linguistique
(`resolveUserLanguagesOrdered` de `@meeshy/shared`) en injectant la `deviceLocale` en 4e priorité, à parité
avec `resolveUserPreferredLanguage`.

## Modules affectés
- `apps/web/utils/user-language-preferences.ts` (prod)
- `apps/web/__tests__/utils/user-language-preferences.test.ts` (test)

## Phases d'implémentation
1. **Extraction helper** — `resolveDeviceLocale(user)` privé : `user.deviceLocale` persistée ??
   `getDeviceLocale()` ?? `undefined`. ✅
2. **Délégation** — `getUserLanguagePreferences` → `resolveUserLanguagesOrdered(user, { deviceLocale })` ;
   `resolveUserPreferredLanguage` réutilise le helper. ✅
3. **Tests de non-régression** — 5 nouveaux cas deviceLocale (append persistée, fallback navigator, priorité
   persistée-vs-navigateur, deviceLocale seule, dédup case-insensitive). ✅

## Dépendances
- `resolveUserLanguagesOrdered` (`packages/shared/utils/conversation-helpers.ts`) — déjà exportée, inclut la
  deviceLocale + normalisation + déduplication lowercase.
- `normalizeLanguageCode` — strip région (`pt-BR` → `pt`), déjà éprouvée.

## Risques estimés
Faible. La délégation produit une liste identique quand la deviceLocale est absente (couvert par les 10
tests existants). Aucun autre appelant que le consommateur `use-message-translations` (grep vérifié).

## Stratégie de rollback
Revert du commit unique : restaure la ré-implémentation locale 3-niveaux. Aucun changement de schéma, d'API
ou de contrat externe.

## Critères de validation
- [x] 41 tests verts `user-language-preferences.test.ts`.
- [x] 45 tests verts `use-message-translations.test.tsx` (consommateur).
- [x] `tsc --noEmit` : aucune erreur nouvelle sur les fichiers touchés.

## Statut de complétion
**Complété.** Implémentation + tests + validation OK.

## Suivi de progression
- F110 : ✅ fait (iter 143).
- F108 : ⏳ reporté.
- Parité iOS (targets de traduction incluent deviceLocale) : ⏳ à investiguer.

## Améliorations futures
- Auditer le chemin iOS `ConversationViewModel.preferredLanguages` pour la même parité affichage ↔
  demande-de-traduction.
- Envisager d'exposer un seul helper `useUserLanguagePreferences()` côté web qui retourne à la fois la langue
  préférée (top) et la liste ordonnée, pour éliminer tout futur risque de divergence entre les deux dérivées.
