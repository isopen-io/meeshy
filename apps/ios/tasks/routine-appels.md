# File de la routine « Vue d'appel » (iOS)

Source : audit du 2026-11-06 (`frames/07-audit-ui-ux-camera-appels.md` du projet).
Périmètre : `apps/ios/Meeshy/Features/Call/Views/`, `Features/Call/Models/` (règles pures), `Main/Views/VideoFilter*.swift` et leurs tests.
Interdit à la routine : `Features/Call/Services/` (sauf lecture), `CallManager`, `WebRTCService`, `Main/Services/VideoFilterPipeline.swift`, tout `Features/Composer/`.

Statuts : `à faire` · `en cours (#PR)` · `fait (#PR)` · `signalé Opus`.
Taille : P petit, M moyen. Un point G n'entre pas ici : il va dans `routine-gros-bogues.md`.

| Id | Taille | Point | Statut |
|----|--------|-------|--------|
| APP-1 | P | Bannières du haut (`CallView+Connected.swift` : partage d'écran top 60, enregistrement 110, cadre en direct 160) : une seule pile ancrée sous `topChrome` via `CallView.chromeTopInset`, ordre fixe partage → enregistrement → cadre, sans chevauchement du chevron « Réduire ». Règle pure d'ordre testée. | à faire |
| APP-2 | P | `CallView+States.swift` (80, 60, 80) et `IncomingCallView.swift` (60, 40) : commandes du bas posées via `CallView.chromeBottomInset` comme la pilule. | fait (#16518) |
| APP-3 | P | `Task.sleep(nanoseconds:)` de `CallView+Connected.swift` → `Task.sleep(for:)`. | fait (#16518) |
| APP-4 | P | Geste du mode capture : `CallModeCopy.gestureHint` reprend la formulation du viseur ; `call.effects.videoFilters` reçoit `bundle: .main`. Coordonner avec CAM-5. | en cours (#16645) |
| APP-5 | M | Avant la connexion, « Filtres » ouvre le même mode « Effets de ma caméra » (carrousel) que l'appel établi. Ajouter le flou d'arrière-plan au carrousel s'il manque, puis retirer `CallEffectsOverlay` / `VideoFiltersPanel` devenus morts (et la capsule à un seul bouton). Si cela exige de toucher `CallManager`, signaler. | à faire |
| APP-6 | M | Appel vidéo entrant : vignette de ma caméra (locale, rien n'est envoyé avant le décroché) et bouton « Répondre sans vidéo ». Si le décroché caméra coupée exige un changement de signalisation, faire l'interface seule et signaler la suite. | à faire |
