# Plan — Itération 278 : SSOT de dédup pour la cible de traduction anonyme

## Objectifs

Aligner la branche anonyme de `_extractConversationLanguages` sur la SSOT
`normalizeLanguageForDedup`, pour qu'un code irréductible région-tagué
(`fil-PH`, `yue-HK`) contribue la même cible région-blind que la branche
inscrite — fermant la collision « cible NLLB dupliquée, jamais matchée ».

## Modules affectés

- `services/gateway/src/services/message-translation/MessageTranslationService.ts`
  (import élargi + ligne 909 + commentaire).
- `services/gateway/src/__tests__/unit/services/message-translation-destinations.test.ts`
  (+1 test de comportement).

## Phases

1. **Instruction** — confirmer que la branche inscrite strippe la région
   (`resolveUserLanguagesOrdered` → `normalizeInAppLanguage`) tandis que la
   branche anonyme réécrit un repli qui ne le fait pas pour les codes
   irréductibles ; confirmer que le jumeau `anonymous.ts:947` utilise déjà la
   SSOT. ✅
2. **Vérification empirique** — mesurer `normalizeLanguageForDedup` vs le repli
   inline sur `fil-PH`/`yue-HK`/`EN`/`ES-ES` (identiques sauf irréductible
   région-tagué). ✅
3. **RED** — ajouter le test `fil-PH` (anonyme + inscrit) ; prouver ROUGE sous le
   code actuel. ✅
4. **GREEN** — remplacer le repli inline par `normalizeLanguageForDedup`. ✅
5. **Validation** — suite destinations 7/7 ; suites sœurs 183/183 ; tsc 0. ✅

## Dépendances

- SSOT `normalizeLanguageForDedup` (`packages/shared`) — inchangée.
- Jumeau de référence `routes/anonymous.ts` (`spokenLanguages`) — inchangé.

## Risques estimés

- **Régression sur codes réductibles / non tagués** → écarté : sortie identique
  au repli actuel, prouvé par les 6 tests pré-existants restés verts.

## Stratégie de rollback

Revenir à `normalizeLanguageCode(participant.language) ?? participant.language.toLowerCase()`
et retirer le test ajouté ; aucun autre site touché.

## Critères de validation

- RED prouvé (`['fil','fil-ph']` sans correctif), GREEN après (`['fil']`).
- 7/7 destinations, 183/183 sœurs, tsc gateway 0 erreur.

## Statut de complétion

**LIVRÉ.** Import élargi, ligne corrigée, test ajouté, validé.

## Suivi / améliorations futures

- **Divergence de REPLI Swift (héritée de l'itération 277).** Le `canon` de
  `MeeshyConversation.resolvedLastMessagePreview` (`CoreModels.swift`) rend
  `$0.lowercased()` en repli (chaîne entière) là où TS/Kotlin rendent le sous-tag
  primaire. Correctif CLIENT non validable dans le conteneur TS courant (aucun
  toolchain Swift) — à instruire en issue avant tout vecteur qui rendrait la CI
  iOS rouge sans le correctif d'accompagnement.
- **Doc-drift Kotlin `resolveUserTranslationLanguages`.** Son en-tête promet un
  jumeau TS (`conversation-helpers.ts → resolveUserTranslationLanguages`) qui
  n'existe pas ; le gateway calcule le concept voisin (cibles d'auto-traduction)
  via le prisme COMPLET (`resolveUserLanguagesOrdered`), pas via
  systemLanguage+regionalLanguage seuls. À trancher en issue (Android-only vs
  SSOT TS) — jugement produit, hors périmètre d'un correctif autonome.
