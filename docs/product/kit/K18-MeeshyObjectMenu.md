# K18 — MeeshyObjectMenu (le menu du (…) d'un objet)

Relevé sur `origin/dev` `8d0f8d02ba` le 2026-11-13. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`, entrée K18 (chantier #17312, milestone 258) ; issue du lot : #17996. Loi 6 de `docs/product/composer-vue-finale.md` ; lois 4, 13 et 15 lues. Planche : `.menu` (l. 89 à 92), `.menu.glass.deep` (l. 29), `objItems` (248), `objMenu(first)` (250). Vue : O2 (l. 327). I2 (l. 361) montre l'ABSENCE de (…) sur grand écran ; O9 et O10 montrent où mènent Description et Temps. Dépend de K00 et K01 ; lit deux valeurs de la recette de K02. K00, K01 et K02 sont fusionnés sur les trois plateformes ; les entrées de catalogue K18 existent, vides.

## 1. Rôle
Un menu de verre, ancré au contrôle qui l'ouvre, liste des lignes « titre + glyphe », range TOUJOURS la ligne destructive en dernier et en rouge, se replace pour rester à l'écran, et se ferme d'un toucher dehors.

Il ne fait pas :
- le bouton (…) (K02, `expanded`), ni la pilule qui le porte (K10), ni la décision d'ouvrir : l'hôte bascule `isPresented` au toucher du (…). Le kit n'offre AUCUNE entrée d'appui long (loi 6 : l'appui long commence le glisser, K25) ;
- le choix des lignes, leurs mots traduits, leur ordre entre elles, ce qu'un objet admet (`StoryCanvasContextAction.offered`, `SceneObjectMenu.offered`, `objectActions`) : l'app ; une action sans effet est ABSENTE de la liste que l'app remet ;
- l'effet d'une ligne (dupliquer, verrouiller, ouvrir Temps ou Description dans la pilule, K11), l'annulation de Retirer (↶), une confirmation ;
- l'assombrissement de la scène (O2 : la scène seule passe à 75 %, pas la pilule ni ↶ ↷) : l'hôte, qui sait ce qu'est « la scène » ;
- le verre, le ton, le repli opaque : K01 ; le rail « Sélection » du grand écran (K12, sans (…)) ; la feuille « Plus » de la scène (R11 : K15 et K06) ; les cases, sous-menus et lignes grisées.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyObjectMenu.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-object-menu.tsx` |
|---|---|---|---|
| Face (pure) | `MeeshyObjectMenu(items:header:tone:pressedItemID:onSelect:)` | `MeeshyObjectMenu(items, onSelect, modifier, header, tone, pressedItemId)` | `<MeeshyObjectMenu items header onSelect … />` |
| Hôte | `.meeshyObjectMenu(isPresented:label:items:…onSelect:)` sur le conteneur | `MeeshyObjectMenuHost(open, label, items, anchor, onSelect, onDismissRequest, modifier, …)`, qui remplit son parent | `<MeeshyObjectMenuHost open label items anchor surface onSelect onClose … />` |
| Ancre | `.meeshyObjectMenuAnchor(_ role: = .control)` sur le (…), `.surface` sur le verre qui le porte (préférence `MeeshyObjectMenuAnchorKey`) ; ou `anchor: MeeshyObjectMenuAnchor?` explicite | `rememberMeeshyObjectMenuAnchorState()` et `Modifier.meeshyObjectMenuAnchor(state, role)` | `anchor` : réf., fonction ou `{ x, y }` ; `surface?` : réf. |
| Ligne | `MeeshyObjectMenuItem(id:title:systemImage:role:hint:)`, `Equatable`, `Identifiable` | `@Immutable data class` (`icon: ImageVector?`) | type `readonly` (`glyph?: ReactNode`) |
| Rôle | `MeeshyObjectMenuRole { normal, destructive }` | `enum class` | `'normal' \| 'destructive'` |
| Bord préféré | `MeeshyObjectMenuEdge { above, below }` | idem | `'above' \| 'below'` |
| Alignement | `MeeshyObjectMenuAlignment { end, center }` | idem | `'end' \| 'center'` |
| Fond | `MeeshyObjectMenuBackdrop { clear, dim }` | idem | `'clear' \| 'dim'` |
| Lois pures | `MeeshyObjectMenuOrder`, `MeeshyObjectMenuPlacement`, `MeeshyObjectMenuChrome`, `MeeshyObjectMenuRecipe` | `object` identiques | `meeshy-object-menu-placement.ts`, `meeshy-object-menu-recipe.ts` |

Paramètres, tous opaques, mêmes défauts partout :
- `label` (obligatoire, non vide) : le nom du menu (« Options du sticker ») ; `items` ; `onSelect(id)` ; fermeture par `isPresented` (iOS), `onDismissRequest` (Android), `onClose` (web) : UN seul chemin pour le toucher dehors, Échap, le retour matériel et l'échappement du lecteur d'écran ;
- `header: String? = nil` (titre de tête, conservé du menu du fond du web) ;
- `preferredEdge = above` ; `alignment = end` ; `backdrop = clear` (`dim` : voile `scrimSoft` sur tout le conteneur) ;
- `tone: MeeshyGlassTone? = nil` (celui de l'hôte, par K01) ; `haptic { light, none } = light` ;
- `dismissLabel: String = « Fermer le menu »` (chaîne du kit, `kit.object_menu.dismiss`, sept langues) ;
- `pressedItemID = nil` (fige une ligne pressée pour le catalogue) ; web : `id` (cible d'`aria-controls` du (…)), `restoreFocusTo`, `data` (sondes `data-*`).

Une ligne ne porte ni rappel ni état : `id` stable, `title` (vide ⇒ ligne retirée), glyphe optionnel (absent ⇒ titre seul, sans trou), `role = normal`, `hint` optionnel. Aucun emplacement libre : le contenu est typé, pour que « destructive en dernier » ne dépende d'aucun appelant.

Lois (portées par `docs/product/kit/K18-MeeshyObjectMenu.vectors.json`) :
- `Order.resolve(items)` : titres vides et `id` en double retirés, lignes `normal` dans l'ordre reçu, PUIS lignes `destructive` dans l'ordre reçu ;
- `Placement.resolve(control, surface, menu, container, insets, preferredEdge, alignment, isRightToLeft)` → cadre, bord retenu, origine de l'échelle, `scrolls`. Référence = `surface ?? control`. Largeur = min(236, conteneur − 2 × 12). Vertical : au bord préféré à 10 de la référence s'il tient entre les marges (12 + zone sûre), sinon l'autre bord, sinon rabattu ; hauteur plafonnée à la place libre, au-delà la colonne défile. Horizontal `end` : bord de fin du menu = bord de fin de la référence + 11, rabattu aux marges ; `center` : centré sur le contrôle ; RTL en miroir. Origine = le contrôle projeté sur le bord du menu qui le regarde ;
- vecteur de référence (O2, 390 × 844) : contrôle (279, 760, 48, 48), surface (55, 752, 280, 64), cinq lignes ⇒ cadre (110, 512, 236, 230), bord `above`, origine (0,82 ; 1).

## 3. États
- Fermé : rien dans l'arbre — O1, O14, O4, O15 (pilule d'objet seule).
- Ouvert au-dessus du (…), cinq lignes, Retirer dernier et rouge, (…) en disque blanc — O2.
- Ouvert avec les lignes d'un média en tête (Temps, Description, Faire un sticker) : `objMenu(first)` le prévoit, aucune vue.
- Sans ligne destructive (objet verrouillé : ‹ et (…) seuls dans la pilule, loi 6) : aucune vue.
- Avec en-tête ; replacé SOUS l'ancre ; rabattu et défilant (petit écran, grande police, paysage) ; ancré à un point, centré (clic droit et touche Menu du web) : aucune vue, conservés du code.
- Ligne pressée, survolée, au focus clavier : aucune vue.
- Ton `onLight` (scène claire) et fond plein (« réduire la transparence ») : K01.
- Ni chargement, ni erreur, ni hors ligne, ni ligne désactivée : une ligne qui ne peut pas agir n'est pas dans la liste.

Loi 13 (`MeeshyObjectMenuChrome.resolve`) :
- liste vide après `Order` ⇒ ni verre ni voile, et la fermeture est demandée une fois ;
- pas d'en-tête sans `header` ; pas de filet avant la première ligne ni après la dernière ; pas de flèche, de coche, de sous-menu ;
- pas de voile assombri par défaut ; le menu ne recouvre jamais le verre qui porte son contrôle (jamais de verre sur du verre) ;
- un seul menu à la fois, jamais à l'appui long ; l'ancre disparaît (objet retiré, pilule rangée) ⇒ fermeture ;
- composer sur grand écran : pas de (…), donc pas de menu (lois 6 et 15) ; l'hôte le ferme avant un glisser, l'écriture ou un mode plein écran.

## 4. Gestes et retours
- Toucher une ligne (relâché dans la ligne) : le menu se ferme PUIS `onSelect(id)` part, une fois. Sortir le doigt de la ligne annule.
- Toucher hors du menu : fermeture, et le toucher est CONSOMMÉ (il ne désélectionne pas l'objet et n'active aucun outil). Retoucher le (…) ferme aussi.
- Échap (clavier d'iPad, web), retour matériel (Android `BackHandler`, coque web `useBackDismiss`), échappement de VoiceOver et retour de TalkBack : la même fermeture.
- Trop haut : la colonne défile dans le verre ; le verre ne bouge pas.
- Rotation, clavier, redimensionnement : replacé sans animation. Web : un défilement qui déplace l'ancre ferme.
- Entrée : échelle 0,92 → 1 depuis l'origine et opacité ; ressort (réponse 0,28, amorti 0,86) sur iOS, 200 ms sur Android et le web ; sortie inverse en 150 ms. Voile `dim` : fondu de même durée. « Réduire les animations » : fondu seul de 150 ms, sans échelle.
- Réponse au toucher d'une ligne : voile d'encre 0 → 22 % à l'appui, 12 % au survol et au focus (valeurs `soft` de la recette de K02), sans échelle. Le verre du menu n'est pas interactif.
- Haptique : `light` au choix d'une ligne, par le site unique (`HapticFeedback`, `rememberMeeshyHaptics()`, `impact()` de `lib/view/haptics.ts`). Rien à l'ouverture (K02 l'a jouée), rien à la fermeture.

## 5. Accessibilité
- Nom : `label`. Rôle : menu modal. iOS : conteneur `.isModal`, lignes boutons ; Android : `paneTitle`, `isTraversalGroup`, lignes `Role.Button` ; web : `role="menu"`, `aria-label`, lignes `<button role="menuitem">`, le (…) porte `aria-haspopup="menu"`, `aria-expanded`, `aria-controls` (K02).
- Ligne : nom = `title`, `hint` en indication, glyphe masqué. Destructive : dite par son mot, sa place (dernière) et son glyphe, jamais par la seule couleur. Valeur : aucune.
- Ordre de lecture : en-tête (trait de titre), lignes de haut en bas, destructive en dernier. Rien derrière n'est atteignable. Le voile est un bouton nommé `dismissLabel` sur Android et le web (hors tabulation) ; masqué sur iOS, où l'échappement ferme (et où `dismissLabel` nomme l'action d'accessibilité de fermeture).
- Focus : à l'ouverture, sur la première ligne ; à la fermeture, rendu au (…) (web `restoreFocusTo` ou le déclencheur, Android `FocusRequester` de l'ancre ; iOS : remis par l'hôte, même limite que K15).
- Web, clavier : un seul arrêt de tabulation (roving) ; ↑ ↓ en boucle, Début, Fin ; Entrée et Espace choisissent ; Échap ferme ; Tab ferme et rend le focus ; anneau `:focus-visible` de K01.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le titre grandit, deux lignes au plus, la ligne grandit ; glyphe figé ; aux tailles d'accessibilité la largeur monte jusqu'à 320 sans dépasser l'écran moins deux marges, puis la colonne défile. Web en `rem` ; à 400 % le menu tient sur 320 px.
- Cible : 46 pt de haut (44 au moins), 48 dp, 46 px, pleine largeur.
- RTL : titre au bord de début, glyphe au bord de fin, par propriétés logiques ; le placement se retourne.
- Contraste, calculé par le témoin depuis les recettes : titre blanc sur verre `dense` ≥ 4,5:1 au pire fond (6,12:1 iOS et Android, 7,26:1 web, K01). Retirer en `errorSoft` : environ 10:1 sur le verre seul, 3,2:1 (3,8:1 web) au pire fond, blanc pur sous le verre ; `error` et le `#FF6B6E` de la planche y tombent à 2,2:1. Fond plein sous « réduire la transparence ».

## 5 bis. Performance
- Ne se re-rend jamais : le contenu de l'hôte à l'ouverture, à la fermeture et à l'appui (le menu est un frère en surimpression) ; les voisines d'une ligne pressée (appui local : style de bouton, `interactionSource`, `:active`) ; la face quand le ton change (seule la surface de K01 le lit). Lignes sans rappel, donc comparables : `.equatable()`, paramètres stables, `memo`.
- S'anime : `transform` (échelle) et `opacity` du menu, `opacity` du voile. Jamais le flou, l'ombre, la hauteur ni la mise en page.
- Un seul verre (K01 `dense`) ; aucune ligne n'en dessine.
- Placement calculé à l'ouverture et quand le conteneur ou l'ancre changent, jamais par image. La première pose part d'une hauteur ESTIMÉE (en-tête + n × hauteur de ligne), corrigée par la mesure sans animation : aucune boucle de mesure.
- Monté seulement ouvert, démonté après la sortie ; rien de retenu ensuite (écouteurs, entrée d'historique rendue, ancre). Web : aucune dépendance ajoutée, poids mesuré par `measure-weight.mjs`.
- Budget : le menu est visible à l'image qui suit le toucher du (…) ; aucune image perdue en l'ouvrant sur une scène vidéo en lecture.

## 6. Jetons et mesures
Planche (O2) : largeur 236 ; rayon 16 ; ligne de 46, retraits 14, titre 15 moyen au début, glyphe 18 à la fin ; filet 1 pt, blanc 12 %, entre deux lignes ; Retirer `#FF6B6E`, mot et glyphe ; verre `deep` à 66 % (`dense` de K01) ; 10 au-dessus de la pilule ; bord de fin 11 au-delà de celui de la pilule (à 44 du bord d'un écran de 390) ; scène à 75 % derrière.

Jetons : rayon `MeeshyRadius.lg`, `--radius-card` ; retrait `MeeshySpacing.mdPlus` (14) ; écart à l'ancre `MeeshySpacing.smPlus` (10) ; marge d'écran `MeeshySpacing.md` (12) ; glyphe `MeeshyIconSize.lg` (18) ; titre `MeeshyFont.bodySize` (15) moyen, relatif ; encre `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ; Retirer `MeeshyColors.errorSoft`, `MeeshyPalette.ErrorSoft`, `--color-error-soft` ; voile `dim` : `scrimSoft`, `ScrimSoft`, `--ios-scrim-soft` ; appui : `softRestOpacity` et `softPressedOpacity` de la recette de K02.

Sans jeton, dans `MeeshyObjectMenuRecipe` et nulle part ailleurs : largeur 236 et plafond 320, ligne 46 (48 dp), débord de fin 11, filet 12 %, échelle 0,92, ressort, 200 et 150 ms. Aucun `glassEffect`, `adaptiveGlass`, `backdrop-filter`, classe `.glass*`, `Menu`, `UIMenu`, `DropdownMenu` ni `Popup` dans les fichiers de K18.

## 7. Jumeaux
K18 ne rebranche et ne supprime aucun jumeau : il promeut le plus complet, et l'écran change à I5.
- iOS. DEVIENT : `ComposerSceneContextMenu` (colonne de lignes sur verre, modale, Échap), la loi `ComposerSceneMenu.frame` avec `margin` et `width`, et le calque `sceneMenuLayer` avec `ComposerSceneMenuSizeKey` (voile, taille mesurée, transition) de `MeeshyComposerHost+SceneMenu.swift`. Réutilisés : `dismissOnEscape` (`MeeshyUI/Compatibility/EscapeDismiss.swift`), `HapticFeedback`, K01.
- iOS, supprimés par I5 : `ComposerSceneMenu.swift` (vue, `frame`, `screenPoint`, `ComposerSceneMenuRequest`, `ComposerSceneMenuTarget`, `ComposerSceneMenuPaint`), le calque et l'état `sceneObjectMenu` du meuble (`backgroundRemovalConfirmed` reste), le relais `onItemMenu`, `ComposerSelectionActions.menuActions` et `shortcut` ; dans le SDK, `UIContextMenuInteraction` et son délégué, `contextMenu(for:kind:)`, `requestItemMenu`, `onItemMenuRequested` (`StoryCanvasUIView+ContextMenu`, `+Gestures`, `StoryCanvasRepresentable`, `EmbeddedSceneCanvas`). Témoins à reprendre par I5 : `ComposerSceneMenuTests`, `StoryCanvasHostMenuTests`, `StoryCanvasThreeGesturesTests`. RESTE : `StoryCanvasContextAction` (inventaire, `offered`, titres, actions VoiceOver), table de contenu.
- Android. DEVIENT : `SceneObjectMenuPopup` (`:feature:stories`, glyphe, mot, alerte en dernier) et le modèle `SceneObjectMenuItem` de `:sdk-ui` `story/canvas/edit/SceneObjectMenu.kt` (sans appelant). Tous deux sont des `DropdownMenu` Material : la surface, le placement et le voile se portent depuis iOS, DANS l'arbre de l'hôte (le flou de K01 lit `LocalGlassBackdrop`, qu'une fenêtre de `Popup` fausserait).
- Android, supprimés par I5 : `SceneObjectMenuPopup.kt` et ses deux appels (`ComposerStickerLayer`, `ComposerTextElementLayer`), `SceneObjectContextMenu`, `sceneContextMenu`, et `SceneObjectMenu.kt` de `:sdk-ui`. RESTENT : `SceneObjectMenu` et `SceneObjectMenuPlan` de `:core:model`, `StoryElementMenu` (tables et actions TalkBack). `ComposerEditGrammarGuardTest` reste vrai (aucun `DropdownMenu` sur la scène) ; I5 met à jour sa phrase d'en-tête.
- Web. DEVIENT : `StudioObjectMenu` (`routes/story-compose-object-menu.tsx`) et `studioMenuFrame` (`lib/stories/studio-scene-menu.ts`). Réutilisés : `useRovingMenu` (`lib/view/roving-menu.ts`, à la place des flèches écrites à la main), `useBackDismiss`, `impact`, `MeeshyGlass` de K01. `lib/view/popover.ts` n'est pas touché.
- Web, supprimés par I5 : `story-compose-object-menu.tsx`, `studioMenuFrame` et ses témoins, les deux imports paresseux (`story-compose.tsx`, `use-studio-scene-columns.tsx`), l'état `objectMenu` de `use-studio-objects.ts`, l'entrée du banc `story-studio-bench.tsx`. Le menu du FOND à l'appui long (web seul) passe par `header` jusqu'à ce que I2 l'aligne sur iOS (#13974). RESTENT : `objectActions`, `studioBackgroundMenuActions`, `studioOverlayBackgroundAction`.
- Ne sont PAS des jumeaux : `ComposerSceneMoreMenu` et `ComposerSceneMoreMenuItems` (iOS), `ComposerMoreMenu` (Android) : le ⋯ de la SCÈNE, à cases et sous-menus, que la planche rend en feuille « Plus » (R11, I2) ; les menus de liste du thème (`row-actions`, `feed-post-menu`, `comment-row-menu`, `notification-row-menu`, `avatar-menu`, `CommentMoreMenu`, `ConversationContextMenu`, `AvatarContextMenu`) ; `call-moderation-menu.tsx` (verre des appels, une ligne grisée et une confirmation) : candidat, à étudier par une issue de suivi.

## 8. Témoins exigés
Comportements (`MeeshyObjectMenuTests`, `MeeshyObjectMenuTest`, `meeshy-object-menu.test.tsx`, vecteurs communs) :
- ordre : destructive toujours en dernier quel que soit l'ordre reçu, titres vides et doublons retirés, ordre relatif gardé ;
- placement : le vecteur O2 ; bascule sous l'ancre quand le haut manque ; rabattu aux marges ; plafonné et défilant ; `center` sur un point ; RTL en miroir ; jamais de recouvrement de `surface` ;
- loi 13 : liste vide ⇒ rien et une fermeture ; ni en-tête, ni filet, ni voile hors de leurs conditions ;
- choisir : fermeture puis `onSelect(id)`, une fois chacun, un `light` par le site unique ; `haptic: none` n'en joue pas ;
- fermer : toucher dehors (consommé), Échap, retour matériel, échappement du lecteur d'écran, ancre disparue, chacun une fois ;
- aucune entrée d'appui long ni de `contextmenu` dans les fichiers du kit (garde de source) ;
- accessibilité : nom, rôle, modalité, ordre, focus à l'entrée et rendu à la sortie ; web : roving, ↑ ↓ Début Fin, Tab, `aria-controls` ;
- « réduire les animations » : aucune échelle ; contraste du titre et de Retirer calculé depuis les recettes ;
- gardes : aucun verre ni couleur en dur, aucun type du composer ; `check-kit.mjs`, `glass-site.mjs`, `KitRegistryGuard` verts ; non-régression : aucun jumeau ni écran touché.

Instantanés (`MeeshyObjectMenu/<id>.<variante>`) : `objet` (O2, avec une pilule d'objet et son (…) allumé), `media` (huit lignes), `verrouille`, `en-tete`, `dessous`, `defile`, `clair` (ton `onLight`), `point`, en `clair` et `sombre`, `presse` pour `objet`, planches `grande-police` et `rtl`. iOS : suffixe `-iOS26` et verre dessiné ; web : 390, 820 et 1440 px. Images enregistrées par la CI sur la branche du lot (`record_snapshots` de `sdk-tests.yml` et d'`android.yml`, `CAPTURE_DIR=docs/product/kit/captures node scripts/check-kit.mjs`). Android : aucun nom de test avec « ; » ni « . ».

Catalogue : entrée K18 remplie (`MeeshyKitCatalog+K18.swift`, `KitCatalogK18.kt`, `components/kit/catalog/k18.tsx`), mêmes identifiants d'état, menu touchable, bascule « ouvrir / fermer » qui joue l'entrée.

Preuve : `sdk-tests.yml` (iOS), `android.yml` (`assembleDebug` et `testDebugUnitTest`), `bun run gate` (web, dans le conteneur). Consigne du porteur : gardes locales vertes et runs de branche annulés ⇒ le lot fusionne dans `dev` et se prouve sur `dev` ; rouge sur `dev`, il est corrigé ou retiré aussitôt.

## 9. Écarts connus et choix retenus (mode autonome)
Écarts relevés :
- Déclencheur : (…) de la pilule (planche) ; appui long sur l'objet partout dans le code (iOS `onItemMenu`, Android `SceneObjectMenuPopup`, web appui long et clic droit).
- Ligne : titre puis glyphe à la fin (planche) ; glyphe en tête (iOS, Android, web) ; aucun glyphe (`:sdk-ui`).
- Place : au-dessus du (…) (planche) ; sous le doigt d'abord (iOS, web) ; `DropdownMenu` du système (Android).
- Mesures : 236, 46, rayon 16 (planche) ; 250, 44, rayon 20 (iOS, web).
- Rouge : `#FF6B6E` sans jeton (planche) ; `error` (iOS, web) ; `colorScheme.error` (Android).
- Voile : scène seule à 75 % (planche) ; tout l'écran à 18 %, toucher consommé (iOS) ; aucun voile, toucher traversant (web).
- Contenu : Mettre devant, Mettre en fond, Verrouiller, Description, Faire un sticker sont sur la planche ; le code sert Modifier, Dupliquer, Retirer (iOS), et n'a pas d'ordre (#13918). C'est I5.
- Registre : `ComposerSceneMoreMenu` cité comme existant iOS n'est pas un jumeau ; `depend` omet K02 ; `web_existant` était à relever.

Choix retenus (alternatives entre parenthèses) :
1. Le kit n'ouvre jamais seul : `isPresented` de l'hôte, aucune entrée d'appui long. (Un geste d'ouverture dans le kit.)
2. Titre au début, glyphe à la fin, comme la planche. (Glyphe en tête, comme le code.)
3. La ligne destructive est triée en dernier PAR LE KIT. (Faire confiance à l'ordre de l'hôte ; un paramètre `destructive` à part.)
4. Au-dessus de la surface porteuse à 10, bord de fin + 11, bascule dessous, rabat aux marges, défile ; `preferredEdge` et `alignment` gardent « dessous » et « centré sur un point ». (Centré sur le (…) ; aligné sans débord ; loi du doigt d'iOS.)
5. Mesures de la planche : 236, 46 (48 dp), rayon 16 ; plafond 320 en grande police. (250, 44 et 20 du code.)
6. Retirer en `errorSoft`, comme K12. (`#FF6B6E` de la planche, sans jeton ; `error` du code : 2,2:1 au pire fond.)
7. Voile clair par défaut, toucher dehors consommé ; l'hôte assombrit sa scène ; `dim` garde le voile plein d'iOS. (Voile à 25 % par défaut ; toucher traversant du web.)
8. Surimpression dans l'arbre de l'hôte, sur le verre de K01 ; portail vers le `dialog` le plus proche sur le web. (`Menu` du système sur iOS 26 ; `DropdownMenu` ou `Popup` Material.)
9. Verre non interactif, réponse dessinée par ligne. (Verre interactif du système sur tout le menu.)
10. `light` au choix, rien à l'ouverture. (Aucune haptique ; `medium` pour Retirer.)
11. Ni ligne grisée, ni case, ni sous-menu ; le ⋯ de la scène reste hors de K18. (Absorber `ComposerSceneMoreMenu` et le menu de modération des appels.)
12. `header` gardé pour le menu du fond du web. (Le retirer, la planche n'en montre pas.)
13. Fermer puis remettre le choix. (Remettre puis fermer, comme `:sdk-ui`.)
14. Web : `useRovingMenu` réutilisé, loi de placement propre au kit avec vecteurs communs, `popover.ts` intact. (Étendre `placePopoverVertical`.)
15. Aucun jumeau touché par le lot, code mort de `:sdk-ui` compris : I5 supprime. (Le retirer dans le lot.)
16. Retour du focus sur iOS : remis par l'hôte à la fermeture, témoin à I5. (Un état de focus partagé entre l'ancre et l'hôte.)

Aucune question ne reste au porteur.

## 10. Livraison iOS (lot K18, plateforme ios)
Fichiers : `MeeshyObjectMenuModels.swift` (lignes, rôles, ancre et préférence `MeeshyObjectMenuAnchorKey`), `MeeshyObjectMenuLaws.swift` (recette, ordre, loi 13, place, mouvement), `MeeshyObjectMenu.swift` (la face, la ligne, les mots), `MeeshyObjectMenuHost.swift` (`.meeshyObjectMenu(...)`, le calque, le choix), `Catalog/MeeshyKitCatalog+K18.swift`, `MeeshyObjectMenuTests` et `MeeshyObjectMenuSnapshotTests`.

Choix d'exécution du lot iOS :
- Les jumeaux (`ComposerSceneContextMenu`, `ComposerSceneMenu.frame`, `sceneMenuLayer`) ne sont PAS rebranchés : leur dessin (250, glyphe en tête, appui long) diffère de la fiche, et ce lot ne change aucun écran. Le kit reprend leurs mécaniques (colonne de verre modale, Échap par `dismissOnEscape`, taille mesurée, transition échelle + fondu à ressort 0,28 / 0,86) ; I5 les remplace et les supprime.
- La face prend, en plus de la fiche, `width` et `maxHeight` (défauts nuls) : l'hôte lui remet le cadre que la loi de place a calculé, et la colonne défile dans `maxHeight`.
- Hauteur du menu : estimée d'abord (`MeeshyObjectMenuRecipe.estimatedHeight`), puis mesurée par `MeeshyObjectMenuSizeKey` ; la correction n'est pas animée.
- Le voile `clear` est un calque transparent qui absorbe le toucher ; `dim` pose `MeeshyColors.scrimSoft`.
