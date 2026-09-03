/// Pipeline d'upload partagé par la publication ET l'édition d'une story :
/// upload TUS des assets (fond, médias, stickers, audio) vers `PostMedia`,
/// création du post (`runStoryUpload`, chemin UI comme chemin queue) et mise
/// à jour d'une story déjà publiée (`runStoryUpdate` / `updateStoryInBackground`).
///
/// Extrait de `StoryViewModel.swift` (#4425) — voir ce fichier pour l'état
/// stocké (`api`, `postService`, `draftStore`, `storyService`, …) et
/// `StoryViewModel+Publication.swift` pour la file/le retry qui pilote ce
/// pipeline (`mutateUpload`, `drainUploadsIfNeeded`, `retryUpload`).

import Foundation
import SwiftUI
import os
import MeeshySDK
import MeeshyUI

extension StoryViewModel {
    // MARK: - Shared Upload Pipeline (UI-driven + queue-driven)

    /// Lightweight handle for a slide that just landed server-side, surfaced
    /// to callers of `runStoryUpload` so the UI path can prepend it to the
    /// story tray and the queue path can ignore it.
    struct PublishedSlide {
        let post: APIPost
        let item: StoryItem
    }

    /// Ce qui reste quand un sticker n'a même pas pu être encodé : sans type
    /// nommé, l'échec se confondrait avec une panne réseau dans le journal.
    private struct StoryStickerImageNotEncodable: Error {}

    /// Téléverse l'image d'un sticker par le chemin commun (TUS → `PostMedia`),
    /// pour le publish comme pour l'édition.
    ///
    /// PNG et non JPEG : un sticker est une image détourée et le JPEG n'a pas
    /// de canal alpha — le réencoder ainsi publierait un rectangle opaque à la
    /// place du découpage. La bibliothèque borne déjà la taille à l'écriture
    /// (`PasteDestination.maxSide`), il n'y a rien à sous-échantillonner ici.
    private func uploadStickerImage(
        _ image: UIImage,
        uploader: TusUploadManager,
        token: String
    ) async throws -> TusUploadResult {
        guard let data = image.pngData() else { throw StoryStickerImageNotEncodable() }
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("sticker_\(UUID().uuidString).png")
        try data.write(to: tempURL)
        defer { try? FileManager.default.removeItem(at: tempURL) }
        let result = try await uploader.uploadFile(
            fileURL: tempURL, mimeType: "image/png",
            credential: .bearer(token), uploadContext: "story", thumbHash: image.toThumbHash()
        )
        // Même réconciliation que les autres images : le lecteur — l'auteur en
        // premier — trouve l'asset en cache au lieu de le retélécharger.
        await CacheCoordinator.shared.images.adoptImage(localFile: tempURL, for: result.fileUrl)
        return result
    }

    /// Headless story upload pipeline shared by:
    ///   1. `launchUploadTask` (composer flow) — wraps progress/phase/published
    ///       callbacks to drive the `activeUploads` surfaces and tray prepend.
    ///   2. `executeQueuedPublish` (queue flow) — passes no-op callbacks since
    ///       there is no banner to update on cold-start replay.
    ///
    /// Stories publish RAW (assets + JSON effects) so the Prisme Linguistique
    /// can retranslate text/audio per viewer. The MP4 export pipeline is a
    /// separate author-only feature (see `StoryExportShareViewModel`) and
    /// must never be wired here — refer to
    /// `docs/superpowers/plans/2026-05-14-story-export-realignment-plan.md`.
    ///
    /// Authentication is checked here (not in callers) because it can change
    /// between an enqueue and a replay; the queue path needs the same gate.
    /// Returns `[String]` of the post ids created in this invocation (excluding
    /// any slides skipped via `upload.publishedPostIds`).
    func runStoryUpload(
        _ upload: StoryUploadState,
        onProgress: @escaping (Double) -> Void,
        onPhase: @escaping (StoryUploadState.UploadPhase) -> Void,
        onPublishedSlide: @escaping (PublishedSlide) -> Void
    ) async throws -> [String] {
        let serverOrigin = MeeshyConfig.shared.serverOrigin
        guard let baseURL = URL(string: serverOrigin),
              let token = api.authToken else {
            throw URLError(.userAuthenticationRequired)
        }
        let uploader = TusUploadManager(baseURL: baseURL)
        let slideCount = upload.slides.count
        let slideShare = 1.0 / Double(max(1, slideCount))
        // On retry, skip slides whose Posts already exist server-side. Without
        // this, a partial-failure retry recreated the early slides and the
        // user ended up with duplicates (e.g., slide 0 published twice).
        let alreadyPublishedCount = upload.publishedPostIds.count
        var newPostIds: [String] = []

        for (slideIdx, slide) in upload.slides.enumerated() {
            guard !Task.isCancelled else { return newPostIds }
            if slideIdx < alreadyPublishedCount {
                // Already committed during a previous attempt.
                onProgress(Double(slideIdx + 1) * slideShare)
                continue
            }
            let baseProgress = Double(slideIdx) * slideShare

            // RAW publish path : background image (if any) + foreground assets
            // (image/video/audio) are uploaded individually. The StoryEffects
            // JSON encodes text, keyframes, transitions, filters and opening.
            // Viewers re-render locally per their preferred language (Prisme
            // Linguistique). MP4 baking is reserved for the author-only export
            // flow (`StoryExportShareViewModel`).

            var uploadResult: TusUploadResult? = nil
            if let bgImage = upload.slideImages[slide.id] {
                let thumbHash = bgImage.toThumbHash()
                let compressed = await MediaCompressor.shared.compressImage(bgImage)
                let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                try compressed.data.write(to: tempURL)
                defer { try? FileManager.default.removeItem(at: tempURL) }
                let result = try await uploader.uploadFile(
                    fileURL: tempURL, mimeType: compressed.mimeType,
                    credential: .bearer(token), uploadContext: "story", thumbHash: thumbHash
                )
                uploadResult = result
                // Pre-populate the image cache under the server URL so that when
                // reconcilePublishedQueueSlide swaps in the real StoryItem the viewer
                // gets a cache hit — no re-download of content the author just uploaded.
                // adoptImage moves tempURL into the cache store; the deferred removeItem
                // silently no-ops since the file is already gone from tempURL.
                await CacheCoordinator.shared.images.adoptImage(localFile: tempURL, for: result.fileUrl)
                onProgress(baseProgress + 0.30 * slideShare)
            } else {
                onProgress(baseProgress + 0.30 * slideShare)
            }

            var updatedEffects = slide.effects
            var foregroundMediaIds: [String] = []
            if var mediaObjects = updatedEffects.mediaObjects {
                let mediaCount = mediaObjects.filter({ $0.postMediaId.isEmpty }).count
                var mediaIdx = 0
                for i in mediaObjects.indices where mediaObjects[i].postMediaId.isEmpty {
                    guard !Task.isCancelled else { return newPostIds }
                    let obj = mediaObjects[i]
                    if obj.kind == .video, let videoURL = upload.loadedVideoURLs[obj.id] {
                        let result = try await uploader.uploadFile(
                            fileURL: videoURL, mimeType: "video/mp4",
                            credential: .bearer(token), uploadContext: "story"
                        )
                        // Seed the video cache under the server URL — metadata-only
                        // reconciliation: viewer gets a cache hit, never re-downloads.
                        await CacheCoordinator.shared.video.seed(copyingLocalFile: videoURL, for: result.fileUrl)
                        mediaObjects[i].postMediaId = result.id
                        mediaObjects[i].mediaURL = result.fileUrl
                        foregroundMediaIds.append(result.id)
                    } else if obj.kind == .image, let uiImage = upload.loadedImages[obj.id] {
                        let fgThumbHash = uiImage.toThumbHash()
                        let compressed = await MediaCompressor.shared.compressImage(uiImage)
                        let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                        try compressed.data.write(to: tempURL)
                        defer { try? FileManager.default.removeItem(at: tempURL) }
                        let result = try await uploader.uploadFile(
                            fileURL: tempURL, mimeType: compressed.mimeType,
                            credential: .bearer(token), uploadContext: "story", thumbHash: fgThumbHash
                        )
                        // Seed the image cache under the server URL — metadata-only
                        // reconciliation: viewer gets a cache hit, never re-downloads.
                        await CacheCoordinator.shared.images.adoptImage(localFile: tempURL, for: result.fileUrl)
                        mediaObjects[i].postMediaId = result.id
                        mediaObjects[i].mediaURL = result.fileUrl
                        foregroundMediaIds.append(result.id)
                    } else {
                        // Symmetric with the audio branch below: a declared
                        // foreground media object with no matching loaded asset
                        // used to be silently skipped — no log, no guard — and
                        // the layer would render as an invisible gap for every
                        // viewer. `postMediaId` stays empty so this object is
                        // simply left out of `mediaIds`/the effects it feeds.
                        os.Logger.storyAudio.error(
                            "publish foreground media asset missing kind=\(obj.mediaType, privacy: .public) id=\(obj.id, privacy: .public) slide=\(slide.id, privacy: .public) — layer will be invisible to viewers (postMediaId stays empty)"
                        )
                    }
                    mediaIdx += 1
                    let mediaProgress = Double(mediaIdx) / Double(max(1, mediaCount))
                    onProgress(baseProgress + (0.30 + mediaProgress * 0.50) * slideShare)
                }
                updatedEffects.mediaObjects = mediaObjects
            }

            // L'image d'un sticker importé est INTÉGRÉE au post : elle part par
            // le chemin commun, comme tout autre média, et le sticker reçoit son
            // `postMediaId`. Aucune URL tierce n'entre dans le document publié.
            if let stickers = updatedEffects.stickerObjects {
                var uploadedStickers: [String: String] = [:]
                let pendingStickerIds = StoryStickerUpload.pendingUploadIds(
                    stickers: stickers, availableBitmapIds: Set(upload.loadedImages.keys)
                )
                for stickerId in pendingStickerIds {
                    guard !Task.isCancelled else { return newPostIds }
                    guard let image = upload.loadedImages[stickerId] else { continue }
                    do {
                        let result = try await uploadStickerImage(image, uploader: uploader, token: token)
                        uploadedStickers[stickerId] = result.id
                        foregroundMediaIds.append(result.id)
                    } catch {
                        // L'erreur s'arrête ICI : propager ferait échouer la
                        // slide entière pour une image d'appoint. Le sticker
                        // reste, rendu par son emoji de repli.
                        Logger.stories.error(
                            "publish sticker image upload failed stickerId=\(stickerId, privacy: .public) slide=\(slide.id, privacy: .public) reason=\(error.localizedDescription, privacy: .public) — sticker kept, falls back to its emoji"
                        )
                    }
                }
                updatedEffects.stickerObjects = StoryStickerUpload.applying(
                    uploads: uploadedStickers, to: stickers
                )
            }

            if var audioObjects = updatedEffects.audioPlayerObjects {
                os.Logger.storyAudio.info(
                    "publish slide=\(slide.id, privacy: .public) preUpload audioCount=\(audioObjects.count) loadedAudioKeys=\(upload.loadedAudioURLs.keys.joined(separator: ","), privacy: .public)"
                )
                for i in audioObjects.indices where audioObjects[i].postMediaId.isEmpty {
                    guard !Task.isCancelled else { return newPostIds }
                    let obj = audioObjects[i]
                    guard let audioURL = upload.loadedAudioURLs[obj.id] ?? upload.loadedVideoURLs[obj.id] else {
                        // Son EMPRUNTÉ à la bibliothèque : aucun fichier local à
                        // uploader, c'est ATTENDU — le clip reste servi par son
                        // `mediaURL` serveur (repli du reader), `postMediaId`
                        // vide par contrat. Ne pas crier au média perdu.
                        if obj.soundId != nil, obj.mediaURL?.isEmpty == false {
                            os.Logger.storyAudio.info(
                                "publish audio borrowed from library audioId=\(obj.id, privacy: .public) soundId=\(obj.soundId ?? "", privacy: .public) — served by mediaURL, nothing to upload"
                            )
                        } else {
                            os.Logger.storyAudio.error(
                                "publish audio URL missing audioId=\(obj.id, privacy: .public) — clip will be uploaded but unplayable (postMediaId stays empty)"
                            )
                        }
                        continue
                    }
                    let result = try await uploader.uploadFile(
                        fileURL: audioURL, mimeType: "audio/mp4",
                        credential: .bearer(token), uploadContext: "story"
                    )
                    // Seed the audio cache under the server URL — metadata-only
                    // reconciliation: viewer gets a cache hit, never re-downloads.
                    await CacheCoordinator.shared.audio.seed(copyingLocalFile: audioURL, for: result.fileUrl)
                    audioObjects[i].postMediaId = result.id
                    foregroundMediaIds.append(result.id)
                    os.Logger.storyAudio.info(
                        "publish audio uploaded audioId=\(obj.id, privacy: .public) postMediaId=\(result.id, privacy: .public)"
                    )
                }
                updatedEffects.audioPlayerObjects = audioObjects
            } else {
                os.Logger.storyAudio.info(
                    "publish slide=\(slide.id, privacy: .public) audioPlayerObjects is nil — no audio attached to this slide"
                )
            }

            onPhase(.publishing)
            var allMediaIds: [String] = []
            if let id = uploadResult?.id { allMediaIds.append(id) }
            allMediaIds.append(contentsOf: foregroundMediaIds)

            let postAudioCount = updatedEffects.audioPlayerObjects?.count ?? 0
            let postAudioIds = (updatedEffects.audioPlayerObjects ?? [])
                .map { "\($0.id)→postMediaId=\($0.postMediaId.isEmpty ? "EMPTY" : $0.postMediaId)" }
                .joined(separator: " ")
            os.Logger.storyAudio.info(
                "publish createStory slide=\(slide.id, privacy: .public) audioInPayload=\(postAudioCount) details=[\(postAudioIds, privacy: .public)]"
            )

            // **CETTE slide, et pas le composer** (#4068). Une slide EST une
            // publication en profil Story : elle n'emporte que les mentions qui
            // lui sont attachées. La liste plate reste le repli — formats à
            // publication unique, et rows de file écrites avant ce lot.
            let declaredForSlide = upload.mentionsBySlide[slide.id] ?? upload.declaredMentions
            let canvasMentions = Self.declaredMentions(
                declared: declaredForSlide, effects: updatedEffects
            )

            // Le texte alternatif est collecté sous les ids d'élément du
            // composer ; le gateway ne retient que des ids de `mediaIds`
            // (`PostService.applyMediaAlt` filtre le reste sans rien dire).
            // L'upload vient d'attribuer les `postMediaId` : c'est ici, et
            // nulle part plus tôt, que la traduction est possible.
            let serverMediaAlt = StoryMediaTextMapping.serverKeyed(
                composerKeyed: upload.composerMediaTexts.alt,
                mediaObjects: updatedEffects.mediaObjects ?? []
            )
            // La LÉGENDE suit EXACTEMENT le même chemin (#4055) : mêmes ids de
            // composer, même traduction, et le même filtrage silencieux côté
            // gateway si on envoyait les ids d'origine.
            let serverMediaCaption = StoryMediaTextMapping.serverKeyed(
                composerKeyed: upload.composerMediaTexts.caption,
                mediaObjects: updatedEffects.mediaObjects ?? []
            )

            // V3-3 — le TYPE suit le format choisi dans le composer. Le canevas
            // part avec lui : `create(content:type:…)` ne porte aucun
            // `storyEffects`, et y router un post composé perdrait chaque objet
            // texte, autocollant et dessin sans la moindre erreur.
            let post = try await postService.createCanvasPost(
                type: upload.targetType,
                content: slide.content,
                storyEffects: updatedEffects,
                visibility: upload.visibility,
                visibilityUserIds: upload.visibilityUserIds,
                originalLanguage: upload.originalLanguage,
                mediaIds: allMediaIds.isEmpty ? nil : allMediaIds,
                repostOfId: upload.repostOfId,
                mentions: canvasMentions.isEmpty ? nil : canvasMentions,
                allowSoundExtraction: upload.allowSoundExtraction,
                mediaAlt: serverMediaAlt.isEmpty ? nil : serverMediaAlt,
                mediaCaption: serverMediaCaption.isEmpty ? nil : serverMediaCaption
            )

            newPostIds.append(post.id)

            // Local-first cover (hybrid Phase 1): render the FULL composite of this
            // slide — text + drawing + media + stickers + filter, including a video
            // background's poster frame (it.26) — and cache it under the published
            // story id. The tray prefers it so the author instantly sees their fully
            // composed story, instead of the server thumbnail (raw bg, no overlays).
            if let cover = StoryStaticSnapshot.render(
                slide: slide,
                loadedImages: upload.loadedImages,
                bgImage: upload.slideImages[slide.id],
                size: StoryCoverThumbnail.renderSize
            ), let jpeg = cover.jpegData(compressionQuality: 0.85) {
                await CacheCoordinator.shared.thumbnails.store(
                    jpeg, for: StoryCoverThumbnail.cacheKey(storyId: post.id)
                )
            }

            let media = buildFeedMedia(from: post, fallback: uploadResult)
            let newItem = StoryItem(
                id: post.id, content: post.content, media: media,
                storyEffects: updatedEffects, createdAt: post.createdAt, isViewed: true
            )
            onPublishedSlide(PublishedSlide(post: post, item: newItem))
            onProgress(Double(slideIdx + 1) * slideShare)
            onPhase(.uploading)
        }

        return newPostIds
    }

    // MARK: - Background Update (édition d'une story publiée, 2026-07-29)

    /// Contexte d'édition capturé depuis `StoryComposerViewModel` au moment du
    /// publish — valeurs COPIÉES, le VM du composer n'est jamais retenu.
    struct StoryEditContext {
        let postId: String
        let originalMediaIds: [String]
        let originalBackgroundMediaId: String?
        let hydratedBackgroundImage: UIImage?
    }

    /// Route le publish d'un composer en mode édition vers `PUT /posts/:id`.
    /// Le serveur remet vues/réactions à zéro (contenu édité) et conserve la
    /// date de publication ; `story:updated` + le delta-sync propagent le
    /// « redevenu non-vu » aux autres clients.
    ///
    /// V1 en ligne uniquement : contrairement au publish, l'édition ne passe
    /// pas par la file offline — retourne `false` (composer laissé ouvert)
    /// quand le réseau manque, pour ne rien perdre.
    @discardableResult
    func updateStoryInBackground(
        edit: StoryEditContext,
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL] = [:],
        originalLanguage: String? = nil,
        visibility: String = StoryVisibilityPreferenceStore.fallback,
        visibilityUserIds: [String] = [],
        draftId: String? = nil,
        /// Les personnes que l'auteur a nommées SANS les écrire, telles que le
        /// composer les porte à cet instant.
        references: [ComposerReference] = [],
        /// Le composer a-t-il pu HYDRATER l'ensemble déclaré de la story ?
        ///
        /// `false` = il n'en sait rien, et sa liste (vide) ne peut donc rien
        /// prouver : l'édition n'en parle pas, le serveur préserve. Envoyer
        /// `[]` depuis un ignorant révoquerait des références que l'auteur n'a
        /// jamais vues — et leur retirerait l'accès au contenu.
        declaredReferencesAreKnown: Bool = false,
        /// Même contrat qu'à la création : keyé par id d'élément du composer,
        /// traduit en ids serveur juste avant le PUT. Le gateway ne l'applique
        /// qu'aux médias ATTACHÉS par cette édition (`mediaIdsToAttach`), donc
        /// un texte saisi sur un média déjà en ligne n'a pas d'effet ici.
        composerMediaTexts: ComposerMediaTexts = .none,
        allowSoundExtraction: Bool? = nil
    ) -> Bool {
        guard let slide = slides.first else { return false }
        if NetworkMonitor.shared.isOffline {
            FeedbackToastManager.shared.showError(String(
                localized: "story.edit.offline",
                defaultValue: "Connexion requise pour modifier la story"))
            return false
        }
        Task { [weak self] in
            await self?.runStoryUpdate(
                edit: edit, slide: slide, slideImages: slideImages,
                loadedImages: loadedImages, loadedVideoURLs: loadedVideoURLs,
                loadedAudioURLs: loadedAudioURLs, originalLanguage: originalLanguage,
                visibility: visibility, visibilityUserIds: visibilityUserIds,
                draftId: draftId,
                references: references,
                declaredReferencesAreKnown: declaredReferencesAreKnown,
                composerMediaTexts: composerMediaTexts,
                allowSoundExtraction: allowSoundExtraction
            )
        }
        return true
    }

    /// Pipeline d'update : n'uploade QUE les assets nouveaux (`postMediaId`
    /// vide — même règle que `runStoryUpload`), garde les médias serveur
    /// encore référencés, retire les orphelins via `removeMediaIds`, puis
    /// `PUT /posts/:id` avec le blob d'effects complet.
    private func runStoryUpdate(
        edit: StoryEditContext,
        slide: StorySlide,
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL],
        originalLanguage: String?,
        visibility: String,
        visibilityUserIds: [String],
        draftId: String? = nil,
        references: [ComposerReference] = [],
        declaredReferencesAreKnown: Bool = false,
        composerMediaTexts: ComposerMediaTexts = .none,
        allowSoundExtraction: Bool? = nil
    ) async {
        do {
            let serverOrigin = MeeshyConfig.shared.serverOrigin
            guard let baseURL = URL(string: serverOrigin), let token = api.authToken else {
                throw URLError(.userAuthenticationRequired)
            }
            let uploader = TusUploadManager(baseURL: baseURL)
            var updatedEffects = slide.effects
            var newMediaIds: [String] = []
            var keptOriginalIds = Set<String>()

            // 1. Fond de slide. Identité d'instance : le MÊME UIImage que
            // celui posé par l'hydratation = fond inchangé → l'original reste
            // attaché, aucun ré-upload. Une autre instance = fond remplacé.
            if let bgImage = slideImages[slide.id] {
                if let hydrated = edit.hydratedBackgroundImage, hydrated === bgImage,
                   let originalBg = edit.originalBackgroundMediaId {
                    keptOriginalIds.insert(originalBg)
                } else {
                    let thumbHash = bgImage.toThumbHash()
                    let compressed = await MediaCompressor.shared.compressImage(bgImage)
                    let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                    try compressed.data.write(to: tempURL)
                    defer { try? FileManager.default.removeItem(at: tempURL) }
                    let result = try await uploader.uploadFile(
                        fileURL: tempURL, mimeType: compressed.mimeType,
                        credential: .bearer(token), uploadContext: "story", thumbHash: thumbHash
                    )
                    await CacheCoordinator.shared.images.adoptImage(localFile: tempURL, for: result.fileUrl)
                    newMediaIds.append(result.id)
                }
            } else if slide.mediaURL != nil, let originalBg = edit.originalBackgroundMediaId {
                // Fond distant sans bitmap local (vidéo de fond) toujours
                // référencé par la slide → conservé tel quel.
                keptOriginalIds.insert(originalBg)
            }

            // 2. Médias de premier plan — même règle que le publish : seuls
            // les objets sans `postMediaId` sont uploadés, les autres restent
            // pointés sur leurs assets serveur (et sont donc conservés).
            if var mediaObjects = updatedEffects.mediaObjects {
                for i in mediaObjects.indices {
                    let obj = mediaObjects[i]
                    if !obj.postMediaId.isEmpty {
                        keptOriginalIds.insert(obj.postMediaId)
                        continue
                    }
                    if obj.kind == .video, let videoURL = loadedVideoURLs[obj.id] {
                        let result = try await uploader.uploadFile(
                            fileURL: videoURL, mimeType: "video/mp4",
                            credential: .bearer(token), uploadContext: "story"
                        )
                        await CacheCoordinator.shared.video.seed(copyingLocalFile: videoURL, for: result.fileUrl)
                        mediaObjects[i].postMediaId = result.id
                        mediaObjects[i].mediaURL = result.fileUrl
                        newMediaIds.append(result.id)
                    } else if obj.kind == .image, let uiImage = loadedImages[obj.id] {
                        let fgThumbHash = uiImage.toThumbHash()
                        let compressed = await MediaCompressor.shared.compressImage(uiImage)
                        let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                        try compressed.data.write(to: tempURL)
                        defer { try? FileManager.default.removeItem(at: tempURL) }
                        let result = try await uploader.uploadFile(
                            fileURL: tempURL, mimeType: compressed.mimeType,
                            credential: .bearer(token), uploadContext: "story", thumbHash: fgThumbHash
                        )
                        await CacheCoordinator.shared.images.adoptImage(localFile: tempURL, for: result.fileUrl)
                        mediaObjects[i].postMediaId = result.id
                        mediaObjects[i].mediaURL = result.fileUrl
                        newMediaIds.append(result.id)
                    } else {
                        os.Logger.storyAudio.error(
                            "update foreground media asset missing kind=\(obj.mediaType, privacy: .public) id=\(obj.id, privacy: .public) — layer will be invisible to viewers"
                        )
                    }
                }
                updatedEffects.mediaObjects = mediaObjects
            }

            // 3. Clips audio — même contrat.
            if var audioObjects = updatedEffects.audioPlayerObjects {
                for i in audioObjects.indices {
                    let obj = audioObjects[i]
                    if !obj.postMediaId.isEmpty {
                        keptOriginalIds.insert(obj.postMediaId)
                        continue
                    }
                    guard let audioURL = loadedAudioURLs[obj.id] ?? loadedVideoURLs[obj.id] else {
                        os.Logger.storyAudio.error(
                            "update audio URL missing audioId=\(obj.id, privacy: .public) — clip unplayable (postMediaId stays empty)"
                        )
                        continue
                    }
                    let result = try await uploader.uploadFile(
                        fileURL: audioURL, mimeType: "audio/mp4",
                        credential: .bearer(token), uploadContext: "story"
                    )
                    await CacheCoordinator.shared.audio.seed(copyingLocalFile: audioURL, for: result.fileUrl)
                    audioObjects[i].postMediaId = result.id
                    newMediaIds.append(result.id)
                }
                updatedEffects.audioPlayerObjects = audioObjects
            }

            // 4. Stickers — même contrat que les médias : les images déjà
            // téléversées sont CONSERVÉES (sans quoi l'étape 5 supprimerait
            // côté serveur l'image de chaque sticker que la story continue
            // d'afficher), les nouvelles partent par le chemin commun.
            if let stickers = updatedEffects.stickerObjects {
                keptOriginalIds.formUnion(StoryStickerUpload.attachedPostMediaIds(stickers: stickers))
                var uploadedStickers: [String: String] = [:]
                let pendingStickerIds = StoryStickerUpload.pendingUploadIds(
                    stickers: stickers, availableBitmapIds: Set(loadedImages.keys)
                )
                for stickerId in pendingStickerIds {
                    guard let image = loadedImages[stickerId] else { continue }
                    do {
                        let result = try await uploadStickerImage(image, uploader: uploader, token: token)
                        uploadedStickers[stickerId] = result.id
                        newMediaIds.append(result.id)
                    } catch {
                        // L'erreur s'arrête ICI : le sticker reste, rendu par
                        // son emoji de repli, plutôt que de faire échouer une
                        // édition entière pour une image d'appoint.
                        Logger.stories.error(
                            "update sticker image upload failed stickerId=\(stickerId, privacy: .public) reason=\(error.localizedDescription, privacy: .public) — sticker kept, falls back to its emoji"
                        )
                    }
                }
                updatedEffects.stickerObjects = StoryStickerUpload.applying(
                    uploads: uploadedStickers, to: stickers
                )
            }

            // 5. Les originaux plus référencés par la composition éditée.
            let removeMediaIds = edit.originalMediaIds.filter { !keptOriginalIds.contains($0) }

            // 6. PUT — le gateway pose `contentEditedAt`, remet l'engagement à
            // zéro et broadcast `story:updated` avec `engagementReset: true`.
            //
            // TRI-ÉTAT des références : `nil` tant que le composer n'a pas pu
            // hydrater l'ensemble déclaré (le serveur préserve alors) ; sinon
            // la liste COMPLÈTE remplace, `[]` compris — c'est ce `[]` qui
            // révoque, et donc qui referme le contenu à qui n'y est plus nommé.
            let declaredMentions: [PostMentionInput]? = declaredReferencesAreKnown
                ? Self.declaredMentions(references: references, effects: updatedEffects)
                : nil
            let serverMediaAlt = StoryMediaTextMapping.serverKeyed(
                composerKeyed: composerMediaTexts.alt,
                mediaObjects: updatedEffects.mediaObjects ?? []
            )
            let serverMediaCaption = StoryMediaTextMapping.serverKeyed(
                composerKeyed: composerMediaTexts.caption,
                mediaObjects: updatedEffects.mediaObjects ?? []
            )
            let post = try await postService.update(
                postId: edit.postId,
                content: slide.content,
                visibility: visibility,
                visibilityUserIds: visibilityUserIds,
                moodEmoji: nil,
                originalLanguage: originalLanguage,
                type: nil,
                removeMediaIds: removeMediaIds.isEmpty ? nil : removeMediaIds,
                storyEffects: updatedEffects,
                mediaIds: newMediaIds.isEmpty ? nil : newMediaIds,
                location: nil,
                mentions: declaredMentions,
                allowSoundExtraction: allowSoundExtraction,
                mediaAlt: serverMediaAlt.isEmpty ? nil : serverMediaAlt,
                mediaCaption: serverMediaCaption.isEmpty ? nil : serverMediaCaption
            )

            // 7. Réconciliation locale : cover local-first re-rendue (la
            // composition a changé) + remplacement de l'item dans le groupe.
            var editedSlide = slide
            editedSlide.effects = updatedEffects
            if let cover = StoryStaticSnapshot.render(
                slide: editedSlide,
                loadedImages: loadedImages,
                bgImage: slideImages[slide.id],
                size: StoryCoverThumbnail.renderSize
            ), let jpeg = cover.jpegData(compressionQuality: 0.85) {
                await CacheCoordinator.shared.thumbnails.store(
                    jpeg, for: StoryCoverThumbnail.cacheKey(storyId: post.id)
                )
            }
            let groups = [post].toStoryGroups(currentUserId: AuthManager.shared.currentUser?.id)
            if var item = groups.first?.stories.first {
                item.isViewed = true
                item.viewedAt = Date()
                insertOrAppendStoryItem(item, forAuthor: post.author)
            }
            storyService.cache(post: post)
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(String(
                localized: "story.edit.success", defaultValue: "Story mise à jour", bundle: .main))
            // Directive 2026-08-02 : succès serveur CONFIRMÉ — le brouillon
            // d'édition (gelé par `freezeCurrentDraftForPublish` au hand-off)
            // n'a plus de raison d'être : la story qu'il modifiait est à jour.
            if let draftId {
                draftStore.delete(draftId: draftId)
            }
        } catch {
            Logger.messages.error("[StoryVM] Story update failed: \(error.localizedDescription)")
            FeedbackToastManager.shared.showError(String(
                localized: "story.edit.error", defaultValue: "Échec de la mise à jour de la story", bundle: .main))
            // Échec PERMANENT (l'édition ne passe pas par la file de retry) :
            // le brouillon revient éditable, avec son erreur affichable —
            // sinon il resterait gelé à vie, invisible des reprises.
            if let draftId {
                draftStore.recordPublishFailure(draftId: draftId, message: error.localizedDescription)
            }
        }
    }

    /// Hydrates the in-memory dictionaries that `runStoryUpload` consumes
    /// from a flat `[StoryMediaReference]` list. The queue stores absolute
    /// disk paths because the in-memory `UIImage` / `URL` graph is not
    /// `Codable`; this helper does the inverse mapping at replay time.
    ///
    /// Convention : a reference whose `elementId` starts with `"slide-bg-"`
    /// is a slide background image (keyed by the trailing `slide.id`);
    /// any other id is treated as a canvas effect (image / video / audio)
    /// keyed by `elementId` directly. Missing or undecodable files raise
    /// `StoryPublishUnrecoverableError` so the queue drops the item rather
    /// than looping forever.
    struct LoadedMedia {
        let slideImages: [String: UIImage]
        let loadedImages: [String: UIImage]
        let loadedVideoURLs: [String: URL]
        let loadedAudioURLs: [String: URL]
    }

    func loadMediaFromReferences(_ refs: [StoryMediaReference]) throws -> LoadedMedia {
        var slideImages: [String: UIImage] = [:]
        var loadedImages: [String: UIImage] = [:]
        var loadedVideoURLs: [String: URL] = [:]
        var loadedAudioURLs: [String: URL] = [:]

        let slideBgPrefix = "slide-bg-"

        for ref in refs {
            guard FileManager.default.fileExists(atPath: ref.localFilePath) else {
                throw StoryPublishUnrecoverableError(
                    "Missing local media at \(ref.localFilePath)"
                )
            }
            let url = URL(fileURLWithPath: ref.localFilePath)
            let isSlideBackground = ref.elementId.hasPrefix(slideBgPrefix)

            switch ref.mediaType {
            case "image":
                guard let image = UIImage(contentsOfFile: ref.localFilePath) else {
                    throw StoryPublishUnrecoverableError(
                        "Could not decode image at \(ref.localFilePath)"
                    )
                }
                if isSlideBackground {
                    let slideId = String(ref.elementId.dropFirst(slideBgPrefix.count))
                    slideImages[slideId] = image
                } else {
                    loadedImages[ref.elementId] = image
                }
            case "video":
                loadedVideoURLs[ref.elementId] = url
            case "audio":
                loadedAudioURLs[ref.elementId] = url
            default:
                throw StoryPublishUnrecoverableError(
                    "Unknown mediaType '\(ref.mediaType)' for elementId \(ref.elementId)"
                )
            }
        }

        return LoadedMedia(
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs,
            loadedAudioURLs: loadedAudioURLs
        )
    }

    func retryUpload(id: String) {
        guard let upload = activeUploads.first(where: { $0.id == id }),
              case .failed(let previousError) = upload.phase else { return }
        // `.preparing` et NON `.queued` : la re-revendication ci-dessous
        // traverse un saut d'acteur, et pendant ce vol une ligne `.queued` est
        // SÉLECTIONNABLE par `drainUploadsIfNeeded()` — qu'un autre upload qui
        // se termine (ou qu'on annule) déclenche. Elle partirait NUE, en
        // parallèle du drain de fond qui détient peut-être encore l'item :
        // exactement la double publication que la phase ferme au premier tap.
        mutateUpload(id: id) {
            $0.progress = 0
            $0.phase = .preparing
        }
        // Le VM détient DÉJÀ la revendication (cas nominal du retry après un
        // commit partiel : elle lui est conservée parce que lui seul sait où
        // reprendre). Re-revendiquer refuserait sa propre claim et figerait la
        // ligne — plus aucune affordance ne l'atteindrait. Rien n'est en vol
        // ici : `.queued` puis drain se suivent sur le même tour de MainActor.
        guard !upload.ownsQueueClaim, let queueId = upload.queueId else {
            mutateUpload(id: id) { $0.phase = .queued }
            drainUploadsIfNeeded()
            return
        }
        Task { [weak self] in
            guard let self else { return }
            // Re-revendication ATOMIQUE : si le drain de fond a repris l'item
            // entre-temps, publier en parallèle dupliquerait la story. On rend
            // la ligne à son état ROUGE — `.queued` la sortirait de l'overlay
            // (gestes gatés sur `.failed`) et de la reprise à la reconnexion.
            guard await StoryPublishQueue.shared.markInFlight(queueId) else {
                self.mutateUpload(id: id) { $0.phase = .failed(previousError) }
                return
            }
            self.mutateUpload(id: id) {
                $0.ownsQueueClaim = true
                $0.phase = .queued
            }
            self.drainUploadsIfNeeded()
        }
    }

    func cancelUpload(id: String) {
        guard let upload = activeUploads.first(where: { $0.id == id }) else { return }
        cleanupUploadTempFiles(upload)
        // Annulation EXPLICITE d'une publication en attente : dégèle le
        // brouillon (retire `pendingPublishAt`) sans lui fabriquer d'erreur —
        // il n'y a pas eu d'échec, l'utilisateur a juste changé d'avis. Il
        // redevient visible/éditable dans les reprises.
        if let draftId = upload.draftId {
            draftStore.clearPendingPublish(draftId: draftId)
        }
        // Delete any slides that were committed before the user cancelled —
        // otherwise a 5-slide story cancelled at slide 3 leaves slides 1-2
        // visible to friends as orphan stories that don't fit any slideshow.
        // Fire-and-forget on a detached task; don't block the cancel UX.
        let orphans = upload.publishedPostIds
        if !orphans.isEmpty {
            Task.detached { [storyService = self.storyService] in
                for postId in orphans {
                    try? await storyService.delete(storyId: postId)
                }
            }
        }
        // E5 — annulation EXPLICITE : l'intent write-ahead part avec (sinon la
        // story annulée ressusciterait au prochain boot via le drain de queue).
        if let queueId = upload.queueId {
            let tempId = upload.queueTempStoryId
            Task.detached {
                await StoryPublishQueue.shared.dequeue(queueId)
                if let tempId { Self.removeOfflineQueueMediaDirectory(tempStoryId: tempId) }
            }
        }
        if currentUploadId == id {
            uploadTask?.cancel()
            uploadTask = nil
            currentUploadId = nil
        }
        activeUploads.removeAll { $0.id == id }
        // Annuler la story en vol enchaîne la suivante.
        drainUploadsIfNeeded()
    }

    /// Cleanup temp video/audio files after upload completes.
    func cleanupUploadTempFiles(_ upload: StoryUploadState) {
        for (_, url) in upload.loadedVideoURLs {
            try? FileManager.default.removeItem(at: url)
        }
        for (_, url) in upload.loadedAudioURLs {
            try? FileManager.default.removeItem(at: url)
        }
    }
}
