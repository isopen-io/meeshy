# Plan — Itération 165i : `CommentsSheetView` empty state

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `efedb69e4`
**Branche** : `claude/laughing-thompson-30zik1` · **Gate** : CI `iOS Tests`

## Objectif
Ajouter un empty state natif à la feuille de commentaires (`CommentsSheetView`) quand une publication
n'a aucun commentaire — lacune HIG (« every screen handles its empty state »). Réutiliser le composant
partagé existant, gate testable, aucune régression pour les posts avec commentaires.

## Étapes (TDD)
1. **RED** — `StoryViewerCommentReactionTests` : 3 tests sur `CommentsSheetView.shouldShowEmptyState(commentCount:topLevelCount:)`
   (vrai si `0/0` ; faux si rangées présentes ; faux si `count>0` mais liste non hydratée = anti-flash).
2. **GREEN** — `FeedCommentsSheet.swift` :
   - `static func shouldShowEmptyState(commentCount:topLevelCount:) -> Bool` = `commentCount == 0 && topLevelCount == 0`.
   - Dans le `LazyVStack`, après le `ForEach`, brancher `AdaptiveContentUnavailableView`
     (icône `bubble.left.and.bubble.right`, titre + sous-titre localisés) sous garde.
3. **i18n** — 2 clés code-only `feed.comments.empty.title/subtitle` (0 xcstrings, parité `feed.comments.*`).
4. **Docs** — analyse + plan + mise à jour `branch-tracking.md`.
5. **Push** — branche `claude/laughing-thompson-30zik1` ; CI `iOS Tests` valide (build iOS indisponible en local Linux).

## Contraintes
- 0 logique métier touchée (send/like/thread/socket/upload).
- 0 nouveau composant — réutilise `AdaptiveContentUnavailableView` (MeeshyUI, déjà importé).
- Les 5 `.font(.system(size:))` figés (doctrine 82i) restent inchangés.

## Vérification
- `shouldShowEmptyState` couvert par 3 tests unitaires purs.
- Placeholder strictement additif (gaté sur liste vide) → posts avec commentaires visuellement identiques.
- Réactivité : premier commentaire posté → `liveCommentCount = 1` → placeholder disparaît.
