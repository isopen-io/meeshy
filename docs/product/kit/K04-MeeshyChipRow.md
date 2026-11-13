# K04 — MeeshyChipRow (la rangée de puces de choix)

Relevé sur `origin/dev` `371d02c4a8` le 2026-11-11. Chantier #17312, milestone 258 ; issue du lot : #17599. Dépend de K00 seul. Lois 7, 8 et 13 de `docs/product/composer-vue-finale.md` ; loi 17 des appels (#17409). Planche : `chips(items,on,cls)` (ligne 228), `.chips`, `.chips span`, `.chips span.on`, `.chips.wrap` (lignes 66 à 69) et `.fade` (ligne 70). Dix vues l'emploient sur `dev` : A2, A6, A12, A16, O7, S1 (celles du registre), plus A11, A17, A19 et O6.

## 1. Rôle
Une rangée de capsules de texte, d'où l'on choisit une option ou plusieurs ; elle défile, se replie ou partage sa largeur, et s'estompe au bord derrière lequel il reste des puces.

Elle ne fait pas :
- le verre, la feuille ni la pilule qui la portent (K01, K10, K11, K15) : K04 ne pose aucune matière ;
- l'état : la sélection appartient à l'hôte, qui l'applique tout de suite (mise à jour optimiste) ;
- les libellés traduits, les compteurs (« Amis (3) »), la liste des options, ni la règle qui retire une option indisponible ;
- le menu qu'ouvre une puce à chevron, le contenu que commande un onglet ;
- les voisins : segment de 2 à 4 options (K03), vignettes à aperçu (K19, dont les polices de A2), pastilles de couleur (K07), puce d'audience et ligne de références (K24), l'indice « Pincer pour zoomer » de la frise (K22).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyChipRow.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-chip-row.tsx` |
|---|---|---|---|
| Rangée | `MeeshyChipRow(_:selection:label:…onChange:)` | `MeeshyChipRow(chips, selection, label, onChange, modifier, …)` | `<MeeshyChipRow chips selection label onChange … />` |
| Puce (valeur) | `MeeshyChip<ID: Hashable & Sendable>` | `MeeshyChip<T>`, `@Immutable` | `MeeshyChip`, `id: string` |
| Mode | `MeeshyChipRowMode { single, singleOrNone, multiple, actions }` | `enum class` identique | union des quatre chaînes |
| Disposition | `MeeshyChipRowLayout { scroll, wrap, equal }` | idem | idem |
| Lois pures | `MeeshyChipRowRule.next(selection:tapped:mode:)`, `MeeshyScrollEdges.of(content:viewport:offset:)`, `MeeshyChipRecipe.resolve(…)` | idem | `meeshyChipRowNext`, `meeshyScrollEdges`, `meeshyChipRecipe`, `meeshyChipRowStep` (`meeshy-chip-row-rule.ts`) |

Paramètres de la rangée, opaques, mêmes défauts partout :
- `chips` (ordonnées) ; `selection: Set<ID>` (ce qui est dessiné blanc) ; `label` (nom du groupe, obligatoire, non vide) ;
- `mode = single` ; `layout = scroll` ; `semantics = choice` (ou `tabs`) ; `surface = onMedia` (ou `theme`) ; `size = regular` (ou `compact`) ;
- `inset = 0` (marge de début et de fin DANS le défilement : la rangée court jusqu'aux bords de la feuille) ; `revealsSelection = true` ; `haptic = light` (ou `none`) ;
- `onChange(next, tapped)` ; `onAction: ((ID) -> Void)? = nil` ;
- désactivée : `.disabled(_:)` (iOS), `enabled = true` (Android), `disabled` (web) ; le web ajoute `data` (sondes des gates).

Une puce : `id`, `title` (vide si le glyphe suffit), `systemImage` / `icon` / `glyph = nil`, `trailing = none` (`chevron`, `remove`), `kind = choice` (`action`, `menu`), `tint = nil`, `isEnabled = true`, `accessibilityLabel = nil` (obligatoire sans titre), `hint = nil` ; `probe` sur le web.

Emplacement : `chipLabel(chip, encre)` remplace le texte du titre (un nom de police peint dans sa police) ; défaut : le titre. Aucun autre : ni pastille, ni titre de rangée, ni fond.

## 3. États
- repos (voile) et courante (blanc plein, encre sombre), tout tient : A2 (effets), A6 et A19 (albums), O6 (tri des looks), O7 (proportions), S1 (effet d'ouverture) ;
- glyphe de tête : A11 (Favoris, Boutique), A2 (globe) ; glyphe seul, nommé par l'accessibilité : A11 (Recherche) ;
- puce de menu (chevron de fin, jamais courante) : A2 « Langue : Français » ;
- déborde, bord de fin estompé : A11, A12 (deux rangées, onglets puis thèmes) ;
- déborde, défilée au milieu (deux bords estompés) ou en bout (bord de début seul) : aucune vue ; loi 17 des appels ;
- repliée, choix simple : A16 (mode d'une mention) ; repliée, choix multiple, ✕ de retrait : A17 ;
- égale (les puces se partagent la largeur) : aucune vue ici ; « Audio · Vidéo » des appels (G3) ;
- pressée, survolée, focus clavier, désactivée (rangée ou puce, contenu à 40 %), surface `theme`, teintée, `compact` : aucune vue, conservés du code.

Loi 13 :
- pas d'estompe si tout tient, ni du côté déjà atteint ; jamais de barre de défilement ;
- sans puce, la rangée ne rend rien, ni hauteur ni marge ;
- pas de puce grisée « à venir » : l'hôte retire l'option ; `isEnabled = false` ne sert qu'à un verrou momentané (publication en cours) ;
- pas de ✕ sur une puce non courante, pas de coche, pas de compteur fabriqué ;
- ni verre ni liseré sous une puce au repos (loi 1) ; pas d'anneau de focus au doigt.

## 4. Gestes et retours
- Toucher : au relâcher dans la cible. `single` : la courante ne répond pas (ni rappel ni haptique). `singleOrNone` : la courante se retire. `multiple` : bascule. `action` et `menu` : `onAction`, jamais dans la sélection. K04 calcule `next` par `MeeshyChipRowRule` et ne garde rien.
- Défiler : geste natif, inertie comprise ; un glisser ne déclenche pas de toucher. Web : molette verticale convertie tant que la rangée a de la course, puis rendue à la page.
- Montrer la courante (`revealsSelection`, en `scroll`) : à l'apparition sans animation, à chaque changement en 250 ms, centrée ; immédiat sous « réduire les animations ».
- Appui : le voile s'épaissit (8 → 15 %), la courante passe à 85 % ; aucune échelle. La réponse part au doigt posé, en moins d'une image.
- Changement d'état : fondu du fond et de l'encre, 200 ms ; l'estompe d'un bord arrive et part en 150 ms. Sous « réduire les animations » : immédiat, le voile d'appui reste.
- Haptique : un `light` par changement effectif ou action, par `HapticFeedback.light()`, `MeeshyHaptics.light()` ou `impact('light')` de `lib/view/haptics.ts` ; rien sur un toucher ignoré ou désactivé ; `none` laisse l'hôte jouer le sien.
- Survol au pointeur : le voile de l'appui. Ni appui long, ni glisser pour réordonner.

## 5. Accessibilité
- Groupe : nom `label`, conteneur qui garde ses enfants. Puce : nom `accessibilityLabel ?? title` ; glyphes et ✕ masqués.
- Rôle et valeur : choix simple ⇒ bouton sélectionné (iOS), `Role.RadioButton` et `selected` (Android), `radiogroup` / `radio` / `aria-checked` (web) ; multiple ⇒ bascule, `Role.Checkbox`, `aria-pressed` ; `tabs` ⇒ `.isTabBar`, `Role.Tab`, `tablist` / `tab` / `aria-selected` ; `action` ⇒ bouton ; `menu` ⇒ bouton et `aria-haspopup`. `hint` porte « retire le hashtag », « ouvre la liste ». Désactivée : annoncée, non activable.
- Ordre de lecture : du début à la fin, rangée après rangée en `wrap` ; l'estompe ne masque rien au lecteur d'écran, et le focus d'accessibilité amène la puce en vue.
- Cible : 44 pt, 48 dp, 44 px en hauteur, 44 au moins en largeur ; elle déborde la capsule sans changer l'encombrement, et l'écart entre deux rangées repliées vaut cible moins capsule.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le texte grandit, la capsule avec lui, sur une ligne ; `scroll` défile, `wrap` replie, une puce plus large que la rangée se coupe en fin ; mesures en `rem` sur le web.
- Web, clavier : un seul arrêt de tabulation (la courante, sinon la première) ; ← → en boucle, Début, Fin, sens inversé en arabe ; les flèches cochent en choix simple, Entrée ou Espace bascule ailleurs ; anneau `:focus-visible` de l'application, visible sur le blanc ; la puce focalisée vient en vue. iPad et Android au clavier : même anneau.
- RTL : ordre, départ du défilement et bords d'estompe miroités ; le chevron et le ✕ restent en fin.
- Contraste, calculé depuis la recette : courante 15,99:1 ; repos 13,33:1 sur feuille sombre, 5,07:1 sur verre dense devant un blanc pur, 4,30:1 sur `onLight` simple. La rangée se pose donc sur une feuille opaque ou un verre dense, comme la planche. Surface `theme`, clair et sombre : encre du thème sur son voile, 4,5:1 au moins. « Réduire la transparence » : fonds déjà pleins.

## 5 bis. Performance
- Ne se re-rend jamais : les puces pendant le défilement ; les puces dont l'état n'a pas bougé quand la sélection change ; l'hôte pendant un appui. iOS : puce `Equatable`, appui dans le style du bouton, bords = deux booléens qui ne changent qu'au seuil. Android : `MeeshyChip` stable, `canScrollBackward` / `canScrollForward` lus en phase de dessin. Web : appui et survol en CSS, bords écrits en attributs `data-` par un écouteur passif, sans état Preact.
- S'anime : l'opacité du fond et de l'encre, la largeur du dégradé du masque. Jamais la mise en page, ni un flou.
- Aucun flou ; un seul calque hors écran, et seulement s'il y a débordement.
- Budget : trente puces défilent sans image perdue, à 120 Hz comme sur un appareil d'entrée de gamme ; rien de retenu une fois l'écran quitté ; web : poids mesuré par `measure-weight.mjs`.

## 6. Jetons et mesures
Mesures de la planche : capsule 34 de haut, rayon 17, marge intérieure 12, écart glyphe-texte 6, écart entre puces 6, texte 12,5 gras, repos blanc 10 %, courante `#fff` à encre `#0E1117`, glyphes 14 (16 seul, 12 en fin), estompe sur les 18 derniers pour cent.

Jetons :
- hauteur `MeeshyControlSize.regular` (36), `compact` : `.small` (28) ; cible `.tapTarget`, `.minTouchTarget`, `--target-min` ; capsule `MeeshyRadius.pill` ;
- marges `MeeshySpacing.md` (12), `.smPlus` (10) en compact ; écarts `.xsPlus` (6) ; entre rangées repliées `.sm` (8 ; 12 dp sur Android) ;
- texte `MeeshyFont.subheadSize` (13) gras, relatif ; compact `smallSize` (12) ; glyphes `MeeshyIconSize.sm` (14) et `.xs` (12) ;
- encre `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ; encre de la courante `indigo950`, `MeeshyPalette.Indigo950`, `--ios-indigo-950` ;
- voiles `MeeshyOpacity.subtle` (repos), `.light` (appui, survol), `.intense` (courante pressée) ;
- largeur de l'estompe : `MeeshyControlSize.tapTarget` (44) ; surface `theme` : `textPrimary` et `backgroundPrimary`.

Les valeurs propres (40 % désactivé, 150, 200 et 250 ms, tolérance de bord 0,5) vivent dans `MeeshyChipRecipe`, nulle part ailleurs. Aucun appel au verre dans les fichiers de K04.

## 7. Jumeaux
K04 promeut et ne rebranche rien : le rebranchement change l'écran et revient aux lots d'intégration.
- iOS. DEVIENT : `CallFrameMoodChips`, `CallFrameMoodChip`, `CallFrameMoodChipLabel`, `CallFrameScopeChip` (`Features/Call/Views/CallFrameMoodChips.swift`, déjà partagés avec le composer). Promus avec eux : la loi `ComposerScrollEdges` et `ComposerScrollEdgeMask`, généralisés à l'axe et au sens de lecture ; `FlowLayout` de `MeeshyUI/Primitives` est réutilisé.
- iOS, supprimés : par I3, `FlowingChips` (2 appels) et les puces de `ComposerHashtagSheet` ; par I5, `ComposerLookFilterChips` et `ComposerObjectChipsRow` (0 appelant) ; par I6, `OpeningEffectChips` (SDK, 3 appels) et `ClipFadeChipRow` ; par I10, la famille `CallFrameMoodChip*`, `CallZoomLensChips`, `ThemedFilterChip` et `ConversationListFilterChipRow`, `ContactsFilterChip` (4), `AudioRecorderSourceChips` ; par I2, `ComposerScrollEdgeCue` (2 rails). Hors K04 : `CallPillChip` (K19), `ReferenceChipRow` (K24).
- Android. DEVIENT : `MoodChips` et `MoodChip` (`:feature:calls`), avec `ComposerScrollEdges` et `composerScrollEdgeCue` de `:feature:stories`.
- Android, supprimés : par I3, `ChipRow` et les `FilterChip` Material de `ComposerTextSections`, `ComposerTextToolbar`, `StoryReferenceSheets`, `StorySoundSheetParts` ; par I5, `SceneChip` et ceux de `ComposerPlacedMediaEditRail`, `ComposerMediaLookPanel` ; par I6, ceux de `ComposerBackgroundEditRail`, `ComposerSceneFrameUi`, `ComposerSettingsRows` ; par I10, `MoodChips`, `PeopleFilterChip` et `PeopleFilterRow`, `ConversationFilterBar`, `CallFilterChip`, `OnboardingChip` et les `FilterChip` restants (26 appels, 16 fichiers en tout) ; par I2, `composerScrollEdgeCue` (7). Hors K04 : `OptionChip` (K03, I4), `KindChip` (vignette, I5), `FooterChip` (K24).
- Web. DEVIENT : `CHIP`, `chipStyle`, `PANEL_ROW_SCROLL`, `PanelRow` (`components/call-panel-frame.tsx`) et `MoodChips` (`components/call-montage-moods.tsx`), avec `rowStep`, `rowWheelDelta`, `onRowKeyDown`, `onRowWheel` (`lib/calls/call-row-keys.ts`).
- Web, supprimés : par I3, `StudioChip` (`routes/story-compose-parts.tsx`, 14 emplois), `StickerTabBar` (`composer-sticker-sheet.tsx`), `SpeedPanel` (`composer-audio-trim.tsx`) ; par I5, les proportions de `story-compose-retouch-edits.tsx` ; par I6, les rangées de `story-compose-frame.tsx` ; par I10, les jumeaux des appels et, à relire un par un, les `radiogroup` et `tablist` en capsules de `unified-shop`, `frame-pack-shop`, `comment-compose-bar`, `status-compose`, `settings-packs`, `thread-export-tray`. `sheet.tsx`, `glass-surface.tsx`, `call-control-pill.tsx`, `scene-*` et `story-*` ne portent aucune rangée de puces.

## 8. Témoins exigés
Comportements (`MeeshyChipRowTests`, `MeeshyChipRowTest`, `meeshy-chip-row.test.tsx`) :
- `next` pour chaque mode : courante ignorée, retirée ou basculée ; `action` et `menu` hors sélection ;
- `onChange` part une fois ; un seul `light` par changement, aucun sur un toucher ignoré, désactivé ou avec `none` ;
- bords : tout tient ⇒ aucun ; au début ⇒ fin seule ; au milieu ⇒ les deux ; au bout ⇒ début seul ; demi-point ignoré ; RTL miroité ;
- recette : fond et encre par état × surface × teinte ; repos ≠ pressé ; sous « réduire les animations », aucune animation et voile présent ;
- nom, rôle, valeur par mode et par `semantics` ; puce sans titre refusée sans nom ; cible d'au moins 44 pt, 48 dp, 44 px ;
- rangée vide ⇒ rien de rendu ; `wrap` : une puce plus large que la rangée s'y borne ;
- la courante est en vue à l'apparition et après un changement ;
- web : flèches, Début, Fin, sens arabe, un seul arrêt de tabulation, molette ;
- performance : changer la sélection ne redessine que les puces dont l'état change ; défiler n'en redessine aucune ;
- contraste calculé depuis la recette ; garde de source : aucun verre dans les fichiers de K04 ; web : `check-kit.mjs` vert ;
- parité : `docs/product/kit/K04-MeeshyChipRow.vectors.json` (lois et recette), lu par les trois suites ; le lot ne touche aucun jumeau ni aucun écran.

Instantanés (`MeeshyChipRow/<id>.<variante>`) : `simple`, `icone`, `deborde`, `deborde-milieu`, `replie`, `multiple`, `egal`, `theme`, `compact`, `desactive`, en `clair` et `sombre`, `presse` pour `simple`, planches `grande-police` et `rtl`. iOS : suffixe `-iOS26` ; web : 390, 820 et 1440 px. Les images sont enregistrées sur la branche du lot (`sdk-tests.yml` et `android.yml` avec `record_snapshots`, `CAPTURE_DIR=docs/product/kit/captures node scripts/check-kit.mjs`) ; Android : aucun nom de test avec « ; » ni « . ».

Catalogue : entrée K04, vide sur `dev` sur les trois plateformes (`MeeshyKitCatalog+K04.swift`, `KitCatalogK04.kt`, `components/kit/catalog/k04.tsx`). Vues : `simple` S1, `icone` A2, `deborde` A12, `replie` A16, `multiple` A17 ; chaque échantillon se pose sur une plaque sombre opaque.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Registre : `CallPillChip`, `KindChip` sont des vignettes ; `ReferenceChipRow`, `FooterChip` relèvent de K24 ; `ComposerObjectChipsRow` n'a plus d'appelant. Il omet `MoodChips` d'Android, les filtres de conversation et de contacts, et tout le web.
- I5 (O6, O7) et I6 (S1) emploient des puces sans dépendre de K04 ; A19 n'appartient à aucun lot.
- La courante est blanche dans les appels, sur les trois plateformes ; elle est teintée de marque dans le composer (iOS `OpeningEffectChips`, Android `FilterChip` Material, web `StudioChip`).
- Les appels donnent un verre à chaque puce ; la planche un voile plat.
- Hauteurs : 34 sur la planche, 36 sur iOS, 44 sur le web, 48 sur Android.
- Aucune rangée de puces ne s'estompe aujourd'hui ; les rails le font sur 28 pt, en vertical. La planche n'estompe que la fin, la loi 17 des appels dit « ses deux bords ».
- Les jumeaux rétrécissent à l'appui (iOS, web `active:scale-95`) ; K02 a retiré l'échelle.
- `ComposerLookFilterChips` porte deux groupes dans une rangée : un type toujours choisi, une ambiance facultative.
- Les rôles d'Android varient : `Tab`, `RadioButton`, `Checkbox`. Le web ne joue aucun haptique sur ses puces.
- K03 (`claude/kit-k03-ios`, en cours) dessine la même pastille blanche.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. Le jumeau des appels devient le composant sur les trois plateformes. (`OpeningEffectChips` ; réécrire.)
2. Aucune matière dans K04 : voile plat ; les puces des appels se posent dans le verre de leur barre. (Dépendre de K01 ; emplacement de fond.)
3. Courante blanche à encre `indigo950` partout. (Fond de marque ; jeton `0E1117`.)
4. Voile de repos à 8 %, le jeton `subtle`. (10 % en dur ; `mediaFill` à 15 %, qui tombe à 4,33:1.)
5. Capsule de 36, cible débordante, 44 de pas entre rangées repliées. (34 en dur ; capsule de 44.)
6. Estompe par bord, seulement là où il reste des puces, sur 44. (18 % ; deux bords toujours ; 28.)
7. Composant contrôlé : `selection`, `mode`, `onChange(next, tapped)`. (Liaison ; état interne.)
8. Deux groupes dans une rangée : `multiple`, la loi de l'hôte, `haptic: none`. (Sections dans l'API.)
9. `surface: theme`, `tint` et `compact`, pour absorber les filtres de conversation et de contacts sans perdre leur couleur. (Les laisser hors du kit.)
10. `layout: equal` pour les deux puces égales des appels. (K03, qui est un choix et non deux actions.)
11. Pas d'échelle à l'appui, comme K02. (Garder le rétrécissement.)
12. Aucune chaîne dans K04 : l'hôte passe noms et aides. (Catalogue de chaînes du kit.)
13. La loi d'estompe est publique et vaut pour les deux axes : K12 et K19 la reprennent. (Une loi par composant.)
14. Texte 13 gras relatif ; la police propre d'une puce passe par `chipLabel`. (Semi-gras des jumeaux ; paramètre de police.)
15. La fiche fait foi pour la liste des jumeaux ; le registre reçoit K04 dans `depend` de I5 et I6, et A19 rejoint I3. (Laisser le registre tel quel.)
16. Aucun jumeau rebranché dans K04. (Faire de `CallFrameMoodChip` un renvoi dès K04.)
