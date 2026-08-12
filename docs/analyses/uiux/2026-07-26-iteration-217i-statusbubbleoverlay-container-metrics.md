# iOS UI/UX — Iteration 217i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift`
**Axe** : Adaptation multi-fenêtre / HIG — une vue doit se mesurer sur son
conteneur, jamais sur l'écran physique
**Base** : `main` HEAD `1f6ef69` (= 216i mergée, PR #2324)

## Sélection de la cible

Le pointeur 216i laissait trois pistes. Aucune n'était prenable telle quelle :

| Piste héritée | Statut |
|---|---|
| `StoryViewerView+Content.shareStory()` — « dernier parcours de fenêtres » | **N'a aucun site d'appel** (`grep` : 1 définition, 0 caller). C'est du code mort, pas un défaut d'expérience. Surface story par ailleurs brûlante : 3 commits le 2026-07-26. |
| `MeeshyShareExtension` i18n | `ShareViewController.swift` détenu par la PR ouverte #2319. |
| `StatusComposerView` / `ThemedComposerButton` | Détenus par la PR ouverte #2275. |

Un balayage neuf a donc été mené sur l'axe voisin — la même famille de défaut
que l'arc 215i/216i (`connectedScenes.first`) : **du code qui interroge le
matériel là où il devrait interroger son propre conteneur**. `UIScreen.main`
apparaît **20 fois sur 15 fichiers**. Le dépôt a déjà tranché la doctrine à trois
endroits (`CallManager.swift:2902` « avoids UIScreen.main (deprecated in iOS
16+) », `StoryViewerView.swift:329` « Use the active window bounds rather than
`UIScreen.main.bounds` », `ConversationListView.swift:432` sur la colonne
gauche) — mais elle n'a jamais été appliquée partout.

La plupart des 20 sites sont soit délibérés et documentés (`RecentMediaStrip`
n'utilise l'écran que sur le chemin iPhone compact, où il *est* un proxy fidèle
du conteneur, et bascule sur la largeur réelle sur iPad), soit à faible enjeu
(`UIScreen.main.scale`, identique sur toutes les fenêtres d'un appareil).

**Un seul site est indéfendable** : `StatusBubbleOverlay`.

## Le défaut

```swift
private var screenHeight: CGFloat { UIScreen.main.bounds.height }
private var screenWidth: CGFloat { UIScreen.main.bounds.width }
private var showAbove: Bool { anchorPoint.y > screenHeight * 0.45 }

var body: some View {
    GeometryReader { parentGeo in
        …
        let bounds = parentGeo.size                       // ← la bonne mesure, en portée
        let bubbleW: CGFloat = min(screenWidth - 48, 250) // ← mais on lit l'écran
        let bubbleX = min(anchor.x + 12 + bubbleW / 2, bounds.width - bubbleW / 2 - 16)
```

La vue **possède déjà** un `GeometryReader`. La taille exacte du conteneur dans
lequel la bulle est posée — et par lequel elle est **clippée** — est dans
`bounds`, à une ligne. Les deux seules décisions de layout de la vue l'ignorent
et interrogent l'écran physique.

Ce n'est pas théorique. `.withStatusBubble()` est appliqué sur **15 surfaces**,
dont plusieurs **feuilles** : `FeedCommentsSheet`, `ConversationInfoSheet`,
`ForwardPickerSheet`, `SharePickerView`, `GlobalSearchView`, `ParticipantsView`,
`FriendRequestListView`, `ThreadView`. Le commentaire de
`StatusBubbleController.swift:88` le dit explicitement : plusieurs feuilles
appliquent `.withStatusBubble()`. Une feuille — a fortiori une form sheet iPad,
une colonne de split view, un Slide Over ou une fenêtre Stage Manager — n'a ni
la largeur ni la hauteur de l'écran.

### A. Bascule verticale décidée sur la mauvaise hauteur

`showAbove` compare `anchorPoint.y` — une coordonnée **globale** — à 45 % de la
hauteur de l'**écran**. Le reste de la vue, lui, travaille dans l'espace du
conteneur : `anchor` est obtenu en retranchant `parentGeo.frame(in: .global).origin`.
La décision de bascule est donc la seule grandeur du fichier exprimée dans un
espace différent de celui où elle s'applique.

Conséquence dans une feuille au détent `.medium` sur un iPhone de 844 pt
(conteneur ≈ 422 pt) : toute ancre entre **190 pt** (45 % de la feuille) et
**380 pt** (45 % de l'écran) est traitée comme « moitié haute » alors qu'elle est
dans la moitié basse de la feuille. La bulle est posée **vers le bas**, du côté
où il reste le moins de place. À une ancre de 350 pt, il reste **20 pt** sous le
centre de la bulle contre 298 pt au-dessus : tout contenu plus haut qu'une ligne
est clippé par le bord de la feuille.

### B. Largeur choisie sur une dimension où la bulle n'est pas rendue

`bubbleW = min(screenWidth - 48, 250)`, puis `bubbleX` ne pince que le bord
**droit** (`bounds.width - bubbleW / 2 - 16`). Quand la bulle est plus large que
son conteneur, le surplus ressort donc par le bord **gauche**, que rien ne
retient.

Le seuil est calculable : sous **298 pt** de conteneur (250 + 2 × 24), la
garantie tombe. Conteneur de 260 pt, écran de 1024 pt → bulle de 250 pt, centre
pincé à 119 pt, **bord gauche à −6 pt**. Dérivée du conteneur, la largeur devient
212 pt, centre à 138 pt, bord gauche à 32 pt : elle tient **par construction**, à
n'importe quelle largeur.

## Correctif (217i)

Les deux décisions deviennent des **fonctions pures** qui ne lisent que le
conteneur, extraites pour être directement testables sans construire de vue
vivante — idiome déjà établi dans le dépôt par
`StoryViewerView+Content.reactionRollbackTarget` (`nonisolated static`, même
raison, même formulation) :

```swift
nonisolated static func bubbleWidth(containerWidth: CGFloat) -> CGFloat {
    min(250, max(0, containerWidth - 48))
}

nonisolated static func flipsAbove(anchorY: CGFloat, containerHeight: CGFloat) -> Bool {
    anchorY > containerHeight * 0.45
}
```

Appel dans le `body`, immédiatement après `let bounds = parentGeo.size` :

```swift
let bubbleW = Self.bubbleWidth(containerWidth: bounds.width)
let showAbove = Self.flipsAbove(anchorY: anchor.y, containerHeight: bounds.height)
```

`showAbove` passe de propriété calculée à `let` local — ses deux usages (`dir`
l.53, l'ancre du `scaleEffect` l.103) sont déjà dans la fermeture du
`GeometryReader`. Les trois propriétés `screenHeight` / `screenWidth` /
`showAbove` disparaissent ; plus aucune ligne de code du fichier ne mentionne
`UIScreen`.

**Les constantes sont conservées à l'identique** (250, 48, 0.45, l'offset 52) :
l'itération corrige la *grandeur mesurée*, pas le réglage visuel.

Le plancher `max(0, …)` est neuf : un `GeometryReader` rapporte `.zero` au
premier passage de layout, et l'ancienne formule appliquée au conteneur y aurait
produit une largeur négative — soit un « Invalid frame dimension » en console.
Le passage transitoire est simplement invisible.

## Changement de comportement, assumé

Sur une surface plein écran **sans inset**, conteneur == écran : les deux
décisions sont **identiques à l'ancienne** (un test le vérifie sur 6 ancres).

Là où le conteneur est plus petit que l'écran — feuilles, colonne de split view,
Slide Over, Stage Manager — la bascule change près du seuil, et c'est
précisément le correctif : la bulle est clippée par son conteneur, donc c'est le
conteneur qui doit décider de quel côté elle a de la place.

## Test

`apps/ios/MeeshyTests/Unit/Views/StatusBubbleOverlayLayoutTests.swift` (neuf).
6 tests / 17 assertions :

1. Plein écran iPhone (393 pt) → largeur plafonnée à 250 pt, **inchangée**.
2. Conteneur étroit (260 pt) → 212 pt, et le bord gauche pincé reste ≥ 0 —
   l'assertion refait le calcul de `bubbleX` plutôt que de figer un nombre.
3. Conteneur de taille nulle / 30 pt → 0, jamais négatif.
4. Bascule mesurée sur le conteneur (haut / bas).
5. **Divergence prouvée dans le test lui-même** : à ancre 350 pt dans une
   feuille de 422 pt, l'ancienne formule (`350 > 844 * 0.45`) est écrite
   explicitement et asserted `false`, la nouvelle `true` ; puis la place
   restante de chaque côté (20 pt vs 298 pt) est comparée — sans jamais
   supposer la hauteur de la bulle, qui épouse son contenu.
6. **Parité plein écran** sur 6 ancres : sans inset, aucune décision ne change.
7. **Verrou de source** : `UIScreen.main` absent des lignes de code du fichier
   (lignes de commentaire exclues — le doc-comment nomme volontairement l'API
   pour expliquer pourquoi elle est proscrite ici).

**RED contre `main` `1f6ef69`** : le verrou de source échoue (le fichier porte
deux `UIScreen.main.bounds` en code). Les 16 autres assertions portent sur deux
fonctions qui n'existent pas sur `main` — la suite n'y compile pas. La
divergence de comportement est donc prouvée *à l'intérieur* du test n° 5, qui
écrit l'ancienne formule à côté de la nouvelle et montre qu'elles répondent
l'inverse sur le même cas.

## Vérification

- Pas de toolchain Swift (Linux) → les **17 assertions arithmétiques ont été
  recalculées indépendamment** hors Xcode : 17/17 conformes. Équilibre
  accolades / parenthèses / crochets des 2 fichiers contrôlé au tokenizer
  (chaînes retirées avant les commentaires) : **0 / 0 / 0**.
- `nonisolated static` sur un type `View` : précédent prouvé dans le dépôt
  (`StoryViewerView+Content.reactionRollbackTarget`), même motif d'extraction
  pour testabilité.
- Collision essaim : `list_pull_requests` (open, 12 PR) → **3 PR iOS**
  (#2325 partage, #2319 navigation, #2275 `StatusComposerView`) — **aucune** ne
  touche `StatusBubbleOverlay.swift`. Aucun test existant ne référençait ce
  fichier.
- Fichier de test **neuf** → enregistré automatiquement par `xcodegen generate`
  en CI (globbing récursif), **0 édition de `project.pbxproj`**.
- Nom de classe contenant « Bubble » → phase 2 de `meeshy.sh test`, comme prévu
  par `FINAL_PHASE_CLASS_PATTERN`.

Gate réel = CI `iOS Tests`.

## Bilan

**1 fichier de production : +22 / −4 lignes** (dont 14 de doc-comment).
2 décisions de layout re-fondées sur le conteneur, 2 lectures de l'écran
physique supprimées, 1 largeur négative transitoire éliminée, 2 fonctions pures
extraites et testées. **0 clé i18n, 0 couleur, 0 constante visuelle modifiée,
0 logique métier, 0 réseau.**

## Piste 218i+

`UIScreen.main` reste sur **13 fichiers**. Les sites suivants méritent un examen
individuel — chacun mérite sa propre itération, aucun n'est mécanique :

1. `MessageListView.MessageMenuPreviewContainer.maxHeight`
   (`UIScreen.main.bounds.height * 0.62`) et son jumeau
   `MessageOverlayMenu.maxPreviewHeight` — les deux doivent bouger ensemble,
   c'est ce couplage qui rend l'itération non triviale.
2. `StatusBubbleOverlay` est **soldé** — ne plus re-flagger.
3. `ImageDownsamplingConfig` (`UIScreen.main.scale`) et
   `BubbleStandardLayout+Media` : la *scale* est identique sur toutes les
   fenêtres d'un même appareil — **pas un défaut**, ne pas y toucher.
4. `RecentMediaStrip.compactCell` : délibéré et documenté (chemin iPhone
   compact uniquement) — **ne pas re-flagger**.
