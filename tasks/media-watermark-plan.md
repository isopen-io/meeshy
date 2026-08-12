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
- [x] Vérifier `docs/superpowers/plans/2026-07-26-story-row-save-ring-and-visibility-menu.md` et extraire les helpers/protocoles nécessaires
- [x] Implémenter `StoryPhotoSaveService` (singleton) et tests — **déjà livré** avant ce chantier (`apps/ios/.../Services/StoryPhotoSaveService.swift`, `StoryPhotoSaveServiceTests`) : il bake déjà via `prepareExport(..., watermark: MeeshyExportWatermark.make(username:))`
- [x] Implémenter `ImageWatermarkComposer` et tests → livré sous le nom **`MeeshyImageWatermark`** (`MeeshyUI/Media/Branding/`), aligné sur la nomenclature des atomes de marque du SDK (`MeeshyExportWatermark`, `MeeshyBrandJingle`)
- [~] Réutiliser `StoryVideoExportService` pour `saveVideo` avec watermark param — **impossible tel quel** : `prepareExport` prend une `StorySlide` et rend des frames Meeshy ; une pièce jointe / un réel n'est pas une story. Livré à la place `MeeshyVideoWatermarkBaker`, qui grave **le même** `StoryExportWatermark` dans une vidéo quelconque
- [x] Ajouter hooks dans `MediaSaveCoordinator` / Action menus (`requestSaveMedia()`) — un SEUL hook dans `pick()` couvre les 7 surfaces (voir « Couverture » ci-dessous)
- [~] Tests E2E: sauvegarde vidéo -> vérifier watermark (pixel/audio RMS) — non livré : voir « Reste à faire »

## État de livraison — 2026-08-12

### Architecture

| Couche | Composant | Rôle |
|---|---|---|
| SDK (`MeeshyUI/Media/Branding/`) | `MeeshyImageWatermark` | Filigrane FIXE sur une image (frame figée du filigrane animé, `stillTime = 3,75 s`) |
| SDK | `MeeshyVideoWatermarkBaker` | Grave le filigrane ANIMÉ dans une vidéo quelconque (tuile par frame + `AVAssetExportSession`) |
| SDK | `MeeshyAudioSignature` | Pose `MeeshyBrandJingle` en tête (défaut) ou en queue d'un audio |
| SDK | `StoryExportWatermark.blockRect/alpha/isBottomRight` | Mise en page extraite de `draw` — SSOT partagée story / image / vidéo |
| APP | `MediaSaveBranding` (+ `MeeshyMediaSaveBranding`) | LA règle : quelles familles sont marquées, résolution du pseudo, repli sur l'original |
| APP | `MediaSaveCoordinator.pick` | Le hook unique : résous → marque → écris |
| APP | `MediaSaveFlowHost` | Pastille « Préparation… » pendant le ré-encodage |

### Couverture (vérifiée par grep)
Les 7 points d'entrée « Enregistrer » passent tous par `MediaSaveCoordinator.requestSave` — donc tous marqués par le hook unique :
`ConversationView` (menu appui-long, menu natif, sous-menu média), `AudioFullscreenView`, `ConversationMediaGalleryView`, `FeedPostCard`, `ReelFeedCard`, `ReelsPlayerView`, `PostDetailView`.
Le bouton « Enregistrer » du viewer image plein écran du SDK (`ImageFullscreen`, chemin legacy hors coordinateur) marque désormais lui aussi, via le même atome.

### Invariants
1. **Marquer n'empêche JAMAIS un enregistrement** — GIF animé, vidéo > 10 min, vidéo dont l'orientation n'est pas redressée, fichier illisible : chaque cas retombe sur le fichier d'origine.
2. **La source n'est jamais modifiée** — c'est le fichier du cache disque ; la marque produit toujours une COPIE, nettoyée après écriture (garde de préfixe `meeshy-branded-`).
3. **Le nom d'export suit le format réel** — un HEIC marqué ressort en JPEG, un MP3 en M4A.

### Décisions à confirmer
- **Jingle en tête** (`Placement.leading`, motif ASCENDANT de `MeeshyBrandJingle`), conformément à ce plan. Réserve : il repousse le contenu de ~2,6 s à CHAQUE lecture. `.trailing` (cadence descendante, comme la carte de fin d'un export) est implémenté et testé — bascule d'une ligne si le produit préfère.
- **Vidéos > 10 min non marquées** (`MeeshyVideoWatermarkBaker.maximumDuration`) : le bake est un ré-encodage complet, linéaire en frames.

### Reste à faire
- Gate iOS non exécuté ici : cet environnement est Linux, sans toolchain Swift. `./apps/ios/meeshy.sh test` doit tourner sur macOS avant merge.
- Tests d'intégration E2E du plan (pixel dans le MP4 produit, RMS audio du jingle) : les tests livrés couvrent la géométrie, les timings, la règle de marquage et le câblage du coordinateur, PAS le contenu d'un fichier réellement encodé.
- `MeeshyVideoWatermarkBaker` s'appuie sur `AVMutableVideoComposition(asset:applyingCIFiltersWithHandler:)` pour redresser la source ; la garde d'orientation renonce au marquage si le gabarit ne correspond pas. À valider sur device avec une vidéo portrait filmée à l'iPhone.

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


