# Zone d'édition du texte de story — ancrage, défilement, ombrage

Date : 2026-08-01
Portée : `packages/MeeshySDK/Sources/MeeshyUI/Story/` (composer iOS)

## Problème

Trois défauts rapportés sur l'édition en place d'un texte de story.

### 1. La position initiale se confond avec les contrôleurs flottants

`StoryCanvasUIView+InlineTextEdit.swift` ancre le bloc édité par
`min(canvasMidY, floorY - blockHeight / 2)`, où `floorY` est le haut des bulles
d'outils moins `inlineEditFloorGap` (12 pt).

Pour un texte neuf — vide, hauteur ≈ celle du placeholder — `floorY -
blockHeight / 2` retombe à quelques points de `canvasMidY` sur un canvas 9:16
clavier levé. Le bloc se pose donc à 12 pt des bulles : visuellement collé aux
contrôleurs. Ce n'est qu'à la frappe, quand `textViewDidChange` ré-ancre un bloc
devenu plus haut, que le texte remonte et qu'une zone distincte apparaît.

Une course aggrave l'effet : à l'ouverture, `measuredTextToolbarTopY` vaut encore
`.greatestFiniteMagnitude` (toolbar pas encore mesurée, clavier pas levé), donc
le premier placement part du centre canvas et saute une fois le plafond connu.

**Cause racine** : le centre du bloc est fonction de sa hauteur. Toute variation
de hauteur déplace le texte.

### 2. Un texte long est inatteignable

`StoryInlineTextEditor` a `isScrollEnabled = false` et `sizeToFitTextContent`
grandit sans borne haute — comportement voulu par la directive du 2026-07-30
(« le texte long sort par le haut de l'écran plutôt que sous les chips »). La
conséquence non anticipée : les premières lignes sortent de l'écran et ne sont
plus ni lisibles ni éditables.

### 3. Aucun ombrage pendant l'édition

Les autres textes et éléments du canvas restent à pleine luminosité sous le
texte édité, qui s'y confond.

## Décisions

| Question | Décision |
|---|---|
| Ancrage à l'ouverture | Centré dans la **zone d'édition**, pas au centre du canvas |
| Débordement | Hauteur bornée à la zone + défilement interne |
| Ombrage | Scrim uniforme sur tout le canvas, sous l'éditeur |

La directive du 2026-07-30 (« aucun clamp haut ») est **supersédée** : le clamp
haut est désormais la zone, et le débordement se règle par défilement.

## Conception

### La zone d'édition

Le canvas connaît deux bornes en coordonnées écran, posées par le composer selon
le même patron que `onBandTopYChange` :

| Borne | Mesurée par | État |
|---|---|---|
| `inlineEditFloorGlobalY` | `StoryTextEditToolbar` → `minY` de la rangée basse (bulles + panneau déplié, décalée du clavier) | existant |
| `inlineEditCeilingGlobalY` | `StoryTextEditTopBar` → `maxY` du bouton « Terminé » | **nouveau** |

Converties en repère canvas (`convert(_:from: nil)`, ce qui absorbe le
`scaleEffect`/`offset` SwiftUI du conteneur) et resserrées d'une marge de
`inlineEditFloorGap` = 12 pt de chaque côté, elles forment :

```swift
struct InlineEditZone { let top: CGFloat; let bottom: CGFloat }
var inlineEditZone: InlineEditZone?   // nil tant qu'une borne manque
```

`nil` quand une borne n'a pas été mesurée ou que la vue n'est pas en fenêtre —
le comportement historique (centre canvas, pas de clamp) reste alors le repli,
ce qui garde les tests hors fenêtre et le canvas de lecture inchangés.

### Règles pures

Deux fonctions statiques `nonisolated`, testables sans fenêtre, remplacent
`inlineEditCenterY(canvasMidY:floorY:blockHeight:)` :

```swift
static func inlineEditCenterY(zone: InlineEditZone?, canvasMidY: CGFloat) -> CGFloat
// zone == nil → canvasMidY ; sinon (zone.top + zone.bottom) / 2

static func inlineEditBlockHeight(natural: CGFloat, zoneHeight: CGFloat?) -> CGFloat
// zoneHeight == nil → natural ; sinon min(natural, zoneHeight)
```

Le centre ne dépend plus de la hauteur du bloc. Conséquences directes :

- l'ouverture pose le texte au milieu de la zone, à mi-chemin entre « Terminé »
  et les bulles — aucune confusion possible avec les contrôleurs ;
- la première frappe ne déplace rien ;
- une zone qui change (clavier qui se lève, panneau d'outil qui se déplie)
  reste le seul évènement qui bouge le texte, et le `didSet` des deux bornes
  déclenche déjà `reapplyInlineEditingIfNeeded()`.

### Défilement interne

`StoryInlineTextEditor.sizeToFitTextContent(maxWidth:maxHeight:)` :

1. mesure la taille naturelle **scroll désactivé** — `sizeThatFits` d'un
   `UITextView` scrollable renvoie sa frame, pas son contenu ; on bascule
   temporairement `isScrollEnabled` à `false` le temps de la mesure ;
2. `isScrollEnabled = natural.height > maxHeight` ;
3. `bounds.size = (largeur, min(natural.height, maxHeight))`, centre préservé ;
4. quand le défilement est actif, `scrollRangeToVisible(selectedRange)` après la
   pose des bounds, pour que le curseur reste visible à la frappe.

`maxHeight` vaut la hauteur de la zone, ou `.greatestFiniteMagnitude` sans zone
mesurée (repli historique, croissance libre).

### Masque du fond de la calque

Le fond du texte — solide, glass, losange, bulle — est peint par
`StoryTextLayer`, pas par l'éditeur. Ses sous-calques de fond sont dimensionnés
dans `configure()` à partir de `bounds` ; muter `bounds` après coup ne les
redimensionne pas. Un texte long garderait donc un fond de sa hauteur naturelle
sous une fenêtre de texte bornée.

On pose sur la calque un `mask` (`CAShapeLayer`) couvrant la bande centrale de
hauteur `visibleHeight` pendant l'édition. Le fond visible coïncide alors
exactement avec la fenêtre de défilement.

`StoryTextLayer` n'utilise jamais `self.mask` — seulement `backdrop.mask` sur son
sous-calque de glass — la propriété est donc libre. Le masque est retiré par
`restoreLayerAfterEditing` et re-posé par `reapplyInlineEditingIfNeeded`, aux
mêmes points que `setGlyphsHidden` et le recentrage.

### Scrim

`inlineEditScrimLayer: CALayer`, noir à 45 %, inséré dans la calque de la **vue**
(pas dans `rootLayer`) juste au-dessus de `rootLayer` :

```
StoryCanvasUIView.layer
 ├─ rootLayer            (fond + itemsContainer + editOverlayLayer)
 ├─ inlineEditScrimLayer ← insertSublayer(_:above: rootLayer)
 └─ inlineEditor.layer   (sous-VUE : sa calque est ajoutée après)
```

`insertSublayer(_:above:)` rend l'ordre déterministe quel que soit l'ordre
d'apparition de l'éditeur (première ouverture, ré-ouverture, bascule texte A → B).

- `frame = bounds` re-posé dans `layoutSubviews` avec `rootLayer` ;
- fondu 0,2 s à l'ouverture et à la fermeture ;
- une `CALayer` nue n'intercepte aucun toucher : le tap « ailleurs » du canvas,
  qui sort de l'édition, continue de passer.

Le fond du texte édité est assombri comme le reste — accepté : les glyphes, eux,
sont peints par l'éditeur qui vit au-dessus du scrim et restent nets.

## Fichiers

| Fichier | Changement |
|---|---|
| `StoryTextEditToolbar.swift` | `onCeilingBottomYChange` — mesure du `maxY` global du top bar |
| `StoryComposerView.swift` | `@State measuredTextTopBarBottomY` |
| `StoryComposerView+Canvas.swift` | câblage toolbar → état → représentable |
| `StoryCanvasRepresentable.swift` | paramètre `inlineEditCeilingGlobalY`, poussé avant `beginInlineTextEdit` |
| `StoryCanvasUIView.swift` | `inlineEditCeilingGlobalY` + `didSet`, `inlineEditScrimLayer`, insertion |
| `StoryCanvasUIView+Core.swift` | `frame` du scrim dans `layoutSubviews` |
| `StoryCanvasUIView+InlineTextEdit.swift` | zone, règles pures, masque, scrim on/off |
| `StoryInlineTextEditor.swift` | `sizeToFitTextContent(maxWidth:maxHeight:)`, défilement, curseur visible |

## Tests

TDD, RED d'abord. Les trois fichiers existants sont étendus ou réécrits ; aucun
nouveau fichier n'est nécessaire.

`StoryInlineTextEditAnchorTests` — **réécrit** (la directive qu'il encode est
supersédée) :

- sans zone mesurée → centre canvas, hauteur naturelle (repli inchangé) ;
- avec zone → centre = milieu de la zone, **indépendamment** de la hauteur du
  bloc (le test de non-régression du saut à la première frappe) ;
- hauteur bornée : `natural < zoneHeight` → naturelle ; `natural > zoneHeight` →
  `zoneHeight` ;
- conversion écran → canvas du plafond, symétrique du test existant sur le
  plancher, marge comprise ;
- zone `nil` si une seule des deux bornes est mesurée.

`StoryInlineTextEditorTests` — ajouts :

- texte court, `maxHeight` large → `isScrollEnabled == false`, hauteur naturelle ;
- texte long, `maxHeight` étroit → `isScrollEnabled == true`, hauteur
  exactement `maxHeight` ;
- retour sous le seuil (effacement) → `isScrollEnabled` repasse à `false` et la
  hauteur redevient naturelle ;
- la mesure ne dépend pas de l'état de défilement d'entrée : deux appels
  successifs avec les mêmes paramètres donnent la même hauteur.

`StoryCanvasUIViewInlineEditTests` — ajouts :

- `beginInlineTextEdit` rend le scrim visible, `endInlineTextEdit` le masque ;
- le scrim est au-dessus de `rootLayer` et sous la calque de l'éditeur ;
- un `rebuildLayers()` pendant l'édition conserve le scrim et le masque.

## Hors périmètre

- Le canvas de lecture (`mode != .edit`) : aucune édition en place, donc aucune
  zone, aucun scrim.
- Le mode dessin, qui a ses propres bulles et son propre plein écran.
- Le panneau `StoryTextEditorView` du band (éditeur non flottant), qui n'utilise
  pas ce chemin.
