# Plan — Itération 283 : descente du Prisme sur le corps du message web

## Objectifs
Faire descendre le prisme ORDONNÉ du lecteur (rangs 1→4) au résolveur de langue
d'affichage du corps du message web (`MessagesDisplay`), au lieu du rang 1
seul — aligner le web sur iOS/Android et sur les trois autres familles web via
la SSOT `resolvePrismTranslation`.

## Modules affectés
- `apps/web/components/common/messages-display.tsx` (production, seul).
- `apps/web/__tests__/components/common/MessagesDisplay.test.tsx` (tests).
- `docs/routine/{analyses,plans}/…-283-…` (documentation).

## Phases
1. **Vérification** (faite) : producteur (`usedLanguages` = prisme ordonné en
   portée) ↔ consommateur (`useMessageDisplay` matche par `sameLanguage`
   normalisé) ; jumelle `usePostTranslation` comme modèle.
2. **Implémentation** (faite) :
   - imports SSOT + helpers `sameLanguage` / `buildTranslationRecord` /
     `PrismMessageShape` ;
   - `orderedLanguages` mémoïsé sur les primitives jointes (anti-churn) ;
   - `getPreferredDisplayLanguage` délègue à `resolvePrismTranslation` ;
   - effet réactif : même résolveur, comparaison normalisée.
3. **Tests** (faite) : fixture rendue cohérente (rang 1 = `userLanguage`) ; 5
   témoins neufs (3 isolants + 2 ancres) ; RED prouvé, GREEN confirmé.
4. **Validation** (faite) : suites voisines vertes, tsc sans erreur neuve.

## Dépendances
`resolvePrismTranslation`, `normalizeLanguageForDedup`, `resolveUserLanguagesOrdered`
(`@meeshy/shared`) — déjà en place.

## Risques estimés
Faible. Un fichier de production ; délégation à une SSOT testée ; comportement
net inchangé pour un lecteur monolingue (rang 1 = langue du message).

## Stratégie de rollback
`git revert` du commit — aucune migration, aucun changement de contrat.

## Critères de validation
RED→GREEN prouvé ; 40+ suites voisines vertes ; aucune erreur tsc neuve.

## Statut de complétion
Livré. Web = 4e/4 famille de contenu à descendre le prisme ordonné.

## Améliorations futures
- Cliquet « toute surface web de contenu descend le prisme » (issue de méthode).
- Retrait/folding des résolveurs rang-1-only morts de
  `use-message-translations.ts`.
