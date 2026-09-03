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
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
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
            progress: 0,
            phase: .uploading,
            authorId: user?.id ?? "",
            authorName: user?.displayName ?? user?.username ?? "",
            authorAvatar: user?.avatar,
            slides: slides,
            slideImages: media.slideImages,
            loadedImages: media.loadedImages,
            loadedVideoURLs: media.loadedVideoURLs,
            loadedAudioURLs: media.loadedAudioURLs,
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
            targetType: item.targetTypePayload.flatMap(PostType.init(rawValue:)) ?? .story
        )

        let ids = try await runStoryUpload(
            upload,
            onProgress: { _ in },
            onPhase: { _ in },
            // Réconcilie le tray : retire le placeholder optimiste hors-ligne et
            // insère la vraie story serveur dès qu'une slide est publiée.
            onPublishedSlide: { [weak self] published in
                self?.reconcilePublishedQueueSlide(tempStoryId: item.tempStoryId, published: published)
            }
        )

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
                    try? await Task.sleep(for: .seconds(2))
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

    // MARK: - Background Upload State

    struct StoryUploadState: Identifiable {
        let id: String
        let thumbnailImage: UIImage
        /// E5 — id de l'item write-ahead dans `StoryPublishQueue` (et le
        /// tempStoryId de son dossier médias) : retiré au succès/cancel ;
        /// un kill le laisse en queue → repris au boot.
        var queueId: String?
        var queueTempStoryId: String?
        /// Brouillon d'origine (directive 2026-08-02) : gelé au hand-off, il
        /// n'est supprimé qu'au SUCCÈS serveur confirmé ; l'annulation le
        /// dégèle, l'échec permanent le ramène éditable avec son erreur.
        var draftId: String?
        /// Republication d'une story d'autrui : id de l'ORIGINAL, transporté
        /// jusqu'à `createStory` pour que la copie porte son attribution et
        /// crédite ses vues. `nil` pour une publication nominale.
        var repostOfId: String?
        /// E5 — le VM détient-il la revendication de son item en queue ?
        /// Posée au write-ahead, CONSERVÉE à l'échec dès qu'une slide est
        /// commise (`releaseQueueClaimIfNothingCommitted`). Un retry ne doit
        /// re-revendiquer que s'il l'a relâchée : sinon `markInFlight`
        /// refuserait sa PROPRE revendication et la ligne resterait en
        /// `.queued`, hors de portée du drain comme du geste « Réessayer ».
        var ownsQueueClaim: Bool = false
        var progress: Double
        var phase: UploadPhase

        let authorId: String
        let authorName: String
        let authorAvatar: String?

        /// Variable pour recevoir les slides ENRICHIES (thumbHashes calculés en
        /// aval du hand-off) avant que l'upload ne démarre.
        var slides: [StorySlide]
        let slideImages: [String: UIImage]
        let loadedImages: [String: UIImage]
        let loadedVideoURLs: [String: URL]
        let loadedAudioURLs: [String: URL]
        let originalLanguage: String?
        let visibility: String
        let visibilityUserIds: [String]
        /// Les personnes que l'auteur a DÉCLARÉES, avec leur mode — ce que la
        /// publication envoie au lieu de deviner les `@handle` des objets
        /// texte. Vide = aucune référence hors texte ; le serveur relit le
        /// texte lui-même.
        var declaredMentions: [PostMentionInput] = []
        /// **Les mentions PAR SLIDE** (#4068, porteur 2026-09-03).
        ///
        /// > Une mention est attachée à la publication. En Story, une
        /// > publication est une slide ; en Post et en Réel, il n'y en a qu'une.
        ///
        /// `declaredMentions` ci-dessus est composer-wide, et la boucle
        /// d'envoi le semait sur CHAQUE slide : une NOTE posée en pensant à la
        /// première notifiait trois fois. Vide ⇒ repli sur la liste plate,
        /// c'est-à-dire sur l'ancien comportement — le cas nominal des formats
        /// à publication unique.
        var mentionsBySlide: [String: [PostMentionInput]] = [:]
        /// Les DEUX textes saisis par l'auteur — texte alternatif et LÉGENDE
        /// (#4055) —, keyés par ID D'ÉLÉMENT DU COMPOSER. La traduction vers
        /// les ids `PostMedia` n'est possible qu'après l'upload, qui les
        /// attribue — `runStoryUpload` la fait juste avant l'envoi
        /// (`StoryMediaTextMapping.serverKeyed`).
        ///
        /// Un porteur NOMMÉ plutôt que deux dictionnaires voisins : cf.
        /// `ComposerMediaTexts`, dont le doc dit pourquoi l'ordre positionnel
        /// ne doit pas être ce qui les distingue.
        var composerMediaTexts: ComposerMediaTexts = .none
        /// L'opt-in d'extraction de bande-son du post. `nil` = l'auteur n'a rien
        /// tranché : le défaut serveur s'applique par silence.
        var allowSoundExtraction: Bool? = nil
        /// Le FORMAT choisi dans le composer (V3-3), porté jusqu'à l'envoi.
        /// `.story` par défaut : toute surface qui n'offre pas d'éventail
        /// publie exactement ce qu'elle publiait.
        var targetType: PostType = .story
        /// IDs of slide-Posts already created server-side. Tracked so that:
        /// (a) `retryUpload()` skips them (otherwise a partial-failure retry creates
        ///     duplicate slides — what was previously committed plus the same again),
        /// (b) `cancelUpload()` can DELETE them (otherwise a 5-slide story that
        ///     fails at slide 3 leaves slides 1-2 visible to friends as orphans).
        var publishedPostIds: [String] = []

        enum UploadPhase: Sendable, Equatable {
            /// L'entrée existe pour l'UI mais son intent n'est pas encore
            /// durable : write-ahead et enrichissement thumbHash en cours. La
            /// drainer publierait des slides sans thumbHash, sans revendication
            /// et sans `queueId` (l'intent survivrait alors au succès et serait
            /// republié au boot). JAMAIS drainable.
            case preparing
            /// Persistée, revendiquée, enrichie — en attente de son tour.
            case queued
            case uploading
            case publishing
            case failed(String)
        }
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
        allowSoundExtraction: Bool? = nil
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
                    originalLanguage: originalLanguage,
                    visibility: visibility,
                    visibilityUserIds: visibilityUserIds,
                    draftId: draftId,
                    declaredMentions: declaredMentions,
                    mentionsBySlide: mentionsBySlide,
                    composerMediaTexts: composerMediaTexts,
                    allowSoundExtraction: allowSoundExtraction
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
            progress: 0,
            phase: .preparing,
            authorId: user?.id ?? "",
            authorName: user?.displayName ?? user?.username ?? "",
            authorAvatar: user?.avatar,
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs,
            loadedAudioURLs: loadedAudioURLs,
            originalLanguage: originalLanguage,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds,
            declaredMentions: declaredMentions,
            mentionsBySlide: mentionsBySlide,
            composerMediaTexts: composerMediaTexts,
            allowSoundExtraction: allowSoundExtraction,
            targetType: targetType
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
                originalLanguage: originalLanguage,
                visibility: visibility,
                visibilityUserIds: visibilityUserIds,
                draftId: draftId,
                repostOfId: repostOfId,
                declaredMentions: declaredMentions,
                composerMediaTexts: composerMediaTexts,
                allowSoundExtraction: allowSoundExtraction
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
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
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
        originalLanguage: String? = nil,
        visibility: String = StoryVisibilityPreferenceStore.fallback,
        visibilityUserIds: [String] = [],
        draftId: String? = nil,
        declaredMentions: [PostMentionInput] = [],
        /// Les mentions PAR SLIDE (#4068) — vide ⇒ repli sur `declaredMentions`.
        mentionsBySlide: [String: [PostMentionInput]] = [:],
        composerMediaTexts: ComposerMediaTexts = .none,
        allowSoundExtraction: Bool? = nil
    ) async {
        guard let intent = await persistPublishIntentToQueue(
            targetType: targetType,
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs,
            loadedAudioURLs: loadedAudioURLs,
            originalLanguage: originalLanguage,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds,
            draftId: draftId,
            declaredMentions: declaredMentions,
            mentionsBySlide: mentionsBySlide,
            composerMediaTexts: composerMediaTexts,
            allowSoundExtraction: allowSoundExtraction
        ) else { return }

        insertOptimisticOfflineStories(
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            tempStoryId: intent.tempStoryId,
            visibility: visibility
        )

        HapticFeedback.success()
        FeedbackToastManager.shared.showSuccess(String(
            localized: "story.publish.queue.enqueued",
            defaultValue: "Story enregistrée — publication au retour en ligne"
        ))

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
    /// (`publishStoryInBackground` persiste AVANT de lancer l'upload, marque
    /// l'item in-flight, le retire au succès — un kill mid-upload laisse
    /// l'item en queue, repris au drain de boot). Retourne les ids de l'item
    /// persisté, `nil` si l'encodage échoue.
    func persistPublishIntentToQueue(
        /// Le format choisi. Persisté DANS l'item de file : il ne vit nulle
        /// part ailleurs (le brouillon ne le porte pas), donc un rejeu qui ne
        /// l'emporterait pas republierait une story là où l'auteur avait
        /// choisi « Post ».
        targetType: PostType = .story,
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL],
        originalLanguage: String? = nil,
        visibility: String,
        visibilityUserIds: [String],
        draftId: String? = nil,
        /// Republication : id de l'original, persisté DANS l'item de file pour
        /// survivre à un kill — le rejeu au boot doit republier avec la même
        /// attribution, pas créer une story orpheline.
        repostOfId: String? = nil,
        /// Références DÉCLARÉES : elles ne vivent nulle part ailleurs (un badge
        /// est exclu de la relecture serveur, une note comme un silence n'ont
        /// aucun texte), donc un rejeu qui ne les porterait pas publierait une
        /// story qui ne prévient personne.
        declaredMentions: [PostMentionInput] = [],
        /// Les mentions PAR SLIDE (#4068), persistées pour la même raison :
        /// sans elles le rejeu retomberait sur la liste plate et re-sèmerait
        /// une NOTE sur toutes les slides. Vide ⇒ repli assumé.
        mentionsBySlide: [String: [PostMentionInput]] = [:],
        /// Accessibilité : ces deux champs ne vivent NULLE PART ailleurs (le
        /// brouillon ne les porte pas), donc un rejeu qui ne les emporterait
        /// pas publierait une story muette pour les lecteurs d'écran.
        composerMediaTexts: ComposerMediaTexts = .none,
        allowSoundExtraction: Bool? = nil
    ) async -> (queueId: String, tempStoryId: String)? {
        // 1. Re-key slide backgrounds.
        let bgImages = Dictionary(
            uniqueKeysWithValues: slideImages.map { (slideId, img) in
                ("slide-bg-\(slideId)", img)
            }
        )
        // Foreground images merged with backgrounds; collisions go to the
        // foreground value (extremely unlikely — slide ids and effect ids
        // are both UUIDs).
        let allImages = bgImages.merging(loadedImages) { _, fg in fg }

        // 2. Persist media on disk in a dedicated offline queue directory per story.
        // This avoids `StoryDraftStore.saveMedia` which clears the directory, allowing
        // multiple stories to be queued without data loss.
        let fm = FileManager.default
        let docDir = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let tempStoryId = "pending_\(UUID().uuidString)"
        let offlineDir = docDir.appendingPathComponent("meeshy_offline_queue").appendingPathComponent(tempStoryId)
        try? fm.createDirectory(at: offlineDir, withIntermediateDirectories: true)
        
        // Chaque écriture passait par un `try?` nu : un échec était avalé ET
        // la référence ajoutée quand même. La story partait en file, on
        // promettait « publication au retour en ligne », puis le drain la
        // faisait échouer DÉFINITIVEMENT en `.missingLocalMedia` — travail
        // perdu, longtemps après, sans signal au moment où c'était réparable.
        //
        // Les images de stickers doivent traverser la file SANS être aplaties :
        // le JPEG n'a pas de canal alpha et c'est ce fichier-là que le drain
        // téléversera. On nomme tous les ids de stickers — le writer n'agit que
        // sur ceux dont il détient réellement un bitmap, donc un sticker emoji
        // n'y change rien. `StorySticker.kind` ne peut pas servir de filtre
        // ici : il se déduit de `postMediaId`, encore vide avant publication.
        let stickerIds = Set(slides.flatMap { $0.effects.stickerObjects ?? [] }.map(\.id))
        let mediaOutcome = StoryOfflineMediaWriter.persist(
            images: allImages,
            videos: loadedVideoURLs,
            audios: loadedAudioURLs,
            into: offlineDir,
            alphaPreservingIds: stickerIds,
            fileManager: fm
        )
        guard mediaOutcome.isComplete else {
            Logger.stories.error(
                "offline.publish aborted — médias non persistés: \(mediaOutcome.failedElementIds.joined(separator: ","), privacy: .public)")
            // Le dossier partiel ne sert à rien et occuperait le disque.
            try? fm.removeItem(at: offlineDir)
            FeedbackToastManager.shared.showError(String(
                localized: "story.publish.queue.mediaError",
                defaultValue: "Impossible d'enregistrer les médias de la story — réessayez"
            ))
            return nil
        }
        let mediaReferences = mediaOutcome.references

        // 3. Encode the slides payload. The custom encoder excludes
        //    `mediaData`, which is exactly why `mediaReferences` carries
        //    the disk paths separately.
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let payload = try? encoder.encode(slides) else {
            FeedbackToastManager.shared.showError(String(
                localized: "story.publish.queue.encodeError",
                defaultValue: "Impossible d'enregistrer la story pour publication différée"
            ))
            return nil
        }

        // 4. Enqueue. The queue persists to disk synchronously so a crash
        //    immediately after this call still preserves the item.
        let item = StoryPublishQueueItem(
            visibility: visibility,
            slidesPayload: payload,
            repostOfId: repostOfId,
            mediaReferences: mediaReferences,
            tempStoryId: tempStoryId,
            visibilityUserIds: visibilityUserIds,
            originalLanguage: originalLanguage,
            draftId: draftId,
            mentionsPayload: declaredMentions.isEmpty ? nil : declaredMentions,
            mentionsBySlidePayload: mentionsBySlide.isEmpty ? nil : mentionsBySlide,
            mediaAltPayload: composerMediaTexts.payload(.alt),
            mediaCaptionPayload: composerMediaTexts.payload(.caption),
            allowSoundExtractionPayload: allowSoundExtraction,
            targetTypePayload: targetType.rawValue
        )
        _ = await StoryPublishQueue.shared.enqueue(item)
        return (queueId: item.id, tempStoryId: tempStoryId)
    }

    /// E5 — supprime le dossier médias `meeshy_offline_queue/<tempStoryId>/`
    /// d'un intent retiré de la queue (succès ou annulation du chemin online).
    /// Sans ce cleanup, chaque publish online laisserait ses copies de médias
    /// orphelines sur disque.
    nonisolated static func removeOfflineQueueMediaDirectory(tempStoryId: String) {
        let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docDir.appendingPathComponent("meeshy_offline_queue")
            .appendingPathComponent(tempStoryId)
        try? FileManager.default.removeItem(at: dir)
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
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
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
                        self?.mutateUpload(id: id) { $0.progress = progress }
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
                self.activeUploads.removeAll { $0.id == id }
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "story.published", defaultValue: "Story publiée", bundle: .main))
                self.releaseUploadSlot(after: id)
            } catch {
                if !Task.isCancelled {
                    self.mutateUpload(id: id) { $0.phase = .failed(error.localizedDescription) }
                    FeedbackToastManager.shared.showError(String(localized: "story.publishError", defaultValue: "Échec de la publication de la story", bundle: .main))
                    // Don't cleanup temp files on failure — retry may need them
                    self.releaseQueueClaimIfNothingCommitted(uploadId: id)
                }
                self.releaseUploadSlot(after: id)
            }
        }
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
