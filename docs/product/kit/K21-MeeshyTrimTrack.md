# K21 — MeeshyTrimTrack (la piste de coupe)

Relevé sur `origin/dev` `0af2664ebf4` le 2026-11-13. Chantier #17312, milestone 258 ; issue du lot : #18085 ; origine : #17110, fermée (« un seul Rogner et régler »). Dépend de K00. Lois 6, 7, 8, 13, 14 et 17 de `docs/product/composer-vue-finale.md` (le registre cite la loi 9, qu'aucune des trois vues n'emploie). Planche : `trimTrack(o)` (ligne 265), avec `strip()` et `waveBand()` (263-264). `soundRows()` (266) n'est pas dans K21 (§ 9, choix 1). Vues : A15 (son, dans une feuille), O8 (vidéo, dans la pilule agrandie), C2 (vidéo, nue au-dessus de la pilule de retouche).

## 1. Rôle
Désigner sur UNE piste, qui montre la source entière, la plage qu'on garde : deux poignées, les zones écartées assombries, une tête de lecture, les bornes et la durée gardée lisibles.

Elle ne fait pas :
- le contenu de la piste (onde, vignettes, leur extraction, leur cache, leur attente) : l'hôte le peint dans `content` ;
- les textes (« 0:02 », « Gardé 0:07 », « Extrait 0:15 », le millième) : l'hôte les formate ;
- la lecture, la boucle, l'image exacte sous la poignée, le pas d'annulation, l'écriture des bornes dans le modèle, l'export ;
- Volume, Muet, Boucle, Atténuer, Langue du son, Transcrire (K05, K06, hôte), le bouton lecture (K02), le titre « Couper · Coupe sans perte », la note d'image clé, la capsule d'un plafond (K14) ;
- son conteneur (feuille K15, pilule agrandie K11) ni aucun verre : K21 n'appelle pas K01 ;
- la frise (K22), ni les poignées de ses barres (`ClipTrimHandles` y reste).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyTrimTrack.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-trim-track.tsx` |
|---|---|---|---|
| Piste | `MeeshyTrimTrack(_ names:range:duration:minimumSpan:…content:)`, `range: Binding<ClosedRange<Double>>` | `MeeshyTrimTrack(names, range, onRangeChange, duration, minimumSpan, modifier, …, content)` | `<MeeshyTrimTrack names start end duration minimumSpan onChange …>{content}</MeeshyTrimTrack>` |
| Partie tenue | `MeeshyTrimTrackPart { start, end, playhead }` | idem | `'start' \| 'end' \| 'playhead'` |
| Loi pure | `MeeshyTrimTrackRule` : `clamped`, `movingStart`, `movingEnd`, `canTrim`, `stop`, `adjusted(part:up:step:)`, `playhead(in:)`, `preciseScale`, `precisionWindow`, `shouldEmit` | idem | `meeshyTrimTrackRule` (`meeshy-trim-track-rule.ts`) |
| Géométrie | `MeeshyTrimTrackGeometry(totalWidth:inset:duration:)` : `x(for:)`, `time(atX:)`, `pointsPerSecond` | idem | idem |
| Recette | `MeeshyTrimTrackRecipe.resolve(tone:selection:isEnabled:held:isPrecise:)` | idem | `meeshyTrimTrackRecipe(…)` : classes et attributs |

Paramètres, opaques, mêmes défauts partout (temps en secondes de la source) :
- `names: MeeshyTrimTrackNames` (obligatoire) : `track`, `start`, `end`, `playhead`, `precisionHint` ;
- `range` ; `duration` (la largeur rendue vaut TOUTE la source) ; `minimumSpan` (obligatoire, > 0) ; `maximumSpan: Double? = nil` ;
- `timeText: (Double, MeeshyTrimTrackTimeStyle) -> String` (obligatoire ; styles `clock`, `precise`, `spoken`) ; `keptText: String? = nil` (texte du centre du relevé) ;
- `playhead: Double? = nil` (Android : `(() -> Double)?`, lue au dessin ; web : valeur, plus `painterRef` pour une horloge de l'hôte) ; `onSeek: ((Double) -> Void)? = nil` ;
- `selection: MeeshyTrimTrackSelection { kept, removed } = kept` ; `height: MeeshyTrimTrackHeight { regular (56), tall (60) } = regular` ;
- `precision: MeeshyTrimTrackPrecision { loupe, none } = loupe` ; `step = 0.1` ; `haptic { standard, none } = standard` ;
- `onEditingChanged: ((MeeshyTrimTrackPart, Bool) -> Void)? = nil` ; désactivée : `.disabled(_:)`, `enabled = true`, `disabled` ; le web ajoute `data`.

Emplacement : `content` (obligatoire), rogné à la piste, posé sur un lit sombre. Le ton vient de l'hôte (`\.meeshyGlassTone`, `LocalMeeshyGlassTone`, `data-glass-tone`) et ne teinte que le relevé.

## 3. États
- onde seule, plage au milieu, tête dans la plage, relevé « 0:18 · Extrait 0:15 · 0:33 » : A15 ;
- vignettes avec onde dessous (`tall`), relevé « 0:02 · Gardé 0:07 · 0:09 » : O8 ;
- la même, nue sur fond noir au-dessus de la pilule : C2 ;
- plage = source entière (cadre aux deux bouts, aucun voile) : aucune vue, état d'ouverture du code ;
- poignée tenue, tête tenue, précision (loupe), butée (plancher, plafond, bord), retrait (`removed` : l'intérieur est voilé, poignées à la couleur d'erreur), désactivée (contenu à 40 %, ni geste ni haptique, annoncée), non coupable, sans tête, sans relevé, ton `theme`, focus clavier : aucune vue, conservés du code.

Loi 13 :
- `playhead` nul ⇒ ni trait ni élément d'accessibilité ; `onSeek` nul ⇒ tête dessinée mais non saisissable, toucher la piste ne fait rien ;
- `keptText` nul ⇒ pas de relevé, aucune place gardée ; les valeurs restent annoncées ;
- `duration ≤ minimumSpan` ⇒ ni poignées, ni cadre, ni voile ; la tête reste ;
- en précision, l'autre poignée, la tête, le liseré et le relevé s'effacent ;
- jamais : bouton lecture, titre, note, règle graduée au repos, bulle de temps hors précision, flèche de poignée hors champ (la piste ne défile pas), pastille ronde sur la tête, verre.

## 4. Gestes et retours
- Glisser une poignée (dès 2 pt, à l'horizontale) : elle suit le doigt dans la même image, course mesurée dans le repère global. En butée elle s'arrête : elle ne traverse ni ne pousse l'autre.
- Appui long de 0,4 s sur une poignée (jeu ≤ 4 pt) : précision. Une loupe couvre la piste ; le doigt fait défiler une règle (un trait par 10 ms, un grand par 100 ms) sous un trait fixe au centre, à 500 pt/s au moins (40 × au plus) ; le temps au millième se lit dans une capsule au-dessus.
- Toucher la piste : la tête s'y pose (`onSeek`). Glisser la tête : `onSeek` à chaque image, bornée à la plage gardée (à la source en `removed`). Sous une poignée, la poignée garde le geste.
- Un glissé vertical est rendu à l'hôte (feuille d'A15).
- `onEditingChanged(part, true)` au début ; `(part, false)` au lever, à l'annulation par le système, si la piste disparaît doigt posé, et autour de chaque ajustement au clavier ou au lecteur d'écran. L'hôte en fait UN pas d'annulation et relance sa boucle.
- Haptique : `light` au toucher qui pose la tête, `medium` à l'entrée en précision, `light` à l'arrivée en butée (une fois par arrivée), rien par image. Par `HapticFeedback`, `MeeshyHaptics`, `impact()` de `lib/view/haptics.ts`.
- Poignée tenue : sa prise passe de 18 à 26 de haut (ressort rapide) ; tête tenue : trait de 3 à 4. Loupe : fondu de 150 ms. Plage changée par l'hôte (annuler, réinitialiser) : glissement de 200 ms, jamais pendant un geste.
- « Réduire les animations » : aucun fondu ni glissement, les états se posent d'un coup ; la loupe reste.
- Survol au pointeur (web, iPad) : curseur de redimensionnement horizontal, prise à 22.

## 5. Accessibilité
- Un groupe nommé `names.track`, valeur = durée gardée (`spoken`). Dedans, dans l'ordre de la piste : Début, Tête de lecture (si `onSeek`), Fin. Le relevé visible est masqué.
- Chaque élément est réglable : nom = `names.*`, valeur = `timeText(t, spoken)`, indication = `names.precisionHint` sur les poignées. iOS : `accessibilityAdjustableAction` ; Android : `progressBarRangeInfo` et `setProgress` (plus jamais « bouton ») ; web : `role="slider"`, `aria-valuemin/max/now`, `aria-valuetext`.
- Pas : `step` (0,1 s) par balayage pour une poignée, 1 s pour la tête ; les butées de la loi s'appliquent.
- Clavier (web, iPad, Android) : Tab dans l'ordre de lecture ; ← → = `step` ; Maj + ← → = 0,01 s ; Page préc. / suiv. = 1 s ; Début / Fin = les butées. Anneau `:focus-visible` autour de la poignée, lisible sur le jaune et sur le voile.
- Cibles : 44 pt, 48 dp, 44 px par poignée et pour la tête, centrées sur le trait ; elles débordent le dessin de 15 de chaque côté sans changer l'encombrement.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le relevé grandit, reste sur une ligne (chiffres à chasse fixe, réduction jusqu'à 70 %, le centre prioritaire) ; piste, poignées et tête ne grandissent pas. Web : textes en `rem`.
- RTL : le temps ne se met pas en miroir. Piste et relevé sont forcés de gauche à droite, → va toujours plus tard.
- Contraste, calculé : jaune sur le voile au-dessus d'une image blanche 3,7:1 ; jaune contre l'image blanche gardée 1,7:1 seulement, d'où la prise sombre (4,1:1 sur le jaune) et l'ombre de la poignée ; tête blanche 21:1 sur le lit, halo sur image claire ; relevé à 85 % : 12,4:1 sur la feuille, 14,8:1 sur noir ; durée gardée en jaune 10,1:1. Ton `theme` clair : relevé à l'encre du thème, durée gardée en encre pleine semi-grasse (le jaune y tomberait à 1,7:1).

## 5 bis. Performance
- Ne se re-rend jamais pendant un geste ni quand la tête avance : `content` (vignettes extraites UNE fois, onde). iOS : couches `Equatable` montées `.equatable()`, fermetures hors comparaison ; Android : paramètres stables, positions lues en phase de placement ou de dessin ; web : composant mémoïsé, positions écrites en propriétés CSS sur la racine, hors de React.
- S'animent : la translation des poignées et de la tête, l'échelle horizontale des voiles et des deux barres du liseré, l'opacité de la loupe. Jamais la mise en page, un flou ni un filtre. La loupe ne dessine que sa fenêtre visible, jamais la piste dilatée.
- Budget : aucune image perdue à 120 Hz en glissant une poignée sur 12 vignettes et 256 échantillons ; au plus un changement émis par image, et seulement si la plage bornée change ; rien de retenu une fois la piste quittée. Web : poids suivi par `measure-weight.mjs`.

## 6. Jetons et mesures
Mesures de la planche : piste haute de 56 (onde) ou 60 (vignettes 44 + onde 16 sur noir 35 %), rayon 12 ; voile `rgba(10,10,14,.62)` ; cadre jaune `#FFD23F` de 3 en haut et en bas, poignées de 14, prise 3 × 18 de rayon 2 ; tête de 3, rayon 2, blanche, halo blanc de 8 ; relevé 12 semi-gras à chasse fixe, blanc 70 %, centre en jaune ; écart piste-relevé 6 (C2) à 12 (feuille).

Jetons :
- jaune : `MeeshyColors.mediaTrim`, nouvel ALIAS de `warning` (#FBBF24), avec ses miroirs `MeeshyMediaChromeColors.MediaTrim` et `--ios-media-trim` (généré) ; retrait : `MeeshyColors.error` ;
- lit et voile : `mediaBackdrop` ; tête : `onMedia` ; relevé : `onMediaSecondary` ;
- rayon `MeeshyRadius.smPlus` (12) ; poignée `MeeshySpacing.mdPlus` (14) ; écart `xsPlus` (6) ; texte `MeeshyFont.smallSize` relatif, chasse fixe ; cible `MeeshyControlSize.tapTarget`, `minTouchTarget`, `--target-min` ; ressort `MeeshyAnimation.springFast` ; `accessibilityReduceMotion`, `LocalReduceMotion`, `reducedMotion()`.

Les valeurs propres (voile 62 %, liseré 3, prise 3 × 18 puis 26 à 55 % de `mediaBackdrop`, tête 3 puis 4, loupe à 78 %, désactivé 40 %, hauteurs 56 et 60) vivent dans `MeeshyTrimTrackRecipe`, nulle part ailleurs. Aucune couleur en dur, aucun verre.

## 7. Jumeaux
K21 ne rebranche et ne supprime rien : il extrait, les lots d'intégration adoptent.

- iOS. DEVIENT : `ComposerTrimTrack` (cibles de 44 pt, loupe, tête saisissable, annulation par `@GestureState`, VoiceOver au dixième) dépouillé de sa session, avec `ComposerTrimTrackGeometry` ; il prend à `MediaTrimStrip` le cadre fermé, le voile à 62 % et la convention « largeur = source entière », et à `MediaTrimRule` / `ComposerTrimRule` leurs bornages, réunis dans `MeeshyTrimTrackRule` avec plancher et plafond en paramètres.
- iOS, supprimés : par I3, la piste interne de `MediaTrimStrip` (`piste`, `voile`, `fenetre`, `languette`, `teteDeLecture`, son emploi de `ClipTrimHandles`), `MediaVolumeSlider` (K05) et `MediaTrimChip` (K06) ; par I9, `ComposerTrimTrack`, `ComposerTrimHandle`, les bornages de `ComposerTrimRule`, `AudioEditorWaveform`. Restent : `MediaTrimStrip` comme COMPOSITION (K21 + K05 + K06), `MediaTrimSourceTrack` et `WaveformStrip` (contenu), `AudioPostTrimZone` et `ComposerMediaTrimBand` (hôtes), `ClipTrimHandles` (frise, K22).
- Android. DEVIENT : `MediaTrimStrip` (`component/media` : source entière, voile, `LiveBounds`, cibles de 48 dp), complété de ce qui lui manque : tête, sémantique réglable, loupe, jaune, sens forcé.
- Android, supprimés : par I3, `TrimHandle`, `Legend` et `LiveBounds` privés de `MediaTrimStrip.kt`, puis `MeeshyAudioTrimmer`, `AudioTrimHandle` et `AudioTrimHandlePlacement` (aucun site d'appel en production) ; par I9, la piste d'`AudioEditorWaveform.kt`. Adoptent : `SoundTrimSection` (I3), `PlacedTrimSection` et `BackgroundTrimStrip` (I5), `RetouchTrimPanel` (I9).
- Web. Aucun jumeau à deux poignées. Le moteur de geste vient de `scene-scrub-bar.tsx` (capture du pointeur, peinture hors de React, `seekFraction`, `data-claims-gesture`), la sémantique de `StudioTrimControls`. Le composant se construit depuis la fiche et le composant iOS fusionné.
- Web, supprimés : par I3, les quatre bornes `input range` de `composer-audio-trim.tsx` (fenêtre et coupe) ; par I9, les deux de `StudioTrimControls` (`routes/story-compose-retouch-edits.tsx`). `scene-scrub-bar`, `media-filmstrip`, `lib/view/waveform.ts` restent (lecture, visionneuse, enregistrement). `call-glass-button`, `call-control-pill`, `glass-surface`, `sheet`, `scene-*`, `story-*` n'ont aucune piste de coupe. A15, O8 et C2 n'existent pas sur le web : I3, I5 et I9 les construisent.

## 8. Témoins exigés
Comportements (`MeeshyTrimTrackTests`, `MeeshyTrimTrackTest`, `meeshy-trim-track.test.tsx`) :
- loi : bornage, plancher, plafond, non-croisement, la borne opposée ne bouge jamais, x ↔ temps avec retrait, tête bornée, pas d'ajustement, échelle et fenêtre de précision ;
- au plus un changement par image, aucun si la plage bornée est la même ;
- `onEditingChanged` : paire au glissé, à l'annulation, à la disparition, autour d'un ajustement ;
- trois éléments réglables, leur ordre, noms et valeurs ; tête absente de l'arbre sans `onSeek` ; relevé absent sans `keptText` ;
- non coupable : ni poignées ni cadre ; précision : l'autre poignée et la tête s'effacent ;
- haptique : pose de la tête, entrée en précision, butée ; aucune avec `none` ni désactivée ;
- sens forcé en RTL ; cibles de 44 pt, 48 dp, 44 px ; contraste calculé depuis la recette ;
- gardes de source : aucun verre, aucune couleur en dur, aucun type du composer ; la garde « un seul rogneur » (`MediaTrimAdjustTests`, `ComposerSceneFriseTests`) admet `MeeshyTrimTrack` et refuse tout autre `*TrimTrack` hors `ComposerTrimTrack` ; web : `check-kit.mjs` vert ;
- parité : `docs/product/kit/K21-MeeshyTrimTrack.vectors.json`, lu par les trois suites ; non-régression : le lot ne touche ni jumeau ni écran.

Instantanés (`MeeshyTrimTrack/<id>.<variante>`) : `onde`, `vignettes`, `nue`, `entiere`, `precision`, `retrait`, `non-coupable`, `sans-tete`, `sans-releve`, `desactivee`, `theme`, en `clair` et `sombre`, `presse` (poignée tenue), planches `grande-police` et `rtl` ; web à 390, 820 et 1440 px.

Catalogue : entrée K21, vide sur `dev` (`MeeshyKitCatalog+K21.swift`, `KitCatalogK21.kt`, `components/kit/catalog/k21.tsx`), contenu de démonstration fixe. Vues : `onde` A15, `vignettes` O8, `nue` C2.

Preuve : `sdk-tests.yml`, `android.yml` (`assembleDebug`, `testDebugUnitTest`), `bun run gate`. Consigne du porteur : gardes locales vertes et runs de branche annulés ⇒ le lot fusionne dans `dev` et se prouve sur `dev` ; rouge sur `dev`, il est corrigé ou retiré aussitôt.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Depuis #17110, iOS a déjà UN rogneur de SDK (`MediaTrimStrip`, gardé par un test), mais deux pistes : la sienne (poignées de `ClipTrimHandles` : cible de 24 pt, pas d'accessibilité de 5 POINTS, tête non saisissable à pastille ronde) et `ComposerTrimTrack` (la plus complète, liée à la session de capture). `ComposerMediaTrimBand` est un hôte, pas un jumeau.
- Relevé : la planche le pose SOUS la piste (début · gardé · fin) ; `MediaTrimStrip` le pose dessus (tête · gardé · total), `ComposerTrimTrack` dessus au millième, Android dessous (« gardé · sur total »), le web en une phrase.
- Jaune : `#FFD23F` sur la planche, `Color.yellow` système sur iOS, l'accent de l'hôte sur Android, aucun jeton.
- Planchers : 0,4 s (`MediaTrimRule`, web), 0,25 s (`ComposerTrimRule`, `AudioTrimGeometry`), 0,2 s (coupe web). Aucun plafond n'existe dans le code.
- Android : pas de tête, poignées annoncées « bouton » et non réglables à TalkBack, sens non forcé en RTL ; `MeeshyAudioTrimmer` (bande défilante, pincement 1 à 40) n'a plus de site d'appel. `AudioEditorWaveform.kt` manque au registre.
- Web : six `input range` (pas 0,1 s), ni onde ni vignettes ni tête.
- Hauteurs : 56 et 60 sur la planche ; 60 et 52 sur iOS, 56 et 72 sur Android. Rayons : 12 ; 8 et 10 sur iOS, 8 sur Android.
- Sous la piste, la planche dessine Muet, Boucle et Atténuer en lignes à bascule ; iOS les rend en capsules.
- K05 § 7 écrit « par K21, `MediaVolumeSlider` » : lire I3.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. K21 est la piste seule. `soundRows()` se compose de K05 et K06 dans l'hôte, par I3, I5 et I9. (Un panneau « Rogner et régler » entier dans le kit.)
2. iOS : `ComposerTrimTrack` devient le composant, avec le vocabulaire de `MediaTrimStrip`, qui reste la composition. (Partir de la piste de `MediaTrimStrip` et de `ClipTrimHandles`.)
3. Les poignées sont HORS de la plage : leur bord intérieur est la borne, le contenu est en retrait de 14 de chaque côté. Au repos le dessin est celui de la planche, et aucune image gardée n'est masquée. (Poignées posées sur le contenu gardé, à la lettre de la planche.)
4. Relevé sous la piste : début · gardé · fin, textes de l'hôte. La position de la tête et le total passent dans les valeurs d'accessibilité. (Dessus ; tête · gardé · total.)
5. Jaune = alias `mediaTrim` de `warning`, sans paramètre de teinte : les poignées sont jaunes partout, rouges en retrait. (Nouveau `#FFD23F` ; `Color.yellow` ; accent de l'hôte.)
6. Précision par appui long et loupe sur les trois plateformes, Maj + flèches au clavier. Le pincement d'Android n'est pas repris. (Paramètre de zoom au pincement.)
7. Au plafond la poignée s'arrête, comme au plancher ; le refus se dit par l'hôte (loi 12). (La fenêtre glisse en poussant l'autre borne.)
8. Le mode retrait (`removed`) entre dans K21 : il existe sur les trois plateformes. (Le laisser à l'éditeur audio.)
9. Source trop courte : ni poignées ni cadre, la tête reste. (Piste grisée à 40 % ; piste non montée.)
10. Un lit sombre opaque sous le contenu, sur tous les tons. (Voile blanc à 6 %, comme la planche.)
11. La tête est le trait de la planche, saisissable si `onSeek`, bornée à la plage. (Pastille ronde, non saisissable.)
12. Le temps ne se met jamais en miroir. (Miroir en RTL.)
13. Web : `role="slider"` à plusieurs poignées, moteur de `scene-scrub-bar`. (Deux `input range` superposés.)
14. Pas de 0,1 s en paramètre, 1 s pour la tête, 0,01 s avec Maj. (5 points ; 5 % de l'étendue comme K05.)
15. Hauteurs 56 et 60, rayon 12, cibles 44 / 48 / 44. (Garder 52, 60, 72.)
16. Un `light` à l'arrivée en butée. (Aucun, comme le code.)
17. Répartition : I3 (son, `composer-audio-trim`, orphelins Android), I5 (vidéo posée), I9 (retouche, `ComposerTrimTrack`, éditeurs audio iOS et Android). (I10 pour les éditeurs audio.)
18. Exécution par sonnet sur les trois plateformes : gestes concurrents, loi pure, deux pistes à fondre sur iOS ; aucune loi partagée n'est touchée. (opus ; haiku.)
