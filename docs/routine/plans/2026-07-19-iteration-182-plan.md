# Plan d'implémentation — Iteration 182

## Objectifs
Éliminer la collision de préfixe dans `normalizeLanguageCode` (SSOT de
canonisation de langue du Prisme Linguistique) : remplacer la troncature aveugle
639-3→639-1 par une table de réduction explicite, sur les deux sites (TS + Swift).

## Modules affectés
- `packages/shared/utils/language-normalize.ts` (source de vérité TS)
- `packages/shared/__tests__/language-normalize.test.ts` (couverture)
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift` (miroir Swift)
- (transitif, aucun changement) `apps/ios/.../ConversationLanguagePreferences.swift`
  délègue déjà à `MeeshyUser.normalizeLanguageCode`.

## Phases
1. **RED** — ajout des tests de collision/réduction/rejet Filipino ; run → 4 échecs. ✅
2. **GREEN** — `ISO_639_3_TO_1` + branche de réduction re-validée ; run → 19/19. ✅
3. **Mirror** — `iso639ReductionMap` Swift + garde identique. ✅
4. **Validation** — suite shared complète (1367/1367), `tsc --noEmit` (0), build dist. ✅
5. **Docs** — analyse + plan itération 182. ✅

## Dépendances
Aucune (fichier pur, sans I/O). `getSupportedLanguageCodes()` déjà consommé.

## Risques estimés
Très faibles — voir « Risk assessment » de l'analyse. Changements de comportement
tous correctifs, aucun test/consommateur dépendant des valeurs corrompues.

## Stratégie de rollback
Revert du commit unique ; fonction pure, aucun état persistant, aucune migration.
(Note : les `User.deviceLocale` déjà persistés à tort en `'fi'` pour des locales
`fil` seront ré-écrits opportunément au prochain passage du middleware avec la
valeur corrigée — pas de migration nécessaire.)

## Critères de validation
- `language-normalize.test.ts` 19/19 ; suite shared 1367/1367 ; `tsc` 0 erreur.

## Statut de complétion
**Terminé** — implémenté, testé, buildé, documenté. Prêt à merge.

## Améliorations futures / suivi
- Aligner les catalogues de langues TS (`languages.ts`) ↔ Swift
  (`LanguageData.allLanguages`) : `ny`/`om`/`ti` présents côté TS seulement.
- Étendre la table 639-3 si de nouvelles langues supportées sont ajoutées
  (checklist : ajouter l'entrée `xxx: 'xx'` en lockstep sur les deux sites).
