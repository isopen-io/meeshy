# K25 — MeeshyDragTargets (les deux cibles du glisser : dupliquer en haut, retirer en bas)

Relevé sur `origin/dev` `a4d3e0f9e80` le 2026-11-14. Chantier #17312, milestone 258 ; issue du lot : #18341. Dépend de K00 et K01 ; lit la recette de K02 sans la modifier. Lois 6 et 13 de `docs/product/composer-vue-finale.md`. Planche : `dropZone(k,label,y,o)` (ligne 252), `finger` (260) ; vues O3 (328), O12 (329), O13 (330), C3 (368).

## 1. Rôle
Pendant qu'on glisse un élément, deux disques de verre apparaissent, la duplication en haut et la poubelle en bas ; celui que le doigt survole grossit, et lâcher dessus appelle l'hôte.

Il ne fait pas :
- le geste (appui long, glisser, pincer), le déplacement de l'objet, sa sortie hors de la scène : `StoryCanvasUIView+Gestures.handlePan`, `ComposerCanvasSurface`, `routes/story-compose-stage.tsx` ;
- la copie (identifiant, décalage, rang, plafond) ni le retrait et son pas d'annulation : `StoryComposerViewModel.duplicateElement` / `deleteElement`, `StorySceneDuplicate`, `StoryComposerObjectCopies`, `withTextDuplicated` ;
- le retrait de l'en-tête, de la pilule (K10 `stowed`) et des rails, leur retour, la sélection de la copie (O13) : l'hôte ;
- le halo et les repères (K23), le menu (K18), la capsule d'un refus (K14), les textes traduits ;
- le doigt de la planche, qui est une annotation.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyDragTargets.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-drag-targets.tsx` |
|---|---|---|---|
| Cible | `enum MeeshyDragTarget { duplicate, remove }` | `enum class` identique | `'duplicate' \| 'remove'` |
| État tenu par l'hôte | `@MainActor final class MeeshyDragTargetsState: ObservableObject` | `@Stable class`, `rememberMeeshyDragTargetsState()` | `useMeeshyDragTargetsState()` |
| Pilotage | `begin()`, `move(to: CGPoint)`, `@discardableResult end() -> MeeshyDragTarget?`, `cancel()` ; lus : `isActive`, `hovered` | idem (`Offset`) | idem (`{ x, y }`) |
| Vue | `MeeshyDragTargets(state:topSlot:bottomSlot:labels:tone:haptic:duplicateGlyph:removeGlyph:onDuplicate:onRemove:)` | `MeeshyDragTargets(state, labels, modifier, topSlot, bottomSlot, tone, haptic, duplicateGlyph, removeGlyph, onDuplicate, onRemove)` | `<MeeshyDragTargets state labels topSlot bottomSlot tone haptic duplicateGlyph removeGlyph onDuplicate onRemove />` |
| Objet glissé (aide pour l'hôte) | `.meeshyDragged(over: MeeshyDragTarget?)` | `Modifier.meeshyDragged(over)` | `meeshyDraggedStyle(over)` |
| Loi et recette | `MeeshyDragTargetsRule.hovered(finger:centers:previous:)`, `MeeshyDragTargetsRecipe` | idem | `meeshy-drag-targets-recipe.ts`, `styles/kit-drag-targets.css` |

Paramètres opaques, mêmes défauts :
- `move(to:)` reçoit le DOIGT en coordonnées de fenêtre (`location(in: nil)`, `positionInWindow`, `clientX/Y`) ; le point n'est jamais publié.
- `onDuplicate`, `onRemove : (() -> Void)? = nil` : les deux rappels. Une cible existe si et seulement si son rappel est passé. `end()` appelle le rappel de la cible survolée, de façon synchrone, puis la rend ; l'hôte lit ce retour pour ne pas valider le déplacement.
- `topSlot`, `bottomSlot : CGRect? = nil`, dans l'espace de la vue : le rectangle laissé par l'en-tête et celui laissé par la pilule. La duplication s'aligne sur le bord haut de `topSlot`, la poubelle se centre dans `bottomSlot`, toutes deux sur leur milieu horizontal. `nil` : à `MeeshySpacing.lg` des bords sûrs.
- `labels: MeeshyDragTargetsLabels(duplicate, duplicateHot, remove, removeHot)`, obligatoires et non vides, traduits par l'hôte.
- `tone: MeeshyGlassTone? = nil` (celui de l'hôte) ; `haptic = medium` (`none` : l'hôte joue le sien).

Emplacements : `duplicateGlyph` et `removeGlyph`. iOS offre l'init de commodité aux symboles `plus.square.on.square` et `trash` (`MeeshyGlassButtonSymbol`). Rien d'autre : pas de légende, pas de troisième cible.

## 3. États
- Aucun glisser : O1, C3. Rien dans l'arbre.
- Glisser, aucune cible survolée : O3. Deux disques de verre dense, glyphe blanc.
- Poubelle survolée : O12. Disque ×1,25, rouge, anneau ; l'objet à 0,57 et 75 % (l'hôte, par l'aide) ; la duplication reste au repos.
- Duplication survolée : sans vue. Disque ×1,25, blanc, glyphe sombre, anneau ; objet inchangé.
- Lâché sur la poubelle : suite de O12. Rappel, fondu de sortie ; l'hôte retire, ↶ ramène.
- Lâché sur la duplication : O13. Rappel, fondu de sortie ; l'hôte pose la copie un rang au-dessus, la sélectionne, rend l'original à sa place.
- Lâché ailleurs, ou annulé : retour à O1. Fondu de sortie, aucun rappel.
- Une seule cible offerte ; ton `onLight` (scène claire sous la duplication) ; grand écran : sans vue.
- « Réduire les animations » ; « réduire la transparence » (fond plein de K01) ; contraste accru.

Loi 13 : aucune cible hors d'un glisser ; aucune cible sans rappel, jamais grisée ; ni légende, ni compteur, ni confirmation ; rien pendant un geste à deux doigts (O11) ni pendant la frappe ; la poubelle et la pilule ne sont jamais visibles ensemble une fois les fondus finis.

## 4. Gestes et retours
- K25 ne prend aucun toucher (`allowsHitTesting(false)`, aucun `pointerInput`, `pointer-events: none`) : le doigt appartient au geste de l'hôte, qui appelle `begin()` quand SON glisser à un doigt est reconnu, `move` à chaque événement, `end()` au lâcher, `cancel()` à l'annulation ou au second doigt.
- Capture : entrée quand le doigt est à 37,5 pt ou moins du centre (le rayon du disque chaud), sortie au-delà de 43,5 pt (le bord de l'anneau). Pas de battement à la frontière.
- Haptique : un `medium` à chaque ENTRÉE dans une cible, rien à la sortie, rien en continu, rien au lâcher, par le site unique (`HapticFeedback.medium()`, `rememberMeeshyHaptics().medium()`, `impact('medium')` de `lib/view/haptics.ts`).
- Animations : apparition en fondu et échelle 0,8 → 1, 200 ms ; passage au chaud par ressort (réponse 0,3, amorti 0,7) sur l'échelle et fondu enchaîné du fond, 150 ms ; sortie 150 ms.
- « Réduire les animations » (`MeeshyMotion.shouldReduce`, `LocalReduceMotion`, `prefers-reduced-motion`) : fondus seuls, l'état chaud se pose d'un coup, l'objet ne rétrécit pas par animation.

## 5. Accessibilité
- Nom : `labels.duplicate` et `labels.remove` au repos (« Déposer ici pour dupliquer », « Déposer ici pour retirer »), `…Hot` quand la cible est survolée (« Lâcher pour retirer »). Rôle : image nommée, comme la planche (`role="img"`) ; jamais un bouton, jamais focalisable.
- Valeur : l'entrée dans une cible est annoncée une fois (annonce VoiceOver et TalkBack, région `aria-live="polite"` sur le web) avec le nom chaud.
- Équivalent sans glisser : Dupliquer et Retirer vivent dans le (…) de la pilule (K18) et dans le rail « Sélection » (I2). Lecteur d'écran actif : l'hôte ne range pas la pilule (règle de K10) et n'ouvre pas les cibles.
- Ordre de lecture : duplication puis poubelle, après les objets de la scène.
- Dynamic Type, fontScale : disque et glyphe en points, figés. Zoom du navigateur : ils suivent la page.
- Clavier et focus (web, iPad) : aucun arrêt de tabulation ; un déplacement aux flèches n'ouvre pas les cibles.
- RTL : disposition verticale et centrée, aucun miroir, glyphes non retournés.
- Contraste, par les recettes de K01 et K02 : repos sur verre dense 6,12:1 (5,07:1 en `onLight`) ; glyphe sombre sur blanc 15,99:1 ; glyphe blanc sur rouge 3,76:1 (glyphe de 26 pt, seuil 3:1). Sur le web, « réduire la transparence » rend le fond plein de K01.

## 5 bis. Performance
- Le point du doigt ne traverse aucun état observable : `move` fait deux distances et ne publie `hovered` qu'à ses transitions. Cent `move` sans changement de cible = zéro re-rendu, de K25 comme de l'hôte.
- Les cadres des disques se mesurent à l'apparition et au changement de mise en page, jamais par mouvement.
- S'animent : l'échelle et l'opacité (`transform`, `opacity`), sur le disque plein. Le disque de verre ne change pas de taille : le flou n'est jamais recalculé. Aucune propriété de mise en page.
- Ni minuteur ni observateur global ; rien dans l'arbre hors glisser ; rien de retenu une fois démonté.
- Budget : aucune image perdue pendant le geste, 60 et 120 Hz, scène de 50 objets.

## 6. Jetons et mesures
Dans `MeeshyDragTargetsRecipe` et nulle part ailleurs :
- repos : verre de K01, `density: dense`, non interactif, ton de l'hôte ; encre `MeeshyColors.onMedia` ;
- chaud : fond et encre de `MeeshyGlassButtonRecipe` en tenue `active` (blanc 94 %, encre `indigo950`) pour la duplication, `destructive` (`MeeshyColors.errorStrong`, verre teinté rouge sous Liquid Glass) pour la poubelle ; anneau `MeeshySpacing.xsPlus` (6) de la couleur du fond à 30 % ; ombre de la surface K01 ;
- constantes sans jeton, tirées de la planche : diamètre 60, échelle chaude 1,25 (75), glyphe 26, objet au-dessus de la poubelle 0,57 (64 sur 112) et 75 % ;
- durées 200 / 150 ms, ressort 0,3 / 0,7 ; rayons de capture 37,5 et 43,5.

Mesures de la planche (390 × 844) : duplication à y = 84, soit le bord haut de l'en-tête (✕ et ↶ ↷ à 84) et 14 sous le haut de la scène (70) ; poubelle à y = 756, dans la pilule (752 à 816 ; centrée, K25 la pose à 754) ; toutes deux à x = 50 %.

Parité : `docs/product/kit/K25-MeeshyDragTargets.vectors.json` (emplacements → centres ; suites de points → `hovered` et haptiques attendus, hystérésis comprise ; issues de `end` et de `cancel`), lu par les trois suites.

## 7. Jumeaux
Aucun jumeau à absorber : recherché sur les trois plateformes (cible de dépôt, zone de corbeille, glisser pour supprimer), rien ne dessine de cible pour un objet glissé. K25 crée, sans rien brancher ni supprimer.
- iOS, restent hors K25 : `ComposerSlideRail` et `ComposerSlideRowJiggle` (réordonner les scènes, K20), `SectionDropDelegate` et la pastille d'en-tête de section (glisser-déposer système de la liste), `ComposerDropTargetModifier` (dépôt de fichiers), la corbeille de `ComposerSelectionActions` (K10, K18).
- Android, restent hors K25 : `ComposerSlideRail` (K20), `ConversationDragDrop.sectionDropTarget`, `ComposerDropTarget` (fichiers).
- Web, restent hors K25 : `composer-drop-veil` et `use-window-file-drop` (fichiers), `use-tile-drag` (tuiles d'appel), `notification-swipe` (balayage). `call-glass-button`, `call-control-pill`, `glass-surface`, `sheet`, `composer-*`, `scene-*`, `story-*` : aucune cible de dépôt.
- Adoption : I5 (composer : le geste du canvas appelle l'état, l'objet suit le doigt hors de la scène, la pilule se range), puis I9 (retouche, C3).

## 8. Témoins exigés
Comportements (`MeeshyDragTargetsTests`, `MeeshyDragTargetsTest`, `meeshy-drag-targets.test.tsx`) : vecteurs de la loi (entrée, sortie, hystérésis, point non fini) ; inactif = rien dans l'arbre ; une cible par rappel passé, aucune sans rappel ; `end()` sur la poubelle appelle `onRemove` une fois et rend `remove` ; sur la duplication, `onDuplicate` et `duplicate` ; ailleurs, aucun rappel et `nil` ; `cancel()` n'appelle rien ; un `medium` par entrée, aucun à la sortie, au lâcher, ni avec `none` ; cent `move` à cible égale = zéro re-rendu ; aucun toucher capté ; placement par `topSlot` et `bottomSlot`, et par défaut ; noms au repos et au chaud, annonce à l'entrée, aucun élément focalisable ; pas de miroir en RTL ; rien d'animé sous « réduire les animations » ; contraste calculé ; garde de source (aucun code de couleur, aucun type du composer, aucun singleton).

Instantanés (`MeeshyDragTargets/<id>.<variante>`) : `glisse` (O3), `poubelle-chaude` (O12), `duplication-chaude`, `poubelle-seule`, `scene-claire`, en `clair` et `sombre`, planches `grande-police` et `rtl` ; iOS : suffixes `-iOS26` et `-dessine` ; web à 390, 820 et 1440. Enregistrés par la CI, jamais posés à la main.

Catalogue : entrée K25 (`MeeshyKitCatalog+K25.swift`, `KitCatalogK25.kt`, `catalog/k25.tsx`, vides sur `dev`), avec un objet de démonstration qu'on glisse vraiment ; `check-kit.mjs` et les gardes de registre restent vertes.

Preuve : gardes locales vertes et CI de la branche (Android : `android.yml` seul) ; si les runs de branche sont annulés, le lot fusionne dans `dev` et se prouve sur `dev`, corrigé ou retiré aussitôt s'il y est rouge.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Aucune cible n'existe sur les trois plateformes ; la planche du 2026-11-09 les demande.
- iOS borne le centre de l'objet à la scène (`clamp`) : il ne peut pas atteindre la poubelle, posée sous la scène.
- Loi 6 : l'appui long commence le glisser. iOS glisse sans attendre, Android ouvre un menu à l'appui long, le web a un seuil de 6 px et un menu d'appui long.
- Copie : la planche la pose un rang au-dessus de l'original, décalée de 26 px ; iOS l'ajoute en fin de famille ou la passe devant, décalée de 20 px de design ; le web ne duplique que le texte.
- Planche : repos sombre à 60 % avec liseré 30 % ; chaud à 96 % ; rouge `#E5484D` ; K01 dense vaut 66 %, K02 94 % et `errorStrong`.
- Diamètre 60 : hors des quatre tailles de K02.
- La planche ne montre ni la duplication survolée, ni le glisser sur grand écran, ni sur la retouche, ni sur scène claire.

Choix retenus (mode autonome ; l'alternative entre parenthèses) :
1. K25 crée le composant sans le brancher ; I5 puis I9 le branchent. (Brancher dès K25.)
2. La capture suit le doigt, en coordonnées de fenêtre. (Le centre ou la boîte de l'objet.)
3. Un état piloté par l'hôte, `begin` / `move` / `end` / `cancel` ; le point n'est jamais publié. (Paramètre `finger` re-rendu à chaque mouvement ; geste possédé par K25.)
4. `end()` appelle le rappel de façon synchrone et rend la cible. (Rappels seuls ; retour seul.)
5. Une cible existe si son rappel est passé, jamais grisée ; au plafond d'objets, l'hôte garde la duplication et dit le refus par K14. (Masquer au plafond ; griser.)
6. Placement par deux emplacements, l'en-tête et la pilule. (Marge de 14 sous le haut de la scène ; positions d'écran fixes.)
7. Disque de 60 tenu par la recette de K25, fonds chauds lus dans K02, repos par K01 dense. (Cinquième taille de K02 ; valeurs brutes de la planche.)
8. Entrée à 37,5 pt, sortie à 43,5 pt. (Rayon de repos de 30 ; marge de 44 ; sans hystérésis.)
9. Un `medium` à chaque entrée, les deux cibles. (`light` ; un retour par cible ; un retour au lâcher.)
10. Duplication survolée : disque blanc, objet inchangé. Poubelle : rouge, objet à 0,57 et 75 %, appliqués par l'hôte. (Objet réduit aussi sur la duplication ; couleur de marque.)
11. Glyphes en emplacements, 26 pt. (Glyphes figés dans le kit ; jeton 28.)
12. Quatre noms passés par l'hôte ; cibles en images nommées, annoncées à l'entrée. (Boutons focalisables ; textes dans le kit.)
13. Lecteur d'écran actif : pas de cibles, les actions passent par K18. (Cibles focalisables agissant sur la sélection.)
14. Grand écran : mêmes cibles, emplacements de l'en-tête et de Publier sous la scène. (Le rail « Sélection » comme zone de dépôt.)
15. Second doigt : l'hôte annule, les cibles sortent. (Garder les cibles pendant le pincement.)
16. Rang et décalage de la copie, départ à l'appui long, sortie de l'objet hors de la scène : hors de K25, à I5, en gardant les règles du code. (Les fixer ici.)
