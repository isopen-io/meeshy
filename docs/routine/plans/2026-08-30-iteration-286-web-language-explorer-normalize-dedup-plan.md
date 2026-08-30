# Plan — Itération 286 : normalisation de langue dans l'explorateur web

## Objectifs
Faire descendre la SSOT d'identité de langue (`normalizeLanguageForDedup`) dans
`LanguageSelectionMessageView` pour qu'une langue déjà traduite sous une clé non
canonique (région-taguée / 3-lettres / legacy) ne soit ni re-proposée à la
traduction, ni double-comptée, ni dupliquée.

## Modules affectés
- `apps/web/components/common/bubble-message/LanguageSelectionMessageView.tsx`
- `apps/web/__tests__/components/common/bubble-message/LanguageSelectionMessageView.test.tsx`
- `scripts/check-type-debt.sh` (resserrage `WEB_BASELINE` 1184 → 1173)

## Phases
1. **RED** — cinq témoins : (a) `pt-BR` absent de « Generate », (b) présent dans
   « Available » sous forme canonique, (c) `por` (MessageTranslation) absent de
   « Generate », (d) parité stricte du compteur `pt` vs `pt-BR`, (e) dédup de
   deux clés d'une même langue. (a),(c),(d) tombent sur le code courant.
2. **GREEN** — clé de groupement normalisée + comparaisons normalisées
   (original, `missingLanguages`) ; type `LooseTranslation` remplaçant les accès
   `unknown` ; correction de `isTranslating` mal destructurée.
3. **Cliquet** — dette de type web recomptée (1173), `WEB_BASELINE` resserré.
4. **Validation** — suite du fichier + dossier bubble-message, `tsc` sur le
   fichier, cliquet vert.

## Dépendances
`packages/shared` bâti (`dist`) pour que `@meeshy/shared/utils/language-normalize`
résolve sous jest (moduleNameMapper → dist).

## Risques
Faible ; comportement identique pour toute clé déjà canonique
(`normalizeLanguageForDedup(x) === x`). Aucun changement de la résolution
d'affichage. Conflit possible sur `WEB_BASELINE` avec la PR #4390 (résolution
triviale : garder le plancher le plus bas).

## Stratégie de rollback
`git revert` du commit unique. Aucun changement de schéma, d'API, ni de format
persistant.

## Critères de validation
- 3/5 témoins RED sur le code courant, 46/46 GREEN après correctif.
- `tsc --noEmit` : zéro erreur sur le fichier (l'erreur `TS2339` pré-existante
  supprimée).
- Cliquet de dette de type vert à 1173.

## Statut
**Livré.** Itération close par le commit qui porte le correctif + tests + doc.

## Améliorations futures (suivi)
- Retirer ou aligner le `missingLanguages` mort de `use-message-display.ts`.
- Documenter la locale appareil (rang 4) dans le compteur de stats de
  `use-stream-translation.ts`.
- Cliquet « toute surface web comparant des langues passe par
  `normalizeLanguageForDedup` » (méthode, récurrent).
