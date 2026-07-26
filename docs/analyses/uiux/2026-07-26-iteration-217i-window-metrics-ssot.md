# iOS UI/UX — Iteration 217i

**Date** : 2026-07-26
**Axe** : Intégration native / HIG — compatibilité iPad Split View, Slide Over et
Stage Manager ; consolidation du design system (une seule résolution de fenêtre) ;
suppression du dernier partage impératif
**Base** : `main` HEAD `ffef1339e` (216i mergée, PR #2324)
**Branche** : `claude/quirky-curie-ufrtzv`
**Collision essaim** : `list_pull_requests` (open) → **0 PR ouverte**. Aucun risque.

## Contexte

216i a convergé les deux derniers sites de partage synchrone sur `ShareLink` et
a laissé une dette nommée explicitement : `StoryViewerView+Content.shareStory()`,
« dernier site impératif de l'app », reporté une seconde fois parce que la surface
story était chaude. L'essaim étant désormais vide, la dette est payable.

En allant la chercher, un défaut **de même racine** est apparu, bien plus large
que le partage : l'app mesurait et ciblait des fenêtres de deux façons fausses,
toutes deux invisibles sur iPhone et toutes deux fausses dès qu'une seconde
fenêtre existe.

## Le défaut

### A. Une scène arbitraire au lieu de la scène active

`UIApplication.shared.connectedScenes` est un **`Set` non ordonné**. `.first`
rend donc *n'importe quelle* scène — en multi-fenêtres, régulièrement une scène
**d'arrière-plan**. `DeviceLayout.windowSize` documentait déjà ce piège en
détail… et **six** autres sites le commettaient quand même :

| Site | Conséquence utilisateur |
|---|---|
| `ConversationView.updateComposerHeight` | Le composer dimensionné sur l'inset d'une **autre** fenêtre : en Split View il flotte au-dessus du home indicator ou se cache dessous |
| `RootView` (titre de scène, ×2) | Avec deux fenêtres Meeshy, celle du premier plan porte le titre de l'autre en App Exposé / Stage Manager |
| `VideoLegacySupport.lockPortrait` | `requestGeometryUpdate` pouvait faire pivoter une fenêtre d'arrière-plan pendant que celle du lecteur restait en place |
| `IslandEmergingBanner.windowTopInset` | `flatMap(\.windows)` aplatissait **toutes** les scènes → le test « île ≥ 59 pt » pouvait trancher sur une autre fenêtre |
| `ComposerModels` (hauteur clavier) | Déjà correct (filtre `activationState`) mais copie manuelle de la règle |
| `StoryViewerView.windowSize` / `windowBottomInset` | Déjà corrects, mais deux copies manuelles de plus |

### B. Le display au lieu de la fenêtre

`UIScreen.main.bounds` est le **display physique**. En Split View l'app n'en
possède qu'une fraction : une proportion prise sur l'écran est une proportion
d'espace que l'app n'a pas.

| Site | Conséquence utilisateur |
|---|---|
| `StoryViewerView+Content.listMaxHeight` | Le plafond 42 %/62 % de la liste de commentaires, pris sur le display, dépassait la fenêtre entière → **le plafond ne plafonnait plus rien** et la liste recouvrait la story qu'elle doit laisser visible |
| `ConversationListView` (largeur de rangée) | Le commentaire du code **connaissait** le problème (« iPad left column is much narrower than `UIScreen.main.bounds.width` ») et compensait par un ratio 0.42 magique ; la rangée budgétait plus de largeur qu'elle n'en avait et le texte qu'on protégeait débordait quand même |
| `ReelFeedCard.cardWidthEstimate` | Estimation à plusieurs fois la largeur réelle → la hauteur dérivée du ratio d'aspect saute à la première mesure du `GeometryReader` |
| `AudioFullscreenView.dismissDownward` | La course de sortie dépassait la fenêtre : la vue disparaissait d'un coup au lieu de glisser |
| `RecentMediaStrip.compactCell` | Correct en pratique (branche iPhone only) mais mauvaise mesure de principe |

### C. Le partage mort

```swift
func shareStory() {                                   // 0 site d'appel
    let shareURL = "https://meeshy.me/story/\(story.id)"   // lien NON traçable
    let activityVC = UIActivityViewController(…)
    if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
       let rootVC = windowScene.windows.first?.rootViewController {   // scène ARBITRAIRE
        …
        activityVC.popoverPresentationController?.sourceView = topVC.view  // sans sourceRect
```

Trois défauts cumulés, et **aucun appelant** : le chemin vivant est
`mintAndShareStory` (`StoryViewerView+Sidebar`), qui forge un
`meeshy.me/l/<token>` traçable et présente via `.sheet(item:)`. L'orphelin
portait le **dernier** `UIActivityViewController` fait main de l'app, un lien
codé en dur qui contournait le minting, et un `sourceView` **sans `sourceRect`**
— donc un popover ancré au coin de la vue sur iPad.

## Correctifs (217i)

### Une résolution, trois lecteurs

`DeviceLayout` portait une seule règle, inlinée dans `windowSize`. Elle est
extraite en deux étages réutilisables, puis relue par trois métriques :

```swift
static var activeWindowScene: UIWindowScene?   // la scène, par activationState
static var activeWindow: UIWindow?             // keyWindow, sinon n'importe laquelle du scene

static var windowSize: CGSize    { activeWindow?.bounds.size ?? UIScreen.main.bounds.size }
static var safeAreaBottom: CGFloat { activeWindow?.safeAreaInsets.bottom ?? 0 }   // neuf
static var safeAreaTop: CGFloat    { activeWindow?.safeAreaInsets.top ?? 0 }      // neuf
```

- **Sémantique de `windowSize` strictement préservée** (mêmes préférences
  keyWindow → any window → display).
- **Toujours sans allocation** : boucle à sortie anticipée, pas de
  `compactMap{}.first{}` — la contrainte que le doc-commentaire d'origine posait
  pour le `body` de la cellule de liste tient toujours.
- `activeWindowScene` sert aussi les requêtes **ciblées sur la scène** (rotation,
  titre de fenêtre), qui n'avaient jusqu'ici aucun point d'entrée correct.
- `0` est le repli honnête des insets, pas une valeur dérivée de l'écran : c'est
  la vraie valeur sur un appareil sans home indicator, et sans scène au premier
  plan rien n'est en train d'être mis en page.

### La règle de hauteur du composer, extraite et testable

```swift
static func resolvedComposerHeight(
    contentHeight: CGFloat, keyboardHeight: CGFloat, safeAreaBottom: CGFloat
) -> CGFloat? {
    guard keyboardHeight == 0 else { return nil }
    return contentHeight + safeAreaBottom
}
```

`nil` = « ne touche pas à `composerHeight` ». Inset **injecté** → la règle se
vérifie sans instancier la View ni une fenêtre (doctrine
`StoryViewerView.entryStory(of:now:)`). Nommée `resolvedComposerHeight` et non
`composerHeight` pour ne pas cohabiter avec le `@State var composerHeight`.

### Les 11 sites convergés

Chacun perd sa copie de la règle au profit de `DeviceLayout`. Aucun ne change de
comportement sur iPhone plein écran ; tous deviennent corrects en multi-fenêtres.

### Le partage mort supprimé

`shareStory()` disparaît (13 lignes). Aucune capacité utilisateur perdue : le
menu du viewer passe par `mintAndShareStory`, inchangé.

## Ce qui reste, délibérément

- **`UIScreen.main.bounds` × 2** — `BubbleStandardLayout:568` et
  `ConversationMediaGalleryView:251` calculent une **cible de décodage** en
  pixels (`× UIScreen.main.scale`). Ils veulent la plus grande largeur qu'une
  image puisse un jour exiger ; les caler sur la fenêtre courante sous-décoderait
  et l'image flouterait dès l'agrandissement de la fenêtre. Mesure volontaire.
- **`connectedScenes` × 1** — `CallManager:2903` demande si **une** scène
  connectée est capturée (`.contains { $0.screen.isCaptured }`). C'est une
  question sur *toutes* les scènes, pas sur l'active. Correct tel quel.

Les deux sont désormais **inscrits dans un test d'égalité** : ils ne peuvent plus
être confondus avec de la dette oubliée, et leur disparition tournerait au rouge.

## Tests

`apps/ios/MeeshyTests/Unit/Views/WindowMetricsSSOTTests.swift` (neuf) — 9 tests :

**4 tests purs** (comportement réel, pas d'introspection) sur
`resolvedComposerHeight` : refus de mise à jour clavier levé, ajout de l'inset
clavier baissé, inset nul ⇒ hauteur de contenu, et une assertion qui prouve que
**la fenêtre d'origine de l'inset change le résultat** (34 pt d'écart — de quoi
décoller le composer de la barre qu'il doit épouser).

**5 tests d'introspection source** : la résolution se fait par `activationState` ;
les trois métriques sont des lecteurs sur `activeWindow` ; `DeviceLayout` ne
touche `connectedScenes` **qu'une fois** ; les 11 fichiers convergés ne portent
plus ni `connectedScenes` ni `UIScreen.main.bounds` ; et **deux balayages
repo-wide en égalité** confinent les sites délibérés.

Les deux garde-fous que 216i avait épinglés sont resserrés maintenant que la
dette est payée :

- `StoryExportShareSheetPaletteTests` — `isSubset(of:)` → **`XCTAssertEqual`**,
  `knownRemaining` (3 fichiers) → `expectedBridges` (**1**). Le fichier disait
  lui-même que l'inclusion virerait au rouge « le jour où la dette est payée » :
  c'est ce jour.
- `NativeShareLinkAdoptionTests` — le doc-commentaire affirmait qu'un site
  impératif subsistait et interdisait l'élargissement. Mis à jour : le balayage
  repo-wide a un propriétaire unique (le test ci-dessus), pas deux.

### Vérification

- **RED prouvé** : rejoué contre `main` `ffef1339e` (arbre extrait via
  `git archive`), **19 assertions d'introspection échouent**. Les 4 tests purs ne
  compilent même pas contre `main` — `resolvedComposerHeight` n'y existe pas.
- **GREEN** : les 40 assertions vérifiées déterministement par correspondance de
  chaînes, avec la **même** règle de dépouillement des commentaires que le test.
- Équilibre des accolades/parenthèses/crochets des **15** fichiers touchés,
  chaînes retirées **avant** les commentaires : `0 0 0` partout.
- Pas de toolchain Swift (Linux) → gate réel = CI `iOS Tests`, qui lance
  `xcodegen generate` : le test neuf est enregistré automatiquement,
  **0 édition de `project.pbxproj`**.

## Bilan

**12 fichiers de production**, 3 fichiers de test.
**8 copies manuelles de la résolution de fenêtre supprimées** (il en reste **1**,
dans `DeviceLayout`), **5 mesures prises sur le display corrigées**, 1 pont
`UIActivityViewController` mort supprimé, 1 lien codé en dur non traçable
supprimé, 1 popover iPad sans ancre supprimé, 2 garde-fous d'inclusion promus en
égalité.

**0 clé i18n, 0 couleur, 0 changement de layout sur iPhone plein écran, 0 API
réseau touchée.** Tous les gains sont sur iPad Split View / Slide Over / Stage
Manager — exactement les configurations que le HIG « multitasking compatibility »
exige et où l'app se dégradait silencieusement.

## Pistes 218i+

- `RootView` : le titre de scène est posé sur `activeWindowScene`, ce qui est
  correct pour une fenêtre ; un vrai support multi-fenêtres titrerait **chaque**
  scène depuis son propre `RootView` (demande un `@Environment(\.scenePhase)` par
  scène — refonte, pas un correctif).
- Auditer les `GeometryReader` qui pourraient rendre inutiles les derniers appels
  à `DeviceLayout.windowSize` (le doc-commentaire les préfère explicitement).
- `TrackingLinkDetailView` : le partage du **QR code en image** reste impératif
  (`UIImage`) ; il demande un `Transferable` + `ShareLink(item:preview:)` — noté
  dès 216i, toujours ouvert.
