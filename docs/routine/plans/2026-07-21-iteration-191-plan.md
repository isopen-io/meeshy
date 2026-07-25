# Plan — Iteration 191 : nettoyage dette `link-name-generator.ts` (web)

## Objectifs
Éliminer la dette technique exposée dans `apps/web/utils/link-name-generator.ts`
(feature « nom de lien de partage par défaut », activement consommée) :
constante morte, docstring mensongère, switch vacant, assertions de test vides —
à comportement de sortie **strictement préservé**.

## Modules affectés
- `apps/web/utils/link-name-generator.ts` (implémentation)
- `apps/web/__tests__/utils/link-name-generator.test.ts` (renforcement des tests)

## Phases
1. **RED (tests d'abord)** — Remplacer les 2 `expect(result).toContain('')`
   (lignes 111, 234) par `toContain('∞')`. Ces assertions passent déjà sur le
   code actuel (le `'∞'` est émis) : elles fixent le comportement AVANT le
   refactor du switch (garde-fou anti-régression du collapse).
2. **GREEN/REFACTOR** — `link-name-generator.ts` :
   - Supprimer `const MAX_LINK_NAME_LENGTH = 32;`.
   - Réécrire la docstring d'en-tête : format réel + plafond réel (60, titre 20).
   - Collapser le `switch` vacant de `getShortDuration` (branche `!durationDays`)
     en `return '∞';` + commentaire (symbole universel, non localisé).
3. **VALIDATE** — `jest link-name-generator` vert ; `tsc --noEmit` sans nouvelle
   erreur sur le fichier ; relecture diff = 0 changement de sortie.

## Dépendances
Aucune (fonctions pures, pas de nouvel import).

## Risques estimés
Minimal. Seul risque : diverger le comportement du switch collapsé → neutralisé
par la phase 1 (les tests renforcés gardent `'∞'`).

## Stratégie de rollback
`git revert` du commit unique — fichier isolé, aucune migration, aucun état
partagé.

## Critères de validation
- Suite `link-name-generator.test.ts` verte, assertions non-vacantes.
- `tsc --noEmit` propre sur le fichier.
- Aucune modification de la sortie de `generateLinkName` (diff comportemental
  nul).

## Statut de complétion
- [x] Phase 1 (RED renforcé) — 2 assertions `toContain('')` → `toContain('∞')` ;
      RED prouvé (branche `'∞'` cassée → exactement ces 2 tests échouent).
- [x] Phase 2 (refactor) — const morte supprimée, docstring alignée, switch
      vacant collapsé (9→1).
- [x] Phase 3 (validation) — `jest link-name-generator` 42/42 vert ;
      `tsc --noEmit` : 0 erreur sur le fichier touché (les 1196 erreurs
      pré-existantes de l'app web sont hors périmètre, gate CI = jest).
- [x] Commit + push

## Suivi de progression
Démarré @ `main` `4f382b75`. Itération 191. Terminé — feature
`link-name-generator` nettoyée à comportement de sortie identique.
