# K24 — MeeshyContextLines

Ce qui accompagne un contenu se lit en une ligne fine : le son au-dessus, les références dessous, la puce posée dessus.

Registre : `.claude/workflows/meeshy-kit-planche.lots.json`, entrée K24. Lois 2, 13 et 14 de `docs/product/composer-vue-finale.md`. Planche : `trace()`, `refs()`, `.chip`. Dépend de K00 et de K01 ; dépendance de fait : la loi d'estompe publique de K04 (`MeeshyScrollEdges`).

## 1. Rôle

Trois petits éléments disent ce qui accompagne un contenu sans le couvrir : une ligne de son au-dessus de son bord haut, une ligne de références sous son bord bas, une puce de verre posée dessus. Toucher l'un rouvre la feuille qui le règle.

Il ne fait pas : décider ce qui se montre (l'app : `ComposerSceneSoundTrace.served`, `ComposerSceneReferences`, `StoryAudioIdentity`, `ComposerSoundCredit`) ; la place (l'hôte pose chaque élément) ; le retrait, l'ouverture de la feuille, le menu d'appui long ; le verre (K01) ; les puces de choix (K04) ; Publier (K13) ; la capsule de refus (K14).

## 2. API (iOS, `MeeshyUI/Kit/MeeshyContextLines.swift`)

| Élément | Signature |
|---|---|
| Ligne de son | `MeeshyContextSoundLine(label:title:levels:detail:…action:)` |
| Ligne de références | `MeeshyContextReferenceLine(label:references:…)` |
| Une référence | `MeeshyContextReference(id:text:spokenLabel:systemImage:hint:action:)` |
| Puce | `MeeshyContextChip(label:title:systemImage:…action:)` |
| Énumérés | `MeeshyContextSurface { media, theme }`, `MeeshyContextAlignment { center, leading }`, `MeeshyContextHaptic { light, none }` |
| Lois pures | `MeeshyContextWaveRule.bars(levels:count:)`, `MeeshyContextLinesRule` (loi 13), `MeeshyContextChipFit.showsTitle(titleWidth:available:)`, `MeeshyContextLinesRecipe` |

Paramètres communs, opaques, mêmes défauts partout : `label` (obligatoire, le nom dit), `hint: String? = nil`, `action = nil` (nul : lecture seule, ni bouton ni haptique), `onLongPress = nil` et `longPressLabel`, `haptic = .light`, `surface = .media`, `tint: Color? = nil`.

Ligne de son : `title = ""`, `levels: [Float]? = nil` (nul : pas d'onde ; vide : onde de repli ; sinon relevé linéaire 0…1), `detail: String? = nil`, `systemImage` (la note), `alignment = .center`.

Ligne de références : `references` dans l'ordre de l'hôte, `alignment = .center`, pas d'action propre.

Puce : `title`, `systemImage`, `detail: String? = nil`, `showsChevron: Bool? = nil` (nul : vrai s'il y a une action), `isExpanded: Bool? = nil`, `tone: MeeshyGlassTone? = nil`, `glassTint: Color? = nil` (teinte du verre de K01, celle que portait `audienceChip` ; `tint`, lui, remplace l'encre), `updatesFrequently = false`, `isPressed: Bool? = nil`.

Emplacement `leading` (second init, `@ViewBuilder leading:`) sur la ligne de son et sur la puce, à la place du glyphe ; `MeeshyContextNoLeading` est l'emplacement vide. Les trois vues sont `Equatable` sur leurs valeurs (les fermetures n'y comptent que par leur présence) ; `MeeshyContextReference` aussi. La ligne de références prend aussi `haptic`.

## 3. États

- Ligne de son : note, « titre · auteur », onde (R2, R3, R5, R7, R8, R10, R12, S5, P1 à P4, P6, O1, O14) ; au-dessus d'un contenu réduit (A15) ; grand écran (I1, I2, I4).
- Ligne de références : hashtag et « Avec @… » (R2, R3, R5, P1 à P3, P6, O1, O14) ; un hashtag (R13, A7, A21) ; sous un contenu réduit (A17) ; lieu puis hashtag (A18) ; grand écran (I1, I2, I4).
- Puce : glyphe, libellé, chevron, ton `deep` (R2 et les vues de capture et de scène) ; ton `onLight` (R13) ; ton `plain` hors du contenu (I1, I2, I4) ; `isExpanded` (R9) ; chrono : point rouge, temps à chasse fixe, sans chevron, non touchable (A9, A20).

Loi 13 (`MeeshyContextLinesRule`, fonctions pures) :
- pas de ligne de son sans titre, sans onde et sans durée ; pas d'onde si `levels` est nul ; pas de durée ni de titre vides ;
- pas de ligne de références sans référence au texte non vide ; pas de « · » en tête, en fin ni doublé ;
- pas de chevron, de rôle bouton, de réponse au toucher ni d'haptique sans action ; pas de puce sans titre ni glyphe ;
- pas de verre, de fond ni de capsule sous les lignes ;
- pas d'estompe si tout tient ; une seule trace du son par contenu (hôte).

## 4. Gestes et retours

- Toucher : `action` part une fois, au relâcher, avec un `light` du site unique de K02 (`MeeshyGlassButtonTrigger`, qui joue `HapticFeedback.light()`) ; `haptic: .none` laisse l'hôte jouer le sien ; désactivé (`.disabled`) : ni action ni haptique, opacité de K02. Vaut pour chaque référence.
- Réponse visuelle : la puce prend celle de K01 ; une ligne passe à 70 % d'opacité à l'appui, sans échelle ; 85 % au survol.
- Appui long : `onLongPress` s'il existe (0,5 s, annulé au-delà de 10 pt, modificateurs de K02 `MeeshyGlassLongPress` et `MeeshyGlassLongPressAction`), il avale le relâcher qui le suit et s'annonce comme action nommée `longPressLabel` (sinon le nom de l'élément).
- La ligne de références défile quand elle déborde ; un toucher sans déplacement reste un toucher.
- Apparition, disparition, changement de texte : fondu de 200 ms (`MeeshyContextLinesRecipe.fadeDuration`), posé par l'hôte (`.transition(.opacity)`) ; K24 n'anime que l'appui et le chevron, par `meeshyAnimation` (« réduire les animations » : immédiat).

## 5. Accessibilité

- Ligne de son : un élément, nom = `label`, rôle bouton s'il y a une action, aide = `hint` ; note et onde masquées.
- Ligne de références : groupe nommé `label` ; chaque référence est un élément, nom = `spokenLabel`.
- Puce : nom = `label`, valeur = `title` puis `detail` (`MeeshyContextLinesRule.chipValue`). iOS : `accessibilityValue` ; `isExpanded` vrai : trait `.isSelected`, comme `MeeshySplitActionButton`. Chrono : `.updatesFrequently`, avec ou sans action.
- Cibles de 44 pt par débord, pas par la mise en page (`MeeshyContextHitShape`, loi `MeeshyContextLinesRule.hitRect`) : vers le haut pour le son, vers le bas pour les références, des deux côtés pour la puce dessinée en 36.
- Dynamic Type : le texte grandit jusqu'à 1,5 fois (palier `.xxxLarge`, `MeeshyContextLinesRecipe.maxDynamicTypeSize`), puis s'arrête. Le titre du son se tronque en fin, la durée jamais. Le libellé de la puce qui ne tient pas laisse un disque de 36 à glyphe (`ViewThatFits`) ; sans glyphe, il se tronque.
- RTL : glyphe au début, chevron à la fin, ordre des références inversé ; onde, note et chevron ne se reflètent pas.
- Contraste : plancher 4,5:1 ; le `detail` en `onLight` prend l'encre pleine.

## 5 bis. Performance

- Vues `Equatable` montées `.equatable()` ; fermetures hors comparaison.
- L'onde est calculée une fois par relevé et dessinée en une passe.
- Chrono : seul le texte change, la largeur est tenue par les chiffres à chasse fixe.
- S'anime : l'opacité et la largeur du dégradé d'estompe. Jamais la mise en page.
- Débordement des références : `ViewThatFits` choisit la rangée posée si elle tient, sinon `MeeshyFadingScrollView` de K04 (deux booléens qui ne changent qu'au seuil) ; aucun `GeometryReader` ni état par image dans K24.

## 6. Jetons et mesures

Planche (téléphone de 390) : ligne de son posée 26 au-dessus du bord haut, écart 8, texte 12,5 demi-gras, onde 18 barres (72 × 12) ; ligne de références 8 sous le bord bas (2 sous un contenu réduit), texte 13 demi-gras, glyphe 13 ; puce hauteur 36, rayon 18, marges 12, écart 6, texte 13 demi-gras, glyphe 16, chevron 14.

Jetons : `MeeshySpacing.sm`, `.xsPlus`, `.md` ; `MeeshyControlSize.regular` (36), `.tapTarget` (44) ; `MeeshyFont.smallSize`, `.subheadSize` ; `MeeshyIconSize.sm`, `.md` ; `MeeshyColors.onMedia`, `.onMediaSecondary`, `.onMediaMuted`. Verre de la puce : `.meeshyGlass(in: Capsule(), tone:, tint:, isInteractive:)`. Constantes de l'onde, opacités, plafond 1,5, largeur d'estompe 44 et délai d'appui long : `MeeshyContextLinesRecipe`, nulle part ailleurs.

## 7. Jumeaux (iOS)

K24 promeut le plus complet et ne rebranche ni ne supprime rien dans ce lot. Jumeaux à traiter par les lots d'intégration :
- la ligne de son : `ComposerSoundTraceRow` (`Features/Composer`) ;
- la ligne de références : `ComposerSceneReferenceFooter` ;
- la puce : `audienceChip` (`MeeshyComposerHost+Socle.swift`).

Supprimés par les lots d'intégration I2, I4, I7, I10 (voir le registre).

## 8. Témoins

- Comportement : `MeeshyContextLinesTests` (lois, recette et vecteurs, cible par débord, contraste calculé, égalité des vues, gardes de source), `MeeshyKitCatalogEntryTests` (existant).
- Instantanés : `MeeshyContextLines/<id>.<variante>` (`son`, `son-vocal`, `references`, `references-lieu`, `references-debord`, `puce`, `puce-claire`, `puce-hors-scene`, `puce-chrono`, `puce-disque`, `theme`, en clair et sombre, `presse` pour ce qui se touche ; planches `grande-police` et `rtl` ; `-dessine` pour les puces) : `MeeshyContextLinesSnapshotTests`, images enregistrées par `sdk-tests.yml` (`record_snapshots`).
- Parité : `docs/product/kit/K24-MeeshyContextLines.vectors.json`.
- Catalogue : entrée K24 dans `MeeshyKitCatalog+K24.swift`.

## 9. Choix retenus

Trois composants frères sans conteneur ; lignes centrées par défaut ; onde de la planche (18 barres, plancher 2) dessinée depuis `levels` ; encre des médias par défaut ; références en une ligne de segments séparés par « · », chacun bouton de sa feuille ; débordement : défilement et estompe ; cible de 44 par débord ; puce dessinée en 36 avec verre K01 ; libellé qui ne tient pas : disque à glyphe ; chrono de capture : la même puce ; appui long comme K02 ; l'annonce du son du lecteur n'est pas absorbée ; les puces sonores de la scène ne sont pas des jumeaux ; web et Android après iOS.
