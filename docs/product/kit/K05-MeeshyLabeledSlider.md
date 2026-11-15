# K05 — MeeshyLabeledSlider (le curseur d'un réglage continu)

Relevé sur `origin/dev` `371d02c4a8` le 2026-11-11. Chantier #17312, milestone 258. Issue du lot : #17598. Dépend de K00 (#17335). Lois 9 et 10 de `docs/product/composer-vue-finale.md`. Planche : `slider(label,pct,val)` (ligne 229) et `.sl`, `.sl .hd`, `.sl .tr` (lignes 71 à 75), employés par A2 (Taille, « 40 pt »), A3 (Épaisseur, « 2 pt »), A13 (Épaisseur, « 12 pt »), O5 (onze curseurs sans valeur, sur deux colonnes) et, par `soundRows()`, A15 (Volume, « 70 % »), que le registre ne compte pas.

## 1. Rôle

Régler UNE valeur continue entre deux bornes : le nom à gauche, la valeur lue à droite, une piste fine et un pouce dessous.

Il ne fait pas :
- le texte de la valeur (« 40 pt », « +12 », « 70 % »), les bornes, le pas ni le neutre : l'app les calcule et les passe ;
- le pas d'annulation, l'aperçu en direct, « Réinitialiser » tout (O5), « comparer », Muet : l'hôte ;
- son conteneur (panneau, plaque, pilule agrandie, feuille : K11, K15, K16) ni aucun verre : K05 n'appelle pas K01 ;
- un choix à deux à quatre crans nommés (graisse d'A2, lissage d'A13) : K03 ;
- deux poignées (coupe : K21), une position de lecture (lecteurs), une poignée de partage d'écran.

## 2. API (mêmes noms sur les trois plateformes)

| | iOS `MeeshyUI/Kit/MeeshyLabeledSlider.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-labeled-slider.tsx` |
|---|---|---|---|
| Curseur | `MeeshyLabeledSlider(_ label:value:in:…)`, `value: Binding<Double>` | `MeeshyLabeledSlider(label, value: Float, onValueChange, valueText, modifier, …)` | `<MeeshyLabeledSlider label value min max valueText onChange … />` |
| Piste seule | `MeeshySliderTrack` (même loi, même accessibilité, sans en-tête visible) | idem | `<MeeshySliderTrack>` |
| Loi pure | `MeeshyLabeledSliderRule` : `snap`, `fraction`, `value(atFraction:)`, `adjusted(up:)`, `detentCrossed`, `shouldEmit` | idem | `meeshyLabeledSliderRule` |
| Recette en valeurs | `MeeshyLabeledSliderRecipe.resolve(tone:isEnabled:isPressed:isOffNeutral:tint:)` | idem | `meeshyLabeledSliderRecipe(...)` : classes et attributs |

Paramètres, tous opaques, mêmes défauts partout :
- `label` (obligatoire, non vide) ; `valueText` (obligatoire : c'est ce que l'accessibilité annonce) ; `range` (`min`, `max` sur le web) ; `step: Double? = nil` (la TAILLE du pas, jamais un nombre de crans ; `nil` = continu) ;
- `showsValue = true` ; `neutral: Double? = nil` ; `resetLabel: String? = nil` (nom de l'action de remise au neutre, exposée seulement si `neutral` existe) ;
- `tint: Color? = nil` (remplissage ; par défaut l'encre de l'hôte) ; `haptic: MeeshyLabeledSliderHaptic { light, none } = light` ;
- `onEditingChanged: ((Bool) -> Void)? = nil` ; désactivé : `.disabled(_:)`, `enabled = true`, `disabled` ; le web ajoute `data` (sondes `data-*`).

Emplacements : aucun. Le ton vient de l'hôte (`\.meeshyGlassTone`, `LocalMeeshyGlassTone`, portée `data-glass-tone`), jamais d'un paramètre.

## 3. États

- repos avec valeur : A2 et A3 (panneau opaque du clavier), A13 (plaque de verre), A15 (feuille) ;
- repos sans valeur visible (`showsValue = false`) : O5 ;
- à la borne basse : O5 (« Flou », 0) ;
- pouce tenu (agrandi, halo), écarté du neutre (valeur à l'encre pleine), désactivé (contenu à 40 %, ni geste ni haptique, annoncé), teinté, ton `theme` (encre du thème sur une feuille claire), focus clavier, piste seule : aucune vue, conservés du code.

Loi 13 :
- pas de valeur ⇒ aucune place gardée à droite du nom ; la valeur reste annoncée ;
- pas de crans dessinés même avec un pas, pas de bulle au-dessus du pouce, pas de glyphes − / + ni d'icône en bout de piste, pas de bouton de remise propre au curseur ;
- pas de halo ni d'anneau de focus au doigt, rien d'actif sur un curseur désactivé ;
- un réglage que le média n'offre pas n'est pas monté par l'hôte : K05 n'a pas d'état « caché ».

## 4. Gestes et retours

- Glisser à l'horizontale : le pouce suit le doigt dans la même image ; la valeur est bornée puis calée sur le pas ; le changement part au plus une fois par image, et seulement si la valeur calée change.
- Toucher bref sur la piste : le pouce y va. Un glissé vertical reste à l'hôte (défilement d'O5, feuille d'A15).
- `onEditingChanged(true)` au début du geste ; `(false)` au lever, à l'annulation, si le curseur disparaît doigt posé, et après chaque ajustement au clavier ou au lecteur d'écran : l'hôte en fait UN pas d'annulation.
- Avec `neutral` : deux touchers sur la valeur la remettent au neutre (double clic, ou Suppr au clavier sur le web).
- Haptique : un `light` quand la valeur franchit le neutre ou atteint une borne, un à la remise ; aucun par pas. Par `HapticFeedback.light()`, `MeeshyHaptics.light()`, `impact('light')` de `lib/view/haptics.ts`.
- Pouce tenu : échelle 1,2 et halo de 32 à 22 %, ressort rapide. « Réduire les animations » : pas d'échelle, le halo reste.
- Valeur changée par l'hôte (remise, annulation) : le pouce glisse en 200 ms, sans animation sous « réduire les animations » ; jamais d'animation pendant le glissé.
- Survol au pointeur (web, iPad) : demi-halo.

## 5. Accessibilité

- Un seul élément : nom = `label`, rôle curseur réglable, valeur = `valueText` (jamais un pourcentage brut). Les deux textes visibles sont masqués.
- iOS : `accessibilityRepresentation` d'un `Slider` système ; Android : sémantique du `Slider` Material, `stateDescription` ; web : `<input type="range">`, `aria-label`, `aria-valuetext`.
- Balayage VoiceOver ou TalkBack, Page préc. / suiv. : 5 % de l'étendue, arrondi au pas, un pas au moins. Flèches : le pas (1 % de l'étendue si continu). Début / Fin : les bornes.
- Remise au neutre : action nommée `resetLabel` (iOS, Android), `aria-keyshortcuts="Delete"` et `aria-description` (web).
- Cible : bande de 44 pt, 48 dp, 44 px sur toute la largeur, centrée sur la piste ; elle déborde le dessin sans changer l'encombrement.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le nom passe à deux lignes, la valeur garde sa ligne (chiffres à chasse fixe), piste et pouce ne grandissent pas ; le web écrit les textes en `rem`.
- Web, clavier : Tab atteint le curseur, anneau `:focus-visible` autour du pouce, visible sur verre clair et sombre. iPad et Android au clavier : même anneau.
- RTL : nom au bord de début, valeur au bord de fin, la piste se remplit depuis le bord de début, les flèches s'inversent ; les chiffres sont à l'hôte.
- Contraste, calculé sur les fonds de la planche : nom 16,8:1 sur le panneau opaque, 6,1:1 sur verre dense au-dessus d'une image blanche ; valeur 12,4:1 et 5,0:1 ; pouce et remplissage au moins 5:1. La piste vide (2:1) ne porte pas l'information. Sur une feuille claire, le ton `theme` passe tout à l'encre du thème.

## 5 bis. Performance

- Ne se re-rend jamais : les dix autres curseurs d'O5 pendant qu'on en glisse un, ni l'en-tête du curseur glissé si le texte de la valeur ne change pas. iOS : `Equatable` sur les valeurs, fermetures hors comparaison. Android : paramètres stables, position lue en phase de dessin. Web : composant mémoïsé, remplissage écrit dans une propriété CSS sur l'élément, sans état.
- S'anime : la transformation du pouce (translation, échelle) et l'opacité du halo ; le remplissage est une mise à l'échelle ou un dégradé repeint. Jamais la mise en page, ni un flou.
- Budget : aucune image perdue en glissant un des onze curseurs d'O5 ; au plus un changement émis par image ; rien de retenu une fois l'écran quitté. Web : poids suivi par `measure-weight.mjs`.

## 6. Jetons et mesures

Mesures de la planche : colonne, écart 7 entre l'en-tête et la piste ; nom 12,5 semi-gras ; valeur 12 à 70 % ; piste haute de 4, rayon 2, blanc 22 % ; remplissage blanc ; pouce 20, blanc, ombre y 2, flou 6, noir 35 % ; O5 : deux colonnes de 162, écarts 12 et 18.

Jetons :
- encre : `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ; valeur : `onMediaSecondary` (85 %) ; piste vide : `mediaHairline`, `MediaHairline` (20 %) ;
- textes : `MeeshyFont.subheadSize` semi-gras (13) et `MeeshyFont.smallSize` (12) en taille relative ; `--ios-font-subhead`, `--ios-font-small` ; `labelMedium` sur Android ;
- espaces : `MeeshySpacing.xsPlus` (6) sous l'en-tête, `sm` entre nom et valeur ; cible : `MeeshyControlSize.tapTarget`, `minTouchTarget`, `--target-min` ; ressort : `MeeshyAnimation.springFast` et ses pendants ; « réduire les animations » : `accessibilityReduceMotion`, `LocalReduceMotion`, `reducedMotion()`.

Les valeurs propres (piste 4, pouce 20, halo 32 à 22 %, échelle 1,2, désactivé 40 %, ombre du pouce) vivent dans `MeeshyLabeledSliderRecipe`, nulle part ailleurs. Aucune couleur en dur, aucun verre.

## 7. Jumeaux

K05 ne rebranche et ne supprime aucun jumeau : le rebranchement change l'écran et revient aux lots d'intégration.

- iOS. DEVIENT : `MediaVolumeSlider` (`MeeshyUI/Media/MediaTrimStrip.swift`, 2 hôtes) pour la grammaire — nom, valeur lue, neutre, remise à deux touchers, action nommée — et la piste dessinée de `ComposerFlashIntensitySlider` avec sa loi `ComposerFlashIntensity`, portée à l'horizontale.
- iOS, supprimés : par K21, `MediaVolumeSlider` ; par I3, les curseurs de `TextEditToolOptions` (taille, contour, marge, liseré), de `StoryTextEditorView` et de `StoryAudioCell` ; par I4, `thicknessOptions` de `DrawingEditToolOptions` ; par I5, `slider(_:value:)` de `ComposerMediaAdjust` et celui de `ComposerObjectTimingControls` ; par I6, `ClipInspector`, `KeyframeInspector`, `TransitionInspector` ; par I9, le gain d'`AudioEditorToolPanel` ; par I10, `CallModeControls` (2), `ConversationAppearanceSheet` (2), `StoryFilterGridView`. Soit 23 des 26 `Slider(` du dépôt ; les 3 lecteurs restent.
- Android. DEVIENT : `AdjustmentSlider` (`ComposerImageAdjustmentsPanel.kt` : nom, valeur lue, neutre, double toucher, action d'accessibilité, 48 dp).
- Android, supprimés : par I3, `ValueSlider`, `ComposerVolumeRow`, le curseur de `StorySoundSheetTracks` ; par I4, celui de `ComposerDrawingOptionPanel` ; par I5, `AdjustmentSlider`, `TimeSlider` ; par I6, les deux de `ComposerSettingsRows` ; par I9, `ComposerRetouchVideoPanels` et `AudioEditorToolPanel` ; par I10, `PanelSlider`, `EffectsSlider`, `PhotoSliders`. `OverlayMediaPreview` (lecture) reste.
- Web. DEVIENT : `Slider` d'`appearance-picker-photo.tsx` (nom visible, 44 px, relâchement au pointeur, au clavier et à la perte du focus), avec l'`aria-valuetext` de `call-effects-mode.tsx`.
- Web, supprimés : par I3, le curseur de `VolumePanel` (`composer-audio-trim.tsx`) ; par I4, celui de `story-compose-camera-flash.tsx` (piste seule) ; par I10, `Slider` d'`appearance-picker-photo` (2 emplois), de `lens-editor-layer` (3) et celui de `call-effects-mode`. Les six bornes de coupe vont à K21 ; les `role="slider"` de lecture restent. `call-glass-button`, `call-control-pill`, `glass-surface`, `sheet`, `scene-*` et `story-*` n'ont aucun curseur de réglage. A2, A3, A13 et O5 n'existent pas sur le web : I3, I4 et I5 les construisent avec K05.

## 8. Témoins exigés

Comportements (`MeeshyLabeledSliderTests`, `MeeshyLabeledSliderTest`, `meeshy-labeled-slider.test.tsx`) :
- loi : bornage, calage sur le pas, fraction ↔ valeur, miroir RTL, pas d'ajustement, franchissement du neutre et d'une borne ;
- aucun changement émis si la valeur calée est la même ; un seul par image ;
- `onEditingChanged` : vrai, faux, faux à la disparition, et la paire autour d'un ajustement au clavier et de la remise ;
- nom, rôle, valeur annoncée même quand `showsValue` est faux ; action de remise absente sans `neutral` ;
- un `light` au neutre, à la borne et à la remise ; aucun avec `none` ni désactivé ;
- recette : repos, tenu, écarté du neutre, désactivé, teinté, ton `theme` ; sous « réduire les animations », échelle 1 et halo présent ;
- cible d'au moins 44 pt, 48 dp, 44 px ; contraste calculé depuis la recette ;
- garde de source : aucun verre, aucune couleur en dur ; web : `check-kit.mjs` vert ;
- parité : `docs/product/kit/K05-MeeshyLabeledSlider.vectors.json`, lu par les trois suites ; non-régression : le lot ne touche aucun jumeau ni aucun écran.

Instantanés (`MeeshyLabeledSlider/<id>.<variante>`) : `valeur`, `sans-valeur`, `borne-basse`, `neutre`, `teinte`, `theme`, `desactive`, `piste-seule`, `grille` en `clair` et `sombre`, `presse` pour ceux qui se touchent, planches `grande-police` et `rtl` ; web à 390, 820 et 1440 px. Images enregistrées par la CI sur la branche du lot (`sdk-tests.yml` et `android.yml`, entrée `record_snapshots` ; `CAPTURE_DIR=docs/product/kit/captures node scripts/check-kit.mjs`).

Catalogue : entrée K05, vide sur `dev` (`MeeshyKitCatalog+K05.swift`, `KitCatalogK05.kt`, `components/kit/catalog/k05.tsx`). Vues : `valeur` A2 sur `dark`, `sans-valeur` et `grille` O5 sur `media`, `borne-basse` O5, `theme` sur `light`.

## 9. Écarts connus et choix retenus

Écarts relevés :
- Le registre donne quatre vues ; la planche en a cinq (A15, par `soundRows()`). K21 compose donc K05.
- Aucun type commun : 26 `Slider(` système sur iOS (9 dans l'app, 17 dans MeeshyUI), 15 `Slider` Material et un curseur dessiné sur Android, 5 `input range` de réglage sur le web. Un seul nom public : `MediaVolumeSlider`.
- Disposition : la planche pose nom et valeur AU-DESSUS de la piste ; le code les aligne (icône · piste · valeur sur iOS, libellé de 88 dp à gauche dans les appels Android, valeur sous la piste sur le web).
- Teinte : blanc sur la planche ; violet de marque, blanc, accent, indigo, jaune selon l'écran.
- Pouce : 20 sur la planche ; 28 pour le système iOS (verre sous iOS 26), barre 4 × 44 pour Material, 16 environ pour le navigateur. La planche le laisse déborder de 10 aux bornes.
- O5 : la planche montre onze curseurs sans valeur ; iOS et Android montrent un curseur à la fois, avec sa valeur signée estompée au neutre.
- Le curseur du flash est vertical, sans nom visible, hors planche ; celui d'Android s'annonce « bouton » et ne se règle pas à TalkBack.
- `HapticFeedback` (iOS) n'a pas de retour « sélection ». La taille du texte va de 14 à 160 dans un éditeur et de 14 à 60 dans l'autre : les bornes sont à l'hôte.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. Piste et pouce DESSINÉS à la géométrie de la planche, sur le moteur natif quand il se laisse redessiner : `Slider` Material avec ses emplacements `thumb` et `track`, `input range` restylé ; iOS dessine et rend l'accessibilité par `accessibilityRepresentation`. (Curseur système teinté ; moteur maison sur les trois.)
2. Le pouce est un disque blanc plein sur toutes les versions d'iOS : le curseur vit toujours dans un panneau ou un verre, et un verre ne se pose pas sur un verre. (Curseur système à pouce Liquid Glass sous iOS 26.)
3. Nom et valeur au-dessus de la piste partout ; les icônes de bout de piste disparaissent, le nom les remplace. (Garder la ligne icône · piste · valeur.)
4. K05 sait taire la valeur et l'annonce toujours ; à I5, O5 garde sa valeur signée visible. (O5 sans valeur, comme dessiné.)
5. La remise au neutre par deux touchers et son action nommée sont conservées ; écartée du neutre, la valeur passe à l'encre pleine. (Seul le « Réinitialiser » d'O5.)
6. Valeur à `onMediaSecondary` (85 %) : 5,0:1 sur verre dense, là où les 70 % de la planche donnent 4,0:1. (70 %.)
7. Remplissage blanc par défaut, `tint` pour l'accent d'une conversation ; le violet des outils de texte et de dessin part à I3 et I4. (Marque par défaut.)
8. Le pouce reste dans la piste : son centre va de 10 à largeur − 10. (Débord de 10 comme la planche.)
9. Toucher la piste y porte le pouce ; seul le glissé horizontal règle. (Pouce seul saisissable.)
10. Un tic au neutre, aux bornes et à la remise, aucun par pas. (Aucun tic pendant le glissé ; un tic par pas.)
11. Horizontal seulement. Le curseur vertical du flash prête sa piste et sa loi, reste dans l'app, et I4 statue ; son annonce « bouton » sur Android devient une issue. (Paramètre `axis`.)
12. La piste seule est un type public, `MeeshySliderTrack` ; le nom y reste obligatoire. (Paramètre « nom masqué ».)
13. Pas d'ajustement de 5 % de l'étendue, arrondi au pas. (Toujours le pas ; les 10 % du système.)
14. Les curseurs des appels partent à I10 : I1 ne dépend pas de K05. Les lecteurs et les bornes de coupe restent hors de K05. (Ajouter K05 aux dépendances d'I1.)
15. Exécution par sonnet sur les trois plateformes : un geste dessiné, une loi pure et deux jumeaux à fondre sur iOS. (haiku, comme l'écrit le registre.)

## 10. Livraison iOS (relecture du 2026-11-11)
Ce que le composant iOS fait de la fiche, là où elle laissait un choix ouvert ; chaque choix a son issue `décision-produit`.
- Fichiers : `MeeshyLabeledSlider.swift` (les deux vues), `MeeshyLabeledSliderRule.swift` (loi, effets, commandes, `MeeshyLabeledSliderInteraction`), `MeeshyLabeledSliderRecipe.swift` (recette et jetons). L'interaction rend chaque geste en EFFETS (`editing`, `value`, `haptic`) : les témoins lisent les effets, la vue les joue.
- Halo du pouce tenu : disque de 32 pt à 22 % de l'encre ; survol au pointeur (iPad) : la moitié, 11 %.
- Accessibilité : un élément `accessibilityElement(children: .ignore)`, nom, valeur `valueText`, `accessibilityAdjustableAction` au pas de 5 % et l'action nommée de remise ; pas d'`accessibilityRepresentation` d'un `Slider` système, dont le balayage impose ses 10 % et contourne la paire `onEditingChanged` et le tic.
- Clavier : iOS 17 et plus (`focusable`, `onKeyPress`) — flèches (inversées en RTL pour ←/→), Page préc. / suiv., Début / Fin, Suppr pour la remise ; anneau dessiné autour du pouce au focus clavier seulement. iOS 16 : le lecteur d'écran et l'accès complet au clavier passent par l'action réglable.
- Geste : le glissé part au-delà de 6 pt, l'axe se décide au premier mouvement (vertical ⇒ rendu à l'hôte) ; un toucher bref porte le pouce (une paire `onEditingChanged`). L'annulation est lue par un `@GestureState`, la disparition par `onDisappear`.
- Dessin : coordonnées forcées de gauche à droite sous la piste, le miroir RTL étant dans la fraction ; ne bougent que la translation du remplissage (capsule décalée sous un masque) et du pouce, l'échelle du pouce et l'opacité du halo. Valeur changée hors du doigt : 200 ms ; aucune animation doigt posé.
- Ton `theme` : pouce, remplissage, halo et nom à `MeeshyColors.textPrimary`, piste vide à 20 % de cette encre.
- Performance : `MeeshyLabeledSlider`, `MeeshySliderTrack` et l'en-tête sont `Equatable` sur leurs valeurs (fermetures hors comparaison) et montés `.equatable()`.
