# Plan — Iteration 188 : Sûreté Unicode de la troncature des noms de liens (web)

## Objectifs
Propager la doctrine `sliceCodePoints` (découpe par point de code, mergée itér.
187 dans `truncate.ts`) au dernier util web live qui manquait le durcissement :
`link-name-generator.ts` — ne jamais scinder une paire de substitution lors de
la troncature du titre de conversation dans le nom de lien de partage.

## Modules affectés
- `apps/web/utils/truncate.ts` (`export` de `sliceCodePoints` — SSOT, additif)
- `apps/web/utils/link-name-generator.ts` (import + 2 points d'application)
- `apps/web/__tests__/utils/link-name-generator.test.ts` (1 cas RED + 1 garde)
- `docs/routine/{analyses,plans}/…-188-*`

## Phases d'implémentation
1. **RED** — ajouter le cas emoji-straddle (`'A'.repeat(16)+'🎉'+'CCCCC'`)
   prouvant la demi-paire isolée `\uD83C` dans la sortie du code actuel + 1
   garde (emoji qui tient → préservé entier).
2. **GREEN** — `export` de `sliceCodePoints` (truncate.ts) ; `import` + remplacer
   les 2 `substring` (l.50 titre, l.59 plafond) par `sliceCodePoints`.
3. **REFACTOR** — commentaire doctrine sur le point de coupe du titre.

## Dépendances
Aucune (utils purs ; le seul lien inter-fichiers est le nouvel `export`
`sliceCodePoints`, additif et sans impact sur `truncate`'s consumers).

## Risques estimés
Très faibles. Comportement ASCII bit-pour-bit préservé (1019/1019 tests utils
verts ; `truncate.test.ts` inchangé). Invariant de longueur du titre préservé
par construction de `sliceCodePoints`.

## Stratégie de rollback
Revert du commit unique — 4 fichiers, aucune migration, aucun état persistant.

## Critères de validation
- RED → GREEN prouvé sur `link-name-generator.test.ts`.
- 38 suites `__tests__/utils` → 1019/1019.
- `tsc --noEmit` propre sur les 2 fichiers touchés.

## Statut : COMPLETED

## Suivi de progression
- [x] RED test (surrogate straddle)
- [x] GREEN fix (export + import sliceCodePoints, 2 sites)
- [x] Non-régression 1019/1019
- [x] tsc propre (fichiers touchés)
- [x] Analyse + plan
- [ ] Commit + push + PR

## Améliorations futures (itération 189+)
- `validateMessageContent` : aligner trim entre check vacuité et check longueur.
- `getLanguageInfo` : normaliser la casse du `code` retourné comme `name`/`flag`.
- `MAX_LINK_NAME_LENGTH` : constante inutilisée + docstring 32≠60 (nettoyage doc).
