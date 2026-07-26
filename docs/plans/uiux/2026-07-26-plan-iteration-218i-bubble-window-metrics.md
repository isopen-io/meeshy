# Plan — iOS UI/UX Iteration 218i

**Objet** : les trois métriques de layout de la conversation (plafond de bulle,
plafond de l'aperçu long-press, plafond de l'aperçu du menu contextuel natif) se
mesurent sur la **fenêtre** de l'app au lieu de l'écran physique déprécié.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-218i-bubble-window-metrics.md`
**Base** : `main` HEAD `e0a6224` · **Branche** : `claude/quirky-curie-mlmono`
**Numérotation** : 218i, strictement > 217i (#2326, en vol)

## Sélection de la cible

La piste (a) héritée de 217i annonçait un « couple
`MessageMenuPreviewContainer.maxHeight` ↔ `MessageOverlayMenu.maxPreviewHeight`,
tous deux `UIScreen.main.bounds.height * 0.62` ». **Vérification faite, le
couple n'existe pas** : le second est un `320` en dur. Le commentaire qui
affirmait la parité était faux ; c'est de la documentation trompeuse, pas un
couplage — donc pas la cible.

Le vrai défaut du même axe est plus net :
`DeviceLayout.bubbleMaxWidth(containerWidth:sizeClass:)` a un paramètre nommé
`containerWidth`, et ses **deux seuls appelants** lui passaient
`UIScreen.main.bounds.width`.

| Piste héritée | Statut |
|---|---|
| Couple `maxHeight` ↔ `maxPreviewHeight` | Le couplage n'existe pas (320 en dur) — le commentaire est rectifié en passant |
| `StatusComposerView` | Détenu par #2275 |
| `MeeshyShareExtension` i18n | `ShareViewController.swift` détenu par #2319 |
| `StatusBubbleOverlay` | Détenu par #2326 (217i) |

## Étapes

- [x] Resync : branche recréée depuis `origin/main` (son commit était déjà mergé via #2327)
- [x] Collision essaim : 14 PR ouvertes, 4 iOS — aucune sur les 4 fichiers cibles
- [x] Vérifier que les 4 fichiers sont froids (1 seul commit i18n de masse en 21 jours)
- [x] Qualifier le défaut : calculer les seuils (Slide Over 320 pt, Split View 683 pt)
- [x] `DeviceLayout.windowSize` — SSOT, scène résolue par `activationState`, repli documenté
- [x] `DeviceLayout.bubbleMaxWidth(sizeClass:)` — surcharge qui rend la mesure correcte la plus courte
- [x] Brancher les 3 appelants ; rectifier les 3 commentaires faux
- [x] Documenter dans le code la lecture d'écran **délibérée** (budget de décodage, `BubbleStandardLayout:564`)
- [x] Test neuf `BubbleWindowMetricsTests` (8 tests / 20 assertions)
- [x] RED prouvé contre `origin/main` (9/9 assertions de source rouges) ; GREEN 9/9 après correctif
- [x] Valeurs arithmétiques recalculées indépendamment hors Xcode (6/6)
- [x] Équilibre accolades/parenthèses/crochets des 5 fichiers au tokenizer (0/0/0)
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Un SSOT dans `DeviceLayout`, pas un helper de plus.** Le dépôt portait déjà
deux fois la doctrine « lire la fenêtre active, pas `UIScreen.main` »
(`CallManager:2902`, `StoryViewerView:329`) sans jamais l'exposer. La poser dans
le fichier qui possède déjà tous les ratios de l'app est ce qui permettra aux
5 résolutions dupliquées restantes d'y converger (219i+) au lieu de proliférer.

**Ajouter une surcharge est le cœur du correctif.** `bubbleMaxWidth(sizeClass:)`
n'est pas du sucre syntaxique : elle rend la mesure **correcte** plus courte à
écrire que la mauvaise. La primitive `containerWidth:` reste exposée — elle est
pure donc testable, et c'est la bonne réponse pour tout appelant qui sait
mesurer son propre conteneur.

**Ne toucher à aucune constante visuelle.** 0.70, 0.62, 560, les planchers de
scale : identiques. L'itération corrige la grandeur **mesurée**, pas le réglage.
C'est ce qui rend le test de parité plein écran vert et l'iPhone strictement
inchangé.

**Garder — et documenter — la lecture d'écran de `BubbleStandardLayout:564`.**
C'est un budget de décodage d'image, pas une métrique de layout : sur-décoder
est invisible, sous-décoder ne l'est pas, et la fenêtre peut grandir jusqu'à
l'écran après le choix de la variante. Le commentaire ajouté évite qu'un
balayage futur la « corrige ».

**Rectifier les commentaires faux plutôt que d'aligner les valeurs.** Faire
converger 320 pt et 62 % de la fenêtre serait un changement **visuel**, hors
périmètre d'une itération de mesure. La dette ici est documentaire : elle se
solde en disant la vérité.

## Non fait (et pourquoi)

- `StoryViewerView.windowSize` : candidate évidente à la délégation, mais
  surface **chaude** (5 commits en 10 jours). → 219i.
- Les 4 autres résolutions de key window (`ConversationView`, `RootView` ×2,
  `ComposerModels`, `IslandEmergingBanner`) : même convergence, itération
  dédiée pour garder celle-ci lisible. → 219i+.
- `StatusBubbleOverlay`, `StatusComposerView`, `ShareViewController` : détenus
  par des PR en vol.

## Suite (219i+)

1. Faire converger les 5 résolutions de key window restantes sur
   `DeviceLayout.windowSize` — `StoryViewerView` en dernier si la surface story
   n'a pas refroidi.
2. `StatusComposerView` → `NavigationStack` dès #2275 résolue, puis réduire
   l'attendu de `NavigationContainerMigrationTests` à l'ensemble vide.
3. `Localizable.xcstrings` pour `MeeshyShareExtension` dès #2319 résolue.
4. `sensoryFeedback` (iOS 17+) : 0 usage contre 11 `UIImpactFeedbackGenerator`.
