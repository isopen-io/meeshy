# Inventaire exhaustif du compositeur de story / post — iOS, avec l'état Android

Date : 2026-10-30 · Issues : #13839 (refonte « scène d'abord » iOS), #13840 (édition non destructive iOS), jumelles Android #13834–#13838 et #13841.
Base iOS lue : export `wios` (base `f5c8c207573b`), `apps/ios/Meeshy/Features/Composer` (214 fichiers), `Features/Stories`, `packages/MeeshySDK/Sources/MeeshyUI/Story`.
Base Android lue : `origin/dev` (`apps/android/feature/stories`, `core/model/.../composer`, `app/.../composer/host`, `sdk-ui/.../retouch`) et l'export en cours `wcompo` (lots #13834, #13838 et #13835 posés, #13836 commencé, #13837 à faire).
Référence de disposition : `docs/product/composer-scene-d-abord/maquette.html` et la spec partagée `docs/superpowers/specs/2026-10-30-composer-scene-d-abord-design.md`.

**Ce document fait foi pour la couverture.** Chaque lot coche la colonne « Lot » des lignes qu'il range, dans le commit qui les range. Une ligne qui n'a pas de nouvelle place est un défaut du lot, jamais une option qui disparaît.

## Légende des nouvelles places

| Code | Où | Quand |
|---|---|---|
| **R** | surimpression au repos : ✕ en haut à gauche, ↶ ↷ en haut à droite, colonne droite de six boutons ronds (Texte, Média, Sticker, Son, Dessin, ⋯), bas : « 🌐 Public » + « Publier la story ▾ » | rien n'est sélectionné, aucun outil ouvert |
| **⋯** | menu « ⋯ » de la colonne | au repos |
| **K** | barre fine collée au clavier (Aa · ● · ≡ · ▣ · OK) et ses panneaux de la hauteur du clavier | on écrit (texte de scène, légende, corps du post) |
| **S** | barre d'actions libellées de la sélection : Modifier · Ordre · Dupliquer · Temps · Retirer | un élément est sélectionné (cadre pointillé visible) |
| **S›M** | feuille « Modifier » ouverte depuis S, propre à la famille de l'élément | sélection + Modifier |
| **P▾** | menu du chevron de Publier « Publier comme » | au repos ou en sélection |
| **F** | feuille ancrée en bas, qui RÉDUIT la scène au-dessus d'elle | ouverte par un bouton de R, de ⋯ ou de S |
| **V** | viseur (scène vide touchée, ou Média › Caméra) | capture |
| **D** | état Dessin : scène entière, barre de dessin en surimpression en bas | outil Dessin |
| **iPad-G / iPad-D** | rail gauche libellé (ce qu'on ajoute) / rail droit libellé « SÉLECTION » (actions de l'élément, ↶ ↷ au pied) | grand écran, place libre suffisante (§ 4.5 de la spec partagée) |
| **—** | supprimé parce que doublon : la ligne nomme la jumelle qui reste | |

Android : **P** présent, **A** absent, **≈** partiel (la cellule dit ce qui manque). Deux colonnes : `origin/dev` et l'export `wcompo` (seulement si différent).

---

## A. Points d'entrée et ouverture

| # | Élément | Fichiers iOS | Ce qu'il fait | Aujourd'hui | Nouvelle place | Doublon / fusion | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|---|---|
| A1 | « + » de l'anneau « Moi » | `ComposerIntent.swift` (`ComposerOrigin.storyTray`), `MeeshyComposerHost+Resolution.swift` | ouvre le compositeur de story | **impose le sélecteur Photos plein écran** (`ComposerOpening`) | ouvre la scène au repos **R** ; Photos seulement sur Média | — | P | P | L1 ✓ |
| A2 | Ouvertures typées | `ComposerOpening` (cameraReady, keyboardOnContent, videoCameraReady, moodGrid, resume, mediaSeeded) | état initial selon la porte | idem | inchangé ; `cameraReady` ⇒ **V**, `keyboardOnContent` ⇒ **K** | — | ≈ (pas de cameraReady en story) | ≈ | L1 ✓ |
| A3 | Compositeur du fil (post) | `ComposerOrigin.feedComposer`, `DocumentComposerDoor.swift`, `ComposerDocumentSurface.swift` | post / réel avec ou sans scène | surface document | même disposition **R** pour la scène ; surface document inchangée | — | P (`FeedComposerSheet`) | P | L1 ✓ |
| A4 | Humeur (mood) | `MoodComposerDoor.swift`, `ComposerMoodSurface.swift`, `ComposerMoodBarePublish.swift` | statut court | surface mood | **hors refonte** (plateau propre) | — | P (`StatusComposerSheet`) | P | — |
| A5 | Republication d'une story | `StoryRepublishComposer.swift`, `ComposerOrigin.repost` | republier sous son audience | meuble + atelier nu | **R** sans chevron (route autonome) ; bouton « Republier » garde son action | — | P | P | L1 (reste : sans chevron) |
| A6 | Modifier une story / un post publiés | `StoryEditComposer.swift`, `PostEditRoute.swift`, `ComposerOrigin.edit` | réédite | meuble | **R** sans chevron, sans « Ajouter une diapo » | — | P (`StoryEditor`, `StoryEditMerge`) | P | L1 (reste : sans chevron) |
| A7 | Reprise d'un brouillon | `ComposerOrigin.draft`, `ComposerAutosave*`, `ComposerHydration.swift` | restaure le meuble | **restaure en silence** | **R** restauré + rien d'autre (reprendre/recommencer = suivi hors lot, comme Android) | — | P | P | L3 |
| A8 | Partage externe | `ShareComposeDoor.swift`, `ComposerOrigin.share` | média reçu ⇒ scène | semé | **R** avec le média posé | — | P (`InboundShareIntake`) | P | L1 ✓ |
| A9 | Média d'une conversation / du fil | `ComposerOrigin.conversationMedia`, `.socialMedia`, `MediaComposerDoor.swift` | sème le média | semé | **R** avec le média posé | — | ≈ | ≈ | L1 ✓ |
| A10 | Recomposer une story reprise | `StoryRecompositionSeeding.swift` | sème depuis une story | semé | **R** | — | ≈ (`StoryEditOpening`) | ≈ | L1 ✓ |
| A11 | Coller dans le compositeur | `PasteIntoComposer.swift`, `PasteDestination.swift`, `StickerLibraryPaste.swift` | colle image/texte/sticker | menu système | inchangé (geste système) | — | ≈ (`ComposerClipboardPreview`) | ≈ | — |
| A12 | Porte de mise à niveau | `UpgradeGateController.swift`, `UpgradeGateView.swift` | bloque une version trop ancienne | plein écran | inchangé | — | P | P | — |

## B. Repos : chrome et scène

| # | Élément | Fichiers iOS | Ce qu'il fait | Aujourd'hui | Nouvelle place | Doublon / fusion | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|---|---|
| B1 | ✕ Fermer | `ComposerTopBar.swift`, `MeeshyComposerHost+Layers.swift` | ferme | barre haute, **sans confirmation** | **R** haut gauche ; confirmation si brouillon non vide (L3) ; iPad-G « Fermer » | — | P | P (+ confirmation) | L1 ✓, L3 |
| B2 | Vignettes de scènes (diapos) | `ComposerSlideRail.swift`, `ComposerSlideRailLaw` (Android) | change de diapo, réordonne (appui long + glissé), supprime (✕ de vignette) | barre haute, dès 1 diapo, 25 × 44 pt | rangée compacte en surimpression en haut de la scène **dès 2 diapos**, cibles 44 pt ; suppression avec confirmation (#13616) | ✕ de vignette ≠ ✕ Fermer : la suppression passe par appui long + confirmation | P | P | L1 (reste : suppression par appui long + confirmation, ✕ de vignette retiré) |
| B3 | « + » Nouvelle diapo | `ComposerTopBar.swift`, `MeeshyComposerHost+ScenePicking.swift` | ajoute une scène | barre haute | **⋯ › Ajouter une diapo** ; iPad-G | — | P | P (⋯) | L1 ✓ |
| B4 | ⋯ Plus d'options | `MeeshyComposerHost+Overflow.swift`, `ComposerOverflowPolicy` (`ComposerSurfaceRules.swift:491`) | Aperçu · Choisir un fond · Retirer le fond · Enregistrer · Transférer · Tout effacer | barre haute | 6ᵉ bouton de la colonne **R** ; entrées rangées § « ⋯ » plus bas | — | ≈ (Enregistrer, Transférer seulement) | ≈ | L1 ✓ |
| B5 | Portes du rail gauche (10 glyphes) | `ComposerLeadingRail.swift`, `ComposerRailDoor.swift` (`canonicalRail`), `ComposerRailMode.swift`, `ComposerRailGlass.swift`, `ComposerRailGeometry.swift` | Média, Son, Texte, Fond, Dessin, Sticker, Mention, Hashtag, Lieu (+ Contenu en post) | rail gauche flottant, glyphes sans libellé | Texte/Média/Sticker/Son/Dessin ⇒ **R** ; Fond, Mention, Hashtag, Lieu ⇒ **⋯** ; Contenu (post) ⇒ **K** via « ⋯ › Écrire le post » ; iPad-G libellé | — | ≈ (6 portes ; ni mention, ni hashtag, ni lieu sur la scène) | ≈ | L1 ✓ |
| B6 | Badges de compte des portes | `ComposerRailDoorBadge.swift` | « 1 » sur Aa… | sur les portes | **supprimés** (l'objet est visible ; directive « aucun compteur ») | — | P (badges) | supprimés | L1 ✓ |
| B7 | Appui long sur la porte Média | `ComposerRailDoorLongPress.swift` | deux sources (photothèque / fichiers) | rail | appui long sur le bouton Média de **R** (même règle) ; iPad-G idem | — | A | A | L1 ✓ |
| B8 | Bascule « Animé » (éclair) | `ComposerSceneColumns.swift` (`ComposerSceneToggle.animated`), `MeeshyComposerHost+Animated.swift` | allume le mode animé et sa frise | rail gauche | **⋯ › Animation** (bascule, la frise s'ouvre en **F**) | **fusion avec « Temps »** (B10) : une seule entrée ; l'éclair « allumé sans effet » disparaît | P (`ANIMATED`) | P (⋯) | L1 ✓ |
| B9 | Bascule « Cadre » du fond (Ajuster / Remplir + fond des bandes) | `ComposerSceneToggle.frame`, `ComposerFrameBand.swift`, `MeeshyComposerHost+Frame.swift` | cadrage du fond | rail gauche | **⋯ › Cadre** si un média de fond existe ; et **S›M** du média de fond | renommer « Cadrage » côté retouche pour ne plus confondre avec les **cadres** (montage) | P (`FRAME`) | P (⋯) | L1 ✓, L5 |
| B10 | Bouton « Temps » (pellicule) | `ComposerTrailingColumn.Foot.time` | ouvre/ferme la frise | bord droit de la scène | **— fusionné** dans « ⋯ › Animation » au repos et **S › Temps** pour un objet | doublon d'Animé | P | P | L1 ✓ |
| B11 | Effets de scène : ouverture (transitions) et visuel (filtre du fond) | `ComposerSceneColumns.swift` (`ComposerSceneEffect`), `ComposerSceneEffectCarousel.swift` | entrée/sortie de la slide ; filtre du fond image | colonne droite au repos (si fond média) | **⋯ › Fond** (feuille : couleurs, puis transitions, puis effet visuel) | les transitions **quittent** l'outil Fond sans titre (défaut 08) : section titrée | P (`OPENING`, `VISUAL`) | P (⋯) | L1 ✓, L3 |
| B12 | Légende / description de la scène + chevron « Replier » | `ComposerSceneDescriptionPanel.swift`, `ComposerSceneDescriptionEditor.swift`, `ComposerDescriptionLayer.swift`, `ComposerWriting.sceneLegend` | légende posée sur la scène | champ permanent + chevron | **⋯ › Légende** ⇒ **K** ; la légende écrite reste lue sur la scène ; vocabulaire unique « Légende » | chevron « description » vs champ « légende » : un seul mot | P (footer) | P (⋯ › Légende) | L1 ✓, L4 |
| B13 | Bloc d'aide des gestes de la scène vide | `ComposerSceneCaptureGesture.swift` (`gestureLines`), `ComposerFirstView.swift` | « Toucher : viseur / deux fois : photo / maintenir : filmer » | sur la scène | une ligne discrète « Touchez la scène pour la caméra » seulement sur scène VIDE, effacée dès le premier objet | — | A (pas de viseur) | A | L1 (reste : une ligne unique) |
| B14 | ↶ Annuler (défaire) / ↷ Rétablir | `ComposerTrailingColumn.Foot.undo/.redo`, `StoryComposerViewModel` (historique) | historique | ↶ en bas à droite sur la scène ; ↷ rare | **R** haut droite, seulement avec historique non vide ; libellé VoiceOver « Défaire » (et non « Annuler ») ; iPad-D au pied | — | P | P | L1 ✓ |
| B15 | Pastille du son de fond près de l'avatar | `ComposerAvatarSoundBadge.swift`, `ComposerSoundColumn.swift` | montre et rouvre le son de fond | près de l'avatar / socle | dans **R** : le bouton Son porte un point d'état seulement si un son est posé (pas de compte) ; toucher rouvre **F** Son | — | P (trace sous la scène) | supprimée (feuille Son) | L1 ✓ |
| B16 | Puces sonores sur la scène | `ComposerSceneSoundChips.swift`, `ComposerSceneSoundHeader.swift` | sons de premier plan posés | sur la carte | inchangées (objets de scène, sélectionnables ⇒ **S**) | — | ≈ | ≈ | L5 |
| B17 | Pied de scène de référence | `ComposerSceneReferenceFooter.swift` | crédit/source au pied | sous la scène | inchangé, **jamais** au repos s'il ne porte rien | — | A | A | L1 ✓ |
| B18 | Résumé VoiceOver de la scène | `ComposerSceneObjectCount.swift` | « Story, 2 objets » | accessibilité | inclure le dessin (défaut 24) | — | ≈ | ≈ | L5 |
| B19 | Socle : audience « 🌐 Public » | `MeeshyComposerHost+Socle.swift`, `ComposerFloatingSocle.swift`, `ComposerAudienceSheet.swift` | ouvre l'audience | socle bas | **R** bas gauche ⇒ **F** Audience | — | P | P | L1 ✓, L3 |
| B20 | Socle : « Publier la story » + ⌄ | `MeeshyComposerHost+Socle.swift`, `ComposerPublishMenu.swift`, `ComposerPublishChannel.swift` | publie ; ⌄ = type | absent tant que la scène est vide ; ⌄ non annoncé | **R** bas, **« Publier la story ▾ »** toujours visible (désactivé si scène vide, avec raison au toucher) ; ▾ = **P▾** | — | P | P | L1 ✓ |
| B21 | Toucher la scène vide | `ComposerSceneCaptureGesture.swift`, `MeeshyComposerHost+Viewfinder.swift` (`handleSceneQuickTap`) | arme le viseur | scène | inchangé ⇒ **V** ; sur scène non vide, toucher à vide **désélectionne** | — | A | A | L1 ✓, L5 |

## C. « ⋯ » — entrées rangées (petit écran)

| # | Entrée | Source iOS | Servie si | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|
| C1 | Ajouter une diapo | B3 | la route édite des diapos (pas en modification publiée) | P | P | L1 ✓ |
| C2 | Fond (couleurs · transitions · effet visuel) | outil Fond + B11 (`ComposerBackgroundMenu`, `StoryToolMode.texture`) | toujours | P | P | L1 ✓ |
| C3 | Cadre du fond | B9 | un média de fond existe | P | P | L1 ✓ |
| C4 | Animation (frise) | B8 + B10 | toujours (bascule) | P | P | L1 ✓ |
| C5 | Durée de la diapo | `StoryEffects.slideDuration`, `timelineDuration` | toujours | P | P | L1 ✓ |
| C6 | Légende | B12 | format qui a une légende | P | P | L1 ✓ |
| C7 | Écrire le post (corps) | `ComposerRailDoor.content`, `ComposerWriting.postBody` | format Post | P (feed) | ≈ | L1 ✓ |
| C8 | Mentionner | `ComposerRailDoor.mention`, `ComposerAudienceSheet` (mentions), `ComposerAudienceReach.swift` | toujours (en story : pose une mention sur la scène) | ≈ (dans l'audience) | ≈ | L1 ✓ |
| C9 | Hashtags | `ComposerRailDoor.hashtag`, `ComposerHashtagSheet.swift`, `ComposerHashtags.swift` | toujours | ≈ (dans l'audience) | ≈ | L1 ✓ |
| C10 | Lieu | `ComposerRailDoor.place`, `StickerNearbyPlaces.swift`, feuille « Choisir un lieu » | toujours | A (sur la scène) | A | L1 ✓ |
| C11 | Aperçu | `ComposerOverflowEntry.preview` | la scène a du contenu | A | A | L1 ✓ |
| C12 | Choisir un fond (média) | `.pickBackground` | la porte Média ne l'atteint pas | A | A | L1 ✓ |
| C13 | Retirer le fond → « Retirer le fond de la scène » | `.removeBackground` | fond média ou couleur | ≈ (menu du fond : Supprimer) | ≈ | L1 ✓ |
| C14 | Enregistrer → « Enregistrer dans Photos » | `.saveToPhotos`, `ComposerSceneExportController.swift` | scène non vide | P | P | L1 ✓ |
| C15 | Transférer → « Partager hors de Meeshy » | `.share` | scène non vide | P | P | L1 ✓ |
| C16 | Tout effacer (rouge, dernier) | `.clearAll` | quelque chose à effacer ; **confirmation** ; remet le fond neutre (défaut 28b : fond rose résiduel) | A | A | L1 ✓, L3 (le ⋯ du document confirme aussi, relecture L1) |

## D. Viseur et capture (V)

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| D1 | Armer (toucher), photo (toucher encore), filmer (maintenir) | `ComposerShutterGesture.swift`, `ComposerCaptureGesture.swift`, `ComposerCaptureTapRule.swift`, `ComposerSceneCamera*.swift` | scène | inchangé ; **sortie visible** « ✕ Fermer le viseur » (défaut 22b : aucune sortie, NaN d'accessibilité à corriger) | A | A | L1 ✓ |
| D2 | Verrou de l'enregistrement, zoom vertical | `ComposerCaptureHold.swift`, `ComposerCaptureLockTrack.swift`, `ComposerCaptureMotion.swift` | viseur | inchangé | A | A | — |
| D3 | Flash + intensité, bascule d'objectif, mise au point | `ComposerCameraFlash.swift`, `ComposerFlashIntensitySlider.swift`, `ComposerCameraSwitchVeil*.swift`, `ComposerCaptureFocus*.swift` | rangée haute du viseur | inchangé | A | A | — |
| D4 | Segments de prise (retirer le dernier) | `ComposerCaptureSegments.swift`, `ComposerSceneCameraBar.swift` | bande des segments | inchangé | A | A | — |
| D5 | Look en direct (filtres, cadres, effets de l'appel) | `ComposerLiveLook*.swift`, `ComposerLookStrip*.swift`, `ComposerFaceEffects.swift` | bande du viseur | inchangé ; le look choisi **voyage avec la prise** comme réglage (L2) | A | A | L2 ◐ (reste : la prise ne pose pas encore l'original + son look) |
| D6 | Budget thermique, orientation, accès refusé | `ComposerThermalBudget.swift`, `ComposerCaptureOrientation.swift`, `ComposerCaptureRefusedChrome.swift` | — | inchangé | A | A | — |
| D7 | Enregistrer la prise dans Photos (⬇︎) | `ComposerCaptureSession+Edit.swift` (`saveTakeToPhotos`), `ComposerGallery.swift`, `CaptureSavePolicy` | retouche | inchangé — **seul aplatissement permis hors publication** (demandé) | ≈ (chat/feed) | ≈ | L2 ✓ |
| D8 | Reprendre la photo du fond | `ComposerBackgroundMenuAction.retakePhoto` | menu du fond | **S›M** du fond « Reprendre la photo » + menu d'appui long | P (`RETAKE_PHOTO`) | P | L5 |

## E. Retouche d'un média — l'atelier de la caméra (aujourd'hui DESTRUCTIF)

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| E1 | Ouverture de la retouche d'un média de scène | `ComposerSceneMediaRetouch.swift`, `MeeshyComposerHost+MediaRetouch.swift`, `MeeshyComposerHost+SceneColumns.swift:230`, `+BackgroundMenu.swift:49` | double toucher / Modifier / menu du fond ⇒ `ConversationPieceRetouch` plein écran | **S › Modifier** ⇒ **S›M** média (feuille qui réduit la scène, sections ci-dessous), non destructive | A en story (la retouche n'existe qu'en chat/feed) | A | L2, L5 ✓ |
| E2 | Filtres de l'appel (`VideoFilterPreset`) | `ComposerPhotoLook.swift`, `ComposerLookStripRule.swift`, `ComposerLookPainter.swift` | cuits au « Terminé » | **S›M › Filtre** : réglage `look.filter` persisté sur l'objet, peint en direct | A en story (`StoryFilter` seulement) | A | L2 ✓ |
| E3 | Cadres du Montage (`CallMontageChoice`) | `ComposerPhotoLook.swift` (`ComposerPhotoFrame`), `ComposerLookSceneCache.swift` | cuits | **S›M › Cadres** : `look.frame` persisté | A en story | A | L2 ✓ |
| E4 | Effets de visage de l'appel | `ComposerFaceEffects.swift` (`CallFaceEffect`) | cuits | **S›M › Effets** : `look.effect` persisté | A | A | L2 ✓ |
| E5 | Recadrage (équerres) + proportions | `ComposerCropBrackets.swift`, `ComposerFraming.swift`, `ComposerEditScene.swift`, `ComposerCropPreset` | cuit | **S›M › Recadrer** : `crop` (`MediaCropRect`, existe) + `framing` persistés | P (image : `MediaEditTool.CROP`) | P | L2 ◐ (reste : proportions et cadrage d'une vidéo) |
| E6 | Texte dans la retouche | `ComposerRetouchTextBoard.swift`, `ComposerEditTextLayer.swift` | **cuit dans l'image** (« texte cuit ») | **— fusionné** : les textes deviennent des `StoryTextObject` de la scène (sélectionnables, ordre, temps) | A | A | L2 ✓ |
| E7 | Découpe d'une vidéo | `ComposerTrimTrack.swift`, `ComposerTrimRule.swift` | cuite (export) | **S›M › Découper** : `sourceStart/sourceEnd` (existent) | P (`TRIM`) | P | L2 ✓ |
| E8 | Son de la prise : gain, muet | `ComposerEditTools.swift` (`ComposerTakeSound`), `ComposerSoundTrack.swift` | cuit | **S›M › Son** : `volume` (existe) + muet (`mutedVolumeMemento`) | P (muet) | P | L2 ✓ |
| E9 | Lecture / position de lecture | `ComposerEditSources.swift`, `offersEditPlayback` | retouche | dans **S›M** (lecture de l'aperçu) | P | P | L2 ◐ (reste : lecture de l'aperçu dans la feuille) |
| E10 | Comparer à l'original (appui maintenu) | `ComposerMediaAdjust.swift` (`ComposerLookComparison`) | éditeur en place | **S›M** (appui maintenu sur la scène réduite) | P (`LookComparison`) | P | L2 ✓ |
| E11 | Terminé / Abandonner / (x) | `ConversationPieceRetouch.swift`, `ComposerCaptureCoverLife` | rend un fichier neuf, remplace l'objet (`ComposerMediaSwapRun`) | **OK** ferme la feuille ; rien n'est rendu, rien n'est remplacé ; l'annulation couvre chaque réglage | — | — | L2 ✓ |

## F. Éditeur de média EN PLACE (non destructif, aujourd'hui masqué pour tout média local)

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| F1 | Filtre `StoryFilter` (portée SLIDE) | `ComposerObjectEditorRail.swift` (`MediaEditTool.filter`), `StoryFilterGridView`, `applyFilter` | servi seulement aux médias SANS source locale | **S›M › Filtre**, une seule grille : filtres de l'appel + `StoryFilter` ; portée = l'objet | P | P | L2, L5 ✓ |
| F2 | Réglages (11 : exposition, luminosité, contraste, saturation, vibrance, température, netteté, flou, vignette, bloom, grain) | `ComposerMediaAdjust.swift`, `ImageAdjustments` | idem | **S›M › Réglages** | P (`ComposerImageAdjustmentsPanel`) | P | L2 ✓ |
| F3 | Effets (bloom, grain) | `MediaEditTool.effects` | idem | **S›M › Réglages › Effets** (sous-section) | P | P | L2 ✓ |
| F4 | Bornes de lecture | `MediaEditTool.trim`, `ComposerMediaControls.swift` | idem | **S›M › Découper** (fusion avec E7) | P | P | L2 ✓ |
| F5 | Actions : muet, quart de tour | `MediaEditTool.actions`, `ComposerMediaActionRow` | idem | **S›M › Son** (muet) et **S›M › Recadrer** (quart de tour) | P | P | L2 ✓ |
| F6 | Texte alternatif | `MediaEditTool.altText`, `MediaAltTextField` | idem | **S›M › Description** | P | P | L2 ✓ |
| F7 | Recadrer (image posée) | `MediaEditTool.crop`, `ComposerMediaCropPads` | idem | **S›M › Recadrer** (fusion avec E5) | P | P | L2 ✓ |
| F8 | Couper (split) | `MediaEditTool.split` | **non servi** (hors contrat) | reste non servi ; suivi à part | A | A | — |
| F9 | Réinitialiser une famille | `ComposerMediaAdjustPanel.reset` | idem | **S›M** (« Réinitialiser » par section) | P | P | L2 ✓ |

## G. Texte

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Doublon | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|---|
| G1 | Créer un texte (Aa) | `MeeshyComposerHost+Intake.swift` (`handleRailDoor(.text)`), `addText` | porte Aa ; **crée toujours un nouveau texte au centre, par-dessus l'ancien** (défaut 25) | **R › Texte** ⇒ **K** ; un nouveau texte se pose décalé de l'existant | — | P | P | L1 ✓, L4 |
| G2 | Saisie en place | `MeeshyComposerHost+InlineEdit.swift`, `ComposerInlineEdit.swift`, `ComposerObjectEditorView+Keyboard.swift` | scène réduite, rail droit 9 glyphes, **pas d'OK** | **K** : scène réduite entière, barre collée au clavier, **OK** | ✕ « Quitter l'objet » ⇒ **OK** | P | P | L4 |
| G3 | POLICE (18 styles) + taille | `TextEditTool.style`, `StoryTextStyle` | carte sur le haut de la scène | **K › Aa** : polices, puis taille, puis effet | « Néon » police ET effet : la police s'appelle « Néon » seulement en effet ; police renommée « Lumière » ou retirée de la grille si identique | P | P | L4 |
| G4 | EFFET (24) | `TextEditTool.effect`, `StoryTextEffect` | carte | **K › Aa › Effet** | voir G3 | P | P | L4 |
| G5 | COULEUR | `TextEditTool.color` | carte | **K › ●** : couleur, puis contour | une seule palette partagée par couleur, contour, fond, cadre (même composant, une rangée) | P | P | L4 |
| G6 | CONTOUR (épaisseur + palette) | `TextEditTool.border` | seulement en sélection | **K › ● › Contour** ; curseur avec unité | 4ᵉ palette ⇒ palette partagée | P | P | L4 |
| G7 | ALIGNEMENT + interlettrage | `TextEditTool.align` | carte | **K › ≡** : alignement ; l'interlettrage passe dans **K › Aa** (c'est de la typographie) | — | P (`letterSpacing`) | P | L4 |
| G8 | FOND du texte (8) | `TextEditTool.background` | carte | **K › ▣** : fond, puis cadre | glyphes FOND/CADRE presque identiques ⇒ une seule entrée ▣ | P | P | L4 |
| G9 | CADRE du texte (formes, 2 curseurs, palette) | `TextEditTool.frame` | carte | **K › ▣ › Cadre** ; curseurs libellés avec unité | palette ⇒ partagée | P | P | L4 |
| G10 | LANGUE du texte (Prisme) | `TextEditTool.language` | seulement en sélection | **K › Aa › Langue du texte** (dernière rangée) | — | P | P | L4 |
| G11 | Mentions pendant la frappe (bande @) | `ComposerObjectEditorView+Mentions.swift` | au-dessus du clavier | **K** (bande au-dessus de la barre, seulement après « @ ») | — | ≈ | ≈ | L4 |
| G12 | APPARITION (début, toujours visible) | `ComposerObjectTiming.swift`, `ComposerObjectTimingControls.swift` | rail de sélection | **S › Temps** (feuille : début/fin + frise de l'objet) | **fusion** APPARITION + TIMELINE | P | P | L5 |
| G13 | TIMELINE (piste de l'objet) / PLAN 2D | `ComposerObjectEditorSection.timing/.plan` | rail de sélection | **S › Temps** | voir G12 | P | P | L5 |
| G14 | Dupliquer | `StoryCanvasContextAction.duplicate` | rail + menu contextuel | **S › Dupliquer** | menu contextuel = raccourci | P | P | L5 |
| G15 | Supprimer | rail (rouge) | rail, collé au ✕ | **S › Retirer** (rouge, à l'autre bout de la barre) | — | P | P | L5 |
| G16 | Premier plan / arrière-plan | `bringForward/sendBackward` | **absent pour le texte** (présent pour le sticker) | **S › Ordre** pour TOUTE famille | — | P | P | L5 |
| G17 | Coquille vide supprimée à la sortie | `ComposerRetouchTextRule`, `StoryComposerViewModel` | OK | inchangé | — | P | P | L4 |
| G18 | Plafond de textes | `StoryComposerLimits.maxTextsPerScene`, `ComposerLimitFeedback.swift` | refus dit | inchangé (message à la limite seulement) | — | P | P | L3 |

## H. Sticker

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| H1 | Feuille Stickers, 9 onglets (Recherche, Favoris, Récents, Mee, Meo, Mee & Meo, Personnalisés, Smileys, Boutique) | `MeeshyStickerSheet.swift`, `StickerSheetTab.swift`, `StickerSheetPage.swift`, `MeeshyComposerHost+Portals.swift` | feuille à mi-hauteur qui COUVRE la scène | **R › Sticker** ⇒ **F** qui réduit la scène ; onglets « Mee »/« Meo » sous un titre « Personnages Meeshy » | ≈ (Recherche, Favoris, Récents, Smileys) | ≈ (feuille ancrée) | L3 |
| H2 | Mes stickers (bibliothèque) | `StickerLibraryStore.swift`, `StickerLibraryArtwork.swift`, `StickerLibraryPaste.swift` | onglet Personnalisés | **F › Personnalisés** | A | A | L3 |
| H3 | Détourer le sujet d'une photo | `StickerSubjectLift.swift` | feuille sticker | **F › Personnalisés › Détourer** et **S›M** d'une image posée (« Faire un sticker ») | A | A | L3, L5 |
| H4 | Lieux alentour (stickers de lieu) | `StickerNearbyPlaces.swift` | onglet / lieu | **⋯ › Lieu** et **F Stickers › Lieu** | A | A | L1 ✓ |
| H5 | Pose d'un sticker | `SceneStickerPose.swift` | **au centre, par-dessus le texte** | décalé hors des objets existants ; sélectionné d'office ⇒ **S** | P | P | L5 |
| H6 | Modifier un sticker | `editSceneItem(.sticker)` | édition en place | **S › Modifier** ⇒ **F** Stickers qui REMPLACE l'emoji | P | P | L5 |
| H7 | Boutique | `StickerSheetPage.shop` | onglet | **F › Boutique** | A | A | L3 |

## I. Son

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| I1 | « Création audio » : micro, Fichiers, Bibliothèque | `MeeshyComposerHost+Sound.swift` (`openSoundSheet`), `AudioPostComposerView` | feuille plein écran CLAIRE, « Annuler » sans « OK » | **R › Son** ⇒ **F** (thème sombre, réduit la scène) : son actuel puis Enregistrer · Fichiers · Bibliothèque ; titre « Son de la story » ; « OK » | ≈ (étagère `SoundShelfSheet` ; ni micro ni langue) | ≈ | L3 |
| I2 | Langue du son (Prisme) | idem (FR/PT/EN/DE/ES/Plus) | feuille | **F Son › Langue du son** | A | A | L3 |
| I3 | Rôle du son : fond ou contenu | `ComposerSoundDisposition.swift`, `ComposerAudioRole`, `ComposerSoundPromotion.swift` | feuille + menu | **F Son** (choix « En fond » / « Sur la scène ») ; menu d'appui long « Poser sur la scène » | ≈ (`ComposerSoundPlacement`) | ≈ | L3 |
| I4 | Rogner le son | feuille (fichier neuf, `survivingTranscription`) | **cuit dans un nouveau fichier** | **F Son › Rogner** : bornes `backgroundAudioStart/End` (existent) — non destructif | P (`SoundTrimLaw`) | P | L2 ◐ (reste : rognage par bornes) |
| I5 | Transcription du son | `documentTranscriptions`, `voiceTranscriptions` | feuille | **F Son** | A | A | L3 |
| I6 | Menu d'un son : poser sur la scène, supprimer | `ComposerSoundActionsMenu.swift` | appui long | inchangé ; sur un son de scène sélectionné ⇒ **S** | ≈ | ≈ | L5 |
| I7 | Volume, atténuation (ducking) | `StoryMediaObject.volume`, `isDuckingDisabled`, `backgroundAudioVolume` | éditeur | **F Son** / **S›M › Son** | ≈ | ≈ | L3 |
| I8 | Son sur une image ou une vidéo RETOUCHÉE | — | **impossible après retouche** (#13840 : la retouche remplace l'objet par un fichier cuit) | possible à tout moment : le média reste un objet réglable | P | P | L2 ✓ |

## J. Dessin (D)

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Doublon | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|---|
| J1 | Outil : stylo / marqueur / gomme | `DrawingEditTool.tool` | carte sur le haut + glyphe « Pinceau » au rail | **D** barre basse : Stylo · Marqueur · Gomme | « Pinceau » du rail = trio de la carte ⇒ un seul | P | P | L1 ✓ |
| J2 | Couleur du trait | `DrawingEditTool.color` | rail | **D** (palette partagée) | — | P | P | L1 ✓ (panneau ouvert au-dessus de la barre, relecture L1) |
| J3 | Épaisseur | `.thickness` | rail | **D** | — | P | P | L1 ✓ |
| J4 | Lissage (brut / courbe / ligne) | `.smoothing` (glyphe = celui de « Dessiner ») | rail | **D** (glyphe propre) | — | P | P | L1 ✓ |
| J5 | Défaire / OK | ↶, ✕ « Terminer l'outil » | ✕ = terminer | **D** : ↶ et **OK** | ✕ ⇒ OK | P | P | L1 ✓ |
| J6 | La scène saute à l'ouverture | `ComposerSceneFloorRules.swift` | descend de 25 pt | scène entière, immobile | — | — | — | L1 ✓ |
| J7 | Trait sélectionnable | — | non (défaut 24) | **hors lot** (suivi, comme Android § 8) | — | A | A | — |

## K. Fond, menu du fond, audience, mentions, hashtags, lieu

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| K1 | Couleurs de fond (17) | outil Fond (`StoryToolMode.texture`) | rangée sous la scène ; **choisir referme** | **⋯ › Fond** ⇒ **F** : la couleur s'applique en direct, la feuille reste ouverte jusqu'à OK | P | P | L1 ✓, L3 |
| K2 | Menu d'appui long du fond : Modifier, Mettre devant, Supprimer, Reprendre la photo | `ComposerBackgroundMenu.swift`, `MeeshyComposerHost+BackgroundMenu.swift`, `ComposerSceneMenu.swift` | appui long | inchangé (raccourci) ; toucher le fond média le **sélectionne** ⇒ **S** | P | P | L5 |
| K3 | Faire d'un média le fond | `makeSceneBackground` | menu | **S › Ordre › Mettre en fond** | P (`SET_AS_BACKGROUND`) | P | L5 |
| K4 | Audience : Public, Communautés, Contacts, Sauf…, Seulement…, Privé + « Appliquer » | `ComposerAudienceSheet.swift`, `PostVisibility`, `ComposerAudienceMemory`, `ComposerAudienceOffer` | feuille plein écran, ni Annuler ni ✕, note jargon | **F** : un toucher applique et ferme ; Sauf/Seulement ouvrent leur liste ; note retirée | P | P | L3 |
| K5 | Mentions de la publication | `ComposerAudienceReach.swift`, feuille « Mentionner » (claire) | porte @ | **⋯ › Mentionner** ⇒ **F** sombre ; « OK » grisé tant que personne n'est choisi | ≈ | ≈ | L1 ✓, L3 |
| K6 | Hashtags | `ComposerHashtagSheet.swift` (sombre, « Ajouter » + « Terminé ») | porte # | **⋯ › Hashtags** ⇒ **F** ; une seule validation (Retour ajoute, OK ferme) | ≈ | ≈ | L1 ✓, L3 |
| K7 | Lieu : recherche, autour de moi, carte, confirmer | feuille « Choisir un lieu » | porte épingle ; **lieu par défaut absurde après refus** | **⋯ › Lieu** ⇒ **F** ; après refus : aucun lieu proposé, OK grisé, message lisible | A | A | L1 ✓, L3 |

## L. Animation, temps, diapos

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| L1x | Frise de la scène animée (▶, pistes par objet) | `ComposerSceneFrise.swift`, `MeeshyComposerHost+Animated.swift` | collée sous la scène, non exposée à VoiceOver | **⋯ › Animation** ⇒ **F** frise ; pistes accessibles | P (`SceneFrise`) | P | L1 ✓, L3 |
| L2x | Mode animé conservé au brouillon | autosave | **perdu à la réouverture** | conservé | P | P | L2 ◐ (reste : mode animé au brouillon) |
| L3x | Temps d'un objet (début/fin, images clés) | `ComposerObjectTiming*.swift`, `StoryKeyframe` | rail de sélection | **S › Temps** | P | P | L5 |
| L4x | Durée de la diapo | `slideDuration` | panneau | **⋯ › Durée de la diapo** ⇒ **F** courte | P | P | L1 ✓ (la coche dit la durée réelle, relecture L1) |
| L5x | Importer plusieurs médias, une diapo par média | `MeeshyComposerHost+ScenePicking.swift` | Photos | **R › Média** (sélection multiple) | P | P | L1 ✓ |
| L6x | Légendes classées par média | `ComposerSlideTextRole.swift`, `MeeshyComposerHost+Captions.swift` | — | inchangé | P | P | — |

## M. Publication (P▾) et formats

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| M1 | « Publier comme » : Story ✓ / Post / Réel (refus motivé) | `ComposerPublishMenu.swift`, `ComposerFormatAvailability.swift`, `ComposerFormatFanPolicy` | ⌄ collé à Publier, non annoncé ; le menu couvre le bouton | **P▾** ; le menu s'ouvre AU-DESSUS du bouton ; libellé VoiceOver « Type de publication » | P (`ComposerFormatMenu`) | P | L1 ✓ |
| M2 | La flèche choisit sans publier | `ComposerPublishMenuRule.armed` | — | inchangé | P | P | L1 ✓ (chevron actif même scène vide, relecture L1) |
| M3 | Post + agencement (carrousel, réel, héros, vague, sinus) | `ComposerMosaicChoice.swift`, `MeeshyComposerHost+Draft.swift` | menu de la flèche | **P▾ › Post › Agencement** | P (`ComposerMosaicChoice`) | P | L1 ✓ |
| M4 | « Publier en réel ? » / bascule auto en réel | `MeeshyComposerHost+ReelOffer.swift`, `+ReelAutoSwitch.swift` | dialogue | inchangé | P (`ReelOffer`) | P | — |
| M5 | Document (post/réel sans scène) | `ComposerDocumentSurface*.swift`, `ComposerDocumentRules.swift`, `ComposerDocumentDurablePublisher.swift` | surface | **P▾ › Post** sans scène ⇒ surface document inchangée | P (`ComposerDocumentTool`) | P | — |
| M6 | Pré-montée (état des envois) | `ComposerPreUpload*.swift`, `MeeshyComposerHost+PreUpload.swift` | sous la scène | état discret sur le média ; message seulement en échec | P | P | L3 |
| M7 | Voile de progression de l'export | `ComposerExportProgressVeil.swift` | voile | inchangé — **c'est là que la cuisson a lieu** : story par `StoryPublicationLookBake`, post, réel et publication à plusieurs scènes par `ComposerDocumentLookBake` (canal document) ; le filet du fil (`sanitizedForServerPublish`) retire tout look restant | P | P | L2 ✓ |
| M8 | Blocage de publication motivé | `publishBlock` | sous la pastille | message bref au-dessus de Publier, seulement s'il existe | P | P | L3 |
| M9 | Plafonds (texte 1000, 50 objets/scène, 2 h) | `StoryComposerLimits`, `ComposerLimitFeedback.swift` | refus dits ; compteurs visibles | aucun compteur au repos ; message à la limite (annonce VoiceOver + haptique) | P | P | L3 |

## N. Sélection (S) et menu contextuel

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| N1 | Cadre de sélection | — | **aucun** (seul le rail le dit) | cadre pointillé blanc décalé de 3 pt, aux bornes du calque (canvas SDK) | ≈ | P | L5 |
| N2 | Rail droit de 8 à 15 glyphes | `ComposerTrailingRail.swift`, `ComposerSceneColumns.swift` (`ComposerTrailingColumn`), `ComposerInlineToolPanel.swift` | rail sur la scène | **S** : une barre de cinq actions libellées | P (12 icônes) | ≈ | L5 |
| N3 | Menu contextuel d'appui long | `StoryCanvasUIView+ContextMenu.swift` (`StoryCanvasContextAction`: edit, trim, duplicate, bringForward, sendBackward, leaveScene), `ComposerSceneMenu.swift`, `MeeshyComposerHost+SceneMenu.swift` | ouvert aussi **à la fin d'un glissé lent** | raccourci des actions de **S** seulement ; jamais à la fin d'un glissé | P (`SceneObjectMenuPopup`) | P | L5 |
| N4 | « Quitter l'objet » ✕ | `ComposerTrailingColumn.Entry.exitObject` | collé à la corbeille | **—** : toucher la scène à vide désélectionne | ≈ | P | L5 |
| N5 | Jetons de l'inspecteur (« STYLE · GRAS ») | `ComposerObjectChips*.swift` | au-dessus du socle | **supprimés** (directive « aucune puce d'état ») ; leur cible (ouvrir une section) passe par **S›M** | P (`SceneInspectorRow`) | supprimés | L4, L5 |
| N6 | Éditeur d'objet plein écran | `ComposerObjectEditorView*.swift`, `ComposerObjectEditorRail.swift`, `ComposerEditedObject` | plein écran pour certaines familles | **S›M** (feuille qui réduit la scène) — l'écran plein disparaît pour la story | P | P | L5 |
| N7 | Sortir l'objet de la scène (leaveScene) | `StoryCanvasContextAction.leaveScene` | menu | **S › Ordre › Sortir de la scène** | P (`LEAVE_SCENE`) | P | L5 |

## O. Brouillon

| # | Élément | Fichiers iOS | Aujourd'hui | Nouvelle place | Android dev | wcompo | Lot |
|---|---|---|---|---|---|---|---|
| O1 | Sauvegarde automatique | `ComposerAutosave*.swift`, `MeeshyComposerHost+Autosave.swift` | silencieuse | inchangée ; **porte les réglages non destructifs** (L2) | P | P | L2 ✓ |
| O2 | Fermer un brouillon non vide | B1 | sans question | confirmation « Fermer le brouillon ? » · « Garder le brouillon » · « Abandonner » | A | P | L3 |
| O3 | Brouillons durables du post (scène emportée) | `ComposerSceneAssetCarriage.swift` | — | **porte les réglages** (L2) | P | P | L2 ◐ (reste : témoin du brouillon durable du post) |

---

## Doublons à fusionner (récapitulatif)

1. Animé (éclair) + Temps (pellicule) ⇒ « ⋯ › Animation » au repos, « Temps » en sélection.
2. APPARITION + TIMELINE d'un objet ⇒ « S › Temps ».
3. Néon (police) + Néon (effet) ⇒ un seul « Néon », dans Effet.
4. Quatre palettes (couleur, fond, cadre, contour) ⇒ un seul composant de palette.
5. Pinceau (rail) + Stylo/Marqueur/Gomme (carte) ⇒ un trio dans la barre de Dessin.
6. Rail de sélection + menu contextuel ⇒ le menu n'est qu'un raccourci des actions de « S ».
7. Retouche de la caméra (destructive) + éditeur en place (non destructif) ⇒ UNE feuille « Modifier » non destructive (E + F).
8. Texte de la retouche (cuit) + texte de scène ⇒ texte de scène.
9. Recadrage de la retouche + recadrage en place ⇒ « S›M › Recadrer ».
10. Découpe de la retouche + bornes de lecture ⇒ « S›M › Découper ».
11. « Annuler » (défaire) vs « Annuler » (fermer une feuille) ⇒ « Défaire » pour ↶, « OK » pour fermer.
12. « Description » (chevron) vs « Légende » (champ) ⇒ « Légende ».
13. « Cadre » du fond (Ajuster/Remplir) vs « Cadres » du Montage ⇒ « Cadrage » pour le premier, « Cadres » pour le second.

## Écarts Android (options iOS absentes ou partielles sur Android)

Ils alimentent le lot de parité promis par l'addendum de la spec partagée. Chacun devient une issue.

- Viseur dans la scène (toucher la scène vide, photo, maintenir pour filmer, verrou, zoom, flash, segments) : absent du compositeur de story.
- Filtres, cadres et effets de l'appel (look) sur un média de story : absents (seuls `StoryFilter` et les réglages).
- Mention, hashtag et lieu posés sur la scène en story : absents (mentions et hashtags seulement dans l'audience).
- Stickers de lieu et lieux alentour : absents.
- Onglets de stickers Mee, Meo, Mee & Meo, Personnalisés et Boutique : absents.
- Bibliothèque « Mes stickers » et détourage du sujet d'une photo : absents.
- Son : enregistrement au micro, choix de la langue du son et transcription absents ; seule l'étagère existe.
- « ⋯ » : Aperçu, Choisir un fond, Retirer le fond de la scène et Tout effacer absents.
- Appui long sur la porte Média (choix photothèque ou fichiers) : absent.
- Pied de scène de référence (crédit) : absent.
- Bloc d'aide des gestes de la scène vide : absent, faute de viseur.
- Retouche de la caméra en chat et dans le fil : cuit filtre, cadre, recadrage et textes (`ComposerRetouchBake`, `RetouchTextPainter`) — même défaut que #13840 hors story.
- Reprise d'une story recomposée (`StoryRecompositionSeeding`) : partielle (`StoryEditOpening`).
