# Plan — Iteration 221i

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-221i-supersession-and-share-surface-closure.md`
**Base** : `main` HEAD `033ce7d64` · **Branche** : `claude/quirky-curie-52uw8j` (recréée depuis `origin/main`)

## Contexte

La 220i de cette session (PR #2351) a été **doublée par un agent concurrent**
pendant que sa CI tournait (`fdc6b422f`, `31d9e61d7` sur `main`). Précédent 212i
de `tasks/lessons.md` : ne pas re-soumettre, pivoter. La branche est recréée
depuis `main` et seul ce qui reste absent est ré-appliqué.

## Séquence

| # | Étape | Fichier |
|---|---|---|
| 1 | Inventaire fichier-par-fichier de ce qui a landé vs ce qui manque | — |
| 2 | **`main` rouge** : `authorOutroTail` (2,0) pour le chemin carte-auteur, `outroTail` (0,5) conservé pour le chemin logo | `StoryVideoExportServiceTests.swift` |
| 3 | Supprimer `shareStory()` (0 caller, revérifié sur `033ce7d64`) | `StoryViewerView+Content.swift` |
| 4 | Verrou de partage `isSubset` → `XCTAssertEqual` sur `{ConversationMediaViews.swift}` | `StoryExportShareSheetPaletteTests.swift` |
| 5 | Rectifier les 2 commentaires devenus faux | `NativeShareLinkAdoptionTests.swift`, `NativeSharePresentationTests.swift` |
| 6 | Résolveur pur + `.accessibilityLabel` sur le `Button` + 3 tests | `StatusComposerView.swift`, `StatusComposerAccessibilityTests.swift` (neuf) |
| 7 | `lastRepostVisibility` + 2 assertions (le compile-fix landé n'assert rien) | `MockPostService.swift`, `StoryRepostFlowTests.swift` |

## Garde-fous

- **Abandonné volontairement** : migration `NavigationStack`, ensemble épinglé
  vide, compile-fix `visibility` — tous trois déjà sur `main` par une autre main.
  Les ré-appliquer aurait produit des conflits et un doublon.
- **0 changement visuel** ; **0 modification du SDK** (hors périmètre routine),
  y compris le commentaire d'arithmétique fautif de `StoryExportOutro.append`,
  signalé dans l'analyse.
- Arithmétique du défaut A **confirmée par la mesure CI** (5,2), pas seulement
  par lecture de code.

## Résultat

Exécuté intégralement. **Gate** : CI `iOS Tests`.
