# Plan — Itération 59w (web only)

## Base
- `main` HEAD post-merge iter-58w `#792` (`1d1b3b6`).
- Branche de travail : `claude/practical-fermat-sgqj60`.

## Contexte — pivot après collision
Le 58w (Escape + dialog semantics) a été livré en parallèle par #792. Le doublon
strict de ce run (#793) a été fermé. Pivot sur le volet différé « 59w+ » par
#792 : le **focus-trap** des 2 dialogues maison.

## Objectif
Compléter l'a11y clavier des 2 dialogues en **réutilisant** le hook canonique
`useFocusTrap` (Single Source of Truth), pas de réimplémentation.

## Étapes
1. [x] Étendre `hooks/use-accessibility.ts` `useFocusTrap` : focus-restore au
   cleanup ; signature `RefObject<HTMLElement | null>` (rétro-compatible).
2. [x] `ConversationDrawer` : `panelRef` + `useFocusTrap(panelRef, isOpen)`.
3. [x] `AgentTopicEditModal` : `panelRef` + `useFocusTrap(panelRef, true)`.
4. [x] `tsc --noEmit` 0 erreur sur les 3 fichiers ; vérifier non-impact des
   tests settings qui mockent le hook.
5. [x] Analyse + `branch-tracking.md` (collision #793, 59w, focus-trap soldé).
6. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes / décisions
- **Réutiliser** `useFocusTrap` existant (0 consommateur) — ne pas dupliquer.
- Pas de focus auto perturbant : le hook focus le 1er élément focusable (close /
  champ) — comportement modal standard, acceptable.
- Aucune nouvelle dépendance ; aucune autre frontend (iOS/Android hors périmètre).

## Suite (60w+)
`PostsFeedScreen.tsx` (~30, large), `Badge` off-palette (arbitrage tokens),
`app/settings/loading.tsx` (server-component i18n).
