# K19 — MeeshyTileStrip (la bande de vignettes)

Relevé sur `origin/dev` `8d0f8d02ba1` le 2026-11-13. Chantier #17312, milestone 258 ; issue du lot : #17993. Lois 7, 9 et 13 de `docs/product/composer-vue-finale.md` ; loi 17 des appels (#17409 : une rangée qui défile s'efface à ses bords). Planche : `ftile()` et `ftiles()` (lignes 258-259), `.ftile`, `.ftile i`, `.ftile.on i` (101-103), `.fade` (70). Vues du registre : A10, O6, S4. Quatre autres dessinent la même vignette à la main : S2 (bandes), S3 (transitions), R8 (disposition du post), A2 (polices).

## 1. Rôle
Une bande de vignettes à aperçu, d'où l'on choisit UNE option ; elle défile, se centre ou se replie en grille, cercle la courante et s'estompe au bord derrière lequel il reste des vignettes.

Elle ne fait pas :
- l'aperçu : l'hôte le peint (image filtrée, cadre, flux vivant, « Aa » d'une police). K19 ne connaît ni filtre, ni look, ni cadre, ni police ;
- l'état : la sélection appartient à l'hôte, appliquée tout de suite (optimiste) ;
- la liste, le tri, les noms traduits, le rendu et le cache des aperçus, le budget thermique ;
- le verre, la plaque ni la pilule qui la portent (K01, K16, K11), le segment ou les puces de tri au-dessus (K03, K04), le déclencheur (K09), les déclinaisons d'un cadre (balayage vertical dans la courante) ;
- les voisins : rangée des scènes (K20), pastilles de couleur (K07), piste de coupe (K21).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyTileStrip.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-tile-strip.tsx` |
|---|---|---|---|
| Bande | `MeeshyTileStrip(_:selection:label:…onSelect:preview:)` | `MeeshyTileStrip(tiles, selection, label, onSelect, modifier, …, preview)` | `<MeeshyTileStrip tiles selection label onSelect … renderPreview />` |
| Vignette (valeur) | `MeeshyTile<ID: Hashable & Sendable>` | `MeeshyTile<T>`, `@Immutable` | `MeeshyTile`, `id: string` |
| Disposition | `MeeshyTileStripLayout { strip, carousel(dimsNeighbours: Bool = false), grid(columns: Int = 4) }` | idem | union équivalente |
| État remis à l'aperçu | `MeeshyTileState { isSelected, isEnabled }`, `Equatable` | idem, stable | idem |
| Lois pures | `MeeshyTileStripRule` (`centeredIndex`, `stepping`), `MeeshyTileStripFollow` (`begin`, `centered`, `chose`, `settled`), `MeeshyTileStripGeometry` (`pitch`, `frame(of:)`, `visibleRange`), `MeeshyTileRecipe.resolve(…)`, `MeeshyScrollEdges` (K04) | idem | `meeshyTileStripRule`, `meeshyTileStripFollow`, `meeshyTileStripGeometry`, `meeshyTileRecipe` (`meeshy-tile-strip-rule.ts`) |

Paramètres, opaques, mêmes défauts partout :
- `tiles` (ordonnées) ; `selection: ID?` (la cerclée, `nil` = aucune) ; `label` (nom du groupe, obligatoire) ; `onSelect(id)` ;
- `layout = strip` ; `tileSize = 56 × 72` ; `names = each` (`current` : une ligne sous la bande ; `none`) ; `selectionStyle = ring` (`fill`) ; `surface = onMedia` (`theme`) ;
- `inset = 0` (marge DANS le défilement) ; `revealsSelection = true` ; `isSolo = false` (seule la courante reste, défilement gelé) ; `haptic = light` (`none`) ;
- `currentGestures = nil` : `onDoubleTap`, `onHold(began · moved(translation) · ended)` sur la courante, chacun avec son action d'accessibilité nommée par l'hôte ;
- `onVisibleRange`, `onScrollingChange` (`nil` par défaut) ;
- désactivée : `.disabled(_:)` (iOS), `enabled = true` (Android), `disabled` (web, plus `data`).

Une vignette : `id`, `title`, `accessibilityLabel = nil`, `hint = nil`, glyphe d'attente (`placeholderSystemImage` / `placeholderIcon` / `placeholderGlyph = nil`), `isEnabled = true` ; `probe` sur le web.

Emplacements :
- `preview(tile, state)`, obligatoire, rogné à la forme de la vignette ;
- `underlay(geometry)`, vide par défaut : UNE surface de l'hôte peinte sous les vignettes visibles (aperçus vivants), masquée à leur forme.

## 3. États
- bande, courante cerclée, nom sous chaque vignette, fin estompée : O6 (50 × 64), A10 (48 × 62) ;
- bande défilée au milieu (deux bords) ou en bout (début seul) : aucune vue ; loi 17 des appels ;
- grille repliée, 4 colonnes : S4 ; 4 et 5 colonnes : S3, S2, R8 ;
- courante pleine (`fill`), sans nom visible : A2 (polices) ;
- carrousel (la vignette centrée est la courante, son nom seul sous la bande ; voisines réduites avec `dimsNeighbours`) : aucune vue du composer ; code de la caméra et des appels (C1), conservé ;
- aperçu en attente (voile et glyphe), pressée, survolée, focus clavier, désactivée (40 %), `isSolo`, surface `theme` : aucune vue, conservés du code.

Loi 13 :
- sans vignette, rien n'est rendu, ni hauteur ni marge ;
- pas d'estompe si tout tient, ni du côté atteint, jamais en grille ; jamais de barre de défilement ;
- pas de cercle sans `selection` ; pas de coche, de pastille ni de compteur fabriqués ;
- pas de vignette grisée « à venir » : l'hôte la retire ; `isEnabled = false` ne sert qu'à un verrou momentané ;
- pas de nom répété : `current` ne montre que celui de la courante ; pas de verre sous une vignette.

## 4. Gestes et retours
- Toucher : au relâcher dans la cible, `onSelect` ; la courante ne répond pas (ni rappel ni haptique), sauf `currentGestures`.
- Défiler : geste natif ; un glisser ne déclenche pas de toucher. Web : molette verticale convertie tant qu'il reste de la course.
- Carrousel : le défilement s'aimante au centre ; la vignette qui passe au centre devient la courante (un `onSelect` par changement) ; au repos la bande rejoint la courante. Toucher une voisine la choisit et la centre.
- Montrer la courante : à l'apparition sans animation, à chaque changement en 250 ms, centrée ; immédiat sous « réduire les animations ».
- Appui : la vignette passe à 85 % ; aucune échelle. Le cercle arrive en fondu (200 ms) ; l'estompe d'un bord en 150 ms.
- « Réduire les animations » (`MeeshyMotion.shouldReduce`, `LocalReduceMotion`, `prefers-reduced-motion`) : ni fondu, ni défilement animé, ni réduction des voisines ; l'aimantation reste.
- Haptique : un `light` par changement effectif (`HapticFeedback.light()`, `MeeshyHaptics.light()`, `impact('light')` de `lib/view/haptics.ts`) ; rien sur un toucher ignoré ; `none` laisse l'hôte jouer le sien.
- Ni appui long ni réordonnancement dans K19.

## 5. Accessibilité
- Groupe nommé `label`. Bande et grille : chaque vignette est un bouton nommé `accessibilityLabel ?? title`, sélectionné ou non (iOS `.isSelected`, Android `Role.RadioButton` + `selected`, web `radiogroup` / `radio` / `aria-checked`) ; l'aperçu et le nom dessiné sont masqués.
- Carrousel : UN élément ajustable sur iOS et Android (nom `label`, valeur = nom de la courante, suivant / précédent), plus les actions nommées de `currentGestures` ; `radiogroup` sur le web.
- Ordre : du début à la fin, rangée après rangée en grille ; le focus d'accessibilité amène la vignette en vue ; l'estompe ne masque rien au lecteur d'écran.
- Cible : 44 pt, 48 dp, 44 px au moins, nom compris.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le nom grandit, sur 2 lignes au plus puis coupé en fin ; l'aperçu garde sa taille ; aucune hauteur fixe ; `rem` sur le web.
- Web, clavier : un seul arrêt de tabulation (la courante, sinon la première) ; ← → (↑ ↓ par colonne en grille), Début, Fin, sens inversé en arabe ; les flèches choisissent ; anneau `:focus-visible` visible sur le cercle blanc ; la vignette focalisée vient en vue.
- RTL : ordre, départ du défilement et bords d'estompe miroités ; l'aperçu n'est pas retourné.
- Contraste : nom blanc sur verre dense 6,12:1 (calcul de K01) ; cercle blanc contre la plaque ≥ 3:1, détaché de l'aperçu par 2 pt de vide ; surface `theme` : encre du thème, 4,5:1. « Réduire la transparence » : rien à changer, K19 ne pose aucune matière.

## 5 bis. Performance
- Ne se re-rend jamais : les vignettes pendant le défilement ; celles dont l'état n'a pas bougé quand la sélection change (deux au plus se redessinent) ; l'hôte pendant un appui.
- iOS : cellule `Equatable`, pile paresseuse, bords = deux booléens. Android : `LazyRow`, clés stables, centre par `derivedStateOf`, bords lus en phase de dessin. Web : appui et survol en CSS, bords et centre écrits en attributs `data-` par un écouteur passif, sans état Preact.
- S'anime : l'opacité du cercle, l'échelle et l'opacité des voisines (carrousel), la largeur du dégradé du masque. Jamais la mise en page ni un flou.
- K19 ne décode, ne filtre ni ne met en cache aucune image. Flux vivant : UNE surface par `underlay`, que l'hôte fige pendant le défilement (`onScrollingChange`) et borne à `onVisibleRange`.
- Budget : trente vignettes à aperçu défilent sans image perdue, à 120 Hz comme sur un appareil d'entrée de gamme ; rien de retenu une fois l'écran quitté (tâche de repos annulée, écouteurs retirés) ; web : poids mesuré par `measure-weight.mjs`.

## 6. Jetons et mesures
Mesures de la planche : vignette 56 × 72 par défaut, 48 × 62 (A10), 50 × 64 (O6), 70 × 56 en 4 colonnes (S4) ; rayon 12 ; écart 8, entre rangées 10 ; nom 11 semi-gras, à 5 de l'aperçu ; cercle = 2 de vide puis 2 de blanc ; estompe sur les 18 derniers pour cent. Voisines : 72 × 56 (S3), 60 × 72 (R8), hauteur 40 (S2), 52 × 52 rayon 14 (A2).

Jetons :
- rayon `MeeshyRadius.smPlus` (12), `md` (14) en `fill` ; web `--radius-tile` ;
- écarts `MeeshySpacing.sm` (8), `.smPlus` (10) entre rangées, `.xs` (4) sous l'aperçu ; cercle et vide `MeeshyBorder.strong` (2) ;
- nom `MeeshyFont.footnoteSize` (11) semi-gras relatif, `--text-mini` ;
- encre et cercle `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ; courante pleine : encre `indigo950` ; surface `theme` : `textPrimary` ;
- voile d'attente `MeeshyOpacity.subtle` ; appui `.intense` ; estompe `MeeshyControlSize.tapTarget` (44) ; cible `.tapTarget`, `--target-min`.

Les valeurs propres (40 % désactivé, 0,78 et 60 % des voisines, 150, 200 et 250 ms, repos du défilement 150 ms) vivent dans `MeeshyTileRecipe`, nulle part ailleurs. Aucun appel au verre dans les fichiers de K19.

## 7. Jumeaux
K19 promeut par copie et ne rebranche rien : le rebranchement change l'écran et revient aux lots d'intégration.
- iOS. DEVIENT : `CallModeCarousel<Item, Cell>` avec ses pistes iOS 17 et iOS 16, `CallModeCarouselRule`, `CallModeCarouselMotion` (`Features/Call`, déjà générique, 3 appels). Promus avec lui : la tenue de `StoryFilterGridView.filterThumbnail` et de `CallModeThumbnail` (aperçu, nom, cercle), `ComposerLookStripFollow`, `ComposerLookStripRule.visibleRange` et `centeredIndex`. Réutilisés : `MeeshyFadingScrollView`, `MeeshyScrollEdges` (K04).
- iOS, supprimés : par I4, `ComposerLookStrip` (722 lignes, 2 appels) avec `ComposerLookStripSnapping`, `LegacyInset`, `Targets`, `ScrollSettle` ; par I5, les capsules de `ComposerMediaLookPanel` (3 appels) et l'appel de `StoryFilterGridView` dans `ComposerMediaControls` ; par I6, `StoryFilterGridView` (SDK) et les puces de `ComposerSceneTransitionRows` ; par I1, `CallModeCarousel`, `CallModeCarouselItem`, `CallModeThumbnail`, `CallModeGlyph`. Restent à l'app : `ComposerLookStripSurface`, `Painting`, `Filter`, `StoryFilterThumbnails`, `CallFrameDeclinationPager`. Hors K19 : `ComposerLookRail` (boutons du rail du viseur, K02, I4), `CallPillChip` (réactions, K02, I1).
- Android. DEVIENT : `CallModeCarousel<T>` (`:feature:calls`, générique, 3 appels), descendu dans `:sdk-ui`, avec `StripCell` de `ComposerLookStrip` et `ComposerLookStripFollow` (`:core:model`).
- Android, supprimés : par I9, `ComposerLookStrip` (`:sdk-ui` retouch, 2 appels) ; par I5, `ComposerMediaLookPanel`, `PlacedLooks` et `FilterRow` du média posé ; par I6, `FilterRow` du fond, `EffectCarousel` et `TransitionRow` de `ComposerSceneFrameUi` ; par I1, `CallModeCarousel`, `MontageCell`. Hors K19 : `VideoFiltersPanel.PresetChips` (K04), `CallHistoryFilterRow` et le `FilterRow` des contacts (homonymes, K04).
- Web. DEVIENT : `ModeCarousel` (`components/call-mode-carousel.tsx`, 509 lignes, 3 appels) avec `carouselStep` et `nearestToCenter` (`lib/calls/call-mode-carousel.ts`), et la vignette de `StudioVisualEffects` (`routes/story-compose-effects.tsx`).
- Web, supprimés : par I1, `ModeCarousel` dans `call-effects-mode.tsx` et `call-montage-mode.tsx` ; par I4, celui de `routes/story-compose-camera-frames.tsx` ; par I6, `StudioVisualEffects` et les puces de `StudioTransitionRows` ; par I5, `StudioFilterSection` (`story-compose-media-fields.tsx`) ; par I10, à relire un par un, `game-photo-frame-picker.tsx`, `DecorChoices` (`profile-decor-sheet.tsx`), `ChoiceGroup` (`appearance-picker-parts.tsx`), `effects-panel.tsx`. `call-glass-button`, `call-control-pill`, `glass-surface`, `sheet`, `scene-*`, `story-rail`, `rail-tile`, `media-filmstrip` ne portent aucune bande de choix à aperçu.

## 8. Témoins exigés
Comportements (`MeeshyTileStripTests`, `MeeshyTileStripTest`, `meeshy-tile-strip.test.tsx`) :
- toucher une vignette ⇒ un `onSelect`, un `light` ; la courante, une désactivée ou `none` ⇒ rien ;
- carrousel : le centre devient la courante une seule fois par changement ; au repos la bande rejoint la courante ; un toucher sur une voisine ne se fait pas reprendre par le défilement ; `stepping` borné aux extrémités ;
- bords : tout tient ⇒ aucun ; début, milieu, bout ; RTL miroité ; jamais en grille ;
- recette : cercle ou plein par état × surface ; repos ≠ pressé ; « réduire les animations » ⇒ aucune animation ;
- bande vide ⇒ rien de rendu ; `isSolo` ⇒ seule la courante, défilement gelé ; sans `selection` ⇒ aucun cercle ;
- le cercle n'est jamais rogné (4 de réserve autour) ; la courante est en vue à l'apparition et après un changement ;
- nom, rôle, valeur par disposition ; élément ajustable en carrousel ; actions nommées de `currentGestures` ; cible d'au moins 44 pt, 48 dp, 44 px ;
- web : flèches, Début, Fin, sens arabe, grille par colonne, un seul arrêt de tabulation, molette ;
- performance : changer la sélection redessine deux vignettes au plus ; défiler n'en redessine aucune ; `onVisibleRange` ne part qu'au changement de plage ;
- gardes de source : aucun verre, aucun type du composer ni des appels, aucune chaîne dans les fichiers de K19 ; web : `check-kit.mjs` vert ;
- parité : `docs/product/kit/K19-MeeshyTileStrip.vectors.json` (lois et recette), lu par les trois suites ; le lot ne touche aucun jumeau ni aucun écran.

Instantanés (`MeeshyTileStrip/<id>.<variante>`) : `bande`, `bande-deborde`, `bande-milieu`, `carrousel`, `grille`, `plein`, `attente`, `desactive`, `solo`, `theme`, en `clair` et `sombre`, `presse` pour `bande`, planches `grande-police` et `rtl`. iOS : suffixe `-iOS26` ; web : 390, 820 et 1440 px. Images enregistrées par la CI (`sdk-tests.yml`, `android.yml` avec `record_snapshots`, `CAPTURE_DIR=docs/product/kit/captures node scripts/check-kit.mjs`), jamais posées à la main.

Catalogue : entrée K19, vide sur `dev` sur les trois plateformes (`MeeshyKitCatalog+K19.swift`, `KitCatalogK19.kt`, `components/kit/catalog/k19.tsx`). Vues : `bande` O6, `carrousel` A10, `grille` S4, `plein` A2, sur une plaque sombre opaque ; aperçus = dégradés du catalogue, aucune image embarquée.

Preuve : iOS `sdk-tests.yml` ; Android `assembleDebug` + `testDebugUnitTest` d'`android.yml` (seul compilateur joignable) ; web `bun run gate`. Consigne porteur : gardes locales vertes et runs de branche annulés ⇒ le lot fusionne dans `dev` et se prouve sur `dev` ; rouge sur `dev`, il est corrigé ou retiré aussitôt.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Kit sur `dev` : iOS jusqu'à K17, Android et web jusqu'à K02 ; la loi d'estompe de K04 n'existe que sur iOS.
- La planche choisit au toucher, déclencheur à part (A10) ; le code choisit par centrage, sur les trois plateformes, et la courante sert de déclencheur à la caméra et aux appels.
- Cercle blanc sur la planche et dans les appels ; couleur de marque dans la grille du SDK iOS et sur le web (`StudioVisualEffects`).
- La planche rogne le cercle en haut de la bande (A10, O6).
- Tailles : 48 à 70 sur la planche ; 56 × 100 (caméra iOS et Android), 64 × 64 (SDK iOS, carrousels), 64 × 80 (web).
- Nom sous chaque vignette sur la planche ; nom de la courante seul dans les carrousels.
- Sur un média, iOS et Android choisissent un look dans des capsules de TEXTE (`ComposerMediaLookPanel`, `FilterRow`) ; la planche montre des vignettes (O6).
- La bande de la caméra iOS force le sens gauche-droite ; aucune bande de vignettes ne s'estompe sur iOS ni Android, le web estompe 34 px des deux côtés.
- La caméra iOS peint toutes les vignettes visibles dans UNE surface vivante, bornée par un budget thermique.
- Registre : I5 (O6) et I6 (S4) ne dépendent pas de K19 ; S2, S3, R8 et A2 dessinent la même vignette sans le citer ; il range `ComposerLookRail` et `VideoFiltersPanel` parmi les jumeaux, K04 lui renvoie `CallPillChip`.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. Le carrousel générique des appels devient le composant sur les trois plateformes, vêtu de la vignette de la grille de filtres. (`ComposerLookStrip`, lié à la session de capture ; `StoryFilterGridView` seul ; réécrire.)
2. Trois dispositions : `strip` au toucher par défaut (planche), `carousel` conservé pour la caméra et les appels, `grid(columns:)`. (Toucher seul ; centrage seul.)
3. Cercle blanc, 2 de vide transparent puis 2 de trait ; encre du thème en surface `theme`. (Couleur de marque ; vide peint en sombre.)
4. La bande réserve 4 autour des vignettes : le cercle n'est jamais rogné. (Suivre la capture.)
5. `tileSize` opaque, 56 × 72 par défaut ; chaque hôte passe sa taille, celles du code jusqu'à l'intégration. (Énumération de tailles.)
6. Grille en colonnes égales, aux proportions de `tileSize` ; elle sert S4, S3, S2 et R8. (Repli libre à largeur fixe.)
7. Noms : `each` par défaut, `current` en carrousel, `none` pour les polices. (Toujours sous chaque vignette.)
8. Estompe selon la loi de K04 : par bord, là où il reste des vignettes, sur 44. (18 % en fin seulement ; 34 px des deux côtés.)
9. `selectionStyle: fill` pour les vignettes de police d'A2, que K04 renvoie ici. (Les laisser à l'app.)
10. Emplacement `underlay` et géométrie publique : une seule surface vivante. (Un aperçu vivant par vignette.)
11. Gestes de l'hôte sur la courante par `currentGestures`, doublés d'actions nommées. (Calque de gestes côté app ; K19 connaît la capture.)
12. `isSolo` : pendant qu'on filme, seule la courante reste. (Masquage côté hôte.)
13. Carrousel = un élément ajustable sur iOS et Android, comme les appels ; bande et grille = un bouton par vignette. (Un bouton par vignette partout.)
14. Aucune échelle à l'appui, comme K02 et K04 ; la réduction des voisines reste, à la demande. (Garder le rétrécissement à 0,94.)
15. RTL miroité, aperçus non retournés. (Garder le sens forcé de la caméra.)
16. `ComposerLookRail` et `CallPillChip` ne sont pas des vignettes : boutons K02, retirés par I4 et I1. (Mode « actions » dans K19.)
17. Les sélecteurs de look en texte deviennent des vignettes à l'intégration (I5, I6) ; K19 ne les touche pas. (Les garder en puces K04.)
18. La fiche fait foi pour les jumeaux ; le registre reçoit K04 dans `depend` de K19, et K19 dans celui de I1, I2, I3, I5 et I6. (Laisser le registre tel quel.)
19. Aucune chaîne dans K19, aucun jumeau rebranché. (Catalogue de chaînes ; renvoi dès K19.)

## 10. Précisions de la livraison iOS (lot K19, 2026-11-13)
Elles complètent la fiche sans la changer ; l'issue `décision-produit` du lot les porte.
- `MeeshyTile` porte un entier `previewVersion = 0` : la cellule est `Equatable` sur ses VALEURS, l'aperçu est une fermeture de l'hôte que la bande ne compare pas ; l'hôte qui a un aperçu neuf (l'image filtrée vient d'arriver) incrémente la version, et seule cette vignette se redessine.
- `underlay(geometry)` vaut pour la disposition `strip` ; `MeeshyTileStripGeometry` y porte aussi le décalage et la largeur visible, que le noyau tient à jour sans redessiner les vignettes.
- Carrousel : l'aimantation et le centrage sur la courante demandent iOS 17 ; sur iOS 16 il se pose comme la bande (toucher = choisir et centrer), le nom de la courante restant seul sous la bande.
- L'action d'accessibilité du maintien joue `began` : un film se lance par elle et s'arrête par le geste de l'hôte, comme `CallModeShotActions`.
