# K22 — MeeshyTimelineFrise (la frise du temps)

Relevé sur `origin/dev` `0d3d396c059` le 2026-11-14. Chantier #17312, milestone 258 ; issue du lot : #18133 ; intégration : #17353 (I6) ; origine : #17110, fermée (« la frise du composer est premium et réactive ») ; voisines ouvertes : #17199, #13481, #16196. Dépend de K00 seulement : ni verre ni bouton dedans. Lois 9, 13 et 15 de `docs/product/composer-vue-finale.md`. Planche : `timeline(o)` (ligne 268), avec `strip()` et `waveBand()` (263-264). Vues : S8 (347, `snap:.6, ph:.3`), S9 (348, `sel:'Sticker', keys:[.27,.4,.53]` ; la rangée de cinq boutons dessous n'est PAS dans `timeline()`), I3 (362, la même, large de 372, dans une plaque de 400 sous la scène).

## 1. Rôle
Montrer le temps d'une scène en pistes, une par objet, chacune avec son contenu réel, et y régler la fenêtre d'apparition de chaque objet : règle graduée, tête de lecture, piste choisie qui prend ses poignées et ses images clés, pincement qui zoome le temps, bord qui s'aimante.

Elle ne fait pas :
- le contenu d'une barre (vignettes, onde, texte, sticker, sa teinte de famille, leur extraction et leur cache) : l'hôte le peint dans `content` ;
- les textes (« 3 s », « aimanté · 9,0 s », « 0:04 / 0:15 », les noms) : l'hôte les formate ;
- la lecture, l'horloge, la recherche tolérante puis précise, l'écriture des fenêtres dans le modèle, le pas d'annulation ;
- le bouton lecture et l'horloge (K02 et un texte de l'hôte, dans l'emplacement `transport`), la rangée de S9 (Entre ici, Sort ici, Couper, Dupliquer, Retirer : cinq K02 de l'hôte), Quitter · Valider et la plaque (K16), les rails grisés d'I3 (K12, I8) ;
- poser, retirer ou régler une image clé, couper, dupliquer, retirer ;
- la loi d'aimantation (`SnapEngine`) et sa tolérance (`TimelineGeometry`) : réutilisées telles quelles ;
- aucun verre : K22 n'appelle pas K01 ;
- l'empilement vertical, les plans et les transitions (l'atelier `Plan2DView`), la coupe d'une source (K21), les repères d'aimantation de la scène (K23).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyTimelineFrise.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-timeline-frise.tsx` |
|---|---|---|---|
| Frise | `MeeshyTimelineFrise(_ names:tracks:duration:minimumSpan:selectedID:…content:)` | `MeeshyTimelineFrise(names, tracks, duration, minimumSpan, selectedId, modifier, …, content)` | `<MeeshyTimelineFrise names tracks duration minimumSpan selectedId … renderContent>` |
| Piste | `MeeshyTimelineFriseTrack { id, name, systemImage, range, height, isLocked, keyframes, detail }` | `data class` identique (`icon: ImageVector`) | objet de même forme (`glyph`) |
| Image clé | `MeeshyTimelineFriseKey { id, time }` (temps absolu) | idem | idem |
| Partie tenue | `MeeshyTimelineFrisePart { playhead, move, start, end }` | idem | union de chaînes |
| Fenêtre visible | `MeeshyTimelineFriseViewport(start:span:)` : `whole`, `clamped`, `fraction`, `time(atFraction:)`, `zoomed(by:around:)`, `panned(by:)`, `showing` | idem (`FriseViewport` de `:core:model`, réutilisé) | `meeshy-timeline-frise-rule.ts` |
| Règle | `MeeshyTimelineFriseRuler` : `majorStep`, `ticks(in:width:labelGap:)`, `crossesMajor` | idem (`FriseRuler`, réutilisé) | idem |
| Loi pure | `MeeshyTimelineFriseRule` : `dragged`, `snapped` (appelle `SnapEngine`), `candidates`, `tolerance` (appelle `TimelineGeometry`), `adjusted(part:up:step:)`, `handleZone` | idem (`FriseBarDrag`, `SnapEngine`, `TimelineGeometry` réutilisés) | idem, plus `lib/view/snap-engine.ts`, miroir de `SnapEngine` |
| Recette | `MeeshyTimelineFriseRecipe.resolve(tone:isEnabled:held:isSnapped:isZoomed:hasSelection:)` | idem | `meeshy-timeline-frise-recipe.ts` + `styles/kit-timeline-frise.css` |

Paramètres, opaques, mêmes défauts partout (temps en secondes, `Double` ; `Float` seulement aux frontières de `SnapEngine` et de l'horloge) :
- `names: MeeshyTimelineFriseNames` (obligatoire) : `frise`, `playhead`, `earlier`, `later`, `entryEarlier`, `entryLater`, `exitEarlier`, `exitLater`, `start`, `end`, `zoomIn`, `zoomOut`, `zoomHint: String?` ;
- `tracks` (l'ordre du tableau est l'ordre à l'écran) ; `duration` ; `minimumSpan` (obligatoire, > 0 : l'écart plancher entre deux poignées) ;
- `selectedID: String? = nil` ; `onSelect: (String, Double?) -> Void` (le temps touché, `nil` au début d'un glissé ou au lecteur d'écran) ;
- `playhead` : iOS `PlayheadClock? = nil` (type existant de MeeshyUI, dont `move(to:)` devient `public`), Android `(() -> Double)? = null` lue au dessin, web `playhead?: number` plus `painterRef` ; `onSeek: ((Double) -> Void)? = nil` ;
- `onWindowCommit: ((String, ClosedRange<Double>, MeeshyTimelineFrisePart) -> Void)? = nil`, appelée UNE fois, au lâcher ; `nil` ⇒ lecture seule ;
- `onKeyframe: ((String, String) -> Void)? = nil` (piste, image clé touchée) ;
- `timeText: (Double, MeeshyTimelineFriseTimeStyle) -> String` (obligatoire ; styles `ruler`, `snap`, `spoken`) ;
- `snapping { standard, none } = standard` ; `step = 0.5` ; `minimumVisibleSpan = 3` ; `followsPlayhead = true` ; `haptic { standard, none } = standard` ;
- `onEditingChanged: ((MeeshyTimelineFrisePart, Bool) -> Void)? = nil` ; désactivée : `.disabled(_:)`, `enabled = true`, `disabled` ; le web ajoute `data`.

Emplacements : `content(track)` (obligatoire : l'intérieur de la barre, rogné, jamais relancé par un geste) ; `transport` (optionnel : début de la ligne du haut, l'hôte y pose lecture et horloge) ; `empty` (optionnel, quand `tracks` est vide). Le ton vient de l'hôte (`\.meeshyGlassTone`, `LocalMeeshyGlassTone`, `data-glass-tone`) et ne teinte que les encres.

## 3. États
- repos : quatre pistes, tête à 30 %, rien de choisi, invite « Pincer pour zoomer » : I3 ;
- glissé en cours, bord aimanté : ligne pointillée sur toute la hauteur et étiquette « aimanté · 9,0 s » : S8 ;
- piste choisie : anneau et halo, poignées aux deux bouts, images clés en losanges, les autres barres à 50 % : S9 ;
- piste verrouillée, sur toute la durée : le Fond et le Son de S8 ;
- grand écran : la même, plus large, sans autre règle : I3 ;
- zoomée (fenêtre visible < durée) : ascenseur fin sous la règle, invite absente, la page tourne quand la tête sort pendant la lecture : aucune vue, conservé du code ;
- barre tenue, poignée tenue, règle tenue, vide, lecture seule, sans tête, désactivée (contenu à 40 %, ni geste ni haptique), ton `theme`, focus clavier : aucune vue.

Loi 13 :
- rien de choisi ⇒ ni poignée, ni losange, ni barre atténuée ; une piste verrouillée ne prend jamais de poignée ;
- pas d'accroche ⇒ ni ligne ni étiquette ; `timeText(_, snap)` vide ⇒ la ligne seule ;
- pas zoomée ⇒ pas d'ascenseur ; zoomée, `zoomHint` nul ou `duration ≤ minimumVisibleSpan` ⇒ pas d'invite ;
- ni `transport` ni invite ⇒ pas de ligne du haut ; `playhead` nul ⇒ pas de tête ; tête hors de la fenêtre visible ⇒ pas dessinée ;
- `onSeek` nul ⇒ règle dessinée, inerte et absente de l'arbre d'accessibilité ; `onWindowCommit` nul ⇒ ni poignée ni action de réglage ;
- `tracks` vide ⇒ `empty` ou rien, jamais une aide écrite par le kit ;
- jamais : verre, colonne de noms, Quitter · Valider, boutons d'action, horloge, grille dans les pistes, boutons + et −.

## 4. Gestes et retours
- Toucher ou glisser la règle : la tête s'y pose (`onSeek`, au plus une fois par image), entre `onEditingChanged(.playhead, true)` et `(.playhead, false)`.
- Toucher une piste, sur la barre ou à côté : `onSelect(id, temps)`.
- Glisser une barre (dès 2 pt, à l'horizontale) : elle se choisit et se déplace sans changer de durée, bornée à la scène. Glisser une poignée : le bord bouge, ne franchit ni l'autre (`minimumSpan`) ni les bords.
- L'aperçu du geste est local ; `onWindowCommit` part au lâcher, jamais à l'annulation par le système ni si la frise disparaît doigt posé. L'hôte en fait UN pas d'annulation.
- Aimantation : le bord qui bouge (début, fin, ou le plus proche des deux pour la barre) s'accroche à la tête, aux bords de la scène, aux bords et aux images clés des AUTRES pistes ; tolérance de 8 pt à l'échelle rendue, plafonnée à 0,25 s ; priorités de `SnapEngine`.
- Pincer : le temps se resserre ou s'élargit autour de la tête, jusqu'à `minimumVisibleSpan` ; revenu à la durée entière, le zoom s'annule. Deux doigts sont lus avant les barres : un pincement ne devient jamais un glissé de barre. Zoomée, glisser le fond d'une piste ou deux doigts la fait défiler.
- Un glissé vertical est rendu à l'hôte ; `onEditingChanged(part, true)` lui dit de tenir la plaque (K16, `isPlateScrollLocked`).
- Toucher un losange (zone de 32, le plus proche gagne) : `onKeyframe`, s'il existe. Les losanges suivent la barre déplacée et s'effacent pendant qu'une poignée est tenue.
- Haptique, par `HapticFeedback`, `MeeshyHaptics`, `impact()` de `lib/view/haptics.ts` : `light` au choix d'une piste, `light` au passage « libre → accroché » (une fois par accroche), `light` quand la tête franchit une graduation majeure sous le doigt ; rien par image.
- Animations : atténuation des autres barres et apparition des poignées en 150 ms, ligne d'accroche en 100 ms, fenêtre changée par l'hôte (annuler) en 200 ms, jamais pendant un geste. « Réduire les animations » : tout se pose d'un coup ; la page qui tourne en lecture est déjà sans transition.
- Pointeur (web, iPad) : curseur de redimensionnement sur une poignée, main sur une barre ; Ctrl ou ⌘ + molette et pincement du pavé zooment.

## 5. Accessibilité
- Un groupe nommé `names.frise`. Ordre : `transport` (hôte), la règle, les pistes de haut en bas.
- Règle : un élément réglable nommé `names.playhead`, valeur `timeText(t, spoken)`, pas `step`. iOS `accessibilityAdjustableAction`, Android `progressBarRangeInfo` et `setProgress`, web `role="slider"` avec `aria-valuetext`.
- Piste : UN élément. Nom `track.name` ; valeur « début – fin » (`spoken`) puis `track.detail` (« 3 images clés », « verrouillée », texte de l'hôte) ; état choisi ; activer = `onSelect(id, nil)`. Six actions nommées, chacune d'un pas `step` : plus tôt, plus tard, entrer plus tôt, entrer plus tard, sortir plus tôt, sortir plus tard ; la nouvelle fenêtre est annoncée. Les poignées dessinées sont masquées ; aucune action sur une piste verrouillée.
- Zoom : `accessibilityZoomAction` sur iOS, actions `names.zoomIn` et `names.zoomOut` sur Android et le web. Ligne et étiquette d'accroche masquées.
- Clavier (web, iPad, Android) : Tab dans l'ordre de lecture ; sur la règle et sur une piste, ← → = `step`, Maj + ← → = 0,1 s, Début et Fin = les butées ; Entrée ou Espace = choisir ; sur la piste choisie, ses deux poignées sont des `role="slider"` (`names.start`, `names.end`) ; `+`, `−`, `0` = zoomer, dézoomer, tout voir. Anneau `:focus-visible` de 2, à l'encre du ton.
- Cibles : chaque rangée fait 44 pt (48 dp, 44 px) de haut, la barre y est dessinée haute de 34 ou 40 ; une poignée a 44 de large, 14 dans la barre et 30 dehors, pour laisser le corps à saisir ; la règle a 44 de haut autour de ses 18.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : libellés de la règle, étiquette d'accroche et invite grandissent ; le pas majeur garde entre deux libellés au moins 44 ou la largeur du plus large plus 8 ; pistes, poignées et tête ne grandissent pas ; l'invite cède sa place avant `transport`. Web : textes en `rem`.
- RTL : le temps ne se met pas en miroir. Règle et pistes sont forcées de gauche à droite, le couloir d'icônes reste à gauche, → va toujours plus tard ; la ligne du haut suit l'interface.
- Contraste, calculé : libellés de la règle (blanc à 85 %) 13,7:1 sur plaque sombre, 5,0:1 sur la plaque assombrie posée sur une scène blanche ; jaune d'accroche 11,3:1 et 3,7:1 ; encre sombre sur l'étiquette jaune 12,6:1. Le blanc seul tombe à 1,9:1 sur une barre verte ou ambre : tête, anneau, poignées et losanges portent un liseré sombre. Ton `theme` clair : encres du thème, ligne d'accroche à l'encre (le jaune y tomberait à 1,7:1), étiquette inchangée.

## 5 bis. Performance
- Ne se re-rend jamais quand la tête avance : pistes, contenus, règle. Seule la feuille de la tête lit l'horloge (`PlayheadTimeReader` ; lecture en phase de dessin sur Android ; `painterRef` hors de React sur le web).
- Pendant un glissé, seule la rangée tenue et la ligne d'accroche changent ; `content` n'est jamais relancé (sa clé est la piste, pas la fenêtre en cours). Pendant un pincement, les barres changent de place et de largeur, la règle se redessine en UNE passe, pour la seule fenêtre visible (douze libellés au plus, mineures à 6 pt au moins) ; aucun contenu n'est ré-extrait.
- S'animent : la translation de la tête, de la barre tenue et des losanges, l'opacité des barres atténuées, des poignées et de la ligne. Jamais un flou ni un filtre (web : `check-animated-properties.mjs`).
- Budget : aucune image perdue à 120 Hz en glissant une barre parmi douze pistes ni en pinçant ; un `onWindowCommit` par geste, un tic par accroche ; rien de retenu une fois la frise quittée. Web : poids suivi par `measure-weight.mjs`.

## 6. Jetons et mesures
Mesures de la planche : couloir d'icônes 26 (icône 16 à 75 %, écart 6) ; règle haute de 18, mineures de 4 à 35 %, majeures de 9 à 70 %, libellés 10 semi-gras à chasse fixe, ceux des bouts rentrés ; pistes de 34 (40 pour les vignettes), écart 7, lit blanc à 6 %, rayon 9 ; choisie : anneau blanc de 2, halo de 14 à 45 %, poignées blanches de 10, autres barres à 50 % ; losange de 12 à bord sombre de 2 ; accroche : pointillé jaune `#FFD23F` de 2, étiquette 10 extra-gras sur jaune ; tête : trait blanc de 2 débordant de 4 à 6, coiffe en losange de 14, halo de 10 ; ligne du haut : bouton de 40, écart 10, invite en puce de 34 ; plaque : rayon 28, marges 12 × 14, écart 12 (K16).

Jetons :
- encres : `MeeshyColors.onMedia` (tête, anneau, poignées, losanges), `onMediaSecondary` (libellés, `--ios-on-media-2`), `mediaBackdrop` (liserés, encre de l'étiquette) ;
- jaune : `MeeshyColors.mediaTrim`, l'alias de `warning` posé par K21, avec ses miroirs `MeeshyMediaChromeColors.MediaTrim` et `--ios-media-trim` (K22 les crée s'ils manquent encore) ;
- rayon `MeeshyRadius.xs` (lit et barre), capsule pour l'étiquette et l'invite ; écarts `MeeshySpacing.xsPlus` et `xs` ; icône `MeeshyIconSize.md` ; textes `MeeshyFont.captionSize` et `smallSize` relatifs, chasse fixe ; cible `MeeshyControlSize.tapTarget`, `minTouchTarget`, `--target-min` ; `accessibilityReduceMotion`, `LocalReduceMotion`, `reducedMotion()`.

Les valeurs propres (hauteurs 34 et 40, couloir 26, traits 4 et 9, opacités 6, 35, 50, 70 et 85 %, anneau 2, poignée 10, losange 12, tête 2 et 14, liseré sombre de 1 à 55 %, désactivé 40 %, durées 100, 150 et 200 ms) vivent dans `MeeshyTimelineFriseRecipe`, nulle part ailleurs. Aucune couleur en dur, aucun verre.

## 7. Jumeaux
K22 extrait et ne rebranche rien ; jusqu'à I6 les lois de l'app et du kit coexistent, tenues égales par le fichier de vecteurs.

- iOS. DEVIENT : `ComposerSceneFrise` (app), la seule frise bâtie sur S8 et S9 (#17110) : règle en un `Canvas`, fenêtre visible, aimant, haptique, six actions VoiceOver, tête seule à lire l'horloge. Elle est dépouillée de `TimelineViewModel`, de ses mots, de son verre, de ses jetons et de son plein écran ; `ComposerSceneFriseViewport`, `ComposerSceneFriseRuler` et les lois de geste de `ComposerSceneFriseMetrics` deviennent les lois du kit. Elle prend au SDK le losange de `KeyframeMarkerView` et la ligne de `SnapGuideView`, reteintée. `SnapEngine`, `TimelineGeometry`, `PlayheadClock` sont réutilisés sur place.
- iOS, supprimés par I6 : dans `ComposerSceneFrise`, la règle, les rangées, la tête, les poignées, le pincement, l'étiquette et l'invite ; `ComposerSceneFriseRuler`, `ComposerSceneFriseViewport` ; `Window`, `Grip`, `Drag`, `dragged`, `snapCandidates`, `snapTolerance`, `trackHeight`, `handleHit`, `labelLane` de `ComposerSceneFriseMetrics` ; son en-tête Quitter · Valider et son `fullScreenCover` (K16), ses `glyphe` et `jeton` (K02). Par I5 (O10) : `ComposerObjectTimingStripView`, remplacée par K22 à une piste en lecture seule. Restent : `ComposerSceneFrise` comme COMPOSITION (K16 + K02 + K22), `ComposerSceneFriseBarContent` (le contenu), les mots, `canSplit`, `canDuplicate`, `canRemove`, icônes et teintes de famille, `SceneFriseTrack`. Hors K22 : l'atelier (`StoryTimelineHost`, `Plan2DView`, `RulerView`, `PlayheadView`, `TrackBarView`, `ClipTrimHandles`), autre instrument, absent de la planche ; et `StoryTimelineView`, `TimelineScrubArea`, `SnapGuideView`, `TimelineScrollBar`, `LaneKeyframeOverlays`, que seuls des tests montent : leur retrait est une issue qu'I6 ouvre.
- Android. DEVIENT : `SceneFrise` (`feature/stories`), dépouillée de `Plan2DTrack`, de son transport et de sa boucle de lecture ; les lois de `:core:model` (`SnapEngine`, `TimelineGeometry`, `FriseViewport`, `FriseRuler`, `FriseBarDrag`) sont réutilisées sur place, la garde de pureté admet ce seul paquet. S'y ajoutent : tête lue au dessin, ligne et étiquette d'accroche, poignées, atténuation, règle réglable à TalkBack.
- Android, supprimés par I6 : `Ruler`, `Playhead`, `FriseTrackRow`, `Handle`, `KeyframeMarkers`, `dragBar`, `pinchToZoom` et `dashedOutline` privés de `SceneFrise.kt` ; `LABEL_LANE_DP` et `HANDLE_HIT_DP` de `ComposerSceneFriseMetrics`. Restent à l'app : `SceneFrise` comme composition, le composable de transport refait en K02, `FriseTransport` et `LocalFriseTransport`, `FrisePlayClock`, `FriseBarContent` et `FriseBarVisual`, `composer/timeline/*`.
- Web. DEVIENT : `StudioTimelinePanel` (`routes/story-compose-timeline.tsx`, hors du dossier que le registre citait) pour son moteur de glissé (capture du pointeur, aperçu local, écriture au lâcher, tête peinte hors de React) ; le reste se construit depuis la fiche et le composant iOS fusionné : règle graduée, zoom, aimant, contenus, poignées accessibles. Le pincement suit `use-tile-pinch.ts`, la règle `scene-scrub-bar.tsx`.
- Web, supprimés par I6 : la règle, les pistes, les poignées et la tête de `StudioTimelinePanel`, et `draggedTiming` de `lib/stories/studio-timeline.ts`. Restent : `use-studio-timeline.ts`, le reste de `studio-timeline.ts`, `scene-clock.ts`, `scene-scrub-bar`, `media-filmstrip`. `call-glass-button`, `call-control-pill`, `glass-surface`, `sheet`, `composer-*`, `scene-*`, `story-*` n'ont aucune frise. S8, S9 et I3 n'existent pas sur le web : I6 et I8 les construisent.

## 8. Témoins exigés
Comportements (`MeeshyTimelineFriseTests`, `MeeshyTimelineFriseTest`, `meeshy-timeline-frise.test.tsx`) :
- lois : fenêtre déplacée ou tirée, bornée, sans croisement ; accroche par le bord le plus proche, candidats sans la piste elle-même, images clés voisines comprises, tolérance qui suit l'échelle et plafonne à 0,25 s ; fenêtre visible (zoom autour de la tête, plancher, défilement, page qui tourne) ; règle (pas lisible, douze libellés au plus, mineures à 6 pt, écart qui suit la police) ;
- `onWindowCommit` une fois au lâcher, jamais à l'annulation ni à la disparition ; `onEditingChanged` en paire ; au plus un `onSeek` par image ;
- loi 13, ligne à ligne : poignées, losanges, atténuation, ligne, étiquette, ascenseur, invite, ligne du haut, tête ;
- accessibilité : un élément par piste, ses six actions et leurs noms, aucune sur une piste verrouillée, règle réglable, absente sans `onSeek`, zoom nommé ; clavier sur le web ;
- haptique : choix, accroche une fois, graduation majeure ; aucune avec `none` ni désactivée ;
- sens forcé en RTL ; cibles de 44 pt, 48 dp, 44 px ; contraste calculé depuis la recette ;
- performance : `content` n'est pas réévalué pendant un geste ni quand la tête avance ;
- gardes de source : aucun verre, aucune couleur en dur, aucun type du composer, aucune chaîne ; `SnapEngine` appelé, jamais recopié (iOS, Android) ; web : `check-kit.mjs` vert ;
- parité : `docs/product/kit/K22-MeeshyTimelineFrise.vectors.json`, lu par les trois suites, reprend les valeurs de `ComposerSceneFriseTests`, `FriseBarDragTest`, `FriseViewportTest`, `FriseRulerTest` et `SnapEngineTests` ; non-régression : le lot ne touche ni jumeau ni écran.

Instantanés (`MeeshyTimelineFrise/<id>.<variante>`) : `repos`, `aimante`, `choisie`, `zoomee`, `verrouillee`, `vide`, `lecture-seule`, `sans-tete`, `desactivee`, `theme`, en `clair` et `sombre`, `presse` (poignée tenue), planches `grande-police` et `rtl` ; web à 390, 820 et 1440 px.

Catalogue : entrée K22, vide sur `dev` (`MeeshyKitCatalog+K22.swift`, `KitCatalogK22.kt`, `components/kit/catalog/k22.tsx`), contenu de démonstration fixe (Fond, Texte, Sticker, Son). Vues : `repos` I3, `aimante` S8, `choisie` S9.

Preuve : `sdk-tests.yml`, `android.yml` (`assembleDebug`, `testDebugUnitTest`), `bun run gate`. Consigne du porteur : gardes locales vertes et runs de branche annulés ⇒ le lot fusionne dans `dev` et se prouve sur `dev` ; rouge sur `dev`, il est corrigé ou retiré aussitôt.

## 9. Écarts connus et choix retenus
Écarts relevés :
- iOS a trois instruments du temps : la frise de la scène (app, en production), l'atelier (`StoryTimelineHost` et `Plan2DView`, encore présenté par `TimelineExportFlow` et monté par `ComposerObjectTimingControls`), et l'ancien conteneur `StoryTimelineView`, que seuls des tests montent. Le registre oppose « SDK contre app » : seule la frise de l'app dessine S8 et S9.
- Couloir : icône seule de 26 sur la planche ; colonne de noms de 72 sur les trois plateformes.
- Pistes : 34 et 40 sur la planche ; 40 (iOS), 34 (Android), 30 (web). Rayon 9 ; 8, 4, 8.
- Tête : blanche à coiffe en losange ; blanche à pastille ronde (iOS), ambre sans coiffe (Android, web). Des commentaires du code disent encore « la tête est ambre ».
- Accroche : pointillé et étiquette jaunes ; étiquette blanche sans ligne (iOS), haptique seule (Android), aucun aimant (web). Android aimante aussi sur les images clés voisines, iOS non.
- Piste choisie : anneau, poignées de 10, autres à 50 % ; iOS opacifie la barre (95 % contre 60 %) et pose un trait de 4 dans une cible de 24 ; Android et le web la peignent à la couleur de marque.
- Images clés : losanges sur la piste choisie ; aucun dans la frise iOS, sur toutes les pistes et avec un jeton poser/retirer sur Android, aucun sur le web.
- Fond : une piste de vignettes sur la planche ; pas de piste (iOS), une barre en pointillé (Android), rien (web).
- Règle : libellés tous les 3 s et traits tous les 0,5 s sur la planche ; la loi du code élit 5 s et 1 s pour 15 s.
- Ligne du haut : l'invite est une puce à droite ; sous les pistes sur iOS, absente ailleurs. S9 met cinq icônes sous la frise ; le code met des jetons de texte dans le transport.
- Android recompose toute la frise à chaque image (`playheadSeconds` en paramètre) ; sa règle n'est pas réglable à TalkBack. Web : poignées masquées, deux boutons « plus tôt, plus tard » seulement, pistes de texte et de calque seulement, ni zoom ni graduations.
- Teintes de famille : celles du design system dans le code, d'autres sur la planche ; hors conformité.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. K22 = règle, pistes, tête, aimant, zoom et la ligne du haut réduite à un emplacement `transport` et à l'invite. Lecture, horloge et rangée de S9 se composent en K02 dans l'hôte, par I6. (Tout `timeline()` dans le kit ; aucune ligne du haut.)
2. iOS : `ComposerSceneFrise` devient le composant, avec le losange et la ligne du SDK ; l'atelier reste, hors K22. (Partir de `Plan2DView` ; de `StoryTimelineView`.)
3. Couloir d'icônes seul ; le nom vit dans l'accessibilité et la barre écrit déjà son contenu. (Colonne de noms de 72 ; un paramètre.)
4. Barres de 34 et 40 dans des rangées de 44 ; l'écart de 7 de la planche en découle entre une haute et une basse. (40 partout ; 34 ; 30.)
5. Tête blanche à coiffe en losange, jamais une cible : c'est la règle qui se touche. (Tête saisissable ; tête ambre.)
6. Accroche en pointillé et étiquette au jaune `mediaTrim`, encre sombre. (Magenta du SDK ; étiquette blanche seule ; nouveau `#FFD23F`.)
7. Candidats = l'union des deux plateformes, images clés voisines comprises ; `SnapEngine` inchangé, porté à l'identique sur le web dans `lib/view/snap-engine.ts`. (Sans images clés ; dans `packages/shared`.)
8. Une piste choisie atténue les autres barres à 50 %. (Garder 95 % contre 60 %.)
9. Poignées de 10 dans les bouts de la barre, posées dehors sous 30 de large ; cible de 44 dont 30 hors de la barre. (Trait de 4, cible de 24.)
10. Losanges sur la seule piste choisie ; le nombre d'images clés se dit dans `detail` pour toutes. Lus seulement, sauf `onKeyframe`. (Toujours visibles ; jamais.)
11. Zoom au pincement autour de la tête, plancher de 3 s, invite muette en haut à droite tant qu'on n'a pas zoomé ; molette et touches sur le web. (Boutons + et − ; zoom autour des doigts.)
12. L'aperçu est local, l'écriture part au lâcher. (Liaison vivante comme K21.)
13. Une piste verrouillée se dessine comme les autres, sans poignée ni action ; I6 donne au Fond sa piste. (Pointillé d'Android ; pas de piste de fond.)
14. Le temps ne se met jamais en miroir. (Miroir en RTL.)
15. `Double` à l'API ; l'horloge est `PlayheadClock` sur iOS, une lecture au dessin sur Android, `painterRef` sur le web. (Un protocole d'horloge neuf ; une valeur simple.)
16. Une piste est un seul élément à six actions ; pas de 0,5 s, 0,1 s avec Maj. (Poignées réglables une à une ; pas en points.)
17. Les lois sont copiées sous les noms du kit et tenues par les vecteurs ; Android réutilise `:core:model` sur place ; I6 supprime les doublons. (Déplacer avec des alias dès K22.)
18. La loi de graduation du code est gardée : les 3 s de la planche sont une illustration. (Ajouter un pas de 3 s à l'échelle.)
19. Les teintes de famille restent celles du design system, peintes par l'hôte. (Teintes de la planche.)
20. `tracks` vide : l'hôte garde sa phrase dans `empty`. (Rien ; une aide du kit.)
21. Exécution par opus sur iOS, sonnet sur Android et le web : les lois d'aimantation, de fenêtre et de règle sont des miroirs, et le web en reçoit un troisième. (sonnet partout ; haiku.)
