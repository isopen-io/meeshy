# Barre d'outils texte du composer story — rangée haute à rotation

Date : 2026-07-26
Statut : design validé, prêt pour plan d'implémentation

## Problème

L'éditeur de texte inline du composer story rend ses 9 outils plus le bouton de
sortie dans une seule `HStack` non scrollable
(`TextEditFloatingBubbles.swift:18`). Le budget nécessaire est
`10 × 36 + 9 × 8 = 432 pt` pour 361 pt utiles sur un iPhone 16 Pro : la première
bulle et le X de sortie sont tronqués par les bords de l'écran. Le X étant le
seul chemin de sortie explicite, la troncature touche une fonction critique.

Deux fuites verticales indépendantes existent en plus, et se révéleront dès
qu'une rangée haute sera ajoutée :

- `StoryComposerView+Canvas.swift:703` — `headerInset` ne réserve la hauteur du
  header que si `showTopBar` est vrai. Or `ComposerChromePolicy` masque le
  header pendant l'édition texte, donc la carte canvas monte jusque sous la
  status bar. Une barre d'outils posée là recouvrirait le haut du canvas.
- `StoryComposerView+Canvas.swift:864` — `presentedSheetHeight` réserve
  `keyboardHeight + 132`, une constante qui ignore la hauteur réellement rendue
  du panneau d'options. Le panneau Contour (slider + palette) dépasse ces
  132 pt et mord sur le bas du canvas. Le correctif du 2026-07-20 avait déjà
  tranché ce débat pour la band d'outils en mesurant son bord supérieur réel
  (`measuredBandTopY`) ; la toolbar texte n'a jamais reçu le même traitement.

## Objectif

Passer les attributs à valeurs discrètes dans une rangée haute sous l'encoche,
actionnés par rotation au tap (façon TikTok), avec rendu immédiat sur le texte
en cours d'édition — et garantir qu'aucune rangée de contrôles ni le canvas ne
sortent du viewport.

## Répartition des outils

| Rangée haute (sous l'encoche) | Rangée basse (au-dessus du clavier) |
|---|---|
| `weight` · `align` · `border` · `frame` + **Terminé** | `style` · `color` · `size` · `background` · `language` |
| tap = cran suivant, appui long = panneau | tap = ouvre/replie le panneau |

Budgets de largeur, marges 2 × 16 pt :

| Rangée | Requis | Dispo iPhone 16 Pro (393) | Dispo iPhone SE (375) |
|---|---|---|---|
| haute (4 bulles + Terminé 100 pt) | 268 pt | 361 pt | 343 pt |
| basse (5 bulles) | 212 pt | 361 pt | 343 pt |

Aucune fonction n'est perdue : les quatre outils montés en haut gardent leur
panneau d'options complet, ouvert par **appui long** (0,4 s) sur le bouton haut.
Le panneau s'affiche en bas, à l'emplacement actuel, via le
`setExpandedTool(_:)` existant.

Le X rouge quitte la rangée basse et devient un bouton **Terminé** à droite de
la rangée haute. Il conserve son câblage sur `exitTextEditingMode()`, donc la
suppression du texte vide et la descente du clavier restent inchangées.

## Rotation des attributs

Chaque tap avance l'attribut d'un cran et reboucle. L'écriture passe par le
`Binding<StoryTextObject>` déjà construit par `StoryTextEditToolbar`
(`textObjectBinding(for:)`), donc `viewModel.currentEffects` est muté et le
canvas se redessine — **le rendu temps réel est acquis par ce chemin, aucune
plomberie supplémentaire n'est nécessaire**.

| Outil | Crans | Origine quand la valeur est absente |
|---|---|---|
| `weight` | fin → normal → semi → gras | `fontWeight == nil` est traité comme `normal` |
| `align` | gauche → centre → droite | `textAlign == nil` est traité comme `center` |
| `border` | 0 → 2 → 4 → 8 → 12 pt | `borderWidth == nil` est traité comme `0` |
| `frame` | arrondi → pilule → carré → losange → nuage → bulle BD | `parsedFrameShape` retourne déjà `.rounded` |

Règles de bord conservées depuis les panneaux actuels :

- passer `border` au-dessus de 0 pose `borderColor = "FFFFFF"` s'il est nul
  (parité `initializeBorderDefaultsIfNeutral`) ;
- choisir une forme pose `backgroundStyle = .solid(hex: "000000A6")` si aucun
  fond n'est actif — un cadrage sans fond est invisible (parité `frameOptions`).

Une valeur hors cran, posée au slider (par exemple `borderWidth == 5.5`),
avance vers le premier cran **strictement supérieur** (ici 8).

## Indicateurs

Le bouton montre l'état courant, il ne montre pas un pictogramme figé.

| Outil | Indicateur |
|---|---|
| `weight` | la lettre `A` rendue dans la graisse courante |
| `align` | `text.alignleft` / `text.aligncenter` / `text.alignright` |
| `border` | `square.dashed` à 0, sinon `square` dont le poids de trait suit la valeur (`ultraLight` → `black`) |
| `frame` | symbole de la forme courante |

## Panneaux d'options

Les chips sont compressés : hauteur uniforme 38 pt (au lieu de 42 pt pour
Style et Graisse), libellés en 11 pt, largeur minimale réduite. Les panneaux
Couleur (14 pastilles) et Fond (12 chips libellés) restent des `ScrollView`
horizontales — décision explicite : leur contenu dépasse la largeur même
compressé, et le scroll est préféré au passage à la ligne.

## Réserve de viewport

- `headerInset` réserve la hauteur d'une rangée de contrôles dès que
  `textEditingMode != .inactive`, exactement comme lorsque `showTopBar` est
  vrai. La carte canvas démarre donc sous la rangée haute.
- `presentedSheetHeight` cesse d'utiliser la constante `keyboardHeight + 132`
  pour la branche texte et s'appuie sur le bord supérieur réellement rendu de
  la toolbar texte, mesuré en coordonnées globales — même mécanique que
  `measuredBandTopY` pour la band. La constante reste en repli tant que la
  première mesure n'a pas atterri.

## Découpage

| Unité | Rôle | Dépendances |
|---|---|---|
| `StoryTextAttributeCycle` (nouveau) | `nonisolated enum` pur : avance un attribut, décrit son indicateur | `StoryTextObject` seul |
| `TextEditToolbarMetrics` (nouveau) | `nonisolated enum` pur : taille de bulle, espacement, largeur requise pour N bulles | aucune |
| `TextEditTool.topTools` / `.bottomTools` | partition des outils entre les deux rangées | `TextEditTool` |
| `StoryTextEditTopBar` (nouveau) | vue de la rangée haute : 4 boutons rotatifs + Terminé | `StoryTextAttributeCycle`, binding texte |
| `TextEditFloatingBubbles` (modifié) | ne rend plus que `bottomTools`, plus de bouton X | `TextEditTool.bottomTools` |
| `StoryTextEditToolbar` (modifié) | monte les deux rangées, publie son bord supérieur | les deux vues ci-dessus |
| `TextEditToolOptions` (modifié) | chips compressés à 38 pt | inchangé pour le reste |
| `StoryComposerView+Canvas` (modifié) | réserves haute et basse du canvas | mesure publiée par la toolbar |

Le type `nonisolated` est posé **sur le type**, pas par méthode : le package
active `.defaultIsolation(MainActor.self)` (SE-0466), et une annotation par
méthode ne suffit pas pour les conformances et les extensions.

## Tests

Écrits avant l'implémentation, dans
`packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/`.

Cycle — `StoryTextAttributeCycleTests` :

- chaque outil parcourt exactement ses crans puis reboucle sur le premier ;
- une valeur absente part du cran d'origine documenté ;
- `borderWidth = 5.5` avance vers 8, pas vers 2 ;
- avancer `border` depuis 0 pose `borderColor = "FFFFFF"` ;
- avancer `frame` sans fond pose `backgroundStyle = .solid(hex: "000000A6")` ;
- avancer `frame` avec un fond existant ne le remplace pas ;
- l'indicateur retourné suit la valeur courante pour les quatre outils.

Partition — `TextEditToolPartitionTests` :

- `topTools + bottomTools == TextEditTool.allCases`, sans doublon ;
- les deux ensembles sont disjoints.

Budget de largeur — `TextEditToolbarMetricsTests` : garde-fou contre la
régression d'origine.

- la rangée basse tient dans 343 pt (iPhone SE, la plus étroite supportée) ;
- la rangée haute, bouton Terminé compris, tient dans 343 pt ;
- l'ancienne composition à 10 bulles ne tient pas — le test échoue si
  quelqu'un remet tous les outils sur une rangée.

Vérification manuelle sur simulateur (skill `ios-simulator`) : ouvrir un texte,
constater qu'aucune bulle n'est coupée, que le tap fait varier le rendu
immédiatement, que l'appui long ouvre le panneau, et que le canvas n'est
recouvert ni en haut ni en bas quand le panneau Contour est ouvert.

## Hors périmètre

- Refonte des panneaux Couleur et Fond en grille (scroll conservé, décision
  explicite).
- Changement de l'ordre ou du contenu des 9 outils.
- Toute modification de la barre d'outils du mode dessin
  (`StoryDrawingToolbar`), bien qu'elle partage la structure des bulles.
