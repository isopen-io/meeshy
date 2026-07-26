# Plan — Iteration 217i : résolution de fenêtre SSOT + dernier partage impératif

**Date** : 2026-07-26 · **Base** : `main` `ffef1339e` · **Branche** : `claude/quirky-curie-ufrtzv`
**Statut** : ✅ terminé — voir `docs/analyses/uiux/2026-07-26-iteration-217i-window-metrics-ssot.md`

## Déclencheur

216i a laissé une dette nommée (`StoryViewerView+Content.shareStory()`, « dernier
site impératif », reporté 2×, surface story chaude). Essaim vide à l'instant
(**0 PR ouverte**) → payable sans collision.

## Constat

En allant chercher cette dette, une racine commune plus large est apparue : l'app
résolvait « quelle fenêtre » de deux façons fausses, invisibles sur iPhone,
fausses dès la seconde fenêtre.

- **A** — `connectedScenes.first` sur un `Set` **non ordonné** → scène arbitraire,
  souvent en arrière-plan. 6 sites (composer, titre de scène ×2, rotation,
  Dynamic Island, + 3 copies déjà correctes mais dupliquées).
- **B** — `UIScreen.main.bounds` = le **display**, pas la fenêtre. 5 sites
  (plafond de la liste de commentaires story, largeur de rangée conversations,
  estimation de carte reel, course de sortie audio, cellule media strip).
- **C** — `shareStory()` : 0 appelant, dernier `UIActivityViewController` fait
  main, lien `meeshy.me/story/<id>` codé en dur (non traçable), popover iPad sans
  `sourceRect`.

## Étapes

1. ✅ Sync `main`, recréer la branche depuis `origin/main`, vérifier l'essaim.
2. ✅ Extraire dans `DeviceLayout` la règle jusque-là inlinée dans `windowSize` :
   `activeWindowScene` + `activeWindow`, puis relire `windowSize` /
   `safeAreaBottom` (neuf) / `safeAreaTop` (neuf) par-dessus.
   Contraintes : sémantique de `windowSize` **inchangée**, toujours sans allocation.
3. ✅ Extraire `ConversationView.resolvedComposerHeight(…) -> CGFloat?` (règle
   pure, inset injecté ; `nil` = ne pas mettre à jour).
4. ✅ Converger les 11 sites sur `DeviceLayout`.
5. ✅ Supprimer `shareStory()`.
6. ✅ Tests : `WindowMetricsSSOTTests` (4 purs + 5 introspection, dont 2 balayages
   repo-wide **en égalité**) ; resserrer les 2 garde-fous épinglés par 216i
   (`isSubset` → `XCTAssertEqual`, 3 fichiers → 1).
7. ✅ RED prouvé contre `main` (19 assertions ; les 4 tests purs ne compilent pas
   contre `main`), GREEN vérifié, accolades équilibrées sur 15 fichiers.
8. ✅ Analyse + tracking, commit, push, PR.

## Hors périmètre (documenté, sous garde-fou d'égalité)

- `BubbleStandardLayout:568` / `ConversationMediaGalleryView:251` — cible de
  décodage en pixels : veulent la largeur **maximale** possible, pas la courante.
- `CallManager:2903` — `.contains { $0.screen.isCaptured }` : question sur
  **toutes** les scènes, pas sur l'active.
- `TrackingLinkDetailView` partage du QR en `UIImage` → demande `Transferable`.

## Gate

CI `iOS Tests` (`xcodegen generate` enregistre le test neuf ; 0 édition de
`project.pbxproj`). Pas de toolchain Swift sur Linux → assertions vérifiées
déterministement par correspondance de chaînes.
