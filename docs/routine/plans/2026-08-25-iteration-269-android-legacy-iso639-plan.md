# Itération 269 — Plan : porter `LEGACY_ISO_639_1` au miroir Kotlin + témoin de parité 3 plateformes

## Objectifs

Fermer une violation du Prisme Linguistique sur Android : les codes ISO 639-1
dépréciés `iw`/`in`/`ji` (émis par `java.util.Locale.getLanguage()`) n'étaient pas
réduits vers `he`/`id`/`yi`. Installer un témoin qui empêche la table de réduction
de diverger sur l'un quelconque des trois clients.

## Modules affectés

- `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageCodeNormalizer.kt`
  (production — ajout table + branche)
- `apps/android/core/model/src/test/kotlin/me/meeshy/sdk/lang/LanguageCodeNormalizerTest.kt`
  (spec Android — 2 cas ajoutés)
- `packages/shared/__tests__/language-normalize-mirror-parity.test.ts`
  (renommé depuis `…-swift-parity`, + extraction Kotlin)

## Phases

1. **RED (Android)** — ajouter à `LanguageCodeNormalizerTest.kt` les cas
   `iw→he`, `in→id`, `iw-IL→he`, `IW→he`, `ji→null`. ✅
2. **GREEN (Android)** — ajouter `LEGACY_ISO_639_1` et l'appliquer dans la branche
   2-lettres, en miroir strict de TS/iOS (cible re-validée). ✅
3. **RED cross-plateforme** — étendre le témoin de parité TS pour lire les tables
   Kotlin ; prouver qu'il rougit quand la table Kotlin manque. ✅
4. **GREEN cross-plateforme** — parité 4/4 avec la table Kotlin en place. ✅
5. **Docs** — analyse + plan. ✅

## Dépendances

Aucune. Kotlin pur, TS de test pur. Pas de nouvelle dépendance.

## Risques estimés

Très faibles. La branche Kotlin n'affecte que 3 codes produisant aujourd'hui une
sortie inutile. Non-régression de tous les autres chemins tracée. Le renommage du
fichier de test n'a aucun consommateur (auto-découverte vitest).

## Stratégie de rollback

`git revert` du commit unique. Aucune migration, aucun état persistant, aucun
schéma touché.

## Critères de validation

- [x] Parité TS 4/4 (2 Swift + 2 Kotlin), RED prouvé sans la table Kotlin.
- [x] `language-normalize.test.ts` 31/31.
- [x] Tables mesurées identiques TS↔Kotlin.
- [ ] Gate Android CI (SDK absent du conteneur ; logique tracée à la main).

## Statut d'achèvement

**Complet** (sous réserve de la gate Android exécutée en CI).

## Suivi / améliorations futures

- Auditer les AUTRES tables mirrorées à trois exemplaires (résolveurs d'aperçu de
  liste, audio, posts) pour vérifier qu'un témoin de parité couvre bien les TROIS
  clients, pas deux. Le trou fermé ici pourrait avoir des jumeaux structurels.
- Envisager de générer les tables Kotlin/Swift depuis le SSOT TS à la compilation
  pour supprimer la duplication à la source (au lieu de la surveiller).
