# File de la routine « Caméra et capture » (iOS)

Source : audit du 2026-11-06 (`frames/07-audit-ui-ux-camera-appels.md` du projet).
Périmètre : `apps/ios/Meeshy/Features/Composer/ComposerCapture*`, `ComposerSceneCamera*`, `ComposerLook*`, `ComposerCamera*` et leurs tests.
Interdit à la routine : `Main/Components/CameraModel.swift`, `CameraInputInstaller.swift`, `Main/Services/VideoFilterPipeline.swift`, tout `Features/Call/`.

Statuts : `à faire` · `en cours (#PR)` · `fait (#PR)` · `signalé Opus`.
Taille : P petit, M moyen. Un point G n'entre pas ici : il va dans `routine-gros-bogues.md`.

| Id | Taille | Point | Statut |
|----|--------|-------|--------|
| CAM-1 | P | Remplacer les `Task.sleep(nanoseconds:)` de `ComposerCaptureSession.swift` (×2), `ComposerCaptureBottomRow.swift`, `ComposerSceneSurface.swift`, `ComposerLookStrip.swift` par `Task.sleep(for:)` ou `cancellableSleep`. | fait (#16626) |
| CAM-2 | P | Réglage « Grille » (désactivé par défaut) : grille des tiers fine dans le viseur, jamais dans la prise. Règle pure + test. | signalé Opus |
| CAM-3 | M | Compensation d'exposition après le toucher de mise au point : petit soleil près du carré, glissé vertical → biais borné, remis à zéro au toucher suivant ou au changement d'objectif. Règle pure (glissé → biais) testée ; l'appel AVFoundation passe par une méthode mince existante ou se signale. | signalé Opus |
| CAM-4 | M | Retardateur 3 s / 10 s sans ajouter de huitième contrôle à la rangée haute (`ComposerCaptureTopRow`) ; compte à rebours lisible et annoncé à VoiceOver. | signalé Opus |
| CAM-5 | P | Libellé du geste : une seule formulation partagée avec l'appel (garder celle de `ComposerSceneCameraCopy`). Coordonner avec APP-4 : celui qui passe en premier crée la clé commune. Côté caméra : la clé commune est `composer.camera.hint.photo` (existante, `ComposerSceneCameraCopy.swift:34`) ; il ne reste que l'appel (APP-4, `Features/Call/`, hors périmètre). | fait (rien à changer côté caméra) |
