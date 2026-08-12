# Plan: Appliquer watermark lors de la sauvegarde de médias

Résumé
- Objectif: Lors de l'enregistrement d'un média (depuis story/post/viewer), appliquer le watermark utilisé pour l'export de story aux vidéos, ajouter pour les images le logo + pseudo auteur (sans animation), et pour les fichiers audio ajouter un jingle/sound short lors de l'enregistrement.

Sources et références existantes
- Plan détaillé original: docs/superpowers/plans/2026-07-26-story-row-save-ring-and-visibility-menu.md (section StoryPhotoSaveService). Contient mentions de `MeeshyExportWatermark.make(username:)` et du protocole `StoryVideoExportServiceProviding`.
- Export vidéo: packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryVideoExportService.swift
- Compositeur AV: packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift
- PhotoLibrary / sauvegarde: packages/MeeshySDK/Sources/MeeshySDK/Cache/PhotoLibraryManager.swift et apps/ios/Meeshy/Features/Main/Services/MediaSaveCoordinator.swift

Proposition d'implémentation (haute-niveau)
1. Réutiliser `StoryVideoExportServiceProviding.prepareExport(..., watermark: StoryExportWatermark?, intro: ...)` pour les vidéos. Le chemin `save` doit appeler le même export path que le partage.
2. Pour images: implémenter `ImageWatermarkComposer` qui compose un overlay statique (logo + pseudo) sur l'image pleine résolution sans animation, puis écrit dans PhotoLibrary (adapter PhotoLibraryManager).
3. Pour audio: produire un petit fichier audio (jingle) concaténé ou joué lors de l'enregistrement. Option A = inclure jingle en tête du fichier audio exporté; Option B = ajouter un fichier sidecar et documenter UX. Préférer A si UX attendu.
4. Ajouter tests unitaires: `StoryPhotoSaveServiceTests`, `ImageWatermarkComposerTests`, et intégration minimal pour `saveVideo`→Photos confirme watermark présent.
5. UX: demander permission PHPhotoLibrary si nécessaire, feedback toast `Enregistrement terminé` et gestion d'erreurs.

Tâches concrètes
- [ ] Vérifier `docs/superpowers/plans/2026-07-26-story-row-save-ring-and-visibility-menu.md` et extraire les helpers/protocoles nécessaires
- [ ] Implémenter `StoryPhotoSaveService` (singleton) et tests
- [ ] Implémenter `ImageWatermarkComposer` et tests
- [ ] Réutiliser `StoryVideoExportService` pour `saveVideo` avec watermark param
- [ ] Ajouter hooks dans `MediaSaveCoordinator` / Action menus (`requestSaveMedia()`)
- [ ] Tests E2E: sauvegarde vidéo -> vérifier watermark (pixel/audio RMS)

Branch & suivi
- Branche de travail proposée: `feat/media-watermark-plan` (fichier plan ajouté ici)

Notes
- Le plan plus complet existe déjà dans le document référencé; ce fichier est un résumé actionnable pour reprise rapide par un dev iOS.
Étendue supplémentaire — posts / reels / post detail / feeds

- Contexte: la fonctionnalité doit couvrir non seulement la sauvegarde depuis l'UI "Mes stories" mais aussi les chemins "Enregistrer" depuis les cartes de feed, les vues détail de post, les readers de reels et les players (ReelFeedCard, ReelsPlayerView, FeedPostCard, PostDetailView).
- Points d'intégration principaux:
	- `MediaSaveCoordinator` / `requestSaveMedia()` — point central à câbler pour déclencher la logique de watermark avant d'appeler `PhotoLibraryManager`.
	- `ReelFeedCard`, `ReelsPlayerView`, `FeedPostCard`, `PostDetailView` — appeler `requestSaveMedia()` et fournir le `StoryExportWatermark` / `ImageWatermarkComposer` selon le média.
	- `MeeshyExportWatermark.make(username:)` doit rester la source de vérité du rendu watermark pour les vidéos.
	- Pour images, utiliser `ImageWatermarkComposer.compose(image:logo:username:) -> UIImage` (statique, sans animation) avant la sauvegarde.
	- Pour audio attaché aux posts/reels, choisir la concaténation d'un jingle court en tête du fichier audio avant écriture dans Documents/Files ou la librairie appropriée.

- Tests d'intégration à ajouter:
	- Sauvegarde depuis `ReelFeedCard` d'une vidéo: exporter via `StoryVideoExportServiceProviding.prepareExport(..., watermark:)` puis `PhotoLibraryManager.saveVideo(at:)` et vérifier watermark présent dans le MP4 (pixel/audio RMS ou métadatas).
	- Sauvegarde d'une image depuis `FeedPostCard`: vérifier que l'image sauvegardée contient le logo + pseudo (pixel sample ou comparaison hash).
	- Sauvegarde audio: vérifier durée/présence du jingle en tête.

Branch & suivi
- Mettre à jour la même branche `feat/media-watermark-plan` avec ce complément et ouvrir une PR dédiée.


