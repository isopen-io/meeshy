# Validation E2E Story — création et restitution (2026-07-26)

Méthode : 16 auditeurs lecture-seule (un par domaine) sur ~190 fichiers de production
et ~200 suites de tests, puis réfutation adverse de CHAQUE défaut « cassé » ou « absent ».

**Taux de faux positifs de l'audit brut : 41 %** (39 réfutés sur 96 jugés). Aucun constat
de la première passe ne doit être repris sans son verdict de réfutation.

| | |
|---|---|
| Éléments audités | 316 |
| Verts (implémentés + testés) | 132 |
| Défauts confirmés après réfutation | 57 |
| dont atteignables par un utilisateur | 34 |
| Trous de COUVERTURE non arbitrés (statut « partiel ») | 87 |

## Journal des correctifs

**2026-07-26 — lot 1 (8 commits, `353ac4397` → `a0806f197`)** : pause effacée par
le ré-armement du timer · groupe expiré fermant le lecteur · bouton Son
inactionnable par VoiceOver · contenu jamais énoncé · marquage « vue » pendant
l'interlude · parsing du dégradé de fond · stories vides publiables et rendues
en noir · bouton « Répondre » perdu en mono-auteur · file hors-ligne des
commentaires · garde de geste vertical sur surface ouverte.

**2026-07-26 — lot 2** : durée de slide restaurée par undo/redo · bandeau des
deux signaux orphelins (durée recalculée, story mise en file) · inspecteur du
clip sticker · compteur « +N pistes » · traduction à la demande des textes de
canvas (gateway) · audience du repost câblée de bout en bout.

**2026-07-26 — lot 3** : médias de publication différée sans référence fantôme ·
préchargement du repost rangé sous une clé relue · parité du filtre entre
miniature et lecteur (4 axes) · parité de taille des stickers · réglages fins
de temps (steppers ±0,1 s, instant d'un keyframe) · sélection auto du clip actif.

Les lignes marquées ✅ **en gras** dans ce rapport le sont soit d'origine, soit
par ces trois lots ; celles suffixées `[CORRIGÉ 2026-07-26]` viennent d'eux. Les
lignes 🟡 « non arbitré » n'ont PAS été traitées : ce sont des trous de
couverture, pas des défauts prouvés.

### État au soir du 2026-07-26 — 8 défauts 🔴 restants

Aucun n'est un « fil manquant » réparable seul :

| défaut | pourquoi il n'est pas traité |
|---|---|
| Ratio du canvas piloté par le fond · choix manuel du format | FONCTIONNALITÉ à concevoir (9:16 / 1:1 / 4:5), pas un défaut de câblage. |
| Picker de langue de l'export · annulation d'un export en cours | Territoire de la session parallèle, active sur l'export toute la journée. |
| `banner` de l'auteur dans l'interlude | Task 9, reprise par la session parallèle. |
| WS1 · Task 5 · Task 6 (parité des transitions) | Touche la boucle de lecture au cœur ; exige une validation visuelle. Pousser à l'aveugle risquerait de casser l'auto-advance pour tout le monde. |

**Deux items 🟠 requalifiés après enquête** — ce ne sont pas des défauts :

- `TimelineViewModel.handlePublishTap` n'a aucun appelant parce que **la
  timeline n'a pas de bouton Publier**, seulement Exporter. Le code est sain
  (il forwarde vers la file unifiée `StoryPublishQueue` via l'adaptateur
  `StoryOfflineQueue`). Soit on décide que la timeline publie — décision
  produit —, soit c'est de l'infrastructure spéculative à retirer.
- `StoryPublishQueue.recoverLastStuckItem` n'a aucun appelant non plus. La
  reprise d'un item bloqué comme brouillon demande une UX (seuil, invite,
  que faire au refus) : fonctionnalité, pas correctif.


## Restitution story iOS — réactions, commentaires, réponses, notifications

- ✅ **Réponse privée à une story (bouton « Répondre » → ouverture/création de la DM)** — CONFIRMÉ partiel. apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift:53-64 (branche singleGroup sans onReplyToStory) vs :66-78 ; StoryViewerView+Sidebar.swift:139 + :53 ; contre-preuve du chemin sain : Stor  [CORRIGÉ 2026-07-26]
- 🟠 **Aperçu « a répondu » / « a reposté » dans la feuille des vues** — CONFIRMÉ absent. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:1262-1271 (seul site de construction) ; Services/StoryInteractionService.swift:102-111 et :193-202 (wire sans reply/repost) ; services
- 🟡 Prisme linguistique sur les commentaires de story (chemin de chargement principal) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:2111-2117 réimplémente la résolution (pas de garde `originalLanguage == la
- 🟠 **File d'attente hors-ligne des écritures story** — COMMENTAIRE livré 2026-07-26 ; la RÉACTION reste absente (nouveau OutboxKind requis).
- 🟡 Rollback du commentaire optimiste sur échec (POST ou upload média) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:813-816 (catch) → :856-864 (wrapper) → cœur pur :833-854 ; mais le brouill
- 🟡 Commentaire optimiste (insertion locale immédiate, racine et réponse) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:754-782 (insert `temp_`, bump `replies` du parent, bump `storyCommentCount
- 🟡 Like d'un commentaire de story (optimiste + rollback) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:2010-2046 (garde in-flight, delta optimiste, rollback dans le catch) ; app
- 🟡 Réaction commentaire en temps réel (agrégat serveur `comment:reaction-added/removed`) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:645-650 (deux `onReceive`) → apps/ios/Meeshy/Features/Main/Views/StoryViewerView+C
- 🟡 Story expirée dans le lecteur (saut des slides périmées + bandeau) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:469, :594, :634 → :1009 (`skipExpiredStoriesIfNeeded`) ; bandeau dans l'overlay co
- 🟡 Ancrage sur le commentaire ciblé par la notification (scroll + chasse paginée) — partiel, non arbitré. iPhone : apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1184-1187 → apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.s
- 🟡 Compteur de commentaires en temps réel dans la sidebar — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:664-666 (miroir `@State`) ← apps/ios/Meeshy/Features/Main/ViewModels/StoryViewMode
- 🟡 Réaction story optimiste (emoji + compteur, dédup du même emoji) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1421-1434 (snapshot puis mutation optimiste conditionnelle) ; appelants apps/ios/M
- ✅ **Rollback de la réaction story sur échec réseau (avec garde swipe-away)** — apps/ios/MeeshyTests/Features/Stories/StoryViewerReactionRollbackTests.swift:33-66 (3 cas sur la décision pure, dont swipe-away et viewer fermé) + :93
- ✅ **Arrivée temps réel des commentaires d'autrui dans l'overlay ouvert** — apps/ios/MeeshyTests/Features/Stories/StoryViewerCommentRealtimeTests.swift:47-145 — 7 cas comportementaux : append en fin de liste, réponse dans un t
- ✅ **Compteur de réactions en temps réel (`story:reacted` / `story:unreacted`)** — apps/ios/MeeshyTests/Unit/ViewModels/StoryViewModelTests.swift:1563-1600 (incrément, décrément, clamp à zéro, câblage du sink socket)
- ✅ **Ouverture du lecteur depuis une notification, sur la BONNE story et la bonne surface** — apps/ios/MeeshyTests/Features/Stories/Notifications/StoryActiveBridgeTests.swift:30-80 ; apps/ios/MeeshyTests/Unit/Views/StoryIndexResolverTests.swift
- ✅ **Distinction hors-ligne vs story réellement expirée à l'ouverture d'une notification** — apps/ios/MeeshyTests/Features/Stories/Notifications/StoryNotificationTargetViewModelTests.swift:117-171 (URLError → offline, 500 → offline, cache déjà
- 🟡 État « story expirée » depuis une notification + CTA de création — partiel, non arbitré. apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift:85-88 (`isExpired`) ; CTA apps/ios/Meeshy/Features/Sto
- ✅ **Feuille des vues : chargement + rafraîchissement temps réel sur `story:viewed`** — apps/ios/MeeshyTests/Unit/Services/StoryInteractionServiceTests.swift:190-221 (succès, échec → nil, liste vide) ; la logique de coalescing `isRefreshi

## Story iOS — Création : audio, voix et transcription

- 🟡 Persistance de la transcription produite par l'éditeur audio — casse, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Media.swift:24 et :35 — `onConfirm: { url, _, _, _ in ... }` ; le 2e paramètre e
- 🟡 Affichage de la transcription dans le reader (bascule du menu « … ») — casse, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1648 et :1660 gatent sur `effects.voiceAttachmentId != nil`. Or `voiceAttachmentId
- 🟡 Audio de la story dans l'export MP4 déclenché depuis le viewer (auteur) — casse, non arbitré. apps/ios/Meeshy/Features/Main/Services/StoryVideoExportService.swift:277 appelle `StoryExporter.export(slide, to:languages:progress:)` SANS 
- ⚪️ ~~Langue parlée choisie par l'utilisateur à l'enregistrement~~ — faux positif de l'audit, statut réel : partiel
- ⚪️ ~~Langues audio proposées à l'exploration multilingue (StoryAudioTranscript.availableLanguages)~~ — faux positif de l'audit, statut réel : absent
- ⚪️ ~~Repli différencié de la variante audio traduite (retour `nil`)~~ — faux positif de l'audit, statut réel : ok
- 🟡 Résolution multilingue de la transcription (repli sur la langue parlée) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshySDK/Models/StoryAudioTranscript.swift:40-50 — la règle demandée est bien implémentée : boucle sur la chaîne
- ✅ **Plafond de durée de l'enregistrement vocal** — TRANCHÉ 2026-07-26 : AUCUN plafond, sur aucune surface (story, message, post, réel). Le champ `maxDuration` est retiré du type, pas mis à `nil` — deux mécanismes parallèles coexistaient, dont un que le composer story n'appliquait pas. `minimumDuration` conservé (plancher anti-appui accidentel).
- ⚪️ ~~Ducking automatique du fond quand une voix foreground joue~~ — faux positif de l'audit, statut réel : absent
- 🟡 Chargement effectif des fichiers audio dans le mixer reader (configure / configureBackground) — non-teste, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift:110-152 et :571-608. Les seuls tests qui exercent ces chemins (ReaderAudioM
- 🟡 Mixage timeline du composer (AudioMixer) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift:60-84 ; appelé par StoryTimelineEngine.swift:185, :255, :273, :33
- ✅ **Mute global du son de la story (bouton latéral du viewer)** — CanvasAudioIntegrationTests.swift:7-23 (poste la notification, assert `isAudioMuted`) et StoryCanvasReaderViewMuteTests.swift:27-57 (montage UIHosting
- 🟡 Mute par piste dans le reader (chip audio + registry partagée) — partiel, non arbitré. Registry packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/AudioForegroundChip.swift:16-40 ; overlay branché en apps/ios/Meeshy/Features/Ma
- ✅ **Bouton son affiché uniquement si la slide est réellement audible** — StoryAudioAvailabilityTests.swift:25-105 (tous les cas audibles/muets) et :167-194 (`merging` avec probe `nil` = ne pas figer un faux négatif) — compo
- ✅ **Indicateur « fond sonore présent » dans l'en-tête** — StoryAudioAvailabilityTests.swift:132-158 — comportemental
- ✅ **Forme d'onde des lanes timeline (AudioWaveform)** — Timeline/Util/AudioWaveformTests.swift:11-40 — comportemental : silence→~0 / fort→~1, et `normalize` ne réamplifie pas un signal silencieux
- 🟡 Forme d'onde temps réel pendant l'enregistrement — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift:205-215 lit `recorder.audioLevels`, alimenté par DefaultSDKAudioRecorder.
- 🟡 Preview lecture/pause + waveform de la cellule audio du composer — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/StoryAudioCell.swift:180-203 ; appelé en Controls/ComposerToolPanelHost.swift:286.
- ⚪️ ~~Spectrogramme audio (AudioSpectrogramView / AudioSpectrogramRenderer)~~ — faux positif de l'audit, statut réel : absent
- ⚪️ ~~Pilule audio play/mute posée sur le canvas (StoryAudioPlayerView)~~ — faux positif de l'audit, statut réel : absent
- ⚪️ ~~Enveloppe de fondu par défaut du fond sonore~~ — faux positif de l'audit, statut réel : absent
- ⚪️ ~~Fondu de sortie global, volume par piste et position de clip du mixer reader~~ — faux positif de l'audit, statut réel : ok
- ⚪️ ~~Convention adaptiveOnChange dans le recorder vocal~~ — faux positif de l'audit, statut réel : ok
- ✅ **Audio de la story dans l'export MP4 déclenché depuis la timeline composer** — StoryExporter_AudioLanesTests.swift:17-122 — comportemental : fenêtre timeline, URL non résolue, boucle bg couvrant la durée, flag loop foreground ign
- 🟡 Sélecteur de langue de l'export : couverture des langues audio — partiel, non arbitré. apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift:61-75 — `prepare(story:)` ne lit que `story.translations` ; ni `Sto

## Story iOS — Création : brouillons, historique undo/redo, file offline, repost

- 🟡 Sauvegarde automatique du brouillon (débounce post-mutation + passage en arrière-plan) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift:312 (.onReceive(viewModel.autosaveTrigger)) et :306 (.adaptiveOnChange(of:
- ✅ **Persistance du brouillon (slides, visibilité, fichiers média) dans StoryDraftStore** — MeeshySDKTests/Store/StoryDraftStoreTests.swift:81/98/114 (re-save depuis une URL restaurée, source manquante) + MeeshyUITests/StoryDraftStoreTests.sw
- 🟡 Reprise via la carte de brouillon (DraftResumeCard) — partiel, non arbitré. Présentée StoryComposerView.swift:220-242 (Reprendre → restoreDraft(), Recommencer → clearAllDrafts()) mais `updatedAt: nil` codé en dur à :
- ✅ **Undo/redo global de la composition** — HistoryStoreTests.swift:7-75 (6 tests : dédup, troncature de branche redo, éviction par cap retournée, trajectoire plancher↔sommet) + StoryComposerHis
- ✅ **Survie de l'historique d'édition timeline à un crash (blob opaque)** — MeeshySDKTests/Store/StoryDraftStoreTests.swift:27/31/40/48 (nil, round-trip, écrasement, purge par clear) + MeeshyUITests/Timeline/ViewModel/Timeline
- 🟡 File d'attente offline de publication + drain à la reconnexion — partiel, non arbitré. Chemin vivant : StoryViewModel.swift:966 `StoryPublishQueue.shared.enqueue(item)` via persistPublishIntentToQueue ; drain StoryPublishQueue.
- ✅ **Copie des médias vers le dossier de la file offline** — CONFIRMÉ partiel. apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:915-941 ; packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift:407-417 ; packages/MeeshySDK/Sources/MeeshyUI/Story/Sto  [CORRIGÉ 2026-07-26]
- 🟠 **Publication offline depuis la timeline (handlePublishTap + snackbar de confirmation)** — snackbar LIVRÉE 2026-07-26 (TimelineBannerOverlay) ; l'appelant de handlePublishTap reste absent. — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+OfflinePublish.swift:79-113 (0 appelant hors tests) ; apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:762-7
- 🟡 Enregistrement du handler de publication (StoryOfflineQueueBootstrap vs StoryPublishService) — casse, non arbitré. Deux écrivains concurrents non gardés sur le MÊME `StoryPublishQueue.shared.onPublish` : apps/ios/Meeshy/MeeshyApp.swift:224 → StoryOfflineQ
- ✅ **Migration des anciennes files offline (StoryQueueMigrator)** — MeeshySDKTests/Persistence/StoryQueueUnificationTests.swift:177 (draine le fichier legacy réel), :199 (idempotence, 2e passage no-op), :218 (JSON corr
- 🟠 **Reprise d'un item bloqué en file comme brouillon (recoverLastStuckItem)** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift:335-343 ; apps/ios/Meeshy/Features/Main/Views/RootView.swift:2107-2120 ; apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swif
- 🟡 Republication d'une story en story — propagation de la chaîne de repost — casse, non arbitré. StoryComposerViewModel+Repost.swift:38-41 pose `repostOfId` / `originalRepostOfId`, mais AUCUN chemin de publication ne les lit : StoryViewe
- ✅ **Préchargement de la chaîne média du repost** — CONFIRMÉ partiel. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Repost.swift:104-110 ; packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift:140-144 ; packages/MeeshySDK/Sou  [CORRIGÉ 2026-07-26]
- ⚪️ ~~Republication « éditer et republier en post » (RepostPayload + reprojection canvas)~~ — faux positif de l'audit, statut réel : partiel
- ✅ **Historique de révisions de message (EditHistoryStore) — hors périmètre Story** — MeeshyTests/Unit/Services/EditHistoryStoreTests.swift:15-120 (12 tests comportementaux : ordre, contenu vide ignoré, isolation par message, plafond de

## Story iOS — Création : dessin et stickers

- 🟡 Tracé au doigt — capture live du trait — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/StrokeCaptureLayer.swift:223-257 (touchesBegan/Moved/Ended) + :295 makeStroke(), monté par
- ✅ **Largeur variable selon vitesse (doigt) et pression (Pencil)** — StrokeWidthMappingTests.swift (7 tests : plafond ×1.0, plancher ×0.4, plancher 1pt, marqueur ×2, non-régression captureVersion 0), StrokeWidthDriverTe
- ✅ **Lissage du trait (brut / courbe Catmull-Rom / droite RDP)** — StrokeSmoothingTests.swift (15 tests : endpoints préservés, tolérance 0 = identité, collapse en ligne droite), StrokeWidthSmoothingTests.swift:21-35 (
- 🟡 Gomme (suppression des traits croisés) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/StrokeCaptureLayer.swift:275 (commit → onEraseGesture) → StoryComposerView+Canvas.swift:11
- ✅ **Couleurs du pinceau et recoloration d'un trait** — DrawingColorHexRoundtripTests.swift:12 (roundtrip identité sur TOUTE la palette — comportemental, verrouille le bug « vert/violet non surlignés ») + S
- ✅ **Épaisseur du pinceau et d'un trait existant** — StoryComposerViewModel_DrawingEditingTests.swift:132 (mutation effective du trait sélectionné) ; les bornes 1…30 du slider ne sont pas testées
- ✅ **Undo / redo des traits de dessin** — StoryComposerViewModel_DrawingUndoRedoTests.swift (9 tests comportementaux : ordre préservé, redo invalidé par un nouveau trait, no-op sur pile vide, 
- ✅ **Sélection et édition par trait (liste des traits)** — StoryComposerViewModel_DrawingEditingTests.swift:87-156 (id invalide = no-op, suppression lève la sélection, mutations ciblées)
- ✅ **Migration des dessins legacy (PKDrawing → StoryDrawingStroke)** — LegacyDrawingMigrationTests.swift (16 tests : données vides/corrompues, comptage, extraction couleur RGB/gris, mapping pen/marker, et l'intégration de
- ✅ **Rastérisation du dessin dans le rendu final (canvas, reader, ThumbHash)** — StoryStrokeRasterizerTests.swift (6 tests dont :46 et :59 qui échantillonnent réellement les pixels — le trait rouge est peint, le hors-trait reste tr
- 🟡 Aperçu WYSIWYG du trait en cours de tracé — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/StrokeCaptureLayer.swift:265 emitInProgress → StoryComposerView+Canvas.swift:1128 → StoryC
- 🟡 Zoom / pan du canvas pendant le tracé (pinch 2 doigts) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/StrokeCaptureLayer.swift:174 (recognizer) + :195-219 handleViewportPinch → StoryComposerVi
- 🟡 Suppression du double rendu du dessin pendant le tracé — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift:1091 `isDrawingOverlayActive: isImmersiveDrawingSurface` → StoryCan
- ✅ **Pose d'un sticker (picker → canvas)** — ComposerLayerActionsTests.swift:109 test_addSticker_appendsToCurrentEffects_andBringsToFront (comportemental : comptage, zIndex croissant, décalage en
- ⚪️ ~~Recherche d'emoji dans le picker de stickers~~ — faux positif de l'audit, statut réel : absent
- 🟡 Redimensionnement et rotation d'un sticker — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Gestures.swift:122 handlePinch (clamp 0.3…4.0 :157) et :176 handleRotatio
- ✅ **Cache LRU des glyphes sticker rasterisés** — StoryStickerRasterizer_LRUTests.swift (4 tests comportementaux : hit sous la limite, éviction au-delà, flush sur didReceiveMemoryWarning, identité de 
- ✅ **Parité de taille des stickers entre canvas, composite et miniature** — CONFIRMÉ partiel. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift:29-37 + Canvas/CanvasGeometry.swift:26 + Canvas/StoryStickerRasterizer.swift:94-101 ; packages/MeeshySDK/Sources/MeeshyU  [CORRIGÉ 2026-07-26]
- ✅ **Routage du hit-test entre dessin, manipulation d'élément et texte** — StoryCanvasHitTestRoutingTests.swift (3 tests comportementaux montant un vrai StoryCanvasUIView : overlay non nommé n'avale plus le hit, pas de fallba

## Story iOS — Création : médias, fond, cadrage et filtres

- 🟡 Import d'un média premier plan (photo/vidéo) depuis PhotosPicker — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift:326 (PhotosPicker → fgMediaItem) → StoryComposerView+Media.sw
- ⚪️ ~~Écriture du fichier temporaire de l'image importée (pont UIImage → file:// pour le canvas)~~ — faux positif de l'audit, statut réel : ok
- ✅ **Désignation du fond (1er média importé = fond, chip « Fond » pour promouvoir/rétrograder)** — MeeshyUITests/Story/Composer/StoryComposerViewModelTests.swift:133 test_toggleBackground_enforcesSingleBackgroundMediaPerSlide, :150 test_toggleBackgr
- 🟡 Réinitialisation de `loop` à la rétrogradation d'un fond (règle : loop = background uniquement) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift:617-621 remet loop=false, MAIS packages/MeeshySDK/Sou
- 🟡 Positionnement / zoom / rotation d'un média premier plan (design 1080 → render) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift:213-231 (bounds = baseMediaDesignSize × scale, position, ancho
- ✅ **Zoom / pan du CONTENU du fond (« zoom inside bg » façon Instagram) + snap centre/bords** — MeeshyUITests/Story/Canvas/StoryCanvasBackgroundSnapTests.swift (5 tests comportementaux), Reader/Background/StoryBackgroundLayerTests.swift:50 test_c
- 🔴 **Ratio du canvas piloté par le fond — ratio CONTINU clampé [9/21, 21/9] (directive 2026-07-14)** — CONFIRMÉ partiel. packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1235-1238 et 1493-1495 ; packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Elements.swift:101-103,128-136 ; packages/Meeshy
- 🔴 **Choix manuel du format de canvas (9:16 / 1:1 / 4:5)** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1213-1216 ; packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift:715-760 ; packages/MeeshySDK/Sources/MeeshyUI/S
- ✅ **Cadrage de la carte canvas (carded/free/immersive, insets, alignement vertical)** — MeeshyUITests/Story/StoryCanvasFramingTests.swift — 22 tests comportementaux (monotonie du scale, non-chevauchement sheet/header, alignements top/bott
- ✅ **Fond couleur unie (pastille + identité de contenu par couleur + thumbHash au-dessus)** — MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift:8 + :101 test_configure_sameSolidColorTwice_isNoOp, StoryBackgroundLayerIdentity
- ✅ **Fond dégradé — sérialisation + rendu canvas / composer / miniatures / export** — MeeshySDKTests/Models/StoryBackgroundValueTests.swift (parse hex/gradient, round-trip, formes malformées, cap 64 car.), StoryBackgroundLayerTests.swif
- ✅ **PARSING du dégradé dans le fond plein écran du viewer (défaut D7 du plan)** — CONFIRMÉ casse. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:1837-1843 ; packages/MeeshySDK/Sources/MeeshySDK/Models/StoryBackgroundValue.swift:20,38 ; packages/MeeshySDK/Sources/MeeshyUI/Story/Co  [CORRIGÉ 2026-07-26]
- ✅ **Fond image — cache chaud, thumbHash, resolver distant, ré-estampage après édition in-place** — MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerImageTests.swift (3 tests : cache, resolver sans imageCache, thumbHash immédiat), StoryBackg
- ✅ **Fond vidéo — attach immédiat, streaming sur cache-miss, gravity fit/fill, lifecycle app** — MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerVideoTests.swift (11 tests : attach, streaming cache-miss, onPlayerAttached, gravity ×4, lif
- ✅ **Boucle du fond vidéo (règle : loop = background uniquement, jamais foreground)** — MeeshyUITests/Story/Canvas/StoryMediaLayer_ForegroundResolverTests.swift:119 test_configure_foregroundVideoPlayMode_doesNotLoop + :260 EditMode_loops 
- ✅ **Filtres — grille 8 filtres + curseur d'intensité, cuits dans le bitmap du fond IMAGE** — MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift:137 test_configure_imageWithFilter_bakesFilteredBitmap, StorySlideRendererFilter
- ⚪️ ~~Filtres appliqués au fond VIDÉO et aux médias premier plan~~ — faux positif de l'audit, statut réel : ok
- ⚪️ ~~Filtres dans l'export MP4 (feature auteur)~~ — faux positif de l'audit, statut réel : partiel
- 🟠 **Parité placeholder thumbHash ↔ rendu pour les 6 filtres sans noyau** — CONFIRMÉ partiel. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterKind.swift:21-29 ; packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideRenderer.swift:181-202 ; packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilt
- ✅ **Flou gaussien GPU (MPSImageGaussianBlur) — brique du verre et du backdrop** — MeeshyUITests/Story/Property/StoryBlurFilterTests.swift — 2 tests qui SEEDENT une texture, exécutent le blur et relisent les octets de sortie (pré-con
- ✅ **Fond « verre » des textes — chemin MPS (backdrop capturé) + repli CAFilter** — MeeshyUITests/Story/Canvas/StoryGlassBackdropLayerFilterRetainTests.swift (exactement un CAFilter installé + survie au drain de l'autorelease pool — r
- ✅ **Zoom viewport du composer (pinch 3 doigts, snap à l'identité, double-tap de reset)** — MeeshyUITests/Story/Canvas/CanvasViewportZoomPolicyTests.swift — 9 tests (clamp min/max, snap identité ±, hors bande, priorité item sur reset)
- ✅ **Reprojection des éléments lors d'un changement de ratio de canvas (repost)** — MeeshyUITests/Story/Repost/CanvasReprojectorTests.swift (centre préservé 9:16→1:1, item bas clampé + warning, aspectRatio et rotation invariants), Can
- 🟡 StoryMediaLoader — downsample ImageIO, vignette vidéo, cache de players prérollés — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaLoader.swift:45/:52 (downsample), :91 videoThumbnail, :118 preloadVideoPlayer, :182 prel

## Story iOS — Création : éléments texte du canvas

- ✅ **Ajout d'un texte au canvas (bouton « Ajouter du texte » + auto-ajout à l'ouverture du panneau Texte)** — MeeshyUITests/Story/Composer/StoryComposerViewModelTests.swift:329 (selectedElementId) et :342 (fontSize lisible) ; StoryComposerViewModel_TextEditing
- ✅ **Saisie inline sur le canvas (StoryInlineTextEditor superposé à la StoryTextLayer)** — StoryCanvasUIViewInlineEditTests.swift:26,33,41 (glyphes masqués/restaurés, survie au rebuild) ; StoryInlineTextEditorTests.swift:11-117. AUCUN test d
- ✅ **Police : style typographique (9 styles) + graisse indépendante (fin/normal/semi/gras)** — StoryTextFontResolverTests.swift:14-47 ; StoryTextLayerFrameGeometryTests.swift:106 (familles nommées) et :123 (la graisse change bien la FACE rendue)
- ✅ **Taille du texte (slider 14…160, suit le pinch en live et réinitialise scale)** — MeeshyUITests/Story/TextEditToolOptionsSizeTests.swift:8,16,24
- ✅ **Couleur du texte (palette de 14 pastilles)** — StoryInlineTextEditorTests.swift:11 (couleur appliquée au champ) ; aucun test de la couleur côté StoryTextLayer
- ✅ **Alignement (gauche / centre / droite)** — StoryInlineTextEditorTests.swift:11 (textAlignment == .left) uniquement ; aucun test sur l'alignement de StoryTextLayer
- ✅ **Fond du texte : aucun / verre (blur GPU) / 9 solides** — StoryTextLayerSolidBackgroundTests.swift:35,48,55,61,74 ; StoryTextLayerGlassZOrderTests.swift ; Story/Property/StoryTextBackgroundStyleTests.swift (C
- ✅ **Cadrage : forme de la boîte (arrondi / pilule / carré / losange / nuage / bulle BD) + padding auto ≥ 1 glyphe « o »** — StoryTextLayerFrameGeometryTests.swift:19-102 (padding historique, losange inscrit, queue de bulle, bosses de nuage, tracés dans les bounds) ; MeeshyS
- 🟡 Bordure / contour du texte (couleur + épaisseur 0…12 pt) — partiel, non arbitré. TextEditToolOptions.swift:433 (borderOptions) + :426 initializeBorderDefaultsIfNeutral appelé depuis le `.onAppear` de TextEditToolOptions.s
- ✅ **Retour à la ligne et mesure (wrap 88 % de la largeur design, jamais de « … », marge d'encre des serifs)** — StoryTextLayerWrappingTests.swift:22,34 ; StoryInlineTextEditorTests.swift:68,86,96,107
- ✅ **Échelle et rotation d'un texte par gestes (pinch 2 doigts, rotation)** — StoryCanvasLiveEditContinuityTests.swift:226,235,244 (ratio d'échelle live, rotation préservée, bakedScale invalide) ; aucun test du geste de bout en 
- ✅ **Ordre d'empilement — remontée au premier plan au tap / au début de drag / pinch** — StoryCanvasUIViewZOrderAndLayerTests.swift:100 (texte), :130 (un seul didSet), :177 (no-op si déjà au sommet) ; StoryComposerViewModelTests.swift:190,
- 🟡 Ordre d'empilement — actions explicites « Mettre au premier plan » / « Mettre à l'arrière » du menu long-press — casse, non arbitré. Canvas/StoryCanvasUIView+ContextMenu.swift:38 et :42 routent vers contextBringForward (:225) et contextSendBackward (:235) qui ne traitent Q
- 🟡 Duplication d'un texte — partiel, non arbitré. Trois implémentations divergentes : StoryComposerViewModel+Elements.swift:534 duplicateElement (respecte isLocked ligne 539 ET le plafond ca
- 🟡 Suppression d'un texte — partiel, non arbitré. StoryComposerViewModel+Elements.swift:483 deleteElement (refuse les textes verrouillés ligne 489, purge selectedElementId ligne 500, sort du
- 🟡 Verrou d'édition du badge d'attribution repost (isLocked) — casse, non arbitré. Le badge est un StoryTextObject ordinaire posé sur le canvas (StoryComposerViewModel+Repost.swift:64-75, `isLocked: true`). Les gardes n'exi
- ✅ **Édition d'un texte existant (tap, double-tap, bouton crayon de la liste des textes)** — StoryComposerViewModel_TextEditingTests.swift:20-95 (état actif, idempotence, géométrie intacte, sortie, suppression pendant l'édition) ; StoryCompose
- 🟡 Sélection / désélection d'un texte sur le canvas — partiel, non arbitré. `selectedElementId` est bien posé au tap (StoryComposerView+Canvas.swift:966) mais n'est JAMAIS transmis au canvas : Canvas/StoryCanvasRepre
- ⚪️ ~~Panneau d'édition texte hiérarchique StoryTextEditorView (cycle de style, bascule fond, timing début/durée/fondus, corbeille)~~ — faux positif de l'audit, statut réel : absent
- ✅ **Langue source du texte (bulle « Langue », 7 pastilles + langue courante)** — StoryTextLanguageChoiceTests.swift:25-54 (résolution de la suggestion) et :58,72 — mais ces deux-là exercent `updateElementLanguage`, PAS le chemin ré
- ✅ **Barre d'outils flottante d'édition texte (9 bulles + panneau d'options déplié)** — StoryComposerViewModel_TextEditingTests.swift:73,83 (outil déplié/replié). MAIS :99 `XCTAssertEqual(TextEditTool.allCases.count, 8)` alors que l'enum 
- ✅ **Respect du Prisme linguistique au rendu du texte (original si aucune traduction ne matche)** — MeeshyUITests/Story/Canvas/ReaderLanguageSwitchTests.swift ; StoryRendererCache_LanguagesTests.swift
- ✅ **Conventions projet dans le domaine (adaptiveOnChange, absence de try? nu, pureté SDK)** — aucun source-guard automatisé sur ces conventions pour le domaine texte

## Story iOS — Prisme linguistique bout-en-bout (composition → restitution)

- ✅ **Résolveur de langue source à la composition (clavier principal > systemLanguage > regionalLanguage > fr)** — MeeshyUITests/Story/Composer/StoryTextLanguageChoiceTests.swift:25-54 — comportemental (clavier prime sur la préférence de lecture, normalisation pt-B
- ✅ **Exclusion des modes d'entrée non linguistiques (emoji, dictée)** — MeeshyUITests/Story/Composer/StoryTextLanguageChoiceTests.swift:35-40 — comportemental (emoji/dictation retombent sur la préférence)
- 🟡 Bulle « Langue » parmi les réglages de texte (choix explicite de l'auteur) — partiel, non arbitré. Enum : packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+TextEditing.swift:21 ; bulle rendue par TextEditFloatingBubbles.swif
- ⚪️ ~~`StoryComposerViewModel.updateElementLanguage(elementId:language:)`~~ — faux positif de l'audit, statut réel : ok
- ⚪️ ~~Correction de la langue source d'un média ou d'un audio du canvas~~ — faux positif de l'audit, statut réel : absent
- ⚪️ ~~Langue source de la story au publish (`originalLanguage` du payload)~~ — faux positif de l'audit, statut réel : partiel
- ✅ **Propagation de la `sourceLanguage` par texte jusqu'au moteur de traduction** — services/gateway/src/services/posts/__tests__/StoryTextObjectTranslationService.test.ts + PostService.storyTextObjectField.test.ts
- ✅ **Résolution du texte canvas à la lecture — chaîne préférée, repli sur l'ORIGINAL (jamais translations.first)** — MeeshySDKTests/Models/Story/Resolution/StoryTextObjectResolutionTests.swift:1-33 et StoryPrismeLanguageMatchTests.swift:14-42 — comportemental, y comp
- ✅ **Résolution de la légende du post sur la chaîne complète** — MeeshySDKTests/Models/StoryItemPrismeContentTests.swift:12-35 — chaîne, ordre, et `noMatch_returnsOriginal_neverTranslationsFirst`
- ✅ **Chaîne de résolution systemLanguage > regionalLanguage > customDestinationLanguage > locale appareil > fr** — MeeshySDKTests/Auth/MeeshyUserPreferredContentLanguagesTests.swift
- ✅ **Override de langue par le lecteur (Prisme « Exploration ») — prépendu à la chaîne, éphémère** — apps/ios/MeeshyTests/Features/Stories/StoryViewerLanguageOverrideTests.swift (helper, 6 cas) + MeeshyUITests/Story/Canvas/ReaderLanguageSwitchTests.sw
- ✅ **Traduction à la demande d'une langue non encore disponible (feuille « Traductions »)** — CONFIRMÉ casse. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:1718-1735 ; StoryInteractionService.swift:35-50 ; services/gateway/src/routes/posts/core.ts:357-381 ; PostTranslationService.ts:105-153
- ✅ **Langues proposées à l'exploration (union texte canvas + légende)** — MeeshySDKTests/Models/StoryTextLanguageAvailabilityTests.swift — 10 cas comportementaux (union multi-textes, texte vide ignoré, normalisation fr-FR/FR
- ✅ **Apparition du bouton « Traductions » conditionnée à la présence de texte** — StoryTextLanguageAvailabilityTests.swift:118-136 (moteur) + apps/ios/MeeshyTests/Features/Stories/StoryActionRailPlanTests.swift:40-51 (rail)
- ✅ **Bascule « Afficher la transcription » dans le menu « … »** — CONFIRMÉ casse. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1659-1662 (garde) ; StoryViewerView+Sidebar.swift:727 (entrée de menu) ; packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Media.swi
- 🟡 Résolution de la transcription (chaîne préférée, puis langue parlée d'origine) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshySDK/Models/StoryAudioTranscript.swift:40-50 ; appelé par StoryViewerView.swift:1653-1654 — mais toujours su
- ✅ **Variante audio TTS jouée dans la langue du lecteur** — MeeshySDKTests/Models/Story/Resolution/StoryAudioPlayerObjectResolutionTests.swift:9-31 — comportemental (ordre de chaîne, repli sur la piste d'origin
- ⚪️ ~~`StoryAudioTranscript.variant(effects:preferredLanguages:)` et `.availableLanguages(effects:)`~~ — faux positif de l'audit, statut réel : ok
- ✅ **Invalidation du cache de layers au changement de langue** — MeeshyUITests/Story/Canvas/StoryRendererCache_LanguagesTests.swift — 4 cas comportementaux (miss sur changement, hit sur identité, liste vide, ordre s
- ✅ **Mode édition affiche le texte ORIGINAL (l'auteur n'édite jamais une traduction)** — MeeshyUITests/Story/Reader/StoryRendererLanguagesTests.swift:28-45 — comportemental, lit la chaîne effectivement posée sur la `StoryTextLayer`
- ✅ **Merge temps réel des traductions par text-object (`story:translation-updated`)** — MeeshySDKTests/Models/StoryItemTranslationMergeTests.swift — 7 cas comportementaux, dont la préservation de `viewedAt`/`updatedAt`/`impressionCount`
- 🔴 **Picker de langue de l'export MP4 (auteur)** — CONFIRMÉ partiel. apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift:71-85 ; apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift:33 ; services/gateway/src/services/PostService.ts:198-2
- 🟡 Chaîne de langues du prefetcher de slides voisines — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:896 utilise `preferredContentLanguagesForReader` (défini :791-792 = préférences br
- ⚪️ ~~État `showLanguageOptions` (ancien strip de drapeaux)~~ — faux positif de l'audit, statut réel : ok
- ⚪️ ~~Suite `StoryComposerView_LanguageResolutionTests` (contrat obsolète)~~ — faux positif de l'audit, statut réel : partiel

## Story iOS — Restitution : gestes, navigation et chrome du lecteur (StoryViewerView + canvas SDK)

- ✅ **Tap sur la bande gauche → slide précédente** — apps/ios/MeeshyTests/Features/Stories/StoryGestureNavigationTests.swift:52 et StoryGestureDecisionsTests.swift:139 exercent la décision avec des coord
- ✅ **Tap sur la bande droite → slide suivante** — StoryGestureNavigationTests.swift:59 et StoryGestureDecisionsTests.swift:156
- ✅ **Bandes 30/40/30 — le centre n'avance pas la story au tap simple** — StoryGestureNavigationTests.swift:22-43 (trois bandes + largeur dégénérée) et :69
- 🟡 Double tap central → bascule pause / lecture — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:478-486 (decideDoubleTap) ; la détection réelle (fenêtre 0,3 s, `lastCenter
- 🟡 Appui long ≥ 200 ms → bascule pause + immersion (second appui = reprise) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:168-186 : le TOGGLE (if isLongPressPaused { … } else { … }) vit dans une Ta
- 🟡 La pause long-press gèle réellement le média (vidéo de fond, audios, effets) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:554-559 poste .storyPlayerPause/.storyPlayerResume ; observateur : packages/Meeshy
- ✅ **Glissé vertical vers le bas → fermeture du lecteur** — StoryGestureNavigationTests.swift:128 (validation), :136 (annulation sous le seuil), :148 (flick court validé par la prédiction)
- ✅ **Glissé vertical vers le haut → plein écran ; vers le bas en plein écran → retour fenêtré** — StoryGestureNavigationTests.swift:107, :114, :122
- 🟡 Glissé horizontal → groupe (auteur) voisin, avec cube suivant le geste — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:245-283 — seuils 60/150 codés en dur directement dans le .onEnded, aucune 
- ✅ **Mute / son (bouton du rail → canvas)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Audio/CanvasAudioIntegrationTests.swift:7-23 (notification → isAudioMuted) et packages/MeeshySDK/T
- ✅ **Bouton Son actionnable par VoiceOver** — CONFIRMÉ casse. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift:387-399 (action vide + toggle dans highPriorityGesture) ; apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:2562-2643   [CORRIGÉ 2026-07-26]
- ✅ **Rail d'actions — composition figée à l'entrée du slide** — apps/ios/MeeshyTests/Features/Stories/StoryActionRailPlanTests.swift:9-117 (comportemental, tous les cas auteur/lecteur/public/privé) ; le re-gel sur 
- ⚪️ ~~Strip de langues du rail (`showLanguageOptions`)~~ — faux positif de l'audit, statut réel : ok
- 🟡 Menu « … » (plein écran, transcription, partage, supprimer, signaler) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift:697-827 — le menu est complet et câblé, mais son ouverture n'appelle jamai
- 🟡 Un toucher n'importe où referme la surface ouverte (langues, emojis, commentaires, transcription) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:137-141 (dismiss dès le touch-down, avant toute autre décision) ; apps/ios/
- ✅ **Une bascule ouverte doit se refermer AVANT de fermer le lecteur** — CONFIRMÉ partiel. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:137-141 (garde touch-down) et 401-413 (seuil 120/300) ; apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:199-200 et 28  [CORRIGÉ 2026-07-26]
- 🟡 État de chargement du lecteur (ThumbHash → miniature → spinner différé) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryReaderLoadingOverlay.swift:63-143 ; monté apps/ios/Meeshy/Features/Main/Views/StoryViewerView
- ✅ **Accessibilité — contenu de la story restitué à VoiceOver (textes traduits, stickers, fond)** — CONFIRMÉ casse. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:1157-1161 ; packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Accessibility.swift:14-110 ; packages/MeeshySDK/Sources/  [CORRIGÉ 2026-07-26]
- 🟡 Accessibilité — actions rotor « Story suivante / précédente » — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:1162-1180 (accessibilityAction nommées, avec tick haptique)
- 🟡 Accessibilité — libellé/indice de l'overlay gestuel — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:106-108 : l'élément plein écran porte un accessibilityHint « Tap left…, hol
- 🟡 Annonce VoiceOver du changement de slide (« Story 2 sur 5 ») — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:584-593 (UIAccessibility.post gaté sur isVoiceOverRunning)
- 🟡 Annulation du long-press armé quand la scène devient inactive — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:287-296 (adaptiveOnChange sur scenePhase) + double garde UIApplication.shar
- 🟡 Conteneur du lecteur — attente, cascade cache→postId→réseau, écran « Story introuvable » — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift:103-116 (attente), :118-167 (repli Réessayer/Fermer), :195-237 (cascade + tim

## Story iOS — Restitution : horloges, progression, pause

- ⚪️ ~~Pont playhead canvas → barre de progression (`onPlaybackTime`)~~ — faux positif de l'audit, statut réel : absent
- 🟠 **Arbitrage playhead vs wall-clock (`StoryPlaybackClock.resolve`)** — CONFIRMÉ absent. apps/ios/Meeshy/Features/Main/Views/StoryPlaybackClock.swift:28-47 (seul site de définition) ; apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:845-862 (`onProgressChange` utilise `p` brut) ;
- 🟠 **D9 — timer armé avec la durée de la BONNE slide** — CONFIRMÉ partiel. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:414+470 (`update()` puis `restartTimer()` synchrones dans `crossFadeStory`) et :618-629 (`updateStoryDuration()` avant `refreshPrefetc
- ✅ **Barre de progression pilotée par le timer gated (wall-clock)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryReaderTimerGatingTests.swift:101 (`test_timer_startsImmediately_afterContentReady`), :230 (`t
- ✅ **Gating content-ready : le compte ne démarre pas avant le contenu** — StoryReaderTimerGatingTests.swift:81 (`test_timer_doesNotStartBeforeContentReady`), :159 (`test_timer_doesNotStartOnPreviousSlideContentReady`) ; apps
- ✅ **Failsafe anti-freeze content-ready (6 s)** — StoryReaderTimerGatingTests.swift:532, :553, :564, :582
- 🟡 Gel en phase de la pause (barre + canvas + audio) depuis un agrégat unique — partiel, non arbitré. Agrégat `shouldPauseTimer` StoryViewerView+Content.swift:556-586 → timer StoryViewerView.swift:563-565 ET canvas StoryViewerView.swift:1289 
- ✅ **Ré-armement du timer qui efface la pause en cours (asymétrie startTimer / refreshPrefetchWindowAndTimer)** — CONFIRMÉ casse. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift:202 (`isPaused = false`) ; apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:630 (compensation présent  [CORRIGÉ 2026-07-26]
- 🟡 Reprise sur le playhead exact (aucun saut au resume) — partiel, non arbitré. Timer : re-seed de l'accumulateur `lastTick = nil` (StoryReaderTimerController.swift:243) ; canvas : `displayLink.isPaused = false` + `pushS
- ✅ **Réinitialisation du playhead à chaque slide** — StoryReaderTimerGatingTests.swift:126 (`test_timer_resetsToZero_onSlideSwitch`) ; AudioForegroundChipTests.swift:75-120 (`StoryReaderPlayheadStateTest
- ✅ **Gel de la timeline sur stall média (pont `onPlaybackProgressing`)** — StoryPlaybackHealthTests.swift:17-137 (matrice complète incl. deadlock guards) ; StoryCanvasPlaybackHealthTests.swift:50 / :142 (`test_playheadAdvance
- 🟡 Indicateur visuel de buffering mid-slide (grâce 350 ms) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:1149 (appel) → :1787-1802 (`handleStallIndicatorSignal`, grâce 350 ms, disp
- 🟡 Self-heal du player figé (`shouldKickPlayback`) — partiel, non arbitré. Règle StoryPlaybackHealth.swift:94-105, appelée en production StoryCanvasUIView+Playback.swift:380-390 → `kickPlayback()` :401-409
- 🟡 Passage en arrière-plan (scenePhase) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:536-545 — sur `.background` : `slideTimer.reset()` + `PlaybackCoordinator.shared.s
- 🟡 Auto-advance en fin de slide (`onCompletion` → `goToNext`) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:863-865 (`t.onCompletion = { goToNext() }`) ; complétion émise StoryReaderTimerCon
- 🟡 Teardown déterministe du display link de progression — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:519 (`slideTimer.invalidate()` en `onDisappear`) → StoryReaderTimerController.swif

## Story iOS — Restitution : ordre des non-vues, interlude auteur, marquage « vue »

- ✅ **Tri du tray : groupes non vus devant (ma story en tête, puis récence)** — apps/ios/MeeshyTests/Unit/ViewModels/StoryViewModelTests.swift:942 (`test_socketStoryCreated_newGroupRespectsUnviewedPriorityOverViewedRecent`) et :89
- 🟡 Entrée sur la première story NON VUE du groupe (tray / avatar / profil) — startAtFirstUnviewed — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:460-463 (`firstIndex(where: { !$0.isViewed })`) ; propagé depuis 12 points d'entré
- 🟡 Entrée par voisinage — groupe SUIVANT à sa première non-vue non-expirée (entryIndex) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:390-395 (`entryIndex(of:)`), appelé au commit de swipe apps/ios/Meeshy/Features/Ma
- ✅ **Aperçu du groupe voisin (face du cube) gaté sur « ce groupe a une story à montrer »** — apps/ios/MeeshyTests/Features/Stories/StoryViewerNeighborEntryTests.swift:50-87 — 3 tests comportementaux (tout expiré → nil, première non-vue non-exp
- 🟡 Entrée par voisinage — groupe PRÉCÉDENT sur sa dernière slide — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:269 (`currentStoryIndex = max(0, groups[currentGroupIndex].stories.count -
- ✅ **Navigation vers un groupe entièrement expiré : le viewer se FERME au lieu de sauter au groupe suivant** — CONFIRMÉ casse. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1009-1032 + :633-644 ; StoryViewerContainer.swift:69 ; StoryViewerView+Content.swift:362-371  [CORRIGÉ 2026-07-26]
- ✅ **Politique d'affichage de l'interlude (StoryGroupIntroPolicy.shouldPresent)** — apps/ios/MeeshyTests/Features/Stories/StoryGroupIntroPolicyTests.swift:11-28 — 3 tests comportementaux sur la fonction pure (mode preview, groupe sans
- 🟡 Interlude auteur affiché 2,6 s, lecture (timer + canvas + audio) gelée pendant sa durée — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:128 (`groupIntroDuration = 2.6`), consommé :1752 (`Task.sleep`) ; gel via `showGro
- ⚪️ ~~Interlude déclenché UNIQUEMENT entre groupes (jamais à l'ouverture depuis le tray)~~ — faux positif de l'audit, statut réel : ok
- 🔴 **`banner` de l'auteur porté par le payload et consommé dans l'interlude** — CONFIRMÉ partiel. packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:5-29 ; apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:504-517 ; services/gateway/src/services/posts/postIncludes.ts:55-64
- ✅ **Marquage « vue » APRÈS l'interlude, jamais pendant (Task 8 du plan)** — CONFIRMÉ absent. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:491-497 + :1793-1803 ; StoryViewerView+Content.swift:503-505, :970-977 ; StoryViewModel.swift:672-707  [CORRIGÉ 2026-07-26]
- ✅ **Mécanique de marquage « vue » d'une slide affichée (local-first + outbox durable)** — apps/ios/MeeshyTests/Unit/ViewModels/StoryViewModelTests.swift:223 (`test_markViewed_updatesLocalStateToViewed`) et :233 (`test_markViewed_enqueuesDur
- ✅ **Entrée depuis une notification : postId → index de lecture exact** — apps/ios/MeeshyTests/Unit/Views/StoryIndexResolverTests.swift:16-54 (5 cas dont index 0 explicite) ; apps/ios/MeeshyTests/Features/Stories/Notificatio
- 🟡 Action initiale de notification exécutée dans le viewer (overlay commentaires / sheet des vues) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:707-725 (`triggerInitialActionIfNeeded`), appelé apps/ios/Meeshy/Features/
- ✅ **Sélection multiple de « Mes stories » filtrée sur les ids vivants (StorySelectionResolver)** — apps/ios/MeeshyTests/Unit/Views/StorySelectionResolverTests.swift:7-30 — 4 cas comportementaux (id disparu en cours de sélection, sélection vide, aucu
- ✅ **Expiration d'une story (StoryItem.isExpired) — socle de l'ordre et des règles d'entrée** — packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryItemExpirationTests.swift:27-80 — 8 tests comportementaux (expiresAt explicite, borne inclusive, r
- 🟡 Rafraîchissement du tray par pull-to-refresh du Feed — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/FeedView.swift:925-929 (`storyViewModel.loadStories(forceNetwork: true)` en parallèle du refresh feed)

## Story iOS — Restitution : rendu, animations d'ouverture/fermeture, transitions

- ✅ **Rendu d'un slide en lecture (StoryRenderer.render en mode .play)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryRenderer_RenderTests.swift:56 (fenêtres temporelles via le nombre de sublayers), :118/:134/:1
- ✅ **Prisme linguistique appliqué aux textes rendus (.play → traduction, sinon original)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/StoryRendererLanguagesTests.swift:9 et :26 — lisent la chaîne réellement posée sur le StoryTextLay
- ⚪️ ~~Effet d'OUVERTURE de slide côté SDK (StoryRenderer.applyOpening)~~ — faux positif de l'audit, statut réel : partiel
- 🟡 Ouverture réellement visible = ré-implémentation SwiftUI app-side, désalignée du SDK (D3) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:424-458 : .zoom part de openingScale 0.88 (le SDK part de 1.08 — sens INVE
- ✅ **Effet de FERMETURE piloté par le playhead (StoryRenderer.applyClosing + resetClosing)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryClosingTests.swift:23-117 (progress, fade/zoom/slide/reveal, restauration hors fenê
- ⚪️ ~~Fermeture appliquée UNE SEULE fois (D2 — double application du closing zoom)~~ — faux positif de l'audit, statut réel : absent
- ⚪️ ~~Fermeture .fade / .slide / .reveal préservée pendant le cross-fade~~ — faux positif de l'audit, statut réel : absent
- ⚪️ ~~Canvas sortant du cross-fade rendu en mode .play (D5)~~ — faux positif de l'audit, statut réel : partiel
- ✅ **Fondu des médias foreground (fadeIn/fadeOut) au playback, non figé par le cache** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryRendererMediaFadeTests.swift:43-105 — dont :63 qui rejoue 3 ticks SUR LE MÊME Story
- ✅ **Fondu des textes/stickers non figé par le cache de layers (texte démarrant à t≈startTime reste visible)** — packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TextStickerAnimationPreviewTests.swift:158-198 (rampe 0,02 → 0,5 → 1,0 sur texte et sticker, ca
- ✅ **Crossfade intra-slide entre clips (clipTransitions, avec dégradation dissolve → crossfade)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/RenderIntegrationTests.swift:57+ (opacité réelle du layer), Timeline/Engine/StoryCanvasR
- ✅ **Interpolation des keyframes (position / échelle / opacité)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryRendererKeyframesTests.swift:7-41 (interpolation + offset startTime), Animation/Ren
- ⚪️ ~~ReaderKeyframeResolver (résolveur de keyframes parallèle)~~ — faux positif de l'audit, statut réel : ok
- ✅ **Cache de layers de rendu (StoryRendererCache) — hits/miss, scoping, purge** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryRendererCache_LanguagesTests.swift (compteur d'invocations du build : miss sur changement de 
- 🟡 Préchargement de la slide suivante (StoryReaderPrefetcher) — partiel, non arbitré. Fenêtre glissante bien alimentée : apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:945 (updateWindow, appelée depuis .onAppear :48
- ✅ **Contexte de rendu partagé Metal / CIContext Display-P3 (StoryRenderingContext)** — aucun test dédié (colorimétrie/GPU non testable en unitaire) ; couvert indirectement par CanvasFilterIntegrationTests et les tests de backdrop
- ✅ **Composite de restitution basse résolution (StorySlideRenderer — cover / ThumbHash)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/StorySlideRendererProportionTests.swift, ...RotationTests.swift, ...FilterTests.swift, ...TextBackgroundT
- 🟡 Parité ouverture/fermeture entre le reader et l'export MP4 — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift:255-256 appelle applyStaticOpening (:411) qui code en dur 0.5 au li
- 🟡 Hygiène de code du domaine (try? nu sans do/catch + log) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift:213 (écriture des images préchargées), :351 (décodage de l'i

## Story iOS — backlog de session : chantiers WS0-WS5 et lots A-F

- 🟡 WS0 — Fade figé par le cache de layers (marqué « fait ») — partiel, non arbitré. Livré : packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift:264-267 (post-passe appelée par tick) + :932 resolvedNonMediaOp
- 🔴 **WS1 — Parité transitions viewer ↔ SDK (marqué « en attente »)** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift:127 ; StoryRenderer.swift:375 et :599-607 ; apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:1072 et :18
- 🟡 WS2 — Interlude + ordre non-vues (marqué « en attente ») — partiel, non arbitré. Seule la brique gateway est livrée : services/gateway/src/services/posts/postIncludes.ts:63 `banner: true` (commit 11faaa15b, testé dans __t
- 🟡 WS3 — Sheet cohérente des inspecteurs timeline (marqué « en attente ») — partiel, non arbitré. Livré (commit b149666b7) : packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineView.swift:360 `.timelineInspecto
- 🟠 **WS4 — Validation TDD + checklist E2E sur Meeshy-iOS26 (marqué « en attente »)** — CONFIRMÉ absent. docs/superpowers/plans/2026-07-25-story-composition-viewer-sync.md:1199 et :1238 ; absence de /Users/smpceo/Documents/v2_meeshy/tasks/story-sync-e2e-checklist-2026-07-25.md ; apps/ios/MeeshyTests/Unit
- ✅ **WS5 — Navigation gestuelle déterministe du viewer (marqué « en attente », en réalité livré)** — StoryGestureNavigationTests.swift:22-160 — zones 30/40/30, largeur dégénérée, tap centre inerte, double tap centre = pause, swipe haut/bas selon isFul
- ✅ **Lot A — Gestes reader (items 5 + 7b, marqué « fait »)** — StoryGestureNavigationTests.swift (mêmes suites que WS5) — comportement, pas existence de symboles.
- ✅ **Lot B — Interlude (items 2 + 3, marqué « fait »)** — StoryGroupIntroPolicyTests.swift:11-33 (comportement de shouldPresent) + gardes de source :55, :112, :125, :165 (commentaires filtrés) ; ReaderLanguag
- 🟡 Lot C — Langue (items 1 + 6 + 4, marqué « en attente », livré à ~90 %) — partiel, non arbitré. Livré et appelé : bouton « Traductions » → feuille de langues, StoryViewerView+Canvas.swift:1719-1741 (LanguagePickerSheet + override prépen
- ✅ **Lot D — Transcription audio dans le menu « … » (item 7a, marqué « en attente », en réalité livré)** — StoryAudioTranscriptTests.swift:28-104 — comportemental (chaîne préférée, normalisation de région, repli, absence de variante ⇒ nil). Réserve : StoryA
- ✅ **Lot E — Sheets d'édition timeline (item 8, marqué « en attente », en réalité livré)** — TimelineInspectorSheetIdentityTests.swift — 6 tests de comportement sur l'identité de la sélection (stabilité sous édition, distinction entre catégori
- ✅ **Lot F — Interlude + jingle Meeshy dans l'export MP4 (marqué « fait »)** — StoryExportBrandedEndToEndTests.swift:127 (intro puis story), :182 (le jingle ne sonne que sur l'intro), :233 (audio de story plus court que sa vidéo)
- 🟡 Langue source des textObjects story mal assignée (marqué « en attente », livré partiellement) — partiel, non arbitré. Livré (commit 3e618faaf) : StoryComposerViewModel+Elements.swift:35-52 resolveComposerSourceLanguage(user:keyboardLanguage:) + :81-86 detect

## Story — Création : export MP4 (intro brandée, watermark, compositeur)

- ✅ **Appel d'export AVFoundation sûr (await session.export(), pas export(to:as:))** — Toute la suite Story/Export/*.swift exerce le chemin réel (StoryExporter_ProgressTests.swift:45, StoryExportBrandedEndToEndTests.swift:59) ; un retour
- ✅ **Rendu des frames réelles du fond vidéo dans le MP4 (fini le « son sur fond noir »)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/StoryExporter_VideoFramePixelTests.swift:59-65 — fixture vidéo ROUGE, sonde le pixel central du MP
- ✅ **Overlays vidéo foreground bakés dans le MP4** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/StoryExporter_VideoFramePixelTests.swift:113-122 — overlay VERT sur fond BLEU : centre g>150 (over
- ✅ **Intro brandée de 2,2 s préfixée au MP4 partagé** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/StoryExportBrandedEndToEndTests.swift:150 (durée = intro + story), :164-175 (indigo de marque au q
- ✅ **Jingle Meeshy audible sur l'interlude et uniquement là** — StoryExportBrandedEndToEndTests.swift:218-225 — RMS mesuré sur le MP4 FINAL : intro>0,01 et story<intro/4 ; MeeshyBrandJingleTests.swift:95-108 vérifi
- ⚪️ ~~Watermark Meeshy dans l'export partagé (share sheet / Enregistrer dans Photos)~~ — faux positif de l'audit, statut réel : ok
- 🟡 Pistes audio des lanes (musique, voix) bakées dans l'export partagé — casse, non arbitré. StoryExporter.composeAudioLanes existe (packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift:419) mais n'est exécutée que si
- 🟡 Fond image d'une story PUBLIÉE peint dans le MP4 — casse, non arbitré. StoryAVCompositor.resolveBackgroundImage (packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift:441-455) n'inspecte que e
- 🟡 Médias foreground d'une story publiée (images distantes) présents dans les frames — partiel, non arbitré. StoryAVCompositor.swift:238-248 appelle StoryRenderer.render SANS resolver: ni imageCache: ; StoryMediaLayer.configureImage (packages/Meeshy
- 🟡 Audio embarqué de la vidéo de fond composé dans l'export — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift:338-404 (piste audio insérée, bouclée si bg.loop, volume via AVAudioMix
- 🟡 Progression d'export 0→1 (10 Hz) remontée à l'UI — partiel, non arbitré. StoryExporter.swift:277-289 (poll 100 ms) + :304 (appel terminal 1.0) ; trampoline @MainActor dans StoryVideoExportService.swift:168-178 ; c
- 🟡 Poursuite de l'export en arrière-plan (beginBackgroundTask) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift:91-96 (begin + defer end) ; la seconde session d'encodage du chemin par
- 🔴 **Annulation d'un export en cours** — CONFIRMÉ partiel. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift:254 et 295 (aucun cancelExport) ; apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift:198-207 et 152-155 ; pac
- 🟡 Échec de l'intro : repli silencieux vers un export non brandé — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Services/StoryVideoExportService.swift:201-204 — catch → logger.warning puis return outputURL (story seule). D
- ✅ **Fidélité compositeur : la frame exportée = le rendu live** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/ExportEquivalenceTests.swift:86 compare la frame t=5 s du MP4 au snapshot CALayer live via SSIM ≥ 
- ✅ **Substrat vidéo synthétique pour les slides statiques (export universel)** — StoryExporterStaticOnlyTests.swift:24/48/100 (fichier produit, frames non vides, frame ≈ rendu live) + :175/205 (cache et taille) ; StoryExporter_Back
- ✅ **Coût mémoire de l'export (pooling backdrop + cache de layers)** — StoryAVCompositor_BackdropLifecycleTests.swift:30 (1 seule instanciation sur 10 acquisitions), :49 (une instance par compositeur), :71 (invalidate ava
- ✅ **Langue gravée dans le MP4 (Prisme Linguistique)** — StoryVideoExportServiceTests.swift:147-160 (threading des langues), StoryExportShareViewModelTests.swift:79 (langue sélectionnée transmise), StoryRend
- ✅ **Partage du fichier exporté (UIActivityViewController) et nettoyage du temporaire** — StoryExportShareViewModelTests.swift:124-148 (cleanup après succès ET après annulation), :159-169 (cancel après .ready), StoryVideoExportServiceTests.
- 🟡 Mode « Enregistrer dans Photos » depuis Mes stories — partiel, non arbitré. apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift:59-74 (adaptiveOnChange sur sharedURL → PhotoLibraryManager.shared.saveVideo

## Story — Création : publication, audience, visibilité (iOS + SDK + gateway)

- ✅ **Bouton « Publier » du composer story (déclencheur de publication)** — apps/ios/MeeshyTests/Unit/ViewModels/StoryViewModelTests.swift:1120-1200 (setsActiveUpload, closesComposer, blocksSecondPublish, multiSlides) — compor
- ✅ **Règle d'activation du bouton Publier (contenu minimal requis)** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+TopBar.swift:136 ; StoryComposerView+Publication.swift:50-77 ; apps/ios/.../StoryViewModel.swift:755 ; services/gateway/src/routes/posts/typ  [CORRIGÉ 2026-07-26]
- 🟡 Sélecteur d'audience du composer story (PUBLIC / COMMUNITY / FRIENDS / EXCEPT / ONLY / PRIVATE) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+TopBar.swift:140-170 (visibilityMenu, monté ligne 65) ; valeur propagée Publicat
- 🟡 Picker d'utilisateurs pour EXCEPT / ONLY (« Sauf… » / « Seulement… ») — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+TopBar.swift:145 (audiencePickerMode) et :165-169 (sheet AudienceUserPickerView)
- ✅ **Sélecteur d'audience de UnifiedPostComposer (repost story → post)** — CONFIRMÉ casse. packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift:340+498-515+546-550 ; apps/ios/.../StoryViewerView.swift:759-766 ; services/gateway/src/services/PostService.ts:1375-1379,1495
- ✅ **Assainissement des effets avant envoi (strip des file:// locaux)** — packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/StoryEffectsSanitizationTests.swift:19-130 — 8 tests comportementaux (file:// nullifié, https/fix
- 🟡 Upload des médias du publish (TUS : fond, images/vidéos foreground, audio) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:1189-1298 (uploadFile pour bg, mediaObjects, audioPlayerObjects, flip mediaURL
- 🟡 Expiration des stories (règle produit « 24 h ») — partiel, non arbitré. services/gateway/src/services/PostService.ts:33 `STORY_EXPIRY_HOURS = 21` (appliqué :112 et :37) ; miroir client packages/MeeshySDK/Sources/
- 🟡 Retour d'erreur de publication (bandeau + toast + Réessayer / Annuler) — partiel, non arbitré. apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:1117-1123 (phase .failed + toast) ; UI appelée apps/ios/Meeshy/Features/Main/V
- ✅ **Publication différée hors-ligne (mise en file + optimistic UI + drain au retour réseau)** — apps/ios/MeeshyTests/Unit/ViewModels/StoryViewModelTests.swift:1460-1533 (item ajouté à la queue, visibility persistée, activeUpload non muté, origina
- ⚪️ ~~Reprise d'un publish online interrompu (write-ahead + marquage in-flight)~~ — faux positif de l'audit, statut réel : ok
- ✅ **Persistance disque des médias de l'intent de publication (write-ahead)** — CONFIRMÉ partiel. apps/ios/.../StoryViewModel.swift:920-922,930-931,938-939 ; packages/MeeshySDK/.../StoryPublishQueue.swift:406-418  [CORRIGÉ 2026-07-26]
- 🟡 Exposition du champ `banner` dans la sélection auteur des stories (Task 1) — partiel, non arbitré. Livré et testé côté gateway : services/gateway/src/services/posts/postIncludes.ts:55-64 (`banner: true`, propagé à trayStorySelect:201 et st
- ✅ **Langue source de la story publiée (`originalLanguage` du payload)** — packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryComposerView_LanguageResolutionTests.swift:40-118 (priorités, utilisateur nil, champs vides
- ⚪️ ~~Langue source des objets de canvas (textes / médias / audios) gravée à la publication~~ — faux positif de l'audit, statut réel : partiel
- 🟡 Suppression du brouillon au moment de la publication — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Publication.swift:68 `clearAllDrafts()` puis :69-71 suspension de l'autosave, AV
- ⚪️ ~~StoryOfflineQueueBootstrap (pont legacy vers la file de publication)~~ — faux positif de l'audit, statut réel : ok

## Story — Création : timeline, clips, keyframes, transitions, durées (iOS / MeeshySDK-MeeshyUI)

- 🟡 Pose d'un keyframe au playhead (bouton « Animer au playhead ») — casse, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift:292 — `onAddKeyframe: { viewModel.addKeyframe
- ✅ **Bouton « déployer les pistes (+N) »** — CONFIRMÉ casse. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineView.swift:533 + :843-850 (allTrackCount ≤ 4 seaux) vs :102-152 (8 groupes, maxCount=3) et :158-199 (1 lane/clip) ; uniq
- ✅ **Toast « la durée a été recalculée automatiquement »** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift:92, :435 (émission) ; 0 lecteur en source (grep dépôt entier) ; StoryTimelineHost.swift:29-47 sans overlay
- 🟡 Pin manuel de la durée de slide (poignée losange + « +10 s ») — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift:138-155 (`setSlideDuration` / `extendSlide
- ✅ **Undo / Redo — restauration de la durée de slide** — CONFIRMÉ casse. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift:452-470 (undo/redo sans recomputeSlideDuration) vs :333, :552 et TimelineViewModel+Plan4Helpers.swift:53, :84, :102
- ✅ **Déplacement TEMPOREL d'un keyframe** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift:340-347 (aucun appelant) vs :357-384 (newTime = snapshot.time) ; LaneKeyframeOverlays.swift:26 ; Keyfr  [CORRIGÉ 2026-07-26]
- ✅ **Steppers ±0,1 s « Début » de l'inspecteur clip** — CONFIRMÉ partiel. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift:261-265 et :284-288 (tolérance 0,16 s + candidat slideStart 0) ; :314-319 (garde no-op) ; ViewModel/TimelineViewMod  [CORRIGÉ 2026-07-26]
- 🟡 Aimantation magnétique aux bords des autres objets — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift:283-307 (`magneticSnapCandidates`) — implémentée et app
- ✅ **Sélection auto du clip actif pendant la lecture** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift:32 (déclaration) vs :302,308,337,370,385 (seuls callbacks émis) ; Engine/StoryTimelineEngine+Providing.swift:18 (con  [CORRIGÉ 2026-07-26]
- ✅ **Inspecteur d'un clip STICKER** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift:87-150 et :237-250 (aucun sticker) ; Views/Container/StoryTimelineView.swift:795-815 (lane sticker tapabl
- 🟡 Dérivation automatique de la durée de slide (« la donnée la plus longue gagne ») — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1039-1078 (`StoryEffects.contentDerivedDuration`) ne prend que `mediaObjects`,
- 🟡 Easing d'un keyframe (courbe d'interpolation) — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift:324 fige `isAdvancedEnabled: false` ⇒ Keyfram
- 🟡 Inspecteur de transition — normalisation dissolve→crossfade à l'ouverture — partiel, non arbitré. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/TransitionInspector.swift:130-135 — `kindPicker.onAppear` appelle `onKind
- ⚪️ ~~Compositor de transitions personnalisées (Metal)~~ — faux positif de l'audit, statut réel : absent
- ⚪️ ~~ReaderKeyframeResolver (code mort avec bug latent)~~ — faux positif de l'audit, statut réel : ok
- 🟠 **Raccourci clavier « K » (poser un keyframe)** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift:138,178 (seuls `.keyboardShortcut` du dépôt) ; chemin de repli fonctionnel ClipInspector.swift:526 → TimelineInspec
- ✅ **Inspecteurs en SHEET avec identité de sélection stable (exigence Task 11)** — TimelineInspectorSheetIdentityTests.swift:32-82 — 6 tests comportementaux : stabilité sous édition de volume/keyframe/durée, distinction inter-catégor
- ✅ **Trim des clips (poignées gauche/droite, y compris clips « permanents »)** — TrimLeftHandleTests.swift:22, TrimRightHandleTests.swift:22/33 (clamp `mediaDurationLimit`), TimelineViewModelPermanentClipTrimTests.swift:27/38 (text
- ✅ **Déplacement de clip + anti-dérive boule-de-neige (vidéo/image/audio/texte/sticker)** — AudioTextDragDriftTests.swift:109/143 (10 frames cumulatives, position finale exacte), :176/206 (`endClipDrag` pousse la commande et purge `activeDrag
- ✅ **Playhead, scrub et précision de seek adaptative** — TimelineViewModel_ScrubTests.swift:30-118 (6 tests : precise false pendant le drag, precise true au relâcher, no-op sans begin, seek final à `currentT
- ✅ **Règle graduée et alignement ticks ↔ pistes ↔ playhead** — TimelineScrubAreaTests.swift:12-42 (largeur de lane, clamp minimum, `playheadLeadingInset == laneLabelWidth + horizontalPadding`), RulerViewTests.swif
- ✅ **Zoom temporel (pinch + boutons transport, 5 %–800 %)** — StoryTimelineViewTests.swift:143/148, TimelineScrubAreaTests.swift:28, PinchZoomTests.swift (2)
- ✅ **Split au playhead (double-tap)** — DoubleTapSplitTests.swift:22 (6 s coupée à 2 s ⇒ 2 s + 4 s), TimelineViewModelTests.swift:105 et :180 (clamp en bout de clip)
- ✅ **Création et suppression de transitions entre clips consécutifs (badge « + » / losange)** — TransitionJunctionResolverTests.swift (7), TimelineViewModelTests.swift:120 (chevauchement), :193 (rejet auto-boucle), :201 (rejet ids inconnus), :269
- ✅ **Undo/redo — pile, coalescing 60 fps, plafond FIFO, persistance par slide** — CommandStackTests.swift (32) + Coalescing (10) + JSONRoundTrip (1) + CommandStack_MoveKeyframeTests (7) + EditCommandIdempotenceTests (12) + TimelineH
- ✅ **Transport (lecture/pause, mute, retour à 0 en fin de lecture) et horloge interne sans piste vidéo** — TimelineViewModel_PlaybackEndTests.swift (3), TimelineViewModelPreviewBridgeTests.swift (4), StoryTimelineEngineInternalClockTests.swift (4), StoryTim
- ✅ **Boucle / répétition visuelle d'un média de fond (règle produit : boucle réservée au fond)** — LoopRepeatOverlayTests.swift (7), ClipInspectorTests.swift (20 dont les cas `supportsLoop`/`visibleSections`)
- ✅ **Interpolation de keyframes à la lecture (position / échelle / opacité, easing par segment)** — KeyframeInterpolatorTests.swift (20), StoryCanvasReaderKeyframeTests.swift (7), TextStickerAnimationPreviewTests.swift (15)
- 🟡 Conventions projet dans le module Timeline (adaptiveOnChange, pas de try? nu, prisme linguistique) — partiel, non arbitré. Aucun `.onChange(of:)` brut (`grep -rn "\.onChange(of:" Sources/MeeshyUI/Story/Timeline` → 0) ; `adaptiveOnChange` utilisé TimelineScrubArea

## Story — Plan d'implémentation 2026-07-25-story-composition-viewer-sync.md : état réel des 12 tâches

- ✅ **Task 1 — Gateway : `banner` dans `storyAuthorSelect`** — services/gateway/src/services/posts/__tests__/postIncludes.test.ts:27-41 — 3 tests : présence de `banner`, sur-ensemble de `authorSelect`, non-régress
- 🟠 **Task 2 — `StoryPlaybackClock`, arbitrage playhead vs wall-clock** — CONFIRMÉ partiel. apps/ios/Meeshy/Features/Main/Views/StoryPlaybackClock.swift:18-48 (aucun appelant) ; StoryViewerView.swift:845-862 (`let raw = CGFloat(min(1.0, p))`, wall-clock brut) ; onPlaybackTime cantonné au SDK
- 🟡 Task 3 — Câbler `onPlaybackTime` : le playhead pilote la barre — absent, non arbitré. Aucun `canvasPlayheadSeconds` dans apps/ios (grep vide) ; aucun `onPlaybackTime:` au call-site `StoryReaderRepresentable(...)` de StoryViewe
- ⚪️ ~~Task 4 — Défaut D9 : armer le timer avec la durée de la bonne slide~~ — faux positif de l'audit, statut réel : ok
- 🔴 **Task 5 — Défaut D5 : le canvas sortant doit rendre en `.play`** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift:127 ; StoryRenderer.swift:374-375 (`guard mode == .play else { return true }`) ; StoryViewerView+Canvas.swift:1059-1088 
- 🔴 **Task 6 — Défauts D2/D3 : closing unique + constantes alignées** — CONFIRMÉ absent. StoryCanvasUIView+Playback.swift:256-282 (applyClosing gardé `mode == .play`) ; StoryCanvasUIView+Core.swift:149-154 (applyOpening seulement sur edit→play) ; StoryCanvasUIView.swift:530-535 (init sans
- 🟠 **Task 7 — Défaut D7 : parsing du dégradé de fond** — CONFIRMÉ absent. apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:1838 (split ",") vs packages/MeeshySDK/Sources/MeeshySDK/Models/StoryBackgroundValue.swift:27 (split ":") ; chemin réel du rendu : pack
- ✅ **Task 8 — Marquage « vue » après l'interlude** — CONFIRMÉ absent. apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:491 puis :497 (marquage AVANT présentation de l'interlude) ; StoryViewerView+Content.swift:504 (groupTransition) et :970-977 (markCurrentViewe  [CORRIGÉ 2026-07-26]
- 🟡 Task 9 — Ordre non-vues verrouillé par tests + `banner` du payload consommé — partiel, non arbitré. Volet ordre : `entryIndex(of:)` vit toujours dans la View (apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:390-395, méthode d'inst
- 🟠 **Task 10 — Primitive `MeeshySheetStyle`** — CONFIRMÉ absent. packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptivePresentationStyle.swift:10 (déclaration, 0 call-site) ; packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHo
- ✅ **Task 11 — Inspecteurs timeline en sheet** — packages/MeeshySDK/Tests/MeeshyUITests/Timeline/TimelineInspectorSheetIdentityTests.swift:32-82 — 6 tests comportementaux réels : identité stable pend
- 🟠 **Task 12 — Validation E2E sur simulateur + déploiement gateway** — CONFIRMÉ absent. docs/superpowers/plans/2026-07-25-story-composition-viewer-sync.md:1197-1250 (Task 12, 0 case cochée dans tout le fichier) ; absence de tasks/story-sync-e2e-checklist-2026-07-25.md ; volet backend liv
