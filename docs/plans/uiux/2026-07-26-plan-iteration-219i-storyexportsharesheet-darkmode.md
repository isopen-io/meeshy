# Plan — iOS UI/UX Iteration 219i

**Objet** : réparer un échec de contraste WCAG AA en mode sombre sur
`StoryExportShareSheet`, et faire converger l'app sur un pont unique vers
`UIActivityViewController`.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-219i-storyexportsharesheet-darkmode.md`
**Base** : `main` HEAD `e90afd6` · **Branche** : `claude/quirky-curie-x6tws7`
**Numérotation** : 219i, strictement > 218i (PR #2330 en vol)

## Sélection de la cible

Les trois pistes héritées de 218i sont **toutes** détenues par des PR ouvertes :
`MessageListView`/`MessageOverlayMenu` (#2330), `StatusComposerView` (#2275),
`MeeshyShareExtension` (#2319). Repli sur la clause de revue produit des
surfaces récemment livrées → classement par churn 7 jours → famille **stories**.

`MyStoriesView` (9 commits, le plus chaud) audité ligne à ligne : **rien à
reprendre**. `StoryExportShareSheet` porte trois défauts.

## Étapes

- [x] Resync : branche recréée depuis `origin/main` (`e90afd6`)
- [x] Collision essaim : 16 PR ouvertes, 5 iOS — aucune sur les 3 fichiers visés
- [x] Qualifier le défaut : remonter les 2 points d'entrée de la feuille et
      établir que celui de `StoryViewerView` force `.preferredColorScheme(.dark)`
- [x] Mesurer les ratios WCAG avant/après (composition alpha comprise)
- [x] Extraire `StoryExportSheetPalette` (3 fonctions pures, branchées sur
      `@Environment(\.colorScheme)`)
- [x] `ShareSheet` gagne `onCompletion` optionnel + défailli
- [x] Supprimer `ActivityView` et `MediaShareSheet`, retirer `import UIKit` devenu inutile
- [x] Localiser la dernière chaîne crue (`common.ok`, clé existante)
- [x] Test neuf `StoryExportShareSheetPaletteTests` (9 tests / 24 assertions)
- [x] 8 assertions numériques recalculées hors Xcode (8/8)
- [x] Équilibre accolades/parenthèses/crochets au tokenizer sur 4 fichiers (0/0/0)
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Se brancher sur `@Environment(\.colorScheme)`, pas sur `ThemeManager`.** C'est
la décision structurante, et elle est contre-intuitive : les jetons sémantiques
`theme.inputBackground` / `theme.inputBorder` existent et conviendraient
parfaitement… à toute autre feuille. Ici, `StoryViewerView` force
`.preferredColorScheme(.dark)` sur ses feuilles ; un utilisateur en thème clair
y a `ThemeManager.mode == .light` mais un rendu sombre. Se brancher sur
`ThemeManager` aurait **reproduit le défaut** sur le chemin d'entrée principal.

**Ne modifier aucune valeur de mode clair.** Les 3 branches claires sont les
expressions d'origine, mot pour mot ; un test le verrouille canal par canal.
L'itération répare un mode, elle n'en re-règle pas un autre.

**Garder la teinte de marque en sombre** (`indigo900`/`indigo700`) plutôt que de
basculer sur des couleurs système neutres. Le contraste est réparé (14,14:1) et
l'identité visuelle Meeshy préservée — les deux exigences tiennent ensemble.

**`onCompletion` optionnel plutôt qu'obligatoire.** Un paramètre non-optionnel
aurait imposé de toucher les 11 sites d'appel. Optionnel **et** conditionnant
l'installation du `completionWithItemsHandler`, il laisse ces 11 sites
inchangés à la fois en signature **et** en comportement runtime.

**Test d'inclusion, pas d'égalité, sur le balayage `UIActivityViewController`.**
Une égalité (idiome 214i) passerait au rouge le jour où #2325 converge
`TrackingLinkDetailView` — donc au moment même où la dette est payée, et sur le
dos d'une autre PR. L'inclusion attrape le seul cas qui compte : un **nouveau**
pont dupliqué. Les 2 fichiers convergés ici sont, eux, vérifiés positivement.

## Non fait (et pourquoi)

- `TrackingLinkDetailView` : détenu par #2325, qui le converge précisément.
- `StoryViewerView+Content.shareStory()` : code mort sans caller (établi 217i) —
  sa suppression est un nettoyage à part, et la surface story est brûlante.
- Balayage Dark Mode généralisé : la famille de défaut mérite un audit dédié,
  avec les deux pièges déjà identifiés (cf. « Piste 220i+ » de l'analyse).

## Suite (220i+)

1. Suppression de `shareStory()` (code mort) dès que la surface story refroidit.
2. Resserrer l'ensemble de dette du test SSOT dès #2325 résolue.
3. Audit Dark Mode généralisé — couleurs de marque claires posées sans lecture
   du `colorScheme`.
4. `StatusComposerView` → `NavigationStack` dès #2275 résolue.
5. `Localizable.xcstrings` pour `MeeshyShareExtension` dès #2319 résolue.
