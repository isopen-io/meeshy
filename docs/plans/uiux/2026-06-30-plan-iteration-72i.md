# Plan — Iteration 72i (2026-06-30) — iOS

## Objectif
Dynamic Type / accessibilité de la feuille de commentaires du fil (`FeedCommentsSheet.swift` —
`CommentsSheetView` + `CommentRowView` + `ThreadedCommentSection` + aperçu de post). Un seul
fichier de production. Borné, épuré, sans collision avec les PR en vol (#1137 = 71i, fichier
distinct).

## Changements

### Dynamic Type — `.system(size:)` figé → `MeeshyFont.relative(...)`
`apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift`
- **23 conversions** : tout `Text` (corps du commentaire `contentFont`, nom d'auteur `authorFont`,
  titre de barre, aperçu de post, bannière de réponse, séparateurs/horodatage, compteurs +
  libellés like/répondre/voir) + glyphes inline accolés à un libellé dans le même HStack
  (`heart`/`bubble.right`/`arrowshape.turn.up.left`/`ellipsis`) → `MeeshyFont.relative(size,
  weight:, design:)` (préserve weight ; tailles variables `authorFont`/`contentFont` et ternaires
  `isReply ? 12 : 14` mappent proprement vers `CGFloat`).
- **5 call-sites gardés figés** (documentés) : bouton « Fermer » barre (`xmark` 14, frame fixe
  32×32) ; bouton « Annuler la réponse » (`xmark` 10, frame fixe 24×24) ; 2 toggles de drapeau de
  langue (soulignement actif à largeur fixe 10×1.5) ; icône `translate` décorative (a11y hidden,
  cluster drapeaux). Chrome / contrôles précis ≠ texte de lecture.

## Hors-scope (différé, ne pas re-flagger)
- Chrome à frame fixe (boutons fermer/annuler) + toggles de drapeau (layout précis).
- Glass / palette / ladder catégoriel (autres lots).

## Vérification
- CI `ios-tests.yml` (compile Xcode 26.1.x + tests simu 18.2) = gate.
- Sweep typographique pur → pas de logique isolable → pas de nouveau test unitaire (parité 55i/71i).
- Pas de build SwiftUI local (Linux).

## Merge
Après CI verte : merge dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Status : ⏳ push + CI → merge main
