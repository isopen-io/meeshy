# K07 — MeeshyColorDots (les pastilles de couleur)

Relevé sur `origin/dev` `7fa7e6239a` le 2026-11-11. Chantier #17312, milestone 258 ; issue du lot #17616, PR iOS #17618. Dépend de K00 ; lit le ton de K01, présent sur `dev` sur les trois plateformes (`\.meeshyGlassTone`, `LocalMeeshyGlassTone`, `data-glass-tone`). Lois 7, 9, 10 et 13 de `docs/product/composer-vue-finale.md`. Planche : `dots(cols,on,size)` (ligne 231) et `.dots`, `.dots i`, `.dots i.on` (lignes 79 à 81), employés par A3 (ligne 302 : 14 teintes de 34 px sur deux lignes), A13 (315 : 9 teintes de 28 px sur une ligne) et S1 (340 : 17 teintes de 30 px sur trois lignes).

## 1. Rôle
Un groupe de choix unique : des disques de couleur dont un seul est courant, cerclé ; toucher un disque le choisit.

Il ne fait pas :
- la palette, son ordre ni le nom des couleurs : l'hôte les passe (`StoryTextColors`, `StoryDrawingColors`, `StoryBackgroundPalette`, la gamme d'accent restent où elles sont) ;
- l'application de la couleur, l'aperçu en direct sur la scène, l'annulation, le choix de la cible (Texte ou Contour : le segment K03 posé au-dessus) ;
- le titre visible, le panneau, la pilule, la plaque ni aucun verre (K17, K11, K16) ;
- la couleur libre (roue, pipette, saisie d'un code) ;
- le fond du texte ▣ de A4 (carrés arrondis Aucun, Verre, Plein), la pastille d'un trait (`DrawingStrokeList.colorButton`, un K02 à emplacement `glyph`), les vignettes de look (K19).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyColorDots.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-color-dots.tsx` |
|---|---|---|---|
| Groupe | `MeeshyColorDots(_ dots:selection:label:size:layout:tone:haptic:onSelect:trailing:)` | `MeeshyColorDots(dots, selection, label, onSelect, modifier, …, trailing)` | `<MeeshyColorDots dots selection label onSelect … />` |
| Pastille | `MeeshyColorDot(id:fill:name:systemImage:)` | `MeeshyColorDot(id, fill, name, icon)` | `{ id, fill, name?, glyph?, data? }` |
| Remplissage | `MeeshyColorDotFill { solid(Color), gradient([Color]), hollow }` | `sealed interface` identique | `{ solid: string } \| { gradient: readonly string[] } \| 'hollow'` |
| Taille | `MeeshyColorDotSize { s28, s32 }` | idem | `28 \| 32` |
| Disposition | `MeeshyColorDotsLayout { wrap, row }` | idem | `'wrap' \| 'row'` |
| Haptique | `MeeshyColorDotHaptic` = `MeeshyGlassButtonHaptic { light, none }` (une loi pour K02 et K07) | idem | `'light' \| 'none'` |
| Recette en valeurs | `MeeshyColorDotsRecipe.resolve(count:available:size:layout:tone:)` | idem | `meeshyColorDotsRecipe(...)` |
| Nom dit | `MeeshyColorDotsWords.spokenName(of:index:total:bundle:locale:)`, clé `kit.color_dots.position` | idem | idem |

Paramètres, tous opaques, mêmes défauts partout :
- `dots` : liste ordonnée ; `id` est une chaîne stable et unique, que l'hôte choisit (un code de couleur normalisé, une clé de gamme) ; `name` est le nom déjà traduit, optionnel ; le glyphe (optionnel) se dessine au centre du disque ;
- `selection: String? = nil` : l'`id` courant ; absent ou inconnu de la liste ⇒ aucun cercle ;
- `label` (obligatoire, non vide) : le nom du groupe (« Couleur du texte », « Arrière-plan ») ;
- `onSelect(id)` : valeur et rappel, pas de liaison ; retoucher la courante rappelle `onSelect`, l'hôte décide ;
- `size = s28` ; `layout = wrap` ; `tone: MeeshyGlassTone? = nil` (celui de l'hôte) ; `haptic { light, none } = light` ;
- désactivé : `.disabled(_:)` (iOS), `enabled = true` (Android), `disabled` (web) ; le web ajoute `data` par pastille (sondes `data-*` des gates, dont `data-story-option`).

Un emplacement : `trailing`, une action qui n'est pas un choix (« Aléatoire »), posée dans le flux après la dernière pastille, dans une cellule de 44 pt, hors du groupe de choix. Aucun emplacement de texte.

## 3. États
- Courante cerclée, sur plusieurs lignes : A3 (`s32`, 8 + 6), S1 (`s28`, 8 + 8 + 1).
- Courante cerclée, sur une ligne : A13 (`s28`, `row`).
- Sans courante (couleur hors palette) : aucune vue, conservé du code (`TextEditPalette.selected` rend `nil`).
- Débordement en `row` : la ligne défile, s'estompe au bord de fin (`.fade` de la planche, ligne 70) et se cale sur la courante. Aucune vue : A13 tient sur une ligne à 390 px parce que la planche serre le pas à 37 px.
- Pressé : le cercle apparaît à 50 % au doigt posé, avant le choix. Survol au pointeur : le filet passe de 25 à 60 %. Focus clavier : anneau de K01 sur la cellule. Aucune vue.
- Désactivé : contenu à 40 %, ni action ni haptique. Aucune vue ; conservé du web (`StudioChip disabled` pendant l'envoi, #7707).
- Dégradé, disque creux (« Aucun », « Automatique ») et glyphe : aucune vue, conservés du code (Android `BackgroundSwatch(brush)` et `AccentSwatch`, pastille « A » du web).

Loi 13 :
- pas de cercle sans courante ; pas de légende sous un disque ; pas de titre dans le composant ;
- une liste vide ne rend rien, pas même une bande ; pas de cellule pour un `trailing` vide ;
- pas d'estompe ni d'indicateur de défilement quand rien ne déborde ;
- pas de pastille « + » ni de couleur libre.

## 4. Gestes et retours
- Toucher : `onSelect(id)` part une fois, au relâcher dans la cible. Pas d'appui long, pas de glisser entre pastilles.
- Réponse visuelle : le pré-cercle au doigt posé, en moins d'une image ; jamais de voile sur la couleur, jamais d'échelle.
- Changement de courante : l'ancien cercle s'efface, le nouveau paraît (opacité, et échelle du cercle seul de 0,8 à 1), 200 ms au ressort rapide ; immédiat sous « réduire les animations ».
- En `row`, la ligne se cale sur la courante sans animation à l'apparition, avec ensuite ; immédiat sous « réduire les animations ».
- Haptique : un `light` au choix, par `HapticFeedback.light()`, `MeeshyHaptics.light()` ou `impact('light')` de `lib/view/haptics.ts` ; `none` laisse l'hôte jouer le sien ; rien si désactivé. Sur iOS, il passe par le déclencheur de K02 (`MeeshyGlassButtonTrigger`), seul site de la loi « désactivé : rien ; sinon un `light`, puis l'action ».

## 5. Accessibilité
- Groupe : nom `label`. Chaque pastille : nom `name`, sinon la position (« Couleur 5 sur 17 », chaîne du kit, nombres dans les chiffres du lecteur) ; jamais le code de la couleur.
- Rôle et valeur : bouton `.isSelected` dans un conteneur nommé (iOS) ; `selectableGroup` et `Role.RadioButton` avec `selected` (Android) ; `radiogroup` et `role="radio"` avec `aria-checked` (web). Glyphe masqué. Désactivé : annoncé, non activable.
- Ordre de lecture : le nom du groupe, les pastilles dans l'ordre visuel (du début à la fin, ligne après ligne), puis `trailing`.
- Cible : 44 pt, 48 dp, 44 px, carrée, pour les deux tailles ; les cellules se touchent.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : disques figés (ils ne portent pas de texte) ; iOS ajoute le Large Content Viewer (disque et nom) ; le web mesure en `rem` et passe à la ligne, sans défilement horizontal de la page.
- Web, clavier : un seul arrêt de tabulation (la courante, sinon la première) ; les flèches déplacent ET choisissent, inversées en RTL ; Début et Fin ; Espace et Entrée choisissent ; anneau `:focus-visible` de K01, distinct du cercle ; `title` égal au nom. Android et iPad au clavier : même anneau.
- RTL : la première couleur au bord de début, l'estompe au bord de fin ; le sens d'un dégradé ne se reflète pas.
- Contraste : le cercle est une FORME, jamais la seule couleur ; encre du ton contre le fond au moins 3:1 (blanc sur le panneau de la planche : 16,8:1) ; le filet garde visible un disque de la couleur du fond ; le glyphe prend la plus contrastée des deux encres (au moins 4,0:1, calculé). « Augmenter le contraste » : filet à 60 %.

## 5 bis. Performance
- Ne se re-rend jamais : les pastilles dont l'état ne change pas (deux seulement bougent à un choix), ni l'hôte. iOS : pastille `Equatable`. Android : paramètres stables, cercle lu en phase de dessin. Web : pastille mémoïsée, `:active`, `:hover`, `:focus-visible` en CSS, un seul écouteur clavier sur le groupe, aucun état interne.
- S'anime : l'opacité et l'échelle du cercle, le défilement de `row`. Jamais la mise en page, une ombre ni un flou.
- La disposition se calcule une fois par largeur, sans mesure par pastille (iOS : un `Layout` qui lit la largeur proposée, aucun `GeometryReader`, aucun état de largeur).
- Budget : 17 pastilles (S1) et la scène qui change de couleur en direct, sans image perdue sous des touchers ou des flèches répétés ; rien de retenu une fois l'écran quitté. Web : poids mesuré par `measure-weight.mjs`.

## 6. Jetons et mesures
Mesures de la planche : disques de 28, 30 et 34 ; écart 9 ; filet intérieur 1 px blanc 25 % ; courante : 2 px de vide puis cercle blanc de 2 px, hors du disque.

Jetons :
- disques : `MeeshyControlSize.small` (28) et `.compact` (32) ; `size-7` et `size-8` sur le web ;
- cellule : `MeeshyControlSize.tapTarget`, `.minTouchTarget`, `--target-min` ;
- filet `MeeshyBorder.regular`, cercle `MeeshyBorder.strong`, vide `MeeshySpacing.xxs`, et leurs pendants ;
- encre : `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ; ton `theme` : l'encre du thème ; encre sombre du glyphe : `indigo950` ;
- ressort : `MeeshyAnimation.springFast` et son pendant.

Géométrie, dans `MeeshyColorDotsRecipe` et nulle part ailleurs :
- le disque est centré dans sa cellule ; le premier disque s'aligne au bord du contenu, la cible déborde de (cellule − diamètre) / 2 ; l'encombrement est celui des disques ;
- par ligne : ⌊(largeur + cellule − diamètre) / cellule⌋, au moins 1 ; `row` défile quand le compte dépasse ;
- filet 25 %, pré-cercle 50 %, désactivé 40 %.

Aucun appel à `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*` dans les fichiers de K07, et aucun code de couleur : les palettes du catalogue sont faites de jetons.

Parité : `docs/product/kit/K07-MeeshyColorDots.vectors.json` (disposition, cercle, opacités, encre, courante, noms dits, contraste), lu par les trois suites. Les vecteurs de disposition portent la cellule iOS et web (44) ; Android les rejoue avec sa cellule de 48 dp.

## 7. Jumeaux
K07 ne rebranche et ne supprime aucun jumeau : le brancher changerait l'écran (pas, cercle, passage à la ligne). Il promeut la grammaire et les témoins du plus complet ; les lots d'intégration suppriment.
- iOS. DEVIENT : `BackgroundColorPalette` (`Features/Main/Components`, cible de 44, nom positionnel, conteneur nommé, `BackgroundColorPaletteTests`), enrichi de l'état courant de `ComposerSharedPalette.swatch`. Promus dans le kit : le nom positionnel (`kit.color_dots.position`, mêmes traductions que `a11y.color.position`, nombres dans les chiffres du lecteur) et ses témoins (rang humain, langues du catalogue, chiffres arabes, aucun placeholder brut).
- iOS, supprimés : par I3, la rangée de `ComposerSharedPalette` (ses puces de cible deviennent K03), `colorDot` et les trois rangées de `TextEditToolOptions`, `colorSection` de `StoryTextEditorView` ; par I4, `colorDot` et `colorOptions` de `DrawingEditToolOptions` ; par I6, `BackgroundColorPalette`, ses deux appels et la clé `a11y.color.position` ; par I10, `colorSwatch` de `CommunitySettingsScreen` et `swatch` de `ConversationAppearanceSheet`.
- Android. DEVIENT : `ColorOptions` (`ComposerDrawingOptionPanel.kt` : cellule de 44 dp, `Role.RadioButton`, `selected`), enrichi du pinceau de `BackgroundSwatch(brush)`.
- Android, supprimés : par I3, `ColorSwatch` (`ComposerTextToolbar.kt`, 3 appels) ; par I4, `ColorOptions` ; par I6, `BackgroundSwatch(brush)` (`ComposerSettingsRows.kt`), dont « Aucun » devient un disque creux et « Aléatoire » le `trailing` ; par I9, la rangée de `ComposerRetouchTextLayer.kt` ; par I10, `Swatch` de `CommunitySettingsScreen.kt` et `AccentSwatch`.
- Web. DEVIENT : `ChoiceGroup` (`components/appearance-picker-parts.tsx`) avec sa loi `arrowTarget` (`lib/appearance/picker-model.ts`) et `swatch()` (`appearance-picker-sections.tsx`).
- Web, supprimés : par I3, les deux rangées de `StudioChip` peints et `COLORS` de `routes/story-compose-editor.tsx` (les huit noms du catalogue passent en `name`) ; par I10, `swatch()`, les pastilles des sections Uni et Accent, et `arrowTarget` au profit de la loi du kit. Le web n'a ni fond de scène en couleur ni dessin : I4 et I6 construisent ces vues avec K07. `call-*`, `composer-*`, `scene-*`, `sheet` et `glass-surface` ne portent aucune pastille de couleur.

## 8. Témoins exigés
Comportements (`MeeshyColorDotsTests`, `MeeshyColorDotsTest`, `meeshy-color-dots.test.tsx`) :
- disposition : les vecteurs rendent 8 + 6 pour A3 (358 de large, `s32`), 8 + 8 + 1 pour S1 (342, `s28`), une ligne qui défile pour A13 (338, `row`) ;
- le cercle n'existe que sur la pastille dont l'`id` est `selection` ; aucun pour `nil` ou un `id` inconnu ;
- `onSelect` part une fois avec l'`id`, de nouveau sur la courante ; désactivé : ni action ni haptique ;
- un seul `light` par le site unique, aucun avec `none` ;
- nom : `name`, sinon la position en chiffres localisés, jamais le code ; rôle, état choisi, nom du groupe ;
- web : un seul arrêt de tabulation, flèches qui choisissent et s'inversent en RTL, Début, Fin, Espace, Entrée ;
- cible d'au moins 44 pt, 48 dp, 44 px pour les deux tailles ; liste vide : rien de rendu ;
- contraste du cercle et du glyphe calculé depuis la recette ; sous « réduire les animations », aucun ressort ;
- garde de source : ni verre ni code de couleur dans les fichiers de K07 ; web : `glass-site.mjs` et `check-kit.mjs` verts ;
- parité : `docs/product/kit/K07-MeeshyColorDots.vectors.json`, lu par les trois suites ; non-régression : le lot ne touche aucun jumeau ni aucun écran.

Instantanés (`MeeshyColorDots/<id>.<variante>`) : `texte`, `dessin`, `fond`, `sans-courante`, `degrade`, `theme`, `desactive` en `clair` et `sombre`, `presse` pour ceux qui se touchent, planches `grande-police` et `rtl` ; web : 390, 820 et 1440 px. Images enregistrées sur la branche du lot puis comparées au vert (`sdk-tests.yml` et `android.yml` avec `record_snapshots`, `check-kit.mjs` avec `CAPTURE_DIR`) ; Android : aucun nom de test avec « ; » ni « . ».

Catalogue : entrée K07 (`MeeshyKitCatalog+K07.swift`, `KitCatalogK07.kt`, `components/kit/catalog/k07.tsx`). Vues : `texte` A3 sur `dark`, `dessin` A13 sur `media`, `fond` S1 sur `media` (avec « Aléatoire » en `trailing`), `theme` sur `light`.

## 9. Écarts connus et choix retenus
Écarts relevés :
- La planche serre le pas à 37, 39 et 43 px : une cible de 44 n'y tient pas. Elle passe à la ligne ; tout le code défile sur une seule ligne.
- Diamètres : 28, 30, 34 sur la planche ; 28, 30, 32, 38 et 40 dans le code.
- Courante : cercle blanc hors du disque, sans échelle, sur la planche ; trait intérieur de 3 pt et échelle 1,1 à 1,15 sur iOS ; cercle `primary` ou blanc et disque de 36 sur Android ; coche dans les réglages de communauté.
- Web : la pastille courante ne se voit pas, le style peint écrase l'état pressé de `StudioChip` ; seul `aria-pressed` le dit. iOS : `BackgroundColorPalette` ne montre aucune courante.
- Noms : « #FF2E63 » sur iOS (`ComposerSharedPalette`) et Android ; aucun nom sur `BackgroundSwatch(brush)` ; `ColorSwatch` Android n'a pas d'action accessible (`detectTapGestures`).
- Cible : le disque seul (28 à 32 pt) pour les couleurs du texte et du dessin sur iOS.
- Le web offre 8 couleurs sur 14, faute de noms.
- Haptique : jouée par certains jumeaux, pas par `BackgroundColorPalette` ni par le web.
- La planche peint le vide du cercle de la couleur du panneau, même sur le verre (S1, A13).
- Registre : `TextEditPalette`, `StoryDrawingColors` et `StoryBackgroundPalette` sont des données et des lois, pas des vues ; `BackgroundSwatch` est compté deux fois, or l'un est le carré de fond du texte (A4) ; les jumeaux du web n'y figurent pas.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. `wrap` par défaut, comme la planche (A3, S1) ; `row` pour la plaque du dessin (A13), qui défile si elle déborde. (Une seule ligne qui défile partout ; deux lignes dans la plaque.)
2. Cible de 44 pt, 48 dp, 44 px tenue : les cellules se touchent, l'écart visible passe de 9 à 12 ou 16, et A13 montre huit pastilles sur neuf à 390 pt. (Pas de la planche avec des cibles de 37 à 39 de large ; débord partagé comme ↶ ↷ de K02.)
3. Deux tailles : 28 (défaut) et 32 ; le 30 de S1 devient 28, le 34 de A3 devient 32, les 38 et 40 deviennent 32 à I10. (Diamètre libre ; trois tailles 28, 30, 34.)
4. Courante : le cercle de la planche, à l'encre du ton, vide transparent, sans échelle ni coche. (Garder l'échelle ; cercle à la couleur de marque.)
5. Nom : celui que passe l'hôte, sinon la position ; jamais le code. (Le code ; un nom de famille de teinte calculé par le kit.)
6. Valeur et rappel, identifiants opaques ; retoucher la courante rappelle. (Liaison ; index.)
7. Remplissage uni, dégradé ou creux, glyphe optionnel : les dégradés, « Aucun » et « Automatique » du code sont gardés. (Uni seulement ; un second composant.)
8. Un emplacement `trailing` pour l'action qui n'est pas un choix, dans une cellule du flux. (La laisser hors du composant.)
9. Aucun verre dans K07 ; l'encre suit le ton de K01. (Paramètre de couleur du cercle.)
10. Un `light` au choix par le site unique, `none` possible. (Retour de sélection distinct ; aucun par défaut.)
11. Web : `radiogroup` dont les flèches choisissent ; la loi des flèches est copiée dans le kit, `ChoiceGroup` reste intact jusqu'à I10. (Boutons `aria-pressed` ; importer `lib/appearance`.)
12. Réponse au toucher : le pré-cercle, sans voile ni échelle. (Voile de K02 ; rétrécissement.)
13. Deviennent le composant : `BackgroundColorPalette` (iOS), `ColorOptions` (Android), `ChoiceGroup` (web). (`ComposerSharedPalette` ; `ColorSwatch` ; `StudioChip`.)
14. Aucun jumeau rebranché dans K07 ; les palettes et `TextEditPalette` restent ; le carré de fond du texte reste hors de K07. (Faire de `BackgroundColorPalette` un appelant mince dès K07.)
15. I3 offre les 14 couleurs sur le web, les huit noms gardés, les autres dites par leur position. (Rester à huit.)

## 10. Livraison iOS (lot K07, branche `claude/kit-k07-ios`)
- Fichiers : `MeeshyUI/Kit/MeeshyColorDots.swift` (valeurs, groupe, disposition, pastille), `MeeshyUI/Kit/MeeshyColorDotsRecipe.swift` (recette, encre, mots), `Kit/Catalog/MeeshyKitCatalog+K07.swift`, clé `kit.color_dots.position` du catalogue de chaînes de MeeshyUI.
- Témoins : `MeeshyColorDotsTests` (vecteurs, nom dit en fr/en/ar, déclencheur, égalité, gardes de source) et `MeeshyColorDotsSnapshotTests` (sept états, pressé, `grande-police`, `rtl`).
- Restent ouverts, chacun par son issue : l'anneau de focus clavier de K01 (#17621 : iOS n'en a pas encore, la cellule garde l'anneau du système) ; `trailing` reste dans le conteneur nommé du groupe (#17622 : il est annoncé après les pastilles, sans état choisi).
