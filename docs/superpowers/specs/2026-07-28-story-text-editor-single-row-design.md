# Éditeur de texte story — rangée unique, canvas plein écran, cadre complet

**Date** : 2026-07-28
**Portée** : iOS uniquement (`packages/MeeshySDK/Sources/MeeshyUI/Story/`, `Sources/MeeshySDK/Models/StoryModels.swift`)
**Supersède** : `2026-07-26-story-text-toolbar-top-cycle-design.md` (la séparation en deux rangées)

## Problème

L'éditeur de texte story répartit ses neuf outils sur deux rangées : quatre attributs
cyclables sous l'encoche, cinq ouvre-panneaux au-dessus du clavier. Cette séparation a
été posée pour un motif de largeur — neuf bulles plus la sortie demandaient 432 pt là où
un iPhone 16 Pro en offre 361 — mais elle coupe l'écran en deux et impose à
l'utilisateur de retenir quel outil habite quelle rangée pour deux gestes différents.

Trois manques s'y ajoutent :

- Le canvas se **carde** dès l'ouverture de l'éditeur : il rétrécit vers le haut,
  change d'échelle, et le texte que l'on édite n'est plus rendu à la taille qu'il aura.
- Le tool **Cadre** n'a ni « Aucun » ni réglage de taille, et choisir une forme
  **repeint le texte** d'un fond noir 65 % non demandé.
- **Taille** et **Graisse** occupent chacun une bulle alors que ce sont des valeurs
  continues, mieux servies par un curseur posé là où on choisit la police.

## Objectifs

1. Une seule rangée d'outils, au-dessus du clavier. « Terminé » reste seul en haut.
2. Un geste unique et uniforme : tap = valeur suivante, appui long = panneau complet.
3. Le canvas reste **plein écran** pendant l'édition.
4. Le cadre gagne « Aucun », une marge réglable et un liseré — indépendants du fond.
5. Taille et graisse deviennent des curseurs dans le panneau Police.
6. Chaque réglage se voit **immédiatement** sur le canvas.

## Non-objectifs

- Les rendus bitmap simplifiés (`StorySlideRenderer`, `SlideMiniPreview`) ignorent déjà
  les formes path-based (losange, nuage, bulle BD). Cet écart préexistant n'est pas
  comblé ici, et marge et liseré n'y sont pas portés non plus — voir §7 pour pourquoi
  c'est impossible à moindre coût dans l'un et sans intérêt dans l'autre.
- Aucun changement de format d'échange. Les effets de slide voyagent en JSON opaque
  vers le gateway : ni `packages/shared/types/`, ni le schéma Prisma ne sont touchés.

---

## 1. Disposition

### Rangée haute — `StoryTextEditTopBar`

Se réduit au seul bouton « Terminé » (capsule brand, alignée à droite, sous l'encoche).
La `ForEach(TextEditTool.topTools)` disparaît, et avec elle la constante `topTools`.

### Rangée basse — `TextEditFloatingBubbles`

Sept bulles, dans cet ordre :

```
police · couleur · alignement · fond · cadre · contour · langue
```

Bulles nues sur le canvas (`glassControlForeground` + `adaptiveGlass`), gabarit 36 pt
inchangé, dans un `ScrollView` horizontal.

**Budget de largeur** : 7 × 36 + 6 × 8 = **300 pt** contre 343 pt utiles sur iPhone SE —
la rangée tient sans défiler sur tous les appareils supportés. Le `ScrollView` est un
filet, pas une nécessité : il garantit qu'un huitième outil ajouté plus tard déborde
visiblement au lieu de se faire couper en silence, ce qui est précisément le défaut qui
avait imposé la séparation en deux rangées.

`TextEditToolbarMetrics.fits` / `requiredWidth` restent la source de vérité du budget et
gagnent un test sur la configuration à sept.

## 2. Interaction

| Geste | Effet |
|---|---|
| **Tap** | valeur suivante de l'attribut, rendu immédiat. Aucun panneau ne s'ouvre. |
| **Appui long** (0,4 s) | ouvre / referme le panneau complet de l'outil. |

Règle unique sur les sept outils, sans exception. La mécanique tap+appui long existe
déjà dans `StoryTextEditTopBar.cycleButton` : elle migre vers `TextEditFloatingBubbles`,
accompagnée du `ViewModifier` d'accessibilité `CycleButtonAccessibility` (qui expose
« Toutes les options » comme action VoiceOver — l'appui long n'est pas atteignable au
lecteur d'écran).

### Chaque bulle montre sa valeur

Cycler à l'aveugle sur quatorze couleurs est intenable : la bulle doit rendre l'état
courant, pas un pictogramme figé. `StoryTextAttributeCycle.Indicator` devient :

```swift
enum Indicator: Equatable, Sendable {
    case symbol(name: String, emphasis: Int)          // alignement · cadre · contour
    case styledGlyph(String, style: StoryTextStyle)   // police  → « Aa » dans la police
    case colorDot(hex: String)                        // couleur → pastille pleine
    case backgroundSwatch(hex: String?, isGlass: Bool)// fond    → pastille / verre / aucun
    case code(String)                                 // langue  → « FR »
}
```

`emphasis` reste réservé au contour, dont le rang de cran se traduit en poids de trait
sur le symbole — le bouton montre l'épaisseur qu'il pose.

Le cas `.glyph(_, weight:)` disparaît avec le tool Graisse.

### Séquences de rotation

`StoryTextAttributeCycle.advance` couvre les sept outils :

| Outil | Crans | Source |
|---|---|---|
| police | `StoryTextStyle.allCases` | existant |
| couleur | `StoryTextColors.palette` (14) | existant |
| alignement | `left · center · right` | existant |
| fond | `aucun · verre · 10 solides` (12) | **à extraire** |
| cadre | `aucun · arrondi · pilule · carré · losange · nuage · bulle BD` (7) | existant + `.none` |
| contour | `0 · 2 · 4 · 8 · 12` pt | existant |
| langue | `fr · en · es · de · it · pt · ar` | existant |

Deux listes vivent aujourd'hui en dur dans le corps de vue de `TextEditToolOptions` et
doivent devenir des constantes partagées, sinon la rotation et le panneau divergeront :

- `StoryTextBackgroundPresets.all` — extraite de `backgroundOptions`
- `TextEditToolOptions.languageChoices(current:)` — déjà statique, à consommer par le cycle

## 3. Canvas plein écran

Le canvas ne se carde plus pendant l'édition texte : il garde son échelle 1 et ses
bords, les bulles et « Terminé » flottent par-dessus, et le clavier recouvre le bas sans
que cela pose problème — l'attention est sur le texte.

**Retirer `textActive` de `StoryCanvasFraming.isCarded` ne suffit pas.** Quand l'éditeur
s'ouvre depuis la tuile Texte de l'empty-state, `StoryComposerView+Canvas` appelle
`bandStateMachine.tapFAB` puis `tapTile` juste après `enterTextEditingMode` : la band
n'est donc pas `.hidden`, et `bandPresent` maintiendrait le carding à lui seul. Il faut
un **court-circuit explicite**, en tête de `canvasIsCarded` :

```swift
if viewModel.textEditingMode != .inactive { return false }
```

La band est de toute façon masquée et non-interactive à cet instant
(`isFloatingEditorActive` → `.opacity(0)` + `.allowsHitTesting(false)`) : lui réserver de
la hauteur n'a aucun sens.

Conséquences, à supprimer :

- la branche `textEditingMode != .inactive` de `presentedSheetHeight` (retourne 0)
- l'état `measuredTextToolbarTopY` et la closure `onBottomEdgeChange` de
  `StoryTextEditToolbar`, qui n'existaient que pour alimenter cette réserve
- le terme `viewModel.textEditingMode != .inactive` de `chromeAtTop`, devenu sans effet

Le comportement du texte édité **ne change pas** : `centerLayerForEditing` le recentre
sur le canvas le temps de l'édition — override purement visuel, `x` / `y` / `rotation`
du modèle ne sont jamais mutés — et `restoreLayerAfterEditing` le remet à sa position
réelle à la fermeture. Sur iPhone 16 Pro le centre écran tombe à 437 pt et le haut du
clavier à ~538 pt : le texte en cours de frappe reste au-dessus.

Le commentaire de `centerLayerForEditing` qui justifie le centrage par « le composer
carde déjà le canvas au-dessus du clavier » devient faux et doit être réécrit.

## 4. Panneau Police

```
Taille    ⎯⎯⎯⎯⎯●⎯⎯⎯⎯   42
Graisse   ⎯●⎯⎯⎯⎯⎯⎯⎯⎯   Normal
[Aa] [Aa] [Aa] [Aa] [Aa] …          ← polices, défilement horizontal
```

**Taille** reprend la logique existante sans modification : le curseur affiche
`fontSize × scale` — donc il suit un pinch sur le canvas en direct — et écrit `fontSize`
en remettant `scale` à 1, pour qu'un pinch résiduel ne se compose jamais avec un
redimensionnement manuel ultérieur. Les helpers `displayedSize(for:)` et
`applyingSliderValue(_:to:)` sont conservés tels quels, seul leur point d'appel change.

**Graisse** est un curseur à quatre crans sur les valeurs modèle existantes
(`thin · normal · semibold · bold`), écrivant `fontWeight`. Aucun champ nouveau.

### `TextEditTool` perd deux cas

`.size` et `.weight` ne sont plus des outils : plus de bulle, plus de panneau propre.
Ils sortent de l'énuméré. En cascade :

- `topTools` / `bottomTools` fusionnent en une seule liste `all` de sept
- `isCyclable` devient vrai partout et perd sa raison d'être — supprimé
- `StoryTextAttributeCycle.advanceWeight` et `defaultWeight` disparaissent
- `TextEditToolOptions` : `weightOptions` et `sizeOptions` deviennent des sous-vues de
  `styleOptions` au lieu de branches du `switch`

## 5. Panneau Cadre

```
[Aucun] [Arrondi] [Pilule] [Carré] [Losange] [Nuage] [Bulle BD]
Marge     ⎯⎯⎯●⎯⎯⎯⎯⎯⎯   ×1,0
Liseré    ⎯●⎯⎯⎯⎯⎯⎯⎯⎯   2,0
● ● ● ● ● ● ● ● ●                    ← couleur du liseré
```

### Modèle — `StoryTextObject`

Un cas d'énuméré et trois champs, tous optionnels, `nil` valant le comportement actuel :
les stories déjà publiées se rendent à l'identique.

| Champ | Type | `nil` signifie |
|---|---|---|
| `framePaddingScale` | `Double?` | `1.0` — le padding automatique actuel |
| `frameBorderWidth` | `Double?` | aucun liseré |
| `frameBorderColor` | `String?` | `FFFFFF` dès que la largeur dépasse 0 |

`StoryTextFrameShape` gagne un `case none`, dont `usesCustomPath` vaut `false`.
`frameShape == nil` continue de se lire `.rounded` : « aucun cadre » est un choix
explicite, jamais l'état par défaut d'un texte existant.

`CodingKeys` et le `init(from:)` manuel sont étendus en conséquence.

**La marge est un multiplicateur, pas une valeur en points.** Le padding automatique
vaut aujourd'hui « au moins la chasse d'un glyphe *o* » horizontalement plus 16 px
verticalement : il dépend donc de la police et de la taille. Un curseur en points
absolus imposerait soit de matérialiser une valeur de départ arbitraire dans le modèle à
l'ouverture du panneau — ce qui déplacerait le cadre d'un texte existant au seul fait de
regarder ses options — soit d'afficher une valeur qui ne correspond pas au rendu. Le
multiplicateur `0…3` (pas de 0,1, défaut 1,0) n'a aucun de ces défauts : `nil` se lit
comme 1,0 sans rien écrire, 0 colle le cadre aux glyphes, et la marge reste
proportionnée quand on passe un texte de 24 à 120 pt.

### Le cadre se détache du fond

Aujourd'hui `StoryTextLayer` dérive `isFramed` de la seule présence d'un fond
(`resolvedBackgroundStyle != .none`) : sans fond, pas de boîte, donc pas de forme. Le
prédicat devient, porté par le modèle en source unique :

```
hasFrameBox = frameShape ≠ .none ∧ (fond ≠ .none ∨ frameBorderWidth > 0)
```

`StoryTextLayer.configure` remplace son `isFramed` local par cette propriété. Un cadre
peut donc exister en liseré seul, sur texte sans fond.

### Rendu du liseré

- **Formes à coins** (arrondi, pilule, carré) : `borderColor` / `borderWidth` sur la
  calque elle-même, qui suivent automatiquement le `cornerRadius` déjà posé par
  `frameCornerRadius(height:)`. Aucun conflit avec `applyForegroundFrames`, qui
  n'applique délibérément aucun cadre aux textes (`fgTextIds` est vide).
- **Formes path-based** (losange, nuage, bulle BD) : `strokeColor` / `lineWidth` sur le
  `CAShapeLayer` de `pathFramePath`. Quand le fond est `.none`, ce `CAShapeLayer` doit
  être créé pour porter le seul trait — `applyBackgroundStyle` retourne actuellement
  tout de suite sur `.none` et doit donc être scindé : le tracé de la forme d'un côté,
  son remplissage de l'autre.

### Choisir une forme ne repeint plus le texte

`advanceFrame` et le panneau posent aujourd'hui un fond noir 65 % dès qu'une forme est
choisie sans fond, pour que le choix soit visible. À la place, ils posent un **liseré
blanc de 2 pt** — même intention, geste non destructeur : le texte n'est pas recouvert.
Le pattern est celui, déjà en place, de `initializeBorderDefaultsIfNeutral` pour le
contour de glyphes.

## 6. Rendu live

Le chemin existe et reste inchangé :

- police, graisse, taille, couleur, alignement et **contour de glyphes** passent par
  `StoryInlineTextEditor.apply(textObject:geometry:setText:)`, rappelée à chaque
  reconstruction via `reapplyInlineEditingIfNeeded()`. `StoryTextFontResolver.resolveFont`
  honore déjà `fontWeight` en surcharge du poids dérivé du style.
- fond, cadre, marge et liseré sont peints par la `StoryTextLayer` **sous** l'éditeur,
  qui reste visible pendant la frappe (seuls les glyphes de la calque sont masqués).

Les deux nouveaux réglages empruntent donc le second chemin sans câblage
supplémentaire — mais chacun reçoit un test de non-régression, la propriété « ça se voit
tout de suite » n'étant garantie par aucune barrière de type.

## 7. Portée du rendu

`StoryTextLayer` est le seul rendu haute fidélité : canvas composer, reader **et** export
vidéo passent par lui. C'est là que marge, liseré et `.none` sont implémentés en entier.

Les deux rendus simplifiés restent en dehors, chacun pour sa raison propre :

- **`StorySlideRenderer`** (cover et thumbHash) peint le fond de texte via l'attribut
  `NSAttributedString.backgroundColor`, posé par run de glyphes. Cet attribut n'a **ni
  padding ni rayon de coin** : il n'existe aucun endroit où écrire une marge ou un
  liseré. Les porter demanderait de remplacer le dessin du texte par un tracé explicite
  de boîte — une réécriture réelle, pour un gain nul sur une vignette de hash perceptuel.
- **`SlideMiniPreview`** (bande de vignettes) sait faire les deux, en SwiftUI. Mais sur
  une vignette large de quelques dizaines de points, un liseré de 2 px design tombe sous
  le pixel. Le coût de maintenance d'un troisième site de vérité n'achète rien de visible.

Les deux divergences existantes sont documentées ici plutôt que corrigées : c'est le
même arbitrage que celui déjà pris pour les formes path-based.

## 8. Tests

Chaque comportement est écrit en test avant son implémentation.

| Fichier | Ce qui est ajouté |
|---|---|
| `StoryTextAttributeCycleTests` | rotation des 4 nouveaux outils ; `.none` dans le cycle du cadre ; liseré blanc 2 pt posé au sortir de `.none` ; disparition du cas graisse |
| `TextEditToolbarLayoutTests` | 7 bulles tiennent dans la largeur la plus étroite supportée ; `topTools` n'existe plus |
| `TextEditToolOptionsSizeTests` | `displayedSize` / `applyingSliderValue` inchangés, consommés depuis le panneau Police |
| `TextEditToolOptionsBorderTests` | curseur de liseré du cadre, distinct du contour de glyphes |
| `StoryTextLayerFrameGeometryTests` | `framePaddingScale` à 0 / 1 / 3 ; bounds d'un cadre en liseré seul, sans fond |
| `StoryTextStyleAndFrameShapeTests` | round-trip Codable des trois champs ; `hasFrameBox` sur les 6 combinaisons forme × fond × liseré |
| `StoryComposerView` (framing) | `canvasIsCarded` est faux en édition texte **même quand la band n'est pas `.hidden`** |

### Tests existants qui deviennent faux

Trois tests de `TextEditToolbarLayoutTests` s'appuient sur la répartition en deux
rangées (`test_theTwoRowsCoverEveryToolExactlyOnce`,
`test_everyToolOnTheTopRowCanBeCycled`,
`test_theTopRowFitsOnTheNarrowestSupportedScreen_finishButtonIncluded`) et disparaissent
avec elle.

Un quatrième, `test_theOriginalSingleRowLayoutDoesNotFitAnywhere`, devient **faux sans
que son intention le devienne** — c'est le piège. Il pose « tous les outils plus la
sortie sur une rangée ne tiennent nulle part » et le vérifie sur deux largeurs. Avec
sept outils au lieu de neuf, sa seconde assertion demande 8 bulles = 344 pt sur les
361 pt d'un iPhone 16 Pro : ça tient, donc le `XCTAssertFalse` casse. Il faut le
réécrire autour de la nouvelle garde — sept bulles tiennent partout, huit ne tiennent
plus sur un iPhone SE — et non le supprimer : c'est lui qui empêche la troncature
silencieuse de revenir.

Dans `StoryTextAttributeCycleTests`, `test_weight_visitsEveryStepThenWrapsAround`,
`test_weight_whenUnset_departsFromNormal` et l'assertion sur `.glyph("A", weight: .bold)`
tombent avec le tool Graisse.

## 9. Un second éditeur de texte, hors scope

`StoryTextEditorView` — le panneau que `ComposerBottomBand` affiche pour l'outil Texte —
est une **seconde** interface d'édition, atteinte par la tuile Texte plutôt que par un
tap sur un texte du canvas. Elle duplique déjà, dans sa propre grammaire, la palette de
couleurs, la rotation de style, la rotation d'alignement, le bascule de fond et le
curseur de taille.

Elle n'est pas touchée ici : les deux surfaces ne sont jamais visibles en même temps
(`isFloatingEditorActive` masque la band), et l'aligner doublerait la tâche. Mais la
divergence se creuse d'un cran avec ce travail, et c'est à traiter dans un lot séparé —
soit en alignant sa grammaire, soit en la supprimant au profit de l'éditeur flottant.

Vérification finale : `./apps/ios/meeshy.sh build` puis `./apps/ios/meeshy.sh test`.
`build` ne compile pas le bundle de tests — un `build-for-testing` est nécessaire dès
qu'une signature change, et les signatures changent ici (`TextEditTool` perd deux cas).

## 10. Risques

| Risque | Traitement |
|---|---|
| `TextEditTool` perd deux cas : tout `switch` exhaustif casse à la compilation | Effet recherché — le compilateur énumère les sites à traiter |
| Cycler 14 couleurs au tap est long | L'appui long reste le chemin direct ; la bulle affiche la valeur courante |
| `applyBackgroundStyle` scindé pour porter un trait sans fond | Zone à régression connue (« boîte noire vide » du 2026-06-01) : couverte par `StoryTextLayerSolidBackgroundTests` et `StoryTextLayerGlassZOrderTests`, à faire passer avant et après |
| Le canvas plein écran met le texte plus près du clavier sur petits écrans | Accepté explicitement — l'attention est sur le texte pendant l'édition |
