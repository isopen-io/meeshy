/// Cycle de vie de publication d'une story : file durable (write-ahead),
/// exécution différée depuis la queue (`executeQueuedPublish`, protocole
/// `StoryPublishExecutor` — conformance déclarée sur `StoryViewModel`),
/// auto-retry à la reconnexion, réconciliation `pending_<uuid>` → id serveur
/// et reprise d'un échec de publication.
///
/// Extrait de `StoryViewModel.swift` (#4425) — voir ce fichier pour l'état
/// stocké (`activeUploads`, `currentUploadId`, `uploadTask`, `draftStore`,
/// `visibilityStore`, …) et `StoryViewModel+PublicationUpload.swift` pour le
/// pipeline d'upload/édition partagé que ce cycle de vie pilote.

import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

extension StoryViewModel {
    // MARK: - StoryPublishExecutor conformance (Pilier 22 V3)

    /// Reconstructs an upload from a queue item and runs it to completion.
    /// Called by `StoryPublishService` when the queue dequeues an item
    /// (offline → online transition, app cold start with pending items, ...).
    ///
    /// Decodes the queued payload, materializes the local media files, and
    /// drives the shared `runStoryUpload` pipeline to completion. Headless:
    /// no UI mutations on `activeUploads` so the queue path can run from
    /// cold start without ghost banners. Returns the server-assigned post
    /// id of the LAST published slide (the one the queue uses to reconcile
    /// the optimistic `pending_<uuid>` row).
    ///
    /// Error contract :
    /// - `StoryPublishUnrecoverableError` for terminal failures (corrupt
    ///   payload, missing/corrupt media, empty slides, server 4xx) so the
    ///   queue drops the item instead of looping.
    /// - any other `Error` (network, 5xx, TUS resume failure) → retryable.
    func executeQueuedPublish(item: StoryPublishQueueItem) async throws -> String {
        Logger.media.info(
            "executeQueuedPublish start tempId=\(item.tempStoryId, privacy: .public)"
        )

        let slides: [StorySlide]
        do {
            let decoder = MeeshyCoders.decoder(.persistence)
            slides = try decoder.decode([StorySlide].self, from: item.slidesPayload)
        } catch {
            throw StoryPublishUnrecoverableError("Invalid slidesPayload: \(error.localizedDescription)")
        }
        guard !slides.isEmpty else {
            throw StoryPublishUnrecoverableError("Empty slides")
        }

        let media = try loadMediaFromReferences(item.mediaReferences)

        let user = AuthManager.shared.currentUser
        let upload = StoryUploadState(
            id: item.tempStoryId,
            thumbnailImage: media.slideImages.values.first?
                .preparingThumbnail(of: CGSize(width: 100, height: 178)) ?? UIImage(),
            // **Le lien d'origine voyage jusqu'au rejeu** (#8522) : persisté
            // dans l'item, il n'était jamais relu — une republication rejouée
            // partait orpheline.
            repostOfId: item.repostOfId,
            phase: .uploading,
            authorId: user?.id ?? "",
            authorName: user?.displayName ?? user?.username ?? "",
            authorAvatar: user?.avatar,
            slides: slides,
            slideImages: media.slideImages,
            loadedImages: media.loadedImages,
            loadedVideoURLs: media.loadedVideoURLs,
            loadedAudioURLs: media.loadedAudioURLs,
            loadedStickerAnimations: media.loadedStickerAnimations,
            originalLanguage: item.originalLanguage,
            visibility: item.visibility,
            visibilityUserIds: item.visibilityUserIds ?? [],
            declaredMentions: item.mentionsPayload ?? [],
            // Row d'avant #4068 : la carte est absente, l'envoi retombe sur la
            // liste plate — l'ancien comportement pour ces rows-là seulement.
            mentionsBySlide: item.mentionsBySlidePayload ?? [:],
            composerMediaTexts: ComposerMediaTexts(alt: item.mediaAltPayload ?? [:],
                                                   caption: item.mediaCaptionPayload ?? [:]),
            allowSoundExtraction: item.allowSoundExtractionPayload,
            // Une valeur inconnue (row écrite par une version future) retombe
            // sur la story plutôt que d'échouer : le rejeu publie, au pire sous
            // le format historique.
            targetType: item.targetTypePayload.flatMap(PostType.init(rawValue:)) ?? .story,
            alsoAsReel: item.alsoAsReelPayload ?? false
        )

        let ids: [String]
        do {
            ids = try await runStoryUpload(
                upload,
                onProgress: { _ in },
                onPhase: { _ in },
                // Réconcilie le tray : retire le placeholder optimiste hors-ligne et
                // insère la vraie story serveur dès qu'une slide est publiée.
                onPublishedSlide: { [weak self] published in
                    self?.reconcilePublishedQueueSlide(tempStoryId: item.tempStoryId, published: published)
                }
            )
        } catch {
            // Un refus définitif (#7907) ne se rejoue pas : la file le classe
            // en échec au lieu de brûler son budget de réessai.
            guard StoryPublishRetryPolicy.isPermanent(error) else { throw error }
            throw StoryPublishUnrecoverableError(error.localizedDescription)
        }

        cleanupUploadTempFiles(upload)

        // Best-effort cleanup of the persisted draft media now that the
        // server holds the canonical posts.
        for ref in item.mediaReferences {
            try? FileManager.default.removeItem(atPath: ref.localFilePath)
        }
        
        // Also remove the containing directory if it was an offline queue folder
        if let firstPath = item.mediaReferences.first?.localFilePath {
            let dirPath = (firstPath as NSString).deletingLastPathComponent
            if dirPath.hasSuffix(item.tempStoryId) {
                try? FileManager.default.removeItem(atPath: dirPath)
            }
        }

        guard let last = ids.last else {
            throw StoryPublishUnrecoverableError("Upload returned no post ids")
        }
        Logger.media.info(
            "executeQueuedPublish done tempId=\(item.tempStoryId, privacy: .public) → \(last, privacy: .public)"
        )
        return last
    }

    // MARK: - Auto-retry on reconnect (SOTA audit Pilier 22, scope A)

    /// When the message socket reconnects after a drop, automatically retry
    /// any active upload that failed mid-flight. Manual retry via the upload
    /// banner remains available; this just removes the friction of having
    /// to tap retry yourself when the network comes back.
    ///
    /// Note: this only handles uploads still in `activeUploads` (process is
    /// alive). Cross-restart resume is the StoryPublishQueue scope (V2).
    func observeReconnectionForRetry() {
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                Task { @MainActor in
                    // Wait a bit so the connection stabilizes and any in-flight
                    // request has a chance to complete first.
                    _ = await cancellableSleep(for: .seconds(2))
                    // TOUTES les entrées en échec repartent — la file les
                    // sérialise (une seule monte à la fois) et la revendication
                    // atomique empêche toute course avec le drain de queue.
                    let failedIds = self.activeUploads.compactMap { upload -> String? in
                        if case .failed = upload.phase { return upload.id }
                        return nil
                    }
                    for id in failedIds { self.retryUpload(id: id) }
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Background Publishing

    func publishStoryInBackground(
        /// Le format que l'auteur a choisi dans l'éventail du composer. C'est
        /// lui qui décide du `type` envoyé à `POST /posts` — sans quoi choisir
        /// « Post » publierait une story, un choix qui a l'air de marcher.
        targetType: PostType = .story,
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL] = [:],
        /// Les octets animés des stickers collés (#3956) — `[:]` quand la
        /// publication n'en porte aucun, ce qui est le cas nominal.
        loadedStickerAnimations: [String: Data] = [:],
        originalLanguage: String? = nil,
        visibility: String = StoryVisibilityPreferenceStore.fallback,
        visibilityUserIds: [String] = [],
        draftId: String? = nil,
        /// Renseigné par la REPUBLICATION d'une story d'autrui : le composeur de
        /// repost (`StoryComposerViewModel.init(reposting:authorHandle:)`) porte
        /// la chaîne d'IDs, et c'est ce champ qui la fait descendre jusqu'à
        /// `createStory`. Il valait `nil` en dur depuis l'écriture de ce
        /// composeur — la « Phase C » annoncée par sa docstring n'avait jamais
        /// été faite, si bien qu'une republication naissait sans lien vers son
        /// original (donc sans attribution ni crédit de vues).
        repostOfId: String? = nil,
        /// Les personnes que l'auteur a choisi de nommer, avec leur mode. Seuls
        /// les modes que le TEXTE ne peut pas porter partent au serveur : les
        /// INLINE, il les relit lui-même du contenu.
        references: [ComposerReference] = [],
        /// Le texte alternatif par média, keyé par ID D'ÉLÉMENT DU COMPOSER :
        /// les ids serveur n'existent qu'après l'upload. `runStoryUpload`
        /// traduit juste avant l'envoi.
        composerMediaTexts: ComposerMediaTexts = .none,
        /// L'opt-in d'extraction de bande-son du post entier. `nil` = l'auteur
        /// n'a rien tranché.
        allowSoundExtraction: Bool? = nil,
        /// « Publier AUSSI en réel » (#9476) : la story part avec son réel, en un
        /// geste. Ignoré hors d'une story — `runStoryUpload` ne l'envoie qu'avec elle.
        alsoAsReel: Bool = false
    ) {
        let declaredMentions = ComposerReferences.payload(references)
        // **Ce que CHAQUE publication emporte** (#4068). En profil Story une
        // slide EST une publication, donc la carte est indexée par son id ; la
        // liste plate ci-dessus reste servie aux formats à publication unique
        // (Post, Réel) et aux rows de file écrites avant ce lot.
        let mentionsBySlide = Dictionary(uniqueKeysWithValues: slides.map { slide in
            (slide.id, ComposerReferences.payload(references, for: slide.id))
        })

        // C6 — l'écriture a lieu au hand-off de CRÉATION uniquement (jamais
        // depuis `updateStoryInBackground` : changer l'audience d'une story
        // existante n'est pas « mon dernier choix pour une nouvelle story »).
        visibilityStore.remember(visibility)

        // Offline-first: route through StoryPublishQueue instead of TUS so
        // the publish survives a cold start and reconnect. The queue handler
        // (registered via StoryPublishService.setExecutor in RootView)
        // replays via executeQueuedPublish on reconnect, reusing the same
        // runStoryUpload pipeline as the online path.
        if NetworkMonitor.shared.isOffline {
            Task { [weak self] in
                await self?.enqueueStoryForOfflinePublish(
                    targetType: targetType,
                    slides: slides,
                    slideImages: slideImages,
                    loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs,
                    loadedAudioURLs: loadedAudioURLs,
                    loadedStickerAnimations: loadedStickerAnimations,
                    repostOfId: repostOfId,
                    originalLanguage: originalLanguage,
                    visibility: visibility,
                    visibilityUserIds: visibilityUserIds,
                    draftId: draftId,
                    declaredMentions: declaredMentions,
                    mentionsBySlide: mentionsBySlide,
                    composerMediaTexts: composerMediaTexts,
                    allowSoundExtraction: allowSoundExtraction,
                    alsoAsReel: alsoAsReel
                )
            }
            showStoryComposer = false
            return
        }

        let user = AuthManager.shared.currentUser
        let thumbnail = slideImages.values.first?.preparingThumbnail(of: CGSize(width: 100, height: 178))
            ?? UIImage()

        let upload = StoryUploadState(
            id: UUID().uuidString,
            thumbnailImage: thumbnail,
            draftId: draftId,
            repostOfId: repostOfId,
            phase: .preparing,
            authorId: user?.id ?? "",
            authorName: user?.displayName ?? user?.username ?? "",
            authorAvatar: user?.avatar,
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs,
            loadedAudioURLs: loadedAudioURLs,
            loadedStickerAnimations: loadedStickerAnimations,
            originalLanguage: originalLanguage,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds,
            declaredMentions: declaredMentions,
            mentionsBySlide: mentionsBySlide,
            composerMediaTexts: composerMediaTexts,
            allowSoundExtraction: allowSoundExtraction,
            targetType: targetType,
            alsoAsReel: alsoAsReel
        )
        let uploadId = upload.id
        activeUploads.append(upload)
        showStoryComposer = false

        // E5 — write-ahead : la MÊME persistance que le chemin offline court
        // AVANT l'upload, revendiquée pour que le drain (reconnect) ne
        // double-publie pas pendant que l'upload UI tourne. Un kill efface le
        // marqueur volatile → le drain de boot reprend l'item : une story en
        // cours de publication ne peut plus se perdre.
        //
        // ORDRE STRICT, non négociable : persist → revendication →
        // enrichissement thumbHash → payload persisté mis à niveau → l'entrée
        // devient `.queued` → drain. L'entrée reste `.preparing` — donc
        // structurellement non drainable — tant que ces quatre étapes ne sont
        // pas passées : un drain déclenché entre-temps par une 2e publication,
        // une annulation ou un événement de queue partirait sinon avec les
        // slides BRUTES, sans revendication et sans `queueId`.
        Task { [weak self] in
            guard let self else { return }
            let intent = await self.persistPublishIntentToQueue(
                targetType: targetType,
                slides: slides,
                slideImages: slideImages,
                loadedImages: loadedImages,
                loadedVideoURLs: loadedVideoURLs,
                loadedAudioURLs: loadedAudioURLs,
                loadedStickerAnimations: loadedStickerAnimations,
                originalLanguage: originalLanguage,
                visibility: visibility,
                visibilityUserIds: visibilityUserIds,
                draftId: draftId,
                repostOfId: repostOfId,
                declaredMentions: declaredMentions,
                composerMediaTexts: composerMediaTexts,
                allowSoundExtraction: allowSoundExtraction,
                alsoAsReel: alsoAsReel
            )
            // L'item vient d'être créé : personne d'autre ne peut le détenir,
            // la revendication est donc acquise d'office ici. On enregistre
            // malgré tout QUI la détient : le retry après commit partiel en
            // dépend (re-revendiquer sa propre claim serait refusé).
            var ownsClaim = false
            if let intent {
                ownsClaim = await StoryPublishQueue.shared.markInFlight(intent.queueId)
            }
            let enriched = await self.enrichSlidesWithThumbHashes(
                queueId: intent?.queueId,
                slides: slides,
                slideImages: slideImages,
                loadedImages: loadedImages,
                loadedVideoURLs: loadedVideoURLs
            )
            self.mutateUpload(id: uploadId) {
                $0.slides = enriched
                $0.queueId = intent?.queueId
                $0.queueTempStoryId = intent?.tempStoryId
                $0.ownsQueueClaim = ownsClaim
                $0.phase = .queued
            }
            self.drainUploadsIfNeeded()
        }
    }

    /// Décision produit : les thumbHashes ne bloquent JAMAIS le retour au feed
    /// (C3). Ils sont calculés après le hand-off, écrits dans l'intent persisté
    /// et dans l'état d'upload en mémoire, puis seulement le TUS démarre.
    ///
    /// Un kill entre le write-ahead et cette mise à niveau laisse en queue une
    /// story SANS thumbHash — publiée correctement au drain de boot, seul le
    /// placeholder flou du lecteur manque. Durabilité > cosmétique.
    private func enrichSlidesWithThumbHashes(
        queueId: String?,
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL]
    ) async -> [StorySlide] {
        let enriched = await StoryThumbHashEnricher.enrich(
            slides: slides,
            bgImages: slideImages,
            loadedImages: loadedImages,
            videoURLs: loadedVideoURLs
        )
        guard let queueId else { return enriched }
        let encoder = MeeshyCoders.encoder(.persistence)
        // La mise à niveau du payload PERSISTÉ est best-effort : son échec ne
        // dit rien des thumbHashes en mémoire, qui restent parfaitement
        // valides. Retourner les slides brutes priverait la story de son
        // placeholder flou pour une raison qui ne la concerne pas.
        guard let payload = try? encoder.encode(enriched) else { return enriched }
        await StoryPublishQueue.shared.updateSlidesPayload(queueId, payload)
        return enriched
    }

    /// Accès indexé sûr à une entrée de la file (no-op si l'id a disparu
    /// entre-temps : succès, annulation, reprise par le drain de fond). TOUS
    /// les callbacks de progression/phase passent par là.
    func mutateUpload(id: String, _ body: (inout StoryUploadState) -> Void) {
        guard let idx = activeUploads.firstIndex(where: { $0.id == id }) else { return }
        body(&activeUploads[idx])
    }

    func reportUploadProgress(_ fraction: Double, for id: String) {
        guard activeUploads.contains(where: { $0.id == id }) else { return }
        uploadProgress.report(fraction, for: id)
    }

    /// Démarre l'upload suivant si aucun ne monte. Les uploads se déroulent un
    /// à la fois, dans l'ordre de publication : le TUS d'une story multi-slides
    /// sature déjà la bande passante, les paralléliser ne ferait que les
    /// ralentir tous. Les entrées `.preparing` et `.failed` sont sautées.
    func drainUploadsIfNeeded() {
        guard currentUploadId == nil else { return }
        guard let next = activeUploads.first(where: { $0.phase == .queued }) else { return }
        currentUploadId = next.id
        mutateUpload(id: next.id) { $0.phase = .uploading }
        launchUploadTask(for: next.id)
    }

    /// Persists the in-memory composer state to disk and enqueues the
    /// publish into `StoryPublishQueue` so it can be replayed when network
    /// returns or on the next cold start. Called by `publishStoryInBackground`
    /// when `NetworkMonitor.shared.isOffline` is true.
    ///
    /// The slide background images are re-keyed to the
    /// `"slide-bg-{slide.id}"` convention expected by `loadMediaFromReferences`
    /// so the executor (commit d3a57947) reconstructs them correctly on
    /// replay. Foreground media (effect images / videos / audio) keep their
    /// `elementId` as-is.
    ///
    /// `internal` access (not `private`) so unit tests can exercise the
    /// enqueue branch without having to mutate `NetworkMonitor.shared`
    /// (whose `isOffline` setter is `private(set)`).
    func enqueueStoryForOfflinePublish(
        targetType: PostType = .story,
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL] = [:],
        loadedStickerAnimations: [String: Data] = [:],
        /// Republication hors ligne (#8522) : sans lui, le rejeu publiait une
        /// publication orpheline de son original.
        repostOfId: String? = nil,
        originalLanguage: String? = nil,
        visibility: String = StoryVisibilityPreferenceStore.fallback,
        visibilityUserIds: [String] = [],
        draftId: String? = nil,
        declaredMentions: [PostMentionInput] = [],
        /// Les mentions PAR SLIDE (#4068) — vide ⇒ repli sur `declaredMentions`.
        mentionsBySlide: [String: [PostMentionInput]] = [:],
        composerMediaTexts: ComposerMediaTexts = .none,
        allowSoundExtraction: Bool? = nil,
        alsoAsReel: Bool = false
    ) async {
        guard let intent = await persistPublishIntentToQueue(
            targetType: targetType,
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs,
            loadedAudioURLs: loadedAudioURLs,
            loadedStickerAnimations: loadedStickerAnimations,
            originalLanguage: originalLanguage,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds,
            draftId: draftId,
            repostOfId: repostOfId,
            declaredMentions: declaredMentions,
            mentionsBySlide: mentionsBySlide,
            composerMediaTexts: composerMediaTexts,
            allowSoundExtraction: allowSoundExtraction,
            alsoAsReel: alsoAsReel,
            onUnsavedMedia: { [weak self] outcome in
                self?.keepCompositionWithUnsavedMedia(
                    outcome, slides: slides, slideImages: slideImages, loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs, loadedAudioURLs: loadedAudioURLs,
                    visibility: visibility, visibilityUserIds: visibilityUserIds,
                    originalLanguage: originalLanguage, draftId: draftId)
            }
        ) else { return }

        insertOptimisticOfflineStories(
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            tempStoryId: intent.tempStoryId,
            visibility: visibility
        )

        HapticFeedback.success()
        FeedbackToastManager.shared.showSuccess(StoryPublishCopy.queuedForOffline(targetType))

        // L'enrichissement est TOUJOURS le dernier maillon avant le premier
        // octet réseau, et JAMAIS devant un feedback utilisateur. Sur le chemin
        // en ligne ce feedback est le dismiss (déjà passé) ; ici c'est le
        // triptyque lignes optimistes + haptic + toast. L'intercaler avant
        // laisserait le tray VIDE plusieurs secondes (jusqu'à la borne par
        // vidéo) — exactement le coût que C3 vient d'éliminer ailleurs.
        // Le cover optimiste vient de `renderComposite`, pas du thumbHash :
        // repousser l'enrichissement n'a aucun impact visuel.
        _ = await enrichSlidesWithThumbHashes(
            queueId: intent.queueId,
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs
        )
    }

    /// E5 — cœur de persistance du publish (write-ahead) partagé par les DEUX
    /// chemins : offline (enqueue + UX optimiste ci-dessus) et online
    /// (`publishStoryInBackground` persiste AVANT de lancer l'upload). Façade de
    /// `StoryPublishIntentWriter.persist`, qui porte le contrat. Retourne les ids de
    /// l'item persisté, `nil` si l'encodage échoue.
    func persistPublishIntentToQueue(
        targetType: PostType = .story,
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL],
        loadedStickerAnimations: [String: Data] = [:],
        originalLanguage: String? = nil,
        visibility: String,
        visibilityUserIds: [String],
        draftId: String? = nil,
        repostOfId: String? = nil,
        declaredMentions: [PostMentionInput] = [],
        mentionsBySlide: [String: [PostMentionInput]] = [:],
        composerMediaTexts: ComposerMediaTexts = .none,
        allowSoundExtraction: Bool? = nil,
        alsoAsReel: Bool = false,
        onUnsavedMedia: ((StoryOfflineMediaWriter.Outcome) -> Void)? = nil
    ) async -> (queueId: String, tempStoryId: String)? {
        await StoryPublishIntentWriter.persist(
            targetType: targetType,
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs,
            loadedAudioURLs: loadedAudioURLs,
            loadedStickerAnimations: loadedStickerAnimations,
            originalLanguage: originalLanguage,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds,
            draftId: draftId,
            repostOfId: repostOfId,
            declaredMentions: declaredMentions,
            mentionsBySlide: mentionsBySlide,
            composerMediaTexts: composerMediaTexts,
            allowSoundExtraction: allowSoundExtraction,
            alsoAsReel: alsoAsReel,
            onUnsavedMedia: onUnsavedMedia
        )
    }

    /// E5 — supprime le dossier médias `meeshy_offline_queue/<tempStoryId>/`
    /// d'un intent retiré de la queue (succès ou annulation du chemin online).
    nonisolated static func removeOfflineQueueMediaDirectory(tempStoryId: String) {
        StoryPublishIntentWriter.removeMediaDirectory(tempStoryId: tempStoryId)
    }

    /// Construit l'id optimiste d'une slide à partir de l'id de queue + index.
    /// Stable et déterministe : la réconciliation retire tout id ayant ce
    /// `tempStoryId` comme préfixe.
    static func optimisticStoryId(tempStoryId: String, slideIndex: Int) -> String {
        "\(tempStoryId)#\(slideIndex)"
    }

    /// Insère les slides en stories optimistes locales sous le groupe de l'auteur
    /// (utilisateur courant), avec un cover composite rendu et caché localement.
    /// Idempotent par id (dédup dans `insertOrAppendStoryItem`).
    func insertOptimisticOfflineStories(
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        tempStoryId: String,
        visibility: String
    ) {
        guard let user = AuthManager.shared.currentUser else { return }
        let authorName = user.displayName ?? user.username

        for (idx, slide) in slides.enumerated() {
            let pendingId = Self.optimisticStoryId(tempStoryId: tempStoryId, slideIndex: idx)

            // Cover composite local (même rendu que le chemin online) → cache
            // thumbnails. Le tray résout ce cover en priorité pour l'auteur.
            if let cover = StoryStaticSnapshot.render(
                slide: slide,
                loadedImages: loadedImages,
                bgImage: slideImages[slide.id],
                size: StoryCoverThumbnail.renderSize
            ), let jpeg = cover.jpegData(compressionQuality: 0.85) {
                Task {
                    await CacheCoordinator.shared.thumbnails.store(
                        jpeg, for: StoryCoverThumbnail.cacheKey(storyId: pendingId)
                    )
                }
            }

            let item = StoryItem(
                id: pendingId,
                content: slide.content,
                media: [],
                storyEffects: slide.effects,
                createdAt: Date(),
                visibility: visibility,
                isViewed: true
            )
            insertOrAppendStoryItem(
                item,
                authorId: user.id,
                authorName: authorName,
                authorAvatar: user.avatar
            )
        }
    }

    /// Ouvre le composer de CRÉATION sur un brouillon existant. L'ORDRE est
    /// l'invariant : `pendingDraftId` est posé AVANT `showStoryComposer`,
    /// sinon `StoryComposerCover` construit un VM vierge qui autosauvegarde
    /// sous un id neuf et duplique le brouillon. Seul écrivain app-side de
    /// `pendingDraftId` (le cover le remet à `nil` au dismiss).
    func openComposer(resumingDraftId draftId: String) {
        pendingDraftId = draftId
        showStoryComposer = true
    }

    /// Convertit un échec de publication en brouillon ÉDITABLE (« Reprendre »).
    /// Ordre STRICT — le travail n'est jamais perdu entre deux états :
    ///   1. décode `slidesPayload` et résout les fichiers de `mediaReferences` ;
    ///   2. écrit un brouillon NEUF (slides + copies des médias via
    ///      `saveMedia(draftId:)` → `meeshy_draft_media/<id>/`) puis VÉRIFIE la
    ///      persistance en relisant le store ;
    ///   3. seulement ensuite, retire l'item de file et son placeholder
    ///      optimiste.
    /// Toute défaillance avant (3) laisse l'item de file INTACT et retourne
    /// `nil` (le brouillon partiel éventuel est effacé). La présentation du
    /// composer reste à la charge de l'appelant (la sheet « Mes stories »
    /// route par son followUp différé → `openComposer(resumingDraftId:)`).
    func resumeFailedItem(
        _ item: StoryPublishQueueItem,
        draftStore: StoryDraftStore = .shared
    ) async -> String? {
        let decoder = MeeshyCoders.decoder(.persistence)
        guard let slides = try? decoder.decode([StorySlide].self, from: item.slidesPayload),
              !slides.isEmpty else {
            Logger.stories.error(
                "resumeFailedItem: slidesPayload indécodable ou vide pour \(item.id, privacy: .public)")
            showResumeFailureToast()
            return nil
        }

        guard let media = try? loadMediaFromReferences(item.mediaReferences) else {
            Logger.stories.error(
                "resumeFailedItem: média manquant/illisible pour \(item.id, privacy: .public) — item conservé")
            showResumeFailureToast()
            return nil
        }

        // `loadMediaFromReferences` (le MÊME validateur que le chemin de
        // publication de la file) déprefixe les fonds en `slideImages` —
        // `saveMedia` attend les clés d'ORIGINE, on re-préfixe.
        let images = media.slideImages.reduce(into: media.loadedImages) { acc, entry in
            acc["slide-bg-\(entry.key)"] = entry.value
        }

        let draftId = UUID().uuidString
        draftStore.save(draftId: draftId,
                        slides: slides,
                        visibility: item.visibility,
                        visibilityUserIds: item.visibilityUserIds ?? [],
                        originalLanguage: item.originalLanguage)
        draftStore.saveMedia(
            draftId: draftId,
            images: images,
            videoURLs: media.loadedVideoURLs,
            audioURLs: media.loadedAudioURLs
        )

        // `save`/`saveMedia` sont best-effort (elles loggent au lieu de
        // throw) : on RELIT le store avant de toucher à l'item de file. Une
        // copie manquante = brouillon effacé + item conservé, jamais l'inverse.
        let persistedIds = Set(draftStore.loadMediaReferences(draftId: draftId).map(\.elementId))
        let expectedIds = Set(item.mediaReferences.map(\.elementId))
        guard draftStore.listDrafts().contains(where: { $0.id == draftId }),
              expectedIds.isSubset(of: persistedIds) else {
            draftStore.delete(draftId: draftId)
            Logger.stories.error(
                "resumeFailedItem: persistance du brouillon incomplète pour \(item.id, privacy: .public) — item conservé")
            showResumeFailureToast()
            return nil
        }

        await failedItemDiscarder(item)
        removeOptimisticStories(tempStoryId: item.tempStoryId)
        return draftId
    }

    private func showResumeFailureToast() {
        FeedbackToastManager.shared.showError(String(
            localized: "story.mine.failed.resume.error",
            defaultValue: "Impossible de reprendre cette story",
            bundle: .main))
    }

    /// Retire toutes les stories optimistes d'un `tempStoryId` (ids préfixés
    /// `tempStoryId#`). Idempotent. Supprime le groupe s'il devient vide.
    /// Persiste le cache pour que le cold-start ne ressuscite pas le pending.
    func removeOptimisticStories(tempStoryId: String) {
        let pendingPrefix = "\(tempStoryId)#"
        var changed = false
        for i in storyGroups.indices.reversed() {
            let filtered = storyGroups[i].stories.filter { !$0.id.hasPrefix(pendingPrefix) }
            guard filtered.count != storyGroups[i].stories.count else { continue }
            changed = true
            if filtered.isEmpty {
                storyGroups.remove(at: i)
            } else {
                storyGroups[i] = storyGroups[i].with(stories: filtered)
            }
        }
        if changed { persistStoryCache() }
    }

    /// Réconcilie une slide publiée par la queue : retire les placeholders
    /// optimistes du `tempStoryId` (au premier appel) puis insère la vraie story
    /// serveur. Appelé depuis `executeQueuedPublish` via `onPublishedSlide`.
    private func reconcilePublishedQueueSlide(tempStoryId: String, published: PublishedSlide) {
        removeOptimisticStories(tempStoryId: tempStoryId)
        insertOrAppendStoryItem(published.item, forAuthor: published.post.author)
    }

    /// Snapshot des stories optimistes actuellement affichées (tous groupes).
    /// Utilisé par `fetchStoriesFromNetwork` pour les ré-injecter après un
    /// overwrite serveur (sinon elles disparaîtraient du tray de l'auteur).
    func currentPendingStoryItems() -> [StoryItem] {
        storyGroups.flatMap { group in
            group.stories.filter { $0.id.hasPrefix(Self.pendingStoryIdPrefix) }
        }
    }

    private func launchUploadTask(for id: String) {
        // L'état est relu depuis la file : il porte les slides ENRICHIES
        // (thumbHashes) posées à la fin de la phase `.preparing`.
        guard let upload = activeUploads.first(where: { $0.id == id }) else {
            // L'entrée a disparu entre la sélection et le lancement (annulation,
            // reprise par le drain de fond) : rendre la main, sinon
            // `currentUploadId` resterait posé et gèlerait la file entière.
            currentUploadId = nil
            drainUploadsIfNeeded()
            return
        }

        uploadTask = Task { [weak self] in
            guard let self else { return }
            do {
                _ = try await self.runStoryUpload(
                    upload,
                    onProgress: { [weak self] progress in
                        self?.reportUploadProgress(progress, for: id)
                    },
                    onPhase: { [weak self] phase in
                        self?.mutateUpload(id: id) { $0.phase = phase }
                    },
                    onPublishedSlide: { [weak self] published in
                        self?.mutateUpload(id: id) { $0.publishedPostIds.append(published.post.id) }
                        self?.insertOrAppendStoryItem(
                            published.item, forAuthor: published.post.author
                        )
                    }
                )

                // Upload complete — cleanup temp files now
                self.cleanupUploadTempFiles(upload)
                // E5 — l'upload online a abouti : retirer l'intent write-ahead
                // (queue + dossier médias), sinon le boot suivant re-publierait.
                //
                // Le retrait de l'intent est AWAITÉ, pas détaché : détaché, il
                // courait contre la fin de cette tâche et contre la déclaration
                // de succès à l'UI juste en dessous. Perdre cette course laisse
                // l'intent au drain de boot, qui RE-PUBLIE une story déjà en
                // ligne. Même geste que le chemin de drain hors-ligne
                // (`executeQueuedPublish`), qui l'awaite déjà.
                //
                // Le ménage disque, lui, reste détaché : `removeOfflineQueue-
                // MediaDirectory` est de l'IO synchrone `nonisolated`, et cette
                // tâche est isolée MainActor. Aucun boot ne dépend de ce dossier
                // une fois l'intent parti.
                let finished = self.activeUploads.first(where: { $0.id == id })
                if let queueId = finished?.queueId {
                    let tempId = finished?.queueTempStoryId
                    await StoryPublishQueue.shared.dequeue(queueId)
                    if let tempId {
                        Task.detached { Self.removeOfflineQueueMediaDirectory(tempStoryId: tempId) }
                    }
                }
                // Directive 2026-08-02 : succès serveur CONFIRMÉ — seul
                // événement qui efface le brouillon gelé au hand-off. Ce
                // chemin (upload online, piloté par `launchUploadTask`) ne
                // passe pas par `publishSucceeded` (silencieux, cf. `dequeue`) :
                // c'est donc ici, et pas dans `StoryPublishService`, que ce
                // succès-là doit être consommé.
                if let draftId = finished?.draftId {
                    self.draftStore.delete(draftId: draftId)
                }
                self.storyUploadSucceeded.send(id)
                self.activeUploads.removeAll { $0.id == id }
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "story.published", defaultValue: "Story publiée", bundle: .main))
                self.releaseUploadSlot(after: id)
            } catch {
                if !Task.isCancelled {
                    let committed = self.activeUploads.first(where: { $0.id == id })?.publishedPostIds.isEmpty == false
                    switch StoryUploadFailureDisposition.of(error, hasCommittedSlides: committed) {
                    case .rejected(let code):
                        self.rejectUpload(id: id, message: error.localizedDescription, code: code)
                    case .retryable:
                        self.mutateUpload(id: id) { $0.phase = .failed(error.localizedDescription) }
                        FeedbackToastManager.shared.showError(String(localized: "story.publishError", defaultValue: "Échec de la publication de la story", bundle: .main))
                        // Don't cleanup temp files on failure — retry may need them
                        self.releaseQueueClaimIfNothingCommitted(uploadId: id)
                    }
                }
                self.releaseUploadSlot(after: id)
            }
        }
    }

    /// Un refus DÉFINITIF de la passerelle (#7907) : rejouer rendrait le même
    /// verdict. L'intent write-ahead quitte la file d'ATTENTE (« publication au
    /// retour en ligne ») pour l'historique d'échecs — que « Mes stories »
    /// montre avec reprise et abandon —, et la ligne en vol disparaît : sinon
    /// la reconnexion la relancerait sans fin. `StoryPublishService` en fait
    /// l'annonce (toast, brouillon rendu éditable). Sans intent persisté, la
    /// ligne reste en échec, seule trace de la story.
    func rejectUpload(id: String, message: String, code: String?) {
        guard let upload = activeUploads.first(where: { $0.id == id }) else { return }
        storyUploadRejected.send(StoryUploadRejection(id: id, code: code))
        guard let queueId = upload.queueId else {
            mutateUpload(id: id) { $0.phase = .failed(message) }
            FeedbackToastManager.shared.showError(message)
            return
        }
        cleanupUploadTempFiles(upload)
        activeUploads.removeAll { $0.id == id }
        Task { await StoryPublishQueue.shared.failPermanently(queueId, message: message) }
    }

    /// Rend le créneau d'upload à la file — mais UNIQUEMENT s'il nous
    /// appartient encore. `cancelUpload(id:)` annule la tâche en vol PUIS
    /// démarre la suivante : le `catch` de la tâche annulée se déroule après,
    /// et effacer `currentUploadId`/`uploadTask` à cet instant laisserait
    /// l'upload fraîchement démarré sans propriétaire (un 2e démarrable en
    /// parallèle) et sans poignée d'annulation.
    private func releaseUploadSlot(after id: String) {
        guard currentUploadId == id else { return }
        currentUploadId = nil
        uploadTask = nil
        // L'échec ou l'annulation d'une story ne gèle PAS la file.
        drainUploadsIfNeeded()
    }

    /// Relâcher, c'est passer le relais : la queue possède le backoff, le
    /// budget de 5 tentatives et l'historique d'échec (visible et rejouable
    /// dans `MyStoriesView`) ; le VM ne garde que l'affordance de retry en
    /// 1 tap. Sans ce relâchement, l'item restait revendiqué à vie et le drain
    /// de fond le sautait pour toujours.
    ///
    /// MAIS uniquement si RIEN n'a encore été commis côté serveur :
    /// `executeQueuedPublish` republierait TOUTES les slides du payload
    /// (`StoryPublishQueueItem` ne porte aucun avancement), donc les amis
    /// verraient les slides déjà publiées EN DOUBLE — et `cancelUpload` ne
    /// connaîtrait pas les post ids du second jeu. Dès qu'une slide est
    /// commise, seul le retry local (qui porte `publishedPostIds`) sait où
    /// reprendre : la revendication reste au VM.
    private func releaseQueueClaimIfNothingCommitted(uploadId: String) {
        guard let upload = activeUploads.first(where: { $0.id == uploadId }),
              upload.publishedPostIds.isEmpty,
              let queueId = upload.queueId else { return }
        // Le drapeau tombe SYNCHRONEMENT : un retry immédiat doit savoir qu'il
        // lui faut re-revendiquer, sans dépendre de l'ordonnancement du
        // `Task.detached` qui efface le marqueur côté acteur.
        mutateUpload(id: uploadId) { $0.ownsQueueClaim = false }
        Task.detached { await StoryPublishQueue.shared.clearInFlight(queueId) }
    }
}

extension StoryViewModel {

    /// **Un média irrécupérable ne fait pas perdre la composition** (#10495).
    ///
    /// Sur le chemin hors ligne, le composer est déjà fermé et son
    /// autosauvegarde jetée quand la file refuse : ne rien faire perdait tout
    /// le travail. La composition devient un brouillon — avec ce qui a pu être
    /// gardé — marqué de l'erreur, et le toast dit QUEL média manque.
    func keepCompositionWithUnsavedMedia(
        _ outcome: StoryOfflineMediaWriter.Outcome,
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL],
        visibility: String,
        visibilityUserIds: [String],
        originalLanguage: String?,
        draftId: String?
    ) {
        let message = StoryPublishCopy.unsavedMedia(outcome.failures.first?.kind ?? .image)
        let keptId = draftId ?? UUID().uuidString
        let images = slideImages.reduce(into: loadedImages) { acc, entry in
            acc["slide-bg-\(entry.key)"] = entry.value
        }
        draftStore.save(draftId: keptId, slides: slides, visibility: visibility,
                        visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage)
        draftStore.saveMedia(draftId: keptId,
                             images: images.filter { !$0.key.contains("/") },
                             videoURLs: loadedVideoURLs, audioURLs: loadedAudioURLs)
        draftStore.recordPublishFailure(draftId: keptId, message: message)
        FeedbackToastManager.shared.showError(message)
    }
}
