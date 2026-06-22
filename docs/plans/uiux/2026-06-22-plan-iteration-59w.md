# Plan — Itération 59w (web)

## Contexte — repivot après collision
Cible initiale (i18n `PostsFeedScreen.tsx`) livrée en parallèle par **#787
(iter-58wb)**, mergée sur `main` `5148505`. PR jumelle **#797 fermée sans merge**
(superseded). Repivot vers le prochain item borné non revendiqué.

## Cible
Focus-trap des dialogues hand-rolled `role="dialog"`/`aria-modal="true"`
(`ConversationDrawer`, `AgentTopicEditModal`) — différé explicite « 59w+ » par 58w.
Catégorie a11y orthogonale aux passes i18n parallèles → faible risque de collision.

## Constat
58w (#792) a posé role/aria-modal/Escape mais **pas de focus-trap** : Tab peut
sortir du dialogue vers le fond obscurci (WCAG 2.4.3) ; pas de restauration du
focus à l'ouvrant.

## Étapes
1. [x] Créer le hook réutilisable `hooks/use-focus-trap.ts` (focus initial +
       Tab-cycle + restauration ; ref sur conteneur).
2. [x] Tests TDD `hooks/__tests__/use-focus-trap.test.tsx` (6 cas) — verts.
3. [x] Câbler `ConversationDrawer` (`useFocusTrap(isOpen)` + `tabIndex={-1}`).
4. [x] Câbler `AgentTopicEditModal` (`useFocusTrap(true)` + `tabIndex={-1}`).
5. [x] Typecheck (0 erreur neuve) + tests (6/6).
6. [ ] Commit, push, PR, merge dans main, MAJ branch-tracking, delete branche.

## Décision branche
Base : `main` HEAD `5148505` (post-#787 iter-58wb). Branche :
`claude/practical-fermat-7gckpa`. Merge → main puis suppression.
