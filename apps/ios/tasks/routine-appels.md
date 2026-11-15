# File de la routine « Vue d'appel » (iOS)

Source : audit du 2026-11-06 (`frames/07-audit-ui-ux-camera-appels.md` du projet).
Périmètre : `apps/ios/Meeshy/Features/Call/Views/`, `Features/Call/Models/` (règles pures), `Main/Views/VideoFilter*.swift` et leurs tests.
Interdit à la routine : `Features/Call/Services/` (sauf lecture), `CallManager`, `WebRTCService`, `Main/Services/VideoFilterPipeline.swift`, tout `Features/Composer/`.

**Cible (2026-11-07) : [`docs/product/appels-vue-finale.md`](../../../docs/product/appels-vue-finale.md)** (#16633). Chaque point de cette file se termine conforme à ses vues (P1–P18 portrait, L1–L5 paysage, A1–A2 après l'appel). La couleur d'une personne vient UNIQUEMENT de `CallSpeakerColor` / `DynamicColorGenerator.colorForName(userId)` (loi 4), y compris pour ma vignette et le journal.

**Pris ailleurs, ne pas toucher sans se coordonner :** `Features/Call/Views/CallTranscriptSection.swift` (journal d'après l'appel, couleur par auteur, #16634) est repris par la session « appels de bout en bout », branche `claude/calls-end-to-end-cvakev`. Tirer `dev` après sa fusion.

Statuts : `à faire` · `en cours (#PR)` · `fait (#PR)` · `signalé Opus`.
Taille : P petit, M moyen. Un point G n'entre pas ici : il va dans `routine-gros-bogues.md`.

| Id | Taille | Point | Statut |
|----|--------|-------|--------|
| APP-1 | P | Bannières du haut (`CallView+Connected.swift` : partage d'écran top 60, enregistrement 110, cadre en direct 160) : une seule pile ancrée sous `topChrome` via `CallView.chromeTopInset`, ordre fixe partage → enregistrement → cadre, sans chevauchement du chevron « Réduire ». Règle pure d'ordre testée. | fait (#16629) |
| APP-2 | P | `CallView+States.swift` (80, 60, 80) et `IncomingCallView.swift` (60, 40) : commandes du bas posées via `CallView.chromeBottomInset` comme la pilule. | fait (#16518) |
| APP-3 | P | `Task.sleep(nanoseconds:)` de `CallView+Connected.swift` → `Task.sleep(for:)`. | fait (#16518) |
| APP-4 | P | Geste du mode capture : `CallModeCopy.gestureHint` reprend la formulation du viseur ; `call.effects.videoFilters` reçoit `bundle: .main`. Coordonner avec CAM-5 : reprendre la clé existante `composer.camera.hint.photo` (« toucher deux fois pour une photo · maintenir pour filmer »). | fait (#16645) |
| APP-5 | M | Avant la connexion, « Filtres » ouvre le même mode « Effets de ma caméra » (carrousel) que l'appel établi. Ajouter le flou d'arrière-plan au carrousel s'il manque, puis retirer `CallEffectsOverlay` / `VideoFiltersPanel` devenus morts (et la capsule à un seul bouton). Si cela exige de toucher `CallManager`, signaler. | fait (#16668 : « Filtres » ouvre le mode « Effets de ma caméra » dès la sonnerie sortante, `CallPreConnectEffectsRule` ; `CallEffectsOverlay`, `VideoFiltersPanel`, `VideoFilterControlView` et leur capsule retirés sans appelant restant, catalogue compris. Le flou du fond vit dans les réglages du mode, comme la vue P8b ; garde `test_effectsMode_beforeAndAfterTheConnection_offersTheBackgroundBlur` (#16668 ; garde de non-régression, le comportement était déjà livré), revérifié le 2026-11-08) |
| APP-6 | M | Appel vidéo entrant : vignette de ma caméra (locale, rien n'est envoyé avant le décroché) et bouton « Répondre sans vidéo ». Si le décroché caméra coupée exige un changement de signalisation, faire l'interface seule et signaler la suite. | fait (#16667 : vignette locale et « Sans vidéo », décroché caméra coupée par `CallAnswerWithoutVideo` ; #16945 : hiérarchie P17 — puce de verre « Appel vidéo entrant » au-dessus du nom, puis « Activer le son », disque de l'appelant effacé quand sa vidéo joue, ma vignette à mi-hauteur à droite sous le son, à MA couleur avec la plaque de la tuile de groupe ; barre « X vous verra en décrochant » dont le bouton Caméra ne s'allume que si la caméra filme vraiment ; rangée Refuser · Sans vidéo (verre neutre, téléphone blanc) · Répondre (glyphe selon la route), légendes blanches. L'écran AUDIO entrant garde sa disposition livrée (`IncomingCallLayout.audio`). Reste à vérifier au simulateur : la CI seule compile ici) |
