# K12 — MeeshyEdgeRails (les rails d'actions des bords)

Relevé sur `origin/dev` `7c6fe22812` le 2026-11-12. Chantier #17312, milestone 258. Dépend de K00, K01, K02 (fusionnés sur les trois plateformes). Lois 3 et 15 de `docs/product/composer-vue-finale.md`, plus 13 et 19. Planche : `rail()` (l. 215), `rails()` (216), `rl()` (272), `rlH()` (275), `ipadL()` (276) ; styles `.rail` (46) et `.rl` (104 à 110). Vues : R3 (rails courts), I1 (libellés), I2 (« Sélection », pied ↶ ↷), I3 (grisés), I4 (étroits). `camRail()` (A8) dessine la même capsule avec un filet.

## 1. Rôle
Deux rails verticaux de verre, au bord de début et au bord de fin d'un conteneur : courts et sans texte quand ils sortent à la demande et se rangent par leur bord, libellés avec un en-tête quand la place existe et qu'ils restent sortis.

Il ne fait pas :
- le verre, le ton, la réponse au toucher : K01 ; le disque d'un bouton : K02 ;
- le choix des actions, leur ordre, leurs mots, ce qui passe derrière « Plus » : l'app (`ComposerLabeledRailLayout`, `CallActionSet`, `studio-scene-columns.ts`) ;
- la décision « courts ou libellés » : `ComposerSceneArrangement` (app, place libre autour du 9:16, jamais la classe de taille) ;
- l'état du (…), le toucher qui range tout (loi 5), l'estompage automatique des commandes d'un appel ;
- ce qu'il faut laisser libre (pilule, ma vignette, colonne du journal) : l'hôte le passe en nombres ;
- Coller (bouton système, loi 19), un menu ou une feuille ouverts par une rangée, Publier sous la scène (K13) ;
- les rails sociaux des lecteurs (compteurs, légendes), la rangée des scènes (K20), la bande des looks (K19).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyEdgeRails.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-edge-rails.tsx` |
|---|---|---|---|
| Les deux rails | `MeeshyEdgeRails(leading:trailing:…onAction:)` | `MeeshyEdgeRails(leading, trailing, onAction, modifier, …)` | `<MeeshyEdgeRails leading trailing onAction … />` |
| Un rail seul, posé par l'hôte | `MeeshyEdgeRail(spec:side:…)` | idem | `<MeeshyEdgeRail>` |
| Dessin d'une rangée (libellé d'un `Menu`) | `MeeshyEdgeRailRowFace` | idem | `<MeeshyEdgeRailRowFace>` (`span`) |
| Contenu d'un rail | `MeeshyEdgeRailSpec` | `@Immutable data class` | type `readonly` |
| Entrée | `MeeshyEdgeRailEntry { item, divider, custom(id) }` | `sealed interface` | union |
| Présentation | `MeeshyEdgeRailsPresentation { compact, labeled(MeeshyEdgeRailWidth) }` | idem | `'compact' \| { labeled: 'regular' \| 'narrow' \| 'tight' }` |
| Visibilité | `MeeshyEdgeRailsVisibility { shown, dimmed, hidden }` | idem | `'shown' \| 'dimmed' \| 'hidden'` |
| Lois pures | `MeeshyEdgeRailsRecipe`, `MeeshyEdgeRailsPresence` | idem | `meeshy-edge-rails-recipe.ts` |

Paramètres, tous opaques, mêmes défauts partout :
- `leading`, `trailing : MeeshyEdgeRailSpec? = nil` ; un rail sans entrée n'existe pas ;
- `MeeshyEdgeRailSpec` : `name` (nom accessible du groupe, obligatoire), `header: String? = nil` (affiché en libellé seulement), `entries`, `foot: [MeeshyEdgeRailItem] = []` (pied épinglé, disques K02 doux) ;
- `MeeshyEdgeRailItem` : `id` stable, `label` (la phrase lue), `title: String? = nil` (le mot court affiché en libellé ; défaut `label`, et `label` doit le contenir), glyphe (`systemImage` / `icon` / `glyph`), `isOn = false`, `role { normal, destructive } = normal`, `activation` (celle de K02), `value`, `hint`, `showsCarriedDot = false`, `isEnabled = true`, `isDimmed = false` (estompé mais touchable), `longPressLabel: String? = nil` ;
- `presentation = compact` ; `MeeshyEdgeRailWidth { regular 210, narrow 150, tight 112 }` ;
- `visibility = shown` ; `tone: MeeshyGlassTone? = nil` (celui de l'hôte, par K01) ;
- `edgeInset = 10`, `safeInset = 0`, `leadingClearance`, `trailingClearance : MeeshyEdgeRailClearance(top, bottom, inline) = zéro` ;
- `onAction: (id) -> Void`, `onLongPress: ((id) -> Void)? = nil` ; web : `id` (cible d'`aria-controls`), `restoreFocusTo`, `data` (sondes des gates).

Emplacement : `custom(id, presentation)`, une cellule 44 × 44 en court, une rangée de 44 de haut en libellé. Il reçoit Coller (`PasteButton`) et toute rangée que l'hôte enveloppe dans un menu (« Plus », le son) avec `MeeshyEdgeRailRowFace`. K12 ne porte aucune chaîne traduite.

## 3. États
- Courts, sortis : deux capsules centrées dans leur bande, Coller en tête du rail de début — R3.
- Courts, rangés : rien dans l'arbre une fois la sortie jouée — R1, R2.
- Court, un bouton allumé (disque blanc de K02) : `rail()` le prévoit (`o.on`), aucune vue ; conservé des appels (Caméra, Sous-titres).
- Court, un seul rail, ou un filet entre deux groupes : A8 (rail du viseur) ; appels quand une famille est vide.
- Court sur contenu clair : ton `onLight` de K01 ; `rail()` le prévoit, aucune vue.
- Court trop haut : il défile, ses bords cachés s'effacent en fondu ; aucune vue, conservé des appels (paysage).
- Libellés 210 : en-tête, huit rangées glyphe + mot — I1.
- Libellés 150 : mêmes listes, corps 14 — I4.
- Libellés 112 : mot sur deux lignes au plus ; aucune vue, conservé du code (téléphone couché, Split View).
- Libellé « Sélection » : Retirer en dernier, en rouge, pied ↶ ↷ sous un filet — I2.
- Rangée allumée : fond blanc, encre sombre (`.rl .it.on`) ; aucune vue.
- Grisés : opacité 42 %, inertes, à leur place — I3.
- Pressé, survolé, focus clavier, rangée désactivée (40 %), entrée estompée (`isDimmed`, appel en attente sur Android), pastille « porte déjà » : aucune vue, conservés du code.

Loi 13 :
- pas de capsule vide ; pas de pied sans bouton (↶ ↷ sans historique) ; pas d'en-tête ni de mot en court ; jamais de légende sous un disque ;
- pas de filet en tête, en queue ou doublé ; pas de pastille sans `value` ; pas de fondu de bord quand tout tient ;
- un rail ne s'étire jamais au-delà de ses boutons ;
- pas de Coller si l'hôte ne donne pas l'entrée ; pas de (…) dans « Sélection » ;
- téléphone : `hidden` pendant l'écriture, un geste sur un objet, un mode plein écran, et au viseur (seul le rail du viseur reste) ; grand écran : `dimmed` dans un mode plein écran. L'hôte décide, K12 exécute.

## 4. Gestes et retours
- Toucher : `onAction(id)` une fois, au relâcher dans la cible. Appui long : seulement si `longPressLabel` existe (0,5 s) ; le toucher qui le suit est avalé.
- Sortie et rangement (court) : translation depuis le bord du rail (largeur + `edgeInset` + `safeInset`) et opacité, rien d'autre, interruptible, 300 ms. Un rail qui repart répond au toucher jusqu'au bout, puis se démonte en gardant sa dernière liste le temps de sortir.
- Libellés : jamais de translation. `shown` ↔ `dimmed` ↔ `hidden` est un fondu d'opacité de 180 ms ; la place reste.
- « Réduire les animations » : fondu de 150 ms, rien ne se déplace. Sur le web, il est joué par Web Animations, que la feuille qui coupe les transitions n'éteint pas.
- Réponse au toucher : disques, celle de K02. Rangée libellée : voile d'appui de la recette de K02 (12 → 22 %), sans échelle ; allumée, 94 → 78 %.
- Haptique : `light` à l'action, `medium` à l'appui long reconnu, par le site unique (`HapticFeedback`, `MeeshyHaptics`, `impact()` de `lib/view/haptics.ts`). Rien à la sortie des rails ni sur une entrée désactivée.
- Défilement vertical dans un rail trop haut ; le pied ne défile jamais. Aucun balayage ne range un rail.
- Changement d'état d'une rangée : fondu enchaîné fond et encre, 200 ms, immédiat sous « réduire les animations ».

## 5. Accessibilité
- Groupe : nom = `name` (« Ce qu'on pose », « La scène et la publication », « Ajouter », « Scène », « Sélection », « Mon image », « L'appel »). iOS : conteneur nommé ; Android : `isTraversalGroup` ; web : `role="toolbar"`, `aria-orientation="vertical"`, `aria-labelledby` l'en-tête en libellé.
- En-tête : texte en casse normale, capitales par le style, trait de titre.
- Entrée : nom = `label`, rôle bouton, glyphe masqué. `isOn` : `.isSelected`, `selected`, `aria-pressed`. `value` s'ajoute, la pastille est masquée. Appui long : action nommée.
- Ordre de lecture : rail de début puis rail de fin ; dans un rail, en-tête, entrées de haut en bas, pied.
- `hidden` : retiré du lecteur d'écran dès la demande. `dimmed` : hors lecteur d'écran et hors focus (`inert` sur le web).
- Cible : 44 pt, 48 dp, 44 px. En court, pas de 50 entre deux disques de 44, la cible déborde le disque.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : glyphes figés ; le mot passe à deux lignes, la rangée grandit, le rail défile ; Large Content Viewer en court (K02). Aux tailles d'accessibilité l'hôte revient au court (loi existante). Web en `rem` ; à 400 % les rails courts tiennent sur 320 px.
- Web, clavier : chaque bouton au Tab ; ↑ ↓ vont au voisin en boucle, Début et Fin aux bouts ; Entrée et Espace activent ; anneau `:focus-visible` de K01 ; un rail qui se démonte avec le focus le rend à `restoreFocusTo`.
- RTL : début et fin s'échangent, la translation se retourne, le glyphe reste du côté de début de sa rangée.
- Contraste : témoin calculé depuis la recette, 4,5:1 au moins pour mot et en-tête. Rail libellé sur le plateau sombre, estimé sur les teintes de la planche : mot environ 19:1, en-tête à 75 % environ 10:1, Retirer environ 10:1 ; rangée allumée 15,99:1 (K02). Rail court sur la scène : ton échantillonné par K01, `onLight` sur scène claire, opaque sous « réduire la transparence ».

## 5 bis. Performance
- Ne se re-rend jamais : un rail quand la scène, l'autre rail ou la pilule changent ; les voisins d'une entrée pressée. iOS : spec `Equatable`, rappels par `id`, `.equatable()`. Android : paramètres stables, translation et opacité lues en phase de dessin. Web : `memo`, `:active` et `:hover` en CSS, un seul état (la présence).
- S'anime : `transform` et `opacity` (entrée, sortie, grisé), l'opacité du fond d'une rangée. Jamais le flou, l'ombre, la largeur ni la mise en page ; passer de 210 à 150 est sec.
- Un verre par rail (K01) ; les disques dedans n'en dessinent pas en verre dessiné. Le fondu de bord est un masque sur ce qui défile, jamais sur le verre.
- Budget : R3, quatorze boutons qui entrent sans image perdue, bouton touchable pendant le mouvement. Démonté : ni minuteur, ni animation, ni écouteur retenu. Web : poids mesuré par `measure-weight.mjs`.

## 6. Jetons et mesures
Planche, rail court : disques de 44 (K02), écart 6 (`MeeshySpacing.xsPlus`), marge 5, largeur 54, capsule ; longueur `n × 44 + (n − 1) × 6 + 10` (six : 304, sept : 354) ; filet 1 pt à 28 % de blanc, retrait 8 ; à 10 du bord de la scène (26 du bord de l'écran) ; centré sur le milieu de la scène.

Planche, rail libellé : marge 10 (`smPlus`), 8 en étroit (`sm`) ; rayon 26 ; écart 4 (`xs`) ; rangée de 44 (`MeeshyControlSize.tapTarget`, 48 dp sur Android), rayon 22 (`MeeshyRadius.xlPlus`), glyphe 20 (`MeeshyIconSize.xl`) dans un carré de 44, écart glyphe-mot 10 (4 en étroit), retrait de fin 12 (`md`) ; mot semi-gras 15 (`bodySize`), 14 en étroit (`labelSize`), 12 en serré (`smallSize`) ; en-tête 12 très gras, interlettrage 0,08 em, blanc à 75 %, retraits 4 / 10 / 6 ; pied : filet blanc 14 %, marge 6, retrait 8, deux doux de 44 écartés de 6 ; longueur `46 + n × 44 + (n − 1) × 4 + pied` (huit rangées : 426) ; grisé 0,42 ; à 40 de la scène en paysage, centré dans son couloir en portrait.

Jetons : encre `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ; rangée allumée blanc plein et `indigo950` ; Retirer `MeeshyColors.errorSoft`, `MeeshyPalette.ErrorSoft`, `--color-error-soft`. Les valeurs sans jeton (5, 26, 54, 210, 150, 112, 0,42, 75 %, 14 %, 28 %, 300 / 180 / 150 ms) vivent dans `MeeshyEdgeRailsRecipe`, nulle part ailleurs. Aucun `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*` dans les fichiers de K12.

Lois de la recette : `length(count, dividers)`, `labeledLength(count, foot)`, `labeledWidth(lane)` (210 dès 250 de couloir, 150 dès 166, sinon 112), `slideOffset(side, isRightToLeft, edgeInset, safeInset)`, `capacity(height)`, `scrolls(length, band)`.

## 7. Jumeaux
K12 ne rebranche et ne supprime aucun jumeau : il promeut la capsule, le mouvement et la rangée des plus complets.
- iOS. DEVIENT : la capsule et le mouvement du duo des appels (`actionRail`, `positionedRail`, `CallRailStow`, `CallRailSlide` de `CallView+Rails.swift` ; géométrie et `slideOffset` de `CallRailsLayout`, `CallRailSide`) ; pour le libellé, `ComposerLabeledRailRow`, l'en-tête et le pied de `ComposerSelectionRail`, le cadre de `ComposerSceneRailsLayer`.
- iOS, supprimés : par I1, ces quatre vues et les constantes de `CallRailsLayout` (`bottomClearance` reste à l'app) ; par I2, la colonne `toolColumn` de `ComposerSceneOverlayChrome`, `ComposerRailCard`, `ComposerFloatingRailInk`, `ComposerRailGlyphRelief` ; par I5, `ComposerTrailingRail` et `ComposerObjectEditorRail` (leur contenu va à la pilule d'objet) ; par I8, `ComposerSceneRailsLayer`, les vues `ComposerLabeledRail`, `ComposerLabeledRailRow`, `ComposerSelectionRail`. Restent à l'app : `ComposerSceneArrangement`, `ComposerSceneRailsInsets`, `ComposerLabeledRailLayout`, `CallControlsDisposition`.
- Android. DEVIENT : `CallActionRails`, `CallActionRailSlot`, `CallActionRail`, `callScrollEdgeFade` (`:feature:calls`), `CallRailsLayout` et `CallRailSide` (`:core:model`) ; pour le libellé, `LabeledRailItem` et l'en-tête de `StoryEditingRail`.
- Android, supprimés : par I1, `CallActionRails.kt` et la géométrie de `CallRailsLayout` ; par I2, `SceneRail`, le `Rail` privé de `ComposerPlateau`, la colonne de `StoryRailButton` ; par I5, `ComposerEditingRail`, `ComposerBackgroundRail`, `ComposerBackgroundEditRail` ; par I8, `StoryLeadingRail`, `StoryTrailingRail`, `StoryEditingRail`, `LabeledRailItem` ; par I9, `RetouchRail` (la retouche n'a pas de rail, loi 17). Restent : `ComposerSceneArrangement`, `ComposerLabeledRail` (modèle), `CallControlsDisposition`, `CallCameraRail` (loi du zoom).
- Web. DEVIENT : `CallRails` et `SlidingRail` (`components/call-rails.tsx`), la capsule `CallActionRail` (`call-control-actions.tsx`), `useRailPresence`, `useRailFade`, `railLength`, le pas vertical de `call-row-keys.ts`. Aucun jumeau libellé : il se porte depuis iOS.
- Web, supprimés : par I1, `call-rails.tsx`, `CallActionRail`, `railLength` (`railsClearance` reste, il nourrit `trailingClearance`) ; par I2, `StudioLeadingRail` (`routes/story-compose-rail.tsx`) et la colonne de `routes/use-studio-scene-columns.tsx` ; par I5, les tuiles légendées `StudioTile` des options d'objet. I8 construit la loi d'arrangement et les rails libellés, absents du web.
- Non absorbés : `FullscreenActionRail` et `FullscreenActionButton` (iOS, Android), `AudioFullscreenActionRail`, `story-action-rail.tsx` (rails sociaux à compteurs, I10) ; `ComposerToolRow` (rangée horizontale, K10) ; `ComposerSlideRail` (K20) ; `ComposerLookRail` (K19) ; `story-rail.tsx` et `rail-tile.tsx` (le plateau des stories, homonyme).

## 8. Témoins exigés
Comportements (`MeeshyEdgeRailsTests`, `MeeshyEdgeRailsTest`, `meeshy-edge-rails.test.tsx`) :
- recette : longueurs court et libellé, largeur élue par couloir, capacité, translation par côté et par sens de lecture ;
- un rail mesure exactement sa longueur, jamais plus ; trop haut, il défile et le pied reste ;
- spec nil ou vide : aucun rail ; filets de tête, de queue et doublés retirés ; pied absent sans bouton ;
- présence : monté à la demande, à sa place une image plus tard, démonté après la sortie, dernière liste gardée pendant la sortie, action servie pendant la sortie ;
- « réduire les animations » : aucune translation, fondu de 150 ms ;
- `dimmed` : 0,42, ni action, ni focus, ni lecteur d'écran ; `hidden` en libellé : la place reste ;
- `onAction(id)` une fois ; un `light` par le site unique ; appui long : `medium`, `onLongPress(id)`, toucher suivant avalé ; rien si désactivé ;
- nom du groupe, en-tête en titre, nom / rôle / valeur d'une entrée, `isOn`, ordre de lecture, `label` contient `title` ;
- web : ↑ ↓ Début Fin, `aria-orientation`, focus rendu au démontage, `id` porté seulement tant que demandé ;
- RTL : côtés échangés, translation retournée ; contraste calculé depuis la recette ;
- garde de source : aucun verre dessiné ni chaîne traduite dans K12 ; `glass-site.mjs` et `check-kit.mjs` verts ;
- parité : `docs/product/kit/K12-MeeshyEdgeRails.vectors.json`, lu par les trois suites (rangée 44 / 48 / 44) ; non-régression : aucun jumeau ni écran touché.

Instantanés (`MeeshyEdgeRails/<id>.<variante>`) : `compact` (R3), `compact-coller`, `compact-actif`, `compact-clair`, `viseur` (A8), `defile`, `libelle` (I1), `libelle-etroit` (I4), `libelle-serre`, `selection` (I2), `libelle-actif`, `grise` (I3), en `clair` et `sombre`, `presse` pour ceux qui se touchent, planches `grande-police` et `rtl`. iOS : suffixe `-iOS26` et `<id>-dessine` ; web : 390 (courts), 820 (étroits), 1440 (libellés). Images enregistrées par la CI sur la branche du lot (`record_snapshots`). Android : aucun nom de test avec « ; » ni « . ».

Catalogue : l'entrée K12, vide sur `dev` (`MeeshyKitCatalog+K12.swift`, `KitCatalogK12.kt`, `components/kit/catalog/k12.tsx`), reçoit ces douze états, repos et pressé.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Sur `dev`, les rails derrière (…) n'existent que dans les appels (#17327). Le repos du composer est encore la colonne posée sur la scène sur iOS, des disques séparés et des tuiles légendées sur le web.
- Registre : `CallView+CameraRail` ne porte plus de rail (zoom seul) ; les rails des appels (`CallView+Rails.swift`, `CallActionRails.kt`, `call-rails.tsx`) n'y figurent pas ; `ComposerRailCard` vit dans `ComposerRailGlass.swift` ; `ComposerToolRow` est horizontal.
- Capsule : la planche dit écart 6, marge 5, largeur 54 ; les appels 8, 8, 60 (64 et disques de 48 sur Android).
- Rail libellé : 112 de large, pleine hauteur, rayon 20 dans le code ; 210 ou 150, court et centré, rayon 26 sur la planche. En-tête sur « Sélection » seulement dans le code, sur les deux rails sur la planche.
- Rangée allumée : couleur de marque (iOS), accent à 55 % (Android), glyphe jaune (rail flottant) ; la planche dit blanc plein.
- Le code pose les options d'un objet dans le rail de GAUCHE et ne laisse que ↶ ↷ à droite (#13957) ; la planche garde « Ajouter » et change le rail droit en « Sélection ». Le code ouvre le rail gauche par « Fermer » ; la planche garde ✕ en en-tête. Contenu et côté : I8.
- Le code rend les rails invisibles pendant la frappe et au viseur ; la planche les grise dans un mode plein écran.
- Mouvement : ressort sur iOS, 250 ms sur Android, 300 ms sur le web ; un rail qui repart répond au toucher sur iOS et le web, rallume les commandes sur Android.
- La chaîne iOS de l'en-tête est écrite en capitales (« SÉLECTION ») ; la planche les obtient par le style.
- Web : ni loi d'arrangement ni rail libellé.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. Un composant, deux présentations élues par l'hôte ; `ComposerSceneArrangement` reste la loi. (Deux composants ; K12 mesure seul la place.)
2. La capsule et le mouvement viennent des rails du duo des appels, la rangée de `ComposerLabeledRailRow`. (Partir de `ComposerTrailingRail` ; redessiner depuis la planche.)
3. Capsule aux mesures de la planche (6, 5, 54), disques K02 de 44, cible de 48 dp par débord sur Android. (Garder 8 / 8 / 60 ; disques de 48.)
4. Trois largeurs libellées, 210, 150 et 112, élues par `labeledWidth(lane)` : la planche sur tablette, l'existant sur téléphone couché et Split View. (210 et 150 seuls, avec un seuil relevé à I8 ; 112 seul.)
5. Rail libellé court et centré, qui défile s'il déborde, pied épinglé. (Pleine hauteur.)
6. Rangée allumée blanc plein à encre `indigo950`, comme l'actif de K02 ; la teinte de marque part à I8. (Marque ; jaune.)
7. Trois visibilités : `shown`, `dimmed` (42 %, inerte, hors lecteur d'écran), `hidden` (invisible, place gardée en libellé). (Grisé annoncé « désactivé » ; deux états.)
8. Coller et les rangées à menu passent par l'emplacement `custom` ; K12 ne dessine pas Coller. (Entrée bleue dessinée par K12, qui perd le collage sans bannière.)
9. Les rails sociaux des lecteurs ne sont pas absorbés : leurs compteurs et légendes sont des features, I10 tranche. (Les servir par un rail unique à légende.)
10. Le rail du viseur (A8) est un `MeeshyEdgeRail` seul avec `divider`, posé par I4. (Composant dédié ; dessin propre à I4.)
11. Pas de filet avant Retirer : dernier et rouge, comme I2. (Garder le filet d'iOS.)
12. Web : barre d'outils verticale, chaque bouton au Tab, flèches en plus, comme les appels. (Un seul arrêt de tabulation.)
13. Mouvement : 300 ms, fondu réduit 150 ms, grisé 180 ms sur les trois plateformes ; un rail qui repart sert l'action, et Android garde son rallumage côté app à I1. (Durées par plateforme.)

## 10. Livraison iOS (lot K12, branche `claude/kit-k12-ios`)
- Fichiers : `MeeshyUI/Kit/MeeshyEdgeRailsRecipe.swift` (côtés, largeurs, présentation, visibilité, dégagement, recette et lois pures), `MeeshyEdgeRailsModel.swift` (rangée, entrée, contenu, présence, déclencheur d'impact), `MeeshyEdgeRails.swift` (`MeeshyEdgeRails`, `MeeshyEdgeRail`), `MeeshyEdgeRailsBodies.swift` (capsule courte, rail libellé, disque), `MeeshyEdgeRailRow.swift` (`MeeshyEdgeRailRowFace`, rangée qui se touche), `Catalog/MeeshyKitCatalog+K12.swift` (douze états de la fiche et un état `presse`).
- Témoins : `MeeshyEdgeRailsTests` (vecteurs de recette, de longueur, de largeur, de translation, de capacité, de visibilité ; contenu, présence, déclencheur, contraste, gardes de source) et `MeeshyEdgeRailsSnapshotTests` (clair, sombre, planches, verre dessiné). Les images sont enregistrées par la CI sur la branche.
- Jumeaux : aucun rebranché, aucun supprimé (§ 7). Les types du duo des appels et du composer restent tels quels : un lot de kit ne change aucun écran. Les constantes du kit (6, 5, 54) diffèrent de celles des appels (8, 8, 60) ; I1 les aligne.
- Choix du lot, hors fiche : un rail monté déjà demandé s'affiche à sa place sans entrer (l'entrée se joue quand la demande change, ce qui évite le clignotement d'un premier rendu) ; `dimmed` vaut aussi pour un rail court (opacité 0,42, inerte) ; une entrée estompée (`isDimmed`) est à 0,6 d'opacité, valeur que la fiche ne chiffre pas ; la rangée au repos n'a pas de fond, un survol la voile à 12 %, l'appui à 22 % ; la pastille « porte déjà » est un point de 8 en `brandPrimary` ; le fondu de bord d'un rail qui défile est de 24 ; le contenu d'un emplacement `custom` porte son propre état (le rail ne se redessine pas quand seul cet état change). Consignés en décision-produit dans #17749. La présence d'un rail court vit au-dessus des deux présentations (`MeeshyEdgeRailSpec.wanted`) : un rail rangé ou changé pendant qu'il est libellé ne revient jamais en court avec une liste périmée ; une rangée libellée désactivée est `.disabled` ; une rangée allumée fond son fond et son encre en 200 ms.
- Limite connue : la hauteur de l'en-tête d'un rail libellé (26) est une constante de la recette ; la hauteur mesurée dépend de la police et du Dynamic Type, et le rail défile alors plutôt que de déborder.
