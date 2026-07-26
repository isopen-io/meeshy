# iOS UI/UX — Iteration 219i

**Date** : 2026-07-26
**Axe** : Design system / intégration native — SSOT des métriques de fenêtre,
compatibilité iPad multitâche (Split View, Slide Over, Stage Manager)
**Base** : `main` HEAD `ffef1339e` (#2325, 216i mergée)
**Essaim** : `list_pull_requests` (open) = **0 PR** → aucune collision possible

## Continuité avec 218i

218i (`83d7b9f83`, `9a1021d85`, `021a1a137`) a introduit
`DeviceLayout.windowSize` — « la surface dans laquelle l'app est réellement
rendue » — et y a converti **les seules surfaces de conversation** (bulle,
preview du menu long-press, `MessageListView`). Le verrou est
`BubbleWindowMetricsTests`, qui garde les assertions de ratio propres à la bulle
et épingle l'unique repli `UIScreen.main` de `DeviceLayout`.

Elle a laissé **onze autres surfaces** résoudre la scène à la main. C'est ce que
219i solde.

## Le défaut

Trois dialectes coexistaient pour poser **la même question**, et deux étaient faux.

### A. `connectedScenes.first` — la scène n'est pas celle de l'utilisateur (5 sites)

`UIApplication.shared.connectedScenes` est un **`Set` non ordonné**. `.first`
n'est donc pas « la scène au premier plan » : sous Split View, Slide Over, Stage
Manager ou écran externe, elle peut rendre une scène **en arrière-plan**.

| Site | Lisait | Conséquence |
|---|---|---|
| `ConversationView.updateComposerHeight:338` | `safeAreaInsets.bottom` | hauteur du composer calée sur le home indicator d'une **autre** fenêtre |
| `RootView` ×2 (l.551, 556) | `scene.title` (écriture) | **retitre** une fenêtre d'arrière-plan ; le libellé Stage Manager / app switcher de la fenêtre active ne change jamais |
| `VideoLegacySupport.lockPortrait:27` | `requestGeometryUpdate` | verrou portrait **demandé à la mauvaise scène** → la vidéo plein écran peut rester libre de tourner |
| `StoryViewerView+Content.shareStory:966` | scène de présentation | feuille de partage présentée sur une fenêtre invisible (défaut soldé 215i/216i ailleurs) |

`IslandEmergingBanner.windowTopInset:62` est une quatrième variante : elle
`flatMap` les fenêtres de **toutes** les scènes puis prend la première `isKeyWindow`
— sans filtre `activationState`. Le seuil « île présente » (`topInset >= 59`) était
donc décidable depuis une scène d'arrière-plan.

### B. `UIScreen.main.bounds` — mesurer l'écran, pas la fenêtre (6 sites)

`UIScreen.main` est déprécié depuis iOS 16 **et** décrit le display physique.
En multitâche l'app n'en possède qu'une fraction : un layout dimensionné dessus
est dimensionné sur de l'espace que l'app n'a pas. C'est exactement le défaut que
218i a corrigé pour la bulle.

| Site | Formule | Effet en Split View 50 % sur iPad 12,9″ (window ≈ 683 pt / display 1366 pt) |
|---|---|---|
| `ConversationListView.sectionConversations:437` | `min(screen × 0.42, 520)` | colonne estimée à 520 pt pour une fenêtre de 683 → `rowWidth` surévaluée de ~130 pt → **débordement du texte**, précisément ce que le commentaire disait vouloir éviter |
| `ReelFeedCard.cardWidthEstimate:157` | `screen − 32` | hauteur de carte pré-mesure calculée sur 1334 pt au lieu de 651 → **saut de layout** à la mesure du `GeometryReader` |
| `StoryCommentsOverlayView.listMaxHeight:1547` | `screen × 0.42/0.62` | plafond de liste **supérieur à la fenêtre** → le cap ne contraint plus rien |
| `AudioFullscreenView.dismissDownward:163` | `dragOffset = screen.height` | translation de sortie surdimensionnée |
| `RecentMediaStrip.compactCell:351` | `cell(forContainerWidth: screen)` | chemin iPhone seul (le grid iPad passe par le conteneur réel) — correct par **hypothèse d'appareil**, pas par construction |
| `ComposerModels` (clavier) | repli `?? screen.height` | repli déjà rare, mais 3e copie de la traversée |

### C. Duplication : deux copies **correctes** qui dérivent quand même

`StoryViewerView.windowSize` / `windowBottomInset` et le calcul clavier de
`ComposerModels` filtraient bien sur `activationState == .foregroundActive` —
mais chacun en copie privée (~6 lignes, `compactMap { … }.first { … }`, donc un
tableau intermédiaire alloué à chaque appel). Aucun ne connaissait le palier de
repli « n'importe quelle fenêtre de la scène au premier plan » que 218i avait
ajouté à `DeviceLayout` : **la règle avait déjà divergé en trois exemplaires.**

### D. Un même écran pouvait mélanger deux fenêtres

Le pire cas n'est pas « un mauvais nombre » mais « deux nombres venant de deux
fenêtres différentes » : `StoryViewerView` mesurait sa taille sur la scène active
et — avant 219i — rien n'empêchait un voisin d'insetter depuis
`connectedScenes.first`. Taille et inset devaient déjà décrire la même fenêtre.

## Correctifs (219i)

### 1. `DeviceLayout` — une résolution, trois accesseurs

La traversée devient `activeWindow: UIWindow?` (corps **inchangé** : même ordre
d'itération, mêmes paliers de repli, toujours une boucle simple à sortie
anticipée — donc toujours sans allocation, contrainte imposée par le `body` de la
cellule de liste). Les trois questions en dérivent :

```swift
static var activeWindow: UIWindow?          // la résolution, une seule fois
static var windowSize: CGSize               // activeWindow?.bounds.size ?? UIScreen.main.bounds.size
static var safeAreaInsets: UIEdgeInsets     // activeWindow?.safeAreaInsets ?? .zero
static var activeWindowScene: UIWindowScene? // activeWindow?.windowScene
```

`windowSize` conserve **exactement** sa sémantique 218i (mêmes valeurs, même
unique repli `UIScreen.main`, l'assertion de comptage de `BubbleWindowMetricsTests`
reste vraie). `safeAreaInsets` retombe sur `.zero` et non sur une valeur négative
ou absente : un inset est **ajouté** à une hauteur (`ConversationView`) et
**comparé** à un seuil (`IslandEmergingBanner`, 59 pt), donc l'absence doit se
lire « pas d'inset », jamais « soustraction ».

### 2. Onze surfaces convergées

Cinq lisent désormais `DeviceLayout.windowSize`, trois `DeviceLayout.safeAreaInsets`,
trois `DeviceLayout.activeWindowScene`. Les trois copies privées de la traversée
sont supprimées (`StoryViewerView` ×2, `ComposerModels`, `IslandEmergingBanner`).

`StoryViewerView.windowSize` est conservé comme nom local (il alimente
`screenH`/`screenW`, consommés depuis le fichier d'extension frère) mais n'est
plus qu'un forward d'une ligne.

## Périmètre volontairement exclu

- **`CallManager:2903`** — sonde de capture d'écran : `connectedScenes.contains { $0.screen.isCaptured }`
  interroge **toutes** les scènes. C'est une question sur l'ensemble, pas sur la
  fenêtre active. Correct tel quel, et le test le documente explicitement pour
  qu'on ne le « converge » pas par erreur plus tard.
- **Cibles de décodage d'image** (`BubbleStandardLayout:568`,
  `ConversationMediaGalleryView:251`, `ImageDownsamplingConfig:50`) —
  `UIScreen.main.scale` / `bounds.width * scale` calculent un **budget pixel**,
  pas un layout. Sur-décoder en Split View coûte de la mémoire sans casser
  l'affichage : c'est une piste perf distincte, avec son propre raisonnement
  (cache, baselines snapshot). → 220i+.
- **Présentation UIKit de `shareStory()`** — 219i corrige la **résolution de scène**
  (bug) ; la migration vers `.sheet(item:)` + `ShareSheet` (doctrine 215i/216i)
  reste la piste ouverte, l'état devant vivre dans `StoryViewerView.swift`.

## Résultat

**12 fichiers de production : +94 / −74 lignes** (net +20, dont l'essentiel est du
commentaire de doctrine ; le code de plomberie recule de ~35 lignes).

- **0 clé i18n** (les 2 clés `root.scene_title_*` sont réutilisées verbatim)
- **0 couleur, 0 métrique de layout, 0 appel réseau, 0 logique produit modifiés**
- **0 changement visuel sur iPhone plein écran** : fenêtre == display, chaque
  site garde sa valeur exacte. Toute la différence de comportement vit dans le
  multitâche iPad — là où les valeurs étaient fausses.
- **0 garde `@available`** : `UIWindow`/`UIWindowScene`/`UIEdgeInsets` sont
  antérieurs au plancher iOS 16 du projet.
- **0 fichier de production neuf → 0 édition de `project.pbxproj`**.

## Test

`apps/ios/MeeshyTests/Unit/Views/WindowMetricsSingleSourceTests.swift` — fichier
**neuf** plutôt qu'extension de `BubbleWindowMetricsTests` : ce dernier verrouille
les **ratios de la bulle** (70 %, 62 %, plafond 560 pt) et garde ce périmètre ;
la doctrine app-wide « une fenêtre, trois questions » a désormais son propre
verrou, qui cite l'autre. Le fichier est auto-inclus par le globbing récursif
`sources: - path: MeeshyTests` de `project.yml` → **aucune édition de pbxproj**.

Contenu : 3 tests de comportement (les trois accesseurs décrivent la même
fenêtre ; les insets ne sont jamais négatifs ; plein écran ne bouge pas) et
5 verrous de source (les 4 accesseurs existent ; `DeviceLayout` ne traverse le
graphe de scènes **qu'une fois** ; la résolution reste sans `compactMap` ;
aucune des 11 surfaces ne contient `connectedScenes` ni `UIScreen.main` ; chacune
lit bien `DeviceLayout.`).

**RED prouvé** : 27 des 39 assertions de verrou échouent contre `main` `ffef1339e`.
**GREEN** : 42/42 après correctif (les 3 assertions ajoutées entre-temps —
comptage `UIScreen.main`, `foregroundActive`, `isKeyWindow` — passent aussi).

## Vérification

- Pas de toolchain Swift sous Linux → assertions vérifiées déterministement par
  correspondance de chaînes (script Python reproduisant `codeLines`), et
  équilibre accolades / parenthèses / crochets des **13** fichiers touchés
  contrôlé au tokenizer (chaînes, chaînes multi-lignes, commentaires `//` et
  `/* */` imbriqués retirés dans le bon ordre) : **0 / 0 / 0** partout.
  Gate réel = CI `iOS Tests` (Xcode 26.1.1 / Swift 6.2, sim iOS 18.2).
- `BubbleWindowMetricsTests` reste vert par construction : `DeviceLayout` garde
  exactement un `UIScreen.main`, et contient toujours `activationState == .foregroundActive`
  et `isKeyWindow`.
- Isolation : `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor` (`project.yml`) rend
  `DeviceLayout` MainActor comme les 11 appelants, qui touchaient déjà
  `UIApplication.shared` / `UIScreen.main` (eux-mêmes MainActor) au même endroit.
  Aucune annotation neuve nécessaire.
- Phase de test : `WindowMetricsSingleSourceTests` ne matche aucun token de
  `FINAL_PHASE_CLASS_PATTERN` → phase 1 (suites isolées), ce qui est correct :
  la suite est en lecture seule et ne mute aucun état persistant.
