import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

/// Local-first story-cover thumbnail (hybrid Phase 1).
///
/// The story tray/feed normally shows a SERVER-generated `thumbnailUrl` built from
/// the raw background asset — which can never contain the composer's text/drawing
/// overlays (those live as JSON effects, never baked: RAW-publish / Prisme). So on
/// send we render the FULL slide composite (bg incl. video frame + text + drawing +
/// media + stickers + filter, via `StorySlideRenderer.renderComposite`) and cache it
/// locally, keyed by the published story id. The tray prefers this local cover for
/// the author's own stories — instant, no backend, no baked upload. Other viewers
/// keep the server thumbnail until Phase 2 (baked cover upload) ships.
enum StoryCoverThumbnail {
    /// Delegates to the SDK scheme (`StoryCoverCacheKey`) — shared with the draft
    /// autosave hook, which lives SDK-side and cannot see this app-side type.
    static let renderSize = StoryCoverCacheKey.renderSize

    static func cacheKey(storyId: String) -> String { StoryCoverCacheKey.key(for: storyId) }

    /// Tray cover resolution order: locally-rendered composite (captures every layer)
    /// → server thumbnail → raw media URL (image only — `CachedAvatarImage` cannot
    /// decode a video file) → author avatar. Pure + testable.
    static func preferredCoverURLString(
        localCover: URL?,
        serverThumbnailUrl: String?,
        mediaUrl: String?,
        mediaIsImage: Bool,
        avatarURL: String?
    ) -> String? {
        if let localCover { return localCover.absoluteString }
        if let t = serverThumbnailUrl, !t.isEmpty { return t }
        if mediaIsImage, let u = mediaUrl, !u.isEmpty { return u }
        return avatarURL
    }

    /// Plan de rendu d'une cover côté RÉCEPTEUR (aperçu à la volée) : quelles
    /// images charger et dans quel slot du renderer les injecter. Une story
    /// texte/fond coloré (± audio) est rendable sans aucune image ; un fond
    /// visuel image doit être chargé (couche dominante) ; un fond VIDÉO n'a
    /// pas de poster frame côté récepteur → pas de plan, la chaîne
    /// `preferredCoverURLString` garde la main. Pure + testable.
    struct ReceiverCoverPlan: Equatable {
        /// Fond legacy (premier média image du post) → paramètre `bgImage`.
        var legacyBackgroundURL: String?
        /// Images par id d'objet (fond moderne inclus) → `loadedImages`.
        var imageURLsByObjectId: [String: String]
        /// Objets dont l'image est indispensable (fond moderne) : échec de
        /// chargement = pas de cover plutôt qu'une cover sans sa couche dominante.
        var requiredObjectIds: Set<String>
    }

    static func receiverCoverPlan(for item: StoryItem) -> ReceiverCoverPlan? {
        guard let effects = item.storyEffects else { return nil }
        var plan = ReceiverCoverPlan(
            legacyBackgroundURL: nil, imageURLsByObjectId: [:], requiredObjectIds: []
        )

        // Les `PostMedia` que la composition référence par ses STICKERS : ils
        // sont attachés au post comme n'importe quel média, donc le repli
        // legacy ci-dessous les prendrait pour le fond et peindrait l'image
        // d'un sticker PLEIN CADRE derrière la composition.
        let stickerMediaIds = Set(
            (effects.stickerObjects ?? []).map(\.postMediaId).filter { !$0.isEmpty }
        )

        if let bg = effects.resolvedBackgroundMedia {
            let url = bg.mediaURL ?? item.media.first(where: { $0.id == bg.postMediaId })?.url
            guard bg.kind == .image, let url, !url.isEmpty else { return nil }
            plan.imageURLsByObjectId[bg.id] = url
            plan.requiredObjectIds.insert(bg.id)
        } else if let legacyVisual = item.media.first(where: {
            ($0.type == .image || $0.type == .video) && !stickerMediaIds.contains($0.id)
        }) {
            guard legacyVisual.type == .image, let url = legacyVisual.url, !url.isEmpty else { return nil }
            plan.legacyBackgroundURL = url
        }

        for obj in effects.resolvedForegroundMediaObjects where obj.kind == .image {
            let url = obj.mediaURL ?? item.media.first(where: { $0.id == obj.postMediaId })?.url
            if let url, !url.isEmpty { plan.imageURLsByObjectId[obj.id] = url }
        }

        // Sticker IMAGE : son asset est un `PostMedia` du post comme un autre,
        // et il entre dans le renderer par le MÊME slot `loadedImages`, sous
        // l'id d'ÉLÉMENT. Jamais `required` : sans son image le renderer peint
        // l'emoji de repli, ce qui vaut mieux que pas de cover du tout.
        for sticker in effects.stickerObjects ?? [] where !sticker.postMediaId.isEmpty {
            let url = item.media.first(where: { $0.id == sticker.postMediaId })?.url
            if let url, !url.isEmpty { plan.imageURLsByObjectId[sticker.id] = url }
        }

        let hasVisualBackground = plan.legacyBackgroundURL != nil || !plan.requiredObjectIds.isEmpty
        let hasDrawableContent = !effects.textObjects.isEmpty
            || effects.drawingData != nil
            || !(effects.background ?? "").isEmpty
        guard hasVisualBackground || hasDrawableContent else { return nil }
        return plan
    }

    /// La DERNIÈRE story de chaque groupe (celle que la tuile du tray montre),
    /// hors stories déjà couvertes par un composite local. Pure + testable.
    static func receiverCoverCandidates(
        groups: [StoryGroup],
        hasLocalCover: (String) -> Bool
    ) -> [StoryItem] {
        groups.compactMap { group in
            guard let last = group.stories.last, !hasLocalCover(last.id) else { return nil }
            return last
        }
    }
}

@MainActor
class StoryViewModel: ObservableObject, StoryPublishExecutor {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    /// Versioned cache key for the home tray story list. Bump the suffix
    /// whenever `StoryItem` / `StoryGroup` gains a non-optional field or a
    /// formerly-dropped enrichment becomes load-bearing — the previous
    /// version's serialized JSON would deserialize with that field missing.
    /// One-shot invalidation, no perma-refetch noise.
    /// `_v2` (2026-05-28): forces a re-fetch so `visibility`, `shareCount`,
    /// `viewCount`, `repostCount`, `currentUserReactions` reach clients that
    /// cached stories before `toStoryGroups` started propagating them
    /// (Partager button stayed hidden on PUBLIC stories until this).
    static let storiesCacheKey = "recent_tray_v2"

    /// Taille de page demandée au tray. `GET /posts/feed/stories` plafonne
    /// `limit` à 50 côté serveur : annoncer davantage ne rend pas une ligne de
    /// plus et désarme le repli heuristique (leçon du cycle 79, où un
    /// `limit=500` face à un plafond de 100 avait rendu la garde inatteignable).
    static let trayPageLimit = 50

    /// Plafond de pages drainées en une passe — 300 stories, très au-delà d'un
    /// cercle réel. Il borne le coût d'une fenêtre anormale et, surtout, d'un
    /// serveur qui annoncerait `hasMore` à tort : sans lui, la boucle ne
    /// s'arrêterait jamais.
    static let maxTrayPagesPerPass = 6

    @Published var storyGroups: [StoryGroup] = []
    @Published var isLoading = false
    @Published var showStoryComposer = false
    /// Brouillon à reprendre, consommé par le cover racine du composer
    /// (`StoryComposerCover`). Posé AVANT `showStoryComposer = true` pour que
    /// le composer s'ouvre SUR ce brouillon et autosauvegarde sous son id —
    /// sans adoption, il écrirait sous un id neuf et dupliquerait le brouillon.
    var pendingDraftId: String?
    /// C5 — file LOCALE des publications en cours. Ordre = ordre des taps
    /// « Publier ». Une seule monte à la fois (`currentUploadId`), mais rien
    /// n'empêche d'en empiler d'autres : plus aucune exclusion mutuelle à la
    /// CRÉATION. L'échec de l'une ne bloque pas les suivantes.
    @Published private(set) var activeUploads: [StoryUploadState] = []
    /// Vue de compatibilité : l'upload que les surfaces d'avatar mettent en
    /// avant (un échec l'emporte, sinon la tête de file). `activeUploads` étant
    /// `@Published`, toutes les vues qui lisent cette propriété calculée
    /// continuent de se rafraîchir.
    var activeUpload: StoryUploadState? { StoryUploadPresentation.surfaced(in: activeUploads)?.upload }
    /// Id de l'upload qui MONTE en ce moment. `nil` = la file peut démarrer le
    /// suivant.
    private var currentUploadId: String?
    /// Incrémenté quand une cover de tray vient d'être rendue côté récepteur —
    /// invalide le tray pour que `latestStoryThumbnailURL` relise le cache local.
    @Published private(set) var receiverCoverRenderTick = 0
    private var uploadTask: Task<Void, Never>?
    /// Garde local-first du drain d'archive « Mes stories » : un seul drain
    /// réseau ABOUTI par session (cf. `loadMyStoriesArchive`).
    private var myStoriesArchiveDrained = false

    private let storyService: StoryServiceProviding
    private let postService: PostServiceProviding
    private var cancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    private let api: APIClientProviding
    private let visibilityStore: StoryVisibilityPreferenceStore
    /// Cycle de vie de publication du brouillon (directive 2026-08-02) :
    /// succès online (`launchUploadTask`), annulation (`cancelUpload`) et
    /// édition (`runStoryUpdate`) y écrivent. Propriété injectable — même
    /// raison que les autres dépendances de ce VM — pour que les tests
    /// n'exercent jamais le singleton `.shared` (base réelle du sandbox app).
    private let draftStore: StoryDraftStore

    init(
        storyService: StoryServiceProviding = StoryService.shared,
        postService: PostServiceProviding = PostService.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        api: APIClientProviding = APIClient.shared,
        visibilityStore: StoryVisibilityPreferenceStore = .init(),
        draftStore: StoryDraftStore = .shared
    ) {
        self.storyService = storyService
        self.postService = postService
        self.socialSocket = socialSocket
        self.api = api
        self.visibilityStore = visibilityStore
        self.draftStore = draftStore
        observeReconnectionForRetry()
        observeQueueDispositions()
    }

    /// C6 — dernier mode d'audience choisi, injecté au composer à son
    /// ouverture. Passe par le VM (et non par un statique global) pour qu'une
    /// seule instance de magasin — donc une seule suite `UserDefaults` — serve
    /// l'écriture et la lecture, y compris sous test.
    var lastComposerVisibility: String { visibilityStore.lastVisibility() }

    /// Depuis S3.4 la queue peut reprendre un item que le VM a relâché : sans
    /// cet abonnement, un anneau rouge FANTÔME survivrait à une publication
    /// réussie par le drain de fond. `publishFailed` retire aussi la ligne —
    /// l'item est alors listé dans `MyStoriesView` via
    /// `StoryPublishService.failedItems`, une seule affordance et pas deux.
    private func observeQueueDispositions() {
        StoryPublishQueue.shared.publishSucceeded.publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.removeActiveUpload(queueId: payload.queueId)
            }
            .store(in: &cancellables)

        StoryPublishQueue.shared.publishFailed.publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.removeActiveUpload(queueId: payload.queueId)
            }
            .store(in: &cancellables)
    }

    private func removeActiveUpload(queueId: String) {
        guard let idx = activeUploads.firstIndex(where: { $0.queueId == queueId }) else { return }
        let removed = activeUploads.remove(at: idx)
        if currentUploadId == removed.id {
            uploadTask?.cancel()
            uploadTask = nil
            currentUploadId = nil
        }
        drainUploadsIfNeeded()
    }

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
    private func observeReconnectionForRetry() {
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

    // MARK: - Load Stories

    func loadStories(forceNetwork: Bool = false) async {
        guard !isLoading else { return }

        if forceNetwork {
            isLoading = true
            await fetchStoriesFromNetwork()
            isLoading = false
            return
        }

        let cached = await CacheCoordinator.shared.stories.load(for: Self.storiesCacheKey)
        switch cached {
        case .fresh(let data, _):
            storyGroups = data
            // Le cache survit délibérément à la fenêtre de visibilité d'une
            // story : sans cette purge, il ressert des stories mortes et le
            // prefetch ci-dessous irait re-télécharger leurs médias.
            purgeDeadStories()
            sortStoryGroupsInPlace()
            prefetchAllStoryMedia(storyGroups)
            renderMissingReceiverCovers()
            return
        case .stale(let data, _):
            storyGroups = data
            purgeDeadStories()
            sortStoryGroupsInPlace()
            prefetchAllStoryMedia(storyGroups)
            renderMissingReceiverCovers()
            // R8 inc.1 — le refresh silencieux passe en DELTA quand le cache
            // porte un curseur updatedAt (sinon nil → full historique). Curseur
            // dérivé du tray APRÈS purge : il doit refléter ce qu'on détient
            // encore. Le dériver d'une story qu'on vient de retirer avancerait
            // le curseur au-delà de notre état réel — le delta suivant sauterait
            // alors les tombstones de cet intervalle.
            let since = Self.deltaSince(for: storyGroups)
            Task { [weak self] in await self?.fetchStoriesFromNetwork(deltaSince: since) }
            return
        case .expired, .empty:
            break
        }

        isLoading = true
        await fetchStoriesFromNetwork()
        isLoading = false
    }

    /// Résultat d'une passe de tray, pages recollées.
    struct DrainedStoryPages {
        let posts: [APIPost]
        let deletedStoryIds: Set<String>
        /// Le serveur a plafonné ses tombstones : des disparitions manquent, et
        /// elles n'ont AUCUN curseur de reprise.
        let tombstonesTruncated: Bool
    }

    enum StoryTrayPageError: Error {
        /// Une page a répondu `success: false` — indiscernable d'une panne, donc
        /// traitée comme telle plutôt que recollée en silence.
        case unsuccessfulPage
    }

    /// Suit `pagination.nextCursor` tant que le serveur annonce `hasMore`.
    ///
    /// La page est FILTRÉE par `updatedAt` mais ORDONNÉE par `(createdAt, id)`,
    /// et son curseur porte sur ce même couple : paginer parcourt donc la
    /// fenêtre EXACTEMENT, sans saut ni doublon. C'est ce qui distingue ce cas
    /// de celui des conversations (cycle 79), où escalader vers un fetch complet
    /// était le seul recours — ici le fetch complet emprunte la MÊME route
    /// plafonnée à 50 : il ne rattraperait rien.
    ///
    /// Avant ce drain, `hasMore`/`nextCursor` n'avaient AUCUN lecteur dans tout
    /// le dépôt : le tray était silencieusement coupé à 50 stories pour tout le
    /// monde, delta comme fetch complet.
    private func drainStoryPages(updatedSince: Date?) async throws -> DrainedStoryPages {
        var posts: [APIPost] = []
        var deletedStoryIds = Set<String>()
        var tombstonesTruncated = false
        var cursor: String?

        for _ in 0..<Self.maxTrayPagesPerPass {
            let response = try await storyService.list(
                cursor: cursor,
                limit: Self.trayPageLimit,
                updatedSince: updatedSince
            )
            guard response.success else { throw StoryTrayPageError.unsuccessfulPage }

            posts.append(contentsOf: response.data)
            deletedStoryIds.formUnion(response.meta?.deletedStoryIds ?? [])
            // Les tombstones voyagent page par page : la troncature vue sur
            // N'IMPORTE laquelle vaut pour la passe entière.
            tombstonesTruncated = tombstonesTruncated || (response.meta?.deletedStoryIdsTruncated ?? false)

            // Un `nextCursor` vide avec `hasMore: true` serait une page suivante
            // qu'on ne sait pas demander : on s'arrête plutôt que de rejouer la
            // même page indéfiniment.
            guard response.pagination?.hasMore == true,
                  let next = response.pagination?.nextCursor,
                  !next.isEmpty else {
                return DrainedStoryPages(
                    posts: posts,
                    deletedStoryIds: deletedStoryIds,
                    tombstonesTruncated: tombstonesTruncated
                )
            }
            cursor = next
        }

        Logger.messages.error(
            "[StoryVM] Tray drain stopped at the \(Self.maxTrayPagesPerPass, privacy: .public)-page cap while the server still announced more"
        )
        return DrainedStoryPages(
            posts: posts,
            deletedStoryIds: deletedStoryIds,
            tombstonesTruncated: tombstonesTruncated
        )
    }

    func fetchStoriesFromNetwork(deltaSince: Date? = nil) async {
        // R8 inc.1 — refetch silencieux DELTA : quand le cache fournit un
        // curseur (max updatedAt), on ne demande que les stories créées ou
        // modifiées depuis (G1a serveur). Merge REPLACE (isViewed monotone),
        // jamais d'overwrite du tray — les stories pendantes et l'état local
        // survivent par construction. Toute erreur delta retombe sur le full
        // historique ci-dessous (résilience > économie).
        if let deltaSince {
            do {
                let drained = try await drainStoryPages(updatedSince: deltaSince)
                // Tombstones plafonnés : la purge qu'on tient est INCOMPLÈTE, et
                // aucun curseur ne permet de réclamer la suite. Le seul geste qui
                // fasse sortir les fantômes restants est le remplacement du tray
                // par un fetch complet — on tombe donc volontairement dessus au
                // lieu de fusionner une couverture qu'on sait trouée. C'est
                // l'inverse du geste de la page tronquée juste au-dessus, qui se
                // rattrape, elle, en paginant.
                if drained.tombstonesTruncated {
                    Logger.messages.error("[StoryVM] Server truncated its story tombstones — escalating to a full tray fetch")
                } else {
                    let deltaGroups = drained.posts.toStoryGroups(currentUserId: AuthManager.shared.currentUser?.id)
                    if !deltaGroups.isEmpty {
                        insertOrMergeStoryGroups(deltaGroups, replacingExisting: true)
                    }
                    // Le merge ci-dessus est additif — il ne peut RIEN retirer.
                    // Les disparitions arrivent par les tombstones du serveur
                    // (`meta.deletedStoryIds`), seul canal capable de rattraper
                    // une suppression survenue app fermée ou hors-ligne. Appelé
                    // même sur un delta vide : une réponse sans aucune story
                    // peut très bien ne porter QUE des disparitions.
                    purgeDeadStories(deletedIds: drained.deletedStoryIds)
                    if !deltaGroups.isEmpty {
                        prefetchAllStoryMedia(storyGroups)
                        renderMissingReceiverCovers()
                    }
                    return
                }
            } catch {
                Logger.messages.error("[StoryVM] Delta refresh failed (falling back to full): \(error.localizedDescription)")
            }
        }

        // Capture les stories optimistes hors-ligne AVANT l'overwrite serveur :
        // le payload `getStories` ne contient pas les stories non encore publiées,
        // donc sans ré-injection elles disparaîtraient du tray de l'auteur après
        // un refetch (alors qu'elles sont toujours en attente dans la queue).
        let pendingBeforeFetch = currentPendingStoryItems()

        do {
            // Drainé lui aussi : ce chemin est celui qui REMPLACE le tray, donc
            // une page tronquée n'y laisse pas seulement un trou — elle EFFACE
            // les stories coupées de l'état affiché, et le cache qu'on sauve
            // juste après grave la troncature.
            let drained = try await drainStoryPages(updatedSince: nil)

            var groups = drained.posts.toStoryGroups()

            // Preserve locally-viewed state for stories the API hasn't synced yet.
            // Garde raffinée : une édition de CONTENU postérieure à la vue
            // locale (reset d'engagement serveur) fait céder la monotonie —
            // sauf pour ses PROPRES stories, dont l'état « vu » est
            // client-only par construction (recordView exclut l'auteur).
            let locallyViewed = buildLocallyViewedMap()
            let selfId = AuthManager.shared.currentUser?.id
            if !locallyViewed.isEmpty {
                groups = groups.map { group in
                    let isOwnGroup = group.id == selfId
                    let merged = group.stories.map { story in
                        guard !story.isViewed, let viewedAt = locallyViewed[story.id] else { return story }
                        guard isOwnGroup || Self.shouldKeepLocalViewed(
                            localViewedAt: viewedAt == .distantPast ? nil : viewedAt,
                            contentEditedAt: story.contentEditedAt
                        ) else { return story }
                        var copy = story; copy.isViewed = true; return copy
                    }
                    return group.with(stories: merged)
                }
            }

            storyGroups = groups

            // Ré-injecte les stories optimistes hors-ligne encore en attente
            // (le serveur ne les renvoie pas). Dédupliqué par id : si le
            // serveur a déjà la version publiée, elle a un autre id et la
            // réconciliation a déjà retiré le pending — pas de doublon.
            if !pendingBeforeFetch.isEmpty, let user = AuthManager.shared.currentUser {
                let authorName = user.displayName ?? user.username
                for item in pendingBeforeFetch {
                    insertOrAppendStoryItem(
                        item,
                        authorId: user.id,
                        authorName: authorName,
                        authorAvatar: user.avatar
                    )
                }
            }

            // Tri unifié (ma story d'abord > non-vues > récence), identique au
            // chemin socket. `toStoryGroups()` est appelé sans `currentUserId`
            // ici, donc sans ce re-tri la story « Moi » n'arrivait pas en tête
            // au chargement réseau/cold-start — incohérent avec le tri appliqué
            // par les events socket (2026-06-01). On sauve la version triée pour
            // que les chemins .fresh/.stale servent déjà le bon ordre.
            sortStoryGroupsInPlace()
            try? await CacheCoordinator.shared.stories.save(storyGroups, for: Self.storiesCacheKey)
            prefetchAllStoryMedia(storyGroups)
            renderMissingReceiverCovers()
        } catch {
            Logger.messages.error("[StoryVM] Failed to load stories: \(error.localizedDescription)")
        }
    }

    private func buildLocallyViewedSet() -> Set<String> {
        var ids = Set<String>()
        for group in storyGroups {
            for story in group.stories where story.isViewed {
                ids.insert(story.id)
            }
        }
        return ids
    }

    /// `id → viewedAt` des stories vues localement (`.distantPast` quand le
    /// moment de la vue est inconnu — caches antérieurs au champ). Sert à la
    /// garde monotone raffinée : une vue sans horodatage cède toujours devant
    /// une édition de contenu.
    private func buildLocallyViewedMap() -> [String: Date] {
        var map: [String: Date] = [:]
        for group in storyGroups {
            for story in group.stories where story.isViewed {
                map[story.id] = story.viewedAt ?? .distantPast
            }
        }
        return map
    }

    /// Garde « viewed monotone » raffinée (directive 2026-07-29) : une fois
    /// vue localement, une story RESTE vue même si le serveur (laggé) dit le
    /// contraire — SAUF quand son contenu a été édité APRÈS la vue locale :
    /// le serveur a alors volontairement effacé les vues (reset
    /// d'engagement), la story redevient légitimement non-vue.
    /// `contentEditedAt` est le SEUL horodatage fiable pour ce test —
    /// `updatedAt` bouge sur chaque écriture (compteurs de vues inclus).
    nonisolated static func shouldKeepLocalViewed(localViewedAt: Date?, contentEditedAt: Date?) -> Bool {
        guard let contentEditedAt else { return true }
        guard let localViewedAt else { return false }
        return localViewedAt >= contentEditedAt
    }

    // MARK: - Background Prefetch (triggered on story load)

    /// URLs média déjà préchargées dans cette session — garde de déduplication.
    ///
    /// `prefetchAllStoryMedia` est rappelé à CHAQUE `loadStories` (y compris sur
    /// cache hit `.fresh`/`.stale`) ET à chaque refetch SWR. Sans ce garde, ouvrir
    /// le tray relance des dizaines de tâches `data(for:)` qui re-sondent le disque
    /// pour des médias déjà en cache à chaque ouverture — du travail redondant qui
    /// alimente le lag ressenti à l'ouverture des stories. Une fois une URL servie
    /// depuis le cache, on ne la re-prefetch plus de la session (les URLs média sont
    /// content-addressed donc immuables ; le viewer garde son chemin de charge à la
    /// demande si jamais le disque a évincé l'asset entre-temps).
    private var prefetchedMediaURLs: Set<String> = []

    /// Stories dont le rendu de cover récepteur a déjà été tenté cette session —
    /// évite de re-tenter en boucle les compositions non rendables (fond vidéo,
    /// image de fond introuvable) à chaque rafraîchissement du tray.
    private var attemptedReceiverCoverStoryIds: Set<String> = []

    /// Aperçu à la volée côté récepteur : rend le composite (texte + fond +
    /// couches) de la dernière story de chaque groupe depuis ses `StoryEffects`
    /// et le stocke sous `StoryCoverThumbnail.cacheKey(storyId:)` — le même
    /// emplacement que la cover locale de l'auteur, que la tuile du tray
    /// préfère déjà à tout le reste. Aucun upload : le texte reste re-rendable
    /// par viewer (Prisme) et les stories DÉJÀ publiées gagnent un aperçu.
    func renderMissingReceiverCovers() {
        let candidates = StoryCoverThumbnail.receiverCoverCandidates(
            groups: storyGroups,
            hasLocalCover: { storyId in
                attemptedReceiverCoverStoryIds.contains(storyId)
                    || CacheCoordinator.thumbnailLocalFileURL(
                        for: StoryCoverThumbnail.cacheKey(storyId: storyId)
                    ) != nil
            }
        )
        guard !candidates.isEmpty else { return }
        attemptedReceiverCoverStoryIds.formUnion(candidates.map(\.id))

        Task(priority: .utility) { [weak self] in
            let imageCache = await CacheCoordinator.shared.images
            var storedAny = false

            for item in candidates {
                guard let plan = StoryCoverThumbnail.receiverCoverPlan(for: item) else { continue }

                var legacyBackground: UIImage?
                if let bgURL = plan.legacyBackgroundURL {
                    let resolved = MeeshyConfig.resolveMediaURL(bgURL)?.absoluteString ?? bgURL
                    legacyBackground = await imageCache.image(for: resolved)
                    guard legacyBackground != nil else { continue }
                }

                var loadedImages: [String: UIImage] = [:]
                for (objectId, urlString) in plan.imageURLsByObjectId {
                    let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
                    if let image = await imageCache.image(for: resolved) {
                        loadedImages[objectId] = image
                    }
                }
                guard plan.requiredObjectIds.allSatisfy({ loadedImages[$0] != nil }) else { continue }

                let slide = StorySlide(
                    id: item.id,
                    content: item.content,
                    effects: item.storyEffects ?? StoryEffects()
                )
                guard let cover = StorySlideRenderer.renderComposite(
                    slide: slide,
                    bgImage: legacyBackground,
                    loadedImages: loadedImages,
                    size: StoryCoverThumbnail.renderSize
                ), let jpeg = cover.jpegData(compressionQuality: 0.85) else { continue }

                await CacheCoordinator.shared.thumbnails.store(
                    jpeg, for: StoryCoverThumbnail.cacheKey(storyId: item.id)
                )
                storedAny = true
            }

            if storedAny { self?.receiverCoverRenderTick += 1 }
        }
    }

    /// Prefetch all media for all story groups in the background.
    /// Downloads images to disk cache and prerolls video players for the first groups.
    /// First slide of each group is prefetched at high priority for instant display.
    private func prefetchAllStoryMedia(_ groups: [StoryGroup]) {
        // Élargi de 5 → 8 groupes : sur un tray dense, précharger plus de bulles
        // rend les premières ouvertures instantanées sans exploser la mémoire (on
        // ne preroll l'AVPlayer que pour la première slide de chaque groupe).
        let groupsToPreload = Array(groups.prefix(8))

        // High priority: première slide non vue de chaque groupe (ce que l'utilisateur tape en premier).
        Task(priority: .userInitiated) { [weak self] in
            guard let self else { return }
            let imageCache = await CacheCoordinator.shared.images
            await withTaskGroup(of: [String].self) { taskGroup in
                for group in groupsToPreload {
                    guard let targetStory = group.stories.first(where: { !$0.isViewed }) ?? group.stories.first else { continue }
                    // Réclame (et marque) les URLs non encore préchargées sur le MainActor
                    // AVANT de dispatcher le child task (qui n'est pas isolé MainActor).
                    let urls = self.claimUnprefetchedURLs(for: targetStory)
                    guard !urls.isEmpty else { continue }
                    taskGroup.addTask {
                        await Self.prefetchStoryMediaURLs(urls, in: targetStory, imageCache: imageCache, prerollPlayer: true)
                    }
                }
                // Une URL sautée par la politique (ex: vidéo en cellulaire) n'est
                // PAS « déjà préchargée » — la retirer pour qu'un retour au Wi-Fi
                // en cours de session la rattrape (cf. claimUnprefetchedURLs ci-dessous).
                for await skipped in taskGroup {
                    self.prefetchedMediaURLs.subtract(skipped)
                }
            }
        }

        // Utility priority: jusqu'à n+2 slides à venir par groupe (fenêtre élargie
        // de 3 → 4 pour couvrir confortablement n+1 ET n+2 avant ouverture).
        // DO NOT preroll AVPlayer here; let `StoryReaderPrefetcher` handle JIT warming to save memory.
        Task(priority: .utility) { [weak self] in
            guard let self else { return }
            let imageCache = await CacheCoordinator.shared.images
            for group in groupsToPreload {
                guard !Task.isCancelled else { return }
                let firstUnviewedIndex = group.stories.firstIndex(where: { !$0.isViewed }) ?? 0
                let slidesToPrefetch = Array(group.stories.dropFirst(firstUnviewedIndex + 1).prefix(4))

                for story in slidesToPrefetch {
                    guard !Task.isCancelled else { return }
                    let urls = self.claimUnprefetchedURLs(for: story)
                    guard !urls.isEmpty else { continue }
                    let skipped = await Self.prefetchStoryMediaURLs(urls, in: story, imageCache: imageCache, prerollPlayer: false)
                    self.prefetchedMediaURLs.subtract(skipped)
                }
            }
        }
    }

    /// Calcule les URLs média d'une story, retire celles déjà préchargées dans la
    /// session, marque les nouvelles comme réclamées et les retourne. `@MainActor`
    /// (mutation de `prefetchedMediaURLs`) — appelé depuis les boucles de prefetch.
    private func claimUnprefetchedURLs(for story: StoryItem) -> [String] {
        let all = Self.mediaURLStrings(for: story)
        let fresh = all.filter { !prefetchedMediaURLs.contains($0) }
        prefetchedMediaURLs.formUnion(fresh)
        return fresh
    }

    /// Extraction pure des URLs média d'une story (background + foreground + audio),
    /// dédupliquées. Pure et testable, sans effet de bord.
    static func mediaURLStrings(for story: StoryItem) -> [String] {
        var urls: [String] = story.media.compactMap(\.url)

        if let mediaObjs = story.storyEffects?.mediaObjects {
            for obj in mediaObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let audioObjs = story.storyEffects?.audioPlayerObjects {
            for obj in audioObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let bgAudioId = story.storyEffects?.backgroundAudioId {
            if let urlStr = story.media.first(where: { $0.id == bgAudioId })?.url {
                urls.append(urlStr)
            }
        }

        return Array(Set(urls))
    }

    // MARK: - Group intro (interstitiel d'identité inter-groupes — directive user 2026-07-03)

    /// Données de l'interstitiel affiché au passage au groupe de story d'une
    /// AUTRE personne : identité complète (nom, bannière) + mood. La présence
    /// est lue par la vue directement (`PresenceManager.shared`, singleton).
    struct StoryGroupIntro: Equatable {
        let userId: String
        /// À la construction (placeholder), reçoit `StoryGroup.username` — qui
        /// porte en réalité `APIAuthor.name` (displayName ?? username). Le
        /// profil résolu l'écrase avec le VRAI handle (`applyIntroProfile`) :
        /// c'est lui que la carte rend après « @ » (directive user 2026-08-20).
        var username: String
        var displayName: String?
        var bannerURL: String?
        var bannerThumbHash: String?
        var moodEmoji: String?
        var moodMessage: String?
    }

    /// Seams injectables (tests) — closures plutôt qu'une extension des
    /// protocols services : ajouter `getProfile` à `UserServiceProviding`
    /// ferait dériver tous les mocks existants pour une seule feature.
    var introProfileResolver: (String) async throws -> MeeshyUser = { userId in
        try await UserService.shared.getProfile(idOrUsername: userId)
    }
    var introMoodFeedLoader: () async throws -> [APIPost] = {
        try await StatusService.shared.list(mode: .friends, cursor: nil, limit: 50).data
    }

    /// Cache SESSION des moods par userId — un seul fetch réseau du feed
    /// statuses par session de ViewModel, réutilisé pour chaque transition.
    private var introMoodsByUserId: [String: StatusEntry]?

    /// Résout les données de l'interstitiel, cache-first : profil depuis
    /// `CacheCoordinator.profiles` (fresh/stale servis tels quels), fetch
    /// réseau UNIQUEMENT si le cache n'a ni nom ni bannière (persisté au
    /// cache ensuite), mood best-effort depuis le feed statuses de session.
    /// Ne throw jamais : au pire l'interstitiel affiche username + avatar
    /// du groupe (données déjà en main).
    func resolveGroupIntro(for group: StoryGroup) async -> StoryGroupIntro {
        var intro = StoryGroupIntro(userId: group.id, username: group.username)

        switch await CacheCoordinator.shared.profiles.load(for: group.id) {
        case .fresh(let users, _), .stale(let users, _):
            if let user = users.first { Self.applyIntroProfile(user, to: &intro) }
        case .expired, .empty:
            break
        }
        if intro.displayName == nil && intro.bannerURL == nil,
           let fetched = try? await introProfileResolver(group.id) {
            Self.applyIntroProfile(fetched, to: &intro)
            try? await CacheCoordinator.shared.profiles.save([fetched], for: group.id)
        }

        if introMoodsByUserId == nil {
            let posts = (try? await introMoodFeedLoader()) ?? []
            introMoodsByUserId = Dictionary(
                posts.compactMap { $0.toStatusEntry() }.map { ($0.userId, $0) },
                uniquingKeysWith: { a, b in a.createdAt > b.createdAt ? a : b }
            )
        }
        if let mood = introMoodsByUserId?[group.id],
           mood.expiresAt.map({ $0 > Date() }) ?? true {
            intro.moodEmoji = mood.moodEmoji
            intro.moodMessage = mood.content
        }
        return intro
    }

    /// Mapping pur profil → intro (testable) : displayName explicite, sinon
    /// « Prénom Nom », sinon nil (la vue retombe sur le username).
    static func applyIntroProfile(_ user: MeeshyUser, to intro: inout StoryGroupIntro) {
        let fullName = [user.firstName, user.lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        intro.displayName = user.displayName ?? (fullName.isEmpty ? nil : fullName)
        // Le placeholder portait `StoryGroup.username` = `APIAuthor.name`
        // (displayName ?? username) : la ligne « @… » de la carte affichait le
        // display name. Le profil est la seule source qui connaît le handle.
        intro.username = user.username
        intro.bannerURL = user.banner
        intro.bannerThumbHash = user.bannerThumbHash
    }

    // MARK: - R5 Offline replay pin (story vue = médias non-évincables jusqu'à expiry)

    /// Store disque cible d'un pin de média story.
    enum StoryPinStore: Equatable {
        case video, audio, images
    }

    /// Échéance du pin : l'expiry de la story (le pin ne doit jamais lui
    /// survivre). Fallback aligné sur `toStoryGroups` : createdAt + fenêtre
    /// publique (`StoryItem.defaultExpiryInterval`, 20 h depuis 2026-08-12).
    static func pinDeadline(for story: StoryItem) -> Date {
        story.expiresAt ?? story.createdAt.addingTimeInterval(StoryItem.defaultExpiryInterval)
    }

    /// Plan de pin PUR (testable) : chaque URL média de la story routée vers
    /// son store disque — miroir exact du routage de `prefetchStoryMediaURLs`
    /// (par `FeedMedia.type`, inconnu → images). Le pin ne télécharge RIEN :
    /// il protège de l'éviction budget LRU ce que les chemins de lecture /
    /// prefetch ont déposé (ou déposeront — pin-avant-download supporté).
    static func pinTargets(for story: StoryItem) -> [(urlString: String, store: StoryPinStore)] {
        Self.mediaURLStrings(for: story).map { urlString in
            // R7 — même résolution de type que le prefetch : le pin doit
            // protéger le MÊME store que celui où le média est réellement rangé.
            let kind = StoryMediaStoreRouter.effectiveKind(
                declaredType: story.media.first(where: { $0.url == urlString })?.type,
                urlString: urlString
            )
            switch kind {
            case .video: return (urlString, .video)
            case .audio: return (urlString, .audio)
            default: return (urlString, .images)
            }
        }
    }

    // MARK: - Purge des stories mortes
    //
    // Le cache du tray (TTL 24 h) survit délibérément à la fenêtre de visibilité
    // d'une story (21 h) — on évite ainsi de re-télécharger avatars et
    // métadonnées à chaque démarrage à froid. La contrepartie : il continue de
    // porter des stories que le serveur ne renverra plus.
    //
    // Jusqu'ici rien ne les effaçait. L'expiry était traitée par masquage (le
    // tray filtre les groupes entièrement expirés) et par saut (le lecteur
    // saute les slides mortes) ; les suppressions n'arrivaient que par l'event
    // socket `story:deleted`, qui ne se rejoue pas — app fermée ou hors-ligne,
    // l'information était perdue. Une story disparue restait donc dans le
    // tray : impossible à revoir, jamais nettoyée, jusqu'à l'expiration du
    // cache 24 h ou un pull-to-refresh.

    /// Retire du tray, du cache disque et des pins média tout ce qui est mort.
    ///
    /// `deletedIds` : ids rapportés disparus par le serveur (tombstones du
    /// delta-sync) ou par l'event socket. L'expiry, elle, est déduite
    /// localement — le balayeur serveur ne passe qu'une fois par heure et le
    /// tray ne doit pas attendre son passage.
    ///
    /// `includingExpired: false` pour un retrait CIBLÉ (event socket, action de
    /// l'utilisateur) : un event qui annonce une disparition précise ne doit
    /// pas emporter avec lui tout ce qui a expiré par ailleurs. Le balayage
    /// d'expiry a lieu aux chargements du tray, là où il est attendu.
    ///
    /// Retourne les stories retirées (vide si rien à faire — aucune écriture de
    /// cache n'est alors déclenchée).
    @discardableResult
    func purgeDeadStories(deletedIds: Set<String> = [], includingExpired: Bool = true) -> [StoryItem] {
        let currentUserId = AuthManager.shared.currentUser?.id
        let now: Date? = includingExpired ? Date() : nil
        let deadIds = Set(storyGroups.deadStoryIds(
            currentUserId: currentUserId, deletedIds: deletedIds, now: now
        ))
        guard !deadIds.isEmpty else { return [] }

        // Capturées AVANT la purge : une fois hors du tray, plus rien ne permet
        // de retrouver les médias à libérer.
        let dead = storyGroups.flatMap(\.stories).filter { deadIds.contains($0.id) }
        storyGroups = storyGroups.purgingDeadStories(
            currentUserId: currentUserId, deletedIds: deletedIds, now: now
        )
        // Retirer une story peut faire basculer `hasUnviewed` d'un groupe, ou
        // le faire disparaître : l'ordre du tray change.
        sortStoryGroupsInPlace()
        persistStoryCache()
        // Le cache by-id sert les deep-links AVANT tout aller-retour réseau :
        // sans cette éviction, une notification ferait ressusciter à l'écran la
        // story qu'on vient de retirer du tray.
        storyService.invalidate(postIds: deadIds)
        releaseOfflineMedia(for: dead)
        Logger.messages.info("[StoryVM] purge de \(deadIds.count, privacy: .public) story(s) morte(s) du tray local")
        return dead
    }

    /// Rend évinçables les médias d'une story purgée.
    ///
    /// Une story vue voit ses médias ÉPINGLÉS sur disque jusqu'à son expiry
    /// (relecture hors-ligne) : sans ce dépinnage, ils resteraient protégés de
    /// l'éviction budget alors que plus rien ne peut les afficher.
    ///
    /// On dépingle sans supprimer les fichiers : un même média peut être
    /// partagé par une story et son repost, et supprimer les octets sous les
    /// pieds du repost survivant casserait sa lecture. Dépinglés, ils repassent
    /// sous le régime normal du cache (TTL + budget LRU).
    private func releaseOfflineMedia(for stories: [StoryItem]) {
        let targets = stories.flatMap { Self.pinTargets(for: $0) }
        guard !targets.isEmpty else { return }
        Task {
            for target in targets {
                switch target.store {
                case .video:
                    await CacheCoordinator.shared.video.unpin(target.urlString)
                case .audio:
                    await CacheCoordinator.shared.audio.unpin(target.urlString)
                case .images:
                    await CacheCoordinator.shared.images.unpin(target.urlString)
                }
            }
        }
    }

    /// Décision produit (app-side, cf. SDK purity) : une story VUE doit se
    /// relire offline → ses médias sont pinnés dans leurs stores jusqu'à
    /// l'expiry. Les pins échus s'auto-purgent côté `DiskCacheStore`.
    private func pinStoryMediaForOfflineReplay(_ story: StoryItem) {
        let until = Self.pinDeadline(for: story)
        guard until > Date() else { return }
        let targets = Self.pinTargets(for: story)
        guard !targets.isEmpty else { return }
        Task {
            for target in targets {
                switch target.store {
                case .video:
                    await CacheCoordinator.shared.video.pin(target.urlString, until: until)
                case .audio:
                    await CacheCoordinator.shared.audio.pin(target.urlString, until: until)
                case .images:
                    await CacheCoordinator.shared.images.pin(target.urlString, until: until)
                }
            }
        }
    }

    /// Décision PURE : ce type de média de story doit-il être PRÉCHARGÉ, la
    /// politique d'auto-téléchargement étant déjà résolue ? Miroir exact de
    /// `BubbleCarouselView.shouldPrefetchAttachment` — extraite pour être
    /// testable sans monter la vue ni le monitor réseau.
    ///
    /// `.document` n'a pas de politique propre : il transite par le store
    /// `images` (branche `else` du routage ci-dessous), donc il suit `prefs.image`.
    nonisolated static func shouldPrefetchStoryMedia(
        kind: FeedMediaType,
        allowImage: Bool,
        allowVideo: Bool,
        allowAudio: Bool
    ) -> Bool {
        switch kind {
        case .video: return allowVideo
        case .audio: return allowAudio
        case .image, .document: return allowImage
        }
    }

    /// Prefetch les URLs (déjà filtrées) d'une story dans les stores disque + mémoire.
    /// Retourne les URLs SAUTÉES par la politique d'auto-téléchargement (ex:
    /// vidéo interdite en cellulaire), pour que l'appelant les retire de
    /// `prefetchedMediaURLs` — sinon la dédup de session les marque
    /// « déjà préchargées » à vie et un retour au Wi-Fi ne les rattrape jamais.
    private static func prefetchStoryMediaURLs(_ urls: [String], in story: StoryItem, imageCache: DiskCacheStore, prerollPlayer: Bool) async -> [String] {
        // Respecte la politique d'auto-téléchargement de l'utilisateur — miroir
        // de `ConversationMediaHandler.prefetchRecentMedia` et de
        // `BubbleCarouselView.prefetchAdjacentPages`. Sans cette garde, le
        // préchargement du tray tirait le corps MP4/audio COMPLET en cellulaire
        // alors que « Vidéo : Wi-Fi uniquement » est le réglage par défaut.
        // Le chemin de LECTURE (ouverture réelle d'une story) n'est PAS gardé :
        // une story tapée doit toujours se charger.
        let condition = NetworkConditionMonitor.shared.condition
        let prefs = MediaDownloadPreferencesStore.shared.preferences
        let allowImage = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: condition, prefs: prefs)
        let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: condition, prefs: prefs)
        let allowAudio = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: condition, prefs: prefs)
        var skipped: [String] = []
        for urlString in urls {
            // Normalize through the SAME resolver the SDK reader uses
            // (`StoryReaderRepresentable` / `directURLIfAny`). Cache keys must
            // match the reader's `url.absoluteString`; a relative URL warmed
            // under its raw key would be a cache-miss + re-download at play time.
            let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
            // R7 — type effectif (déclaré corrigé par sniff d'extension) : un
            // mp4 mal classé ne doit plus atterrir dans le store `images`.
            let mediaType = StoryMediaStoreRouter.effectiveKind(
                declaredType: story.media.first(where: { $0.url == urlString })?.type,
                urlString: resolved
            )
            guard Self.shouldPrefetchStoryMedia(
                kind: mediaType, allowImage: allowImage, allowVideo: allowVideo, allowAudio: allowAudio
            ) else { skipped.append(urlString); continue }

            if mediaType == .video {
                // Peupler le store `video` (celui que le canvas relit), pas
                // `images` — sinon cache-miss + re-download au moment de jouer.
                _ = try? await CacheCoordinator.shared.video.data(for: resolved)
                if prerollPlayer, let url = MeeshyConfig.resolveMediaURL(urlString) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
                }
            } else if mediaType == .audio {
                _ = try? await CacheCoordinator.shared.audio.data(for: resolved)
            } else {
                _ = await imageCache.image(for: resolved)
            }
        }
        return skipped
    }

    // MARK: - Mark Story as Viewed

    /// R6 — seam injectable (tests) : le chemin réel enqueue dans l'outbox
    /// durable (`.markStoryViewed`, anchor = storyId pour le coalescing) au
    /// lieu du POST fire-and-forget historique — le « vu » survit à un
    /// kill/offline et se rejoue FIFO au reconnect via OutboxDispatcher.
    var markViewedOutboxEnqueuer: (String) async throws -> Void = { storyId in
        try await StoryViewModel.enqueueMarkStoryViewed(storyId)
    }

    /// Corps réel du seam ci-dessus — `nonisolated static` pour que la valeur
    /// PAR DÉFAUT de la propriété n'évalue rien d'actor-isolé (Swift 6 :
    /// « actor-isolated default value in a main actor-isolated context »).
    nonisolated static func enqueueMarkStoryViewed(_ storyId: String) async throws {
        let payload = MarkStoryViewedPayload(
            clientMutationId: ClientMutationId.generate(),
            storyId: storyId
        )
        _ = try await OfflineQueue.shared.enqueue(
            .markStoryViewed, payload: payload, conversationId: storyId
        )
        // Sans ce réveil explicite, la ligne dort `.pending` jusqu'à ce qu'une
        // mutation SANS RAPPORT (envoi, réaction) réveille le videur — la
        // pastille affichait « Synchronisation des vues story » en boucle sans
        // jamais se vider. C'était le SEUL site d'enfilement à ne pas le faire :
        // même correctif que `markAsRead` (cf. OutboxFlushTrigger).
        await OutboxFlushTrigger.flushNow()
    }

    /// C3 (unification des remontées, 2026-07-14) : chaque slide de story affiché émet
    /// UNE impression (non dédupliquée, `source: "story"`) pour CE post-slide — aligne
    /// `impressionCount` de la story sur le détail/réel (« chaque visionnage fait monter
    /// les impressions »). Volontairement SÉPARÉ de `markViewed` (vue UNIQUE, coalescée
    /// via l'outbox durable) car l'impression doit monter à CHAQUE visionnage, pas une
    /// seule fois. Fire & forget : l'échec réseau est loggé, jamais toasté (bruit de fond).
    func recordStoryImpression(storyId: String) {
        Task { [postService] in
            do {
                try await postService.recordImpression(postId: storyId, source: "story")
            } catch {
                Logger.stories.error(
                    "recordStoryImpression failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    func markViewed(storyId: String) {
        // Fire & forget : l'état « vu » local est posé optimistiquement (local-first).
        // L'échec réseau ne déclenche PAS de toast (marquer-vu est un effet de bord de
        // fond, pas une action utilisateur attendant un feedback — un toast serait du
        // bruit), mais il est désormais LOGGÉ (avant : catch vide → échec invisible,
        // ring « vu » localement mais jamais côté serveur → revert au prochain fetch).
        Task { [markViewedOutboxEnqueuer] in
            do {
                try await markViewedOutboxEnqueuer(storyId)
            } catch {
                Logger.stories.error(
                    "markViewed enqueue failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }

        // Update local state — `isViewed` est un `var` : on le flippe EN PLACE.
        // (Avant : reconstruction via init partiel qui droppait ~13 champs à leur
        // défaut — translations [Prisme cassé après visionnage], currentUserReactions,
        // chaîne de repost repostOfId/originalRepostOfId/repostAuthorName, audioUrl,
        // backgroundAudio, reaction/comment/share/view/repostCount. Et persistStoryCache
        // gravait l'état corrompu en cache → survie au cold-start.) Même pattern que
        // fetchStoriesFromNetwork (`var copy = story; copy.isViewed = true`).
        for i in storyGroups.indices {
            if let j = storyGroups[i].stories.firstIndex(where: { $0.id == storyId }) {
                var updated = storyGroups[i].stories
                updated[j].isViewed = true
                // R11 — horodatage local du vu (DateTime nullable > boolean seul).
                updated[j].viewedAt = Date()
                storyGroups[i] = storyGroups[i].with(stories: updated)
                persistStoryCache()
                // R5 — la story vient d'être VUE : garantir sa relecture
                // offline en protégeant ses médias de l'éviction LRU.
                pinStoryMediaForOfflineReplay(updated[j])
                return
            }
        }
    }

    /// Change le mode de visibilité d'une story (menu « Modifier la
    /// visibilité » de « Mes stories »).
    ///
    /// Écriture locale D'ABORD pour que le checkmark du menu bouge tout de
    /// suite, appel serveur ensuite, restauration de l'état exact d'avant si
    /// l'appel échoue — sinon l'UI affirmerait un changement que le serveur
    /// n'a jamais enregistré.
    ///
    /// Mutation EN PLACE (`visibility` et `visibilityUserIds` sont des `var`),
    /// jamais une reconstruction via init partielle : celle-ci droppait ~13
    /// champs à leur défaut et le cache gravait l'état corrompu (cf. le
    /// commentaire de `markViewed`).
    ///
    /// - Returns: `true` si le serveur a accepté le changement.
    func applyVisibility(storyId: String, visibility: String, userIds: [String]?) async -> Bool {
        guard let groupIndex = storyGroups.firstIndex(where: { $0.stories.contains { $0.id == storyId } }),
              let storyIndex = storyGroups[groupIndex].stories.firstIndex(where: { $0.id == storyId })
        else { return false }

        let previousVisibility = storyGroups[groupIndex].stories[storyIndex].visibility
        let previousUserIds = storyGroups[groupIndex].stories[storyIndex].visibilityUserIds

        write(visibility: visibility, userIds: userIds, groupIndex: groupIndex, storyIndex: storyIndex)

        do {
            _ = try await postService.update(
                postId: storyId,
                content: nil,
                visibility: visibility,
                visibilityUserIds: userIds,
                moodEmoji: nil,
                originalLanguage: nil,
                type: nil,
                removeMediaIds: nil
            )
            return true
        } catch {
            Logger.stories.error(
                "applyVisibility failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            // La story a pu disparaître (suppression temps réel) pendant l'appel :
            // relocaliser avant de restaurer plutôt que réutiliser des index périmés.
            if let g = storyGroups.firstIndex(where: { $0.stories.contains { $0.id == storyId } }),
               let s = storyGroups[g].stories.firstIndex(where: { $0.id == storyId }) {
                write(visibility: previousVisibility, userIds: previousUserIds, groupIndex: g, storyIndex: s)
            }
            return false
        }
    }

    private func write(visibility: String?, userIds: [String]?, groupIndex: Int, storyIndex: Int) {
        var stories = storyGroups[groupIndex].stories
        stories[storyIndex].visibility = visibility
        stories[storyIndex].visibilityUserIds = userIds
        storyGroups[groupIndex] = storyGroups[groupIndex].with(stories: stories)
        persistStoryCache()
    }

    // MARK: - Lookup Methods

    func storyGroupForUser(userId: String) -> StoryGroup? {
        storyGroups.first { $0.id == userId }
    }

    // MARK: - Archive auteur (« Mes stories », stories en cours ET passées)

    /// Draine `GET /posts/stories/mine` (archive complète — les stories ne
    /// sont plus jamais détruites côté serveur) et fusionne les stories
    /// manquantes dans le groupe de l'utilisateur courant. La page du tray
    /// borne son archive auteur à 7 j pour ne pas noyer les amis ;
    /// « Mes stories » lit ICI l'historique au-delà. Idempotent (dédup par id),
    /// drain borné à 10 pages de 50.
    func loadMyStoriesArchive() async {
        guard let user = AuthManager.shared.currentUser else { return }
        // Local-first : un seul drain par session — l'archive est immuable côté
        // serveur (les nouvelles stories arrivent par le flux temps réel /
        // publication locale, la republication par `applyRepublishedStory`).
        // Sans ce garde, chaque apparition de MyStoriesView relançait jusqu'à
        // 10 pages de refetch d'un contenu déjà présent.
        guard !myStoriesArchiveDrained else { return }
        myStoriesArchiveDrained = true
        var cursor: String? = nil
        var fetched: [APIPost] = []
        for _ in 0..<10 {
            guard let response = try? await storyService.listMine(cursor: cursor, limit: 50) else { break }
            fetched.append(contentsOf: response.data)
            guard response.pagination?.hasMore == true,
                  let next = response.pagination?.nextCursor else { break }
            cursor = next
        }
        guard !fetched.isEmpty,
              let archiveGroup = fetched.toStoryGroups(currentUserId: user.id).first(where: { $0.id == user.id })
        else {
            // Rien reçu (offline, erreur, archive vide) : rendre le drain
            // retentable — le garde ne doit verrouiller qu'un drain ABOUTI.
            myStoriesArchiveDrained = false
            return
        }

        if let idx = groupIndex(forUserId: user.id) {
            let existing = storyGroups[idx].stories
            let existingIds = Set(existing.map(\.id))
            let missing = archiveGroup.stories.filter { !existingIds.contains($0.id) }
            guard !missing.isEmpty else { return }
            let merged = (existing + missing).sorted { $0.createdAt < $1.createdAt }
            storyGroups[idx] = storyGroups[idx].with(stories: merged)
        } else {
            storyGroups.append(archiveGroup)
        }
        persistStoryCache()
    }

    /// Applique le résultat d'une republication (`POST /posts/:id/republish`) :
    /// la MÊME story (même id) repart avec des dates fraîches et un engagement
    /// remis à zéro — on remplace l'item en place et on re-trie le groupe.
    func applyRepublishedStory(_ post: APIPost) {
        guard let user = AuthManager.shared.currentUser,
              let refreshed = [post].toStoryGroups(currentUserId: user.id)
                  .first(where: { $0.id == user.id })?.stories.first
        else { return }

        if let gIdx = groupIndex(forUserId: user.id),
           let sIdx = storyGroups[gIdx].stories.firstIndex(where: { $0.id == refreshed.id }) {
            var stories = storyGroups[gIdx].stories
            stories[sIdx] = refreshed
            storyGroups[gIdx] = storyGroups[gIdx].with(stories: stories.sorted { $0.createdAt < $1.createdAt })
            persistStoryCache()
        } else {
            insertOrAppendStoryItem(refreshed, forAuthor: post.author)
        }
    }

    func groupIndex(forUserId userId: String) -> Int? {
        storyGroups.firstIndex { $0.id == userId }
    }

    func groupIndex(forStoryId storyId: String) -> Int? {
        storyGroups.firstIndex { group in
            group.stories.contains { $0.id == storyId }
        }
    }

    func hasStories(forUserId userId: String) -> Bool {
        storyGroups.contains { $0.id == userId }
    }

    func hasUnviewedStories(forUserId userId: String) -> Bool {
        storyGroups.first { $0.id == userId }?.hasUnviewed ?? false
    }

    /// Source unique de l'état d'anneau story d'un avatar, toutes surfaces.
    /// `.none` si l'utilisateur n'a aucune story active (groupe absent ou
    /// entièrement expiré), `.unread` s'il reste au moins une story non vue.
    func storyRingState(forUserId userId: String) -> StoryRingState {
        guard let group = storyGroups.first(where: { $0.id == userId }),
              !group.isFullyExpired() else { return .none }
        return group.hasUnviewed ? .unread : .read
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
    private func mutateUpload(id: String, _ body: (inout StoryUploadState) -> Void) {
        guard let idx = activeUploads.firstIndex(where: { $0.id == id }) else { return }
        body(&activeUploads[idx])
    }

    /// Démarre l'upload suivant si aucun ne monte. Les uploads se déroulent un
    /// à la fois, dans l'ordre de publication : le TUS d'une story multi-slides
    /// sature déjà la bande passante, les paralléliser ne ferait que les
    /// ralentir tous. Les entrées `.preparing` et `.failed` sont sautées.
    private func drainUploadsIfNeeded() {
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

    // MARK: - Optimistic offline stories (visibilité auteur hors-ligne)

    /// Préfixe d'id des stories optimistes (non encore publiées). Permet de les
    /// repérer pour la réconciliation et pour les préserver à travers un refetch
    /// réseau (`fetchStoriesFromNetwork`).
    static let pendingStoryIdPrefix = "pending_"

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

    // MARK: - Reprise d'un échec de publication (spec 2026-08-01, incrément 5)

    /// Seam injectable (tests) : retrait d'un item de l'historique d'échecs.
    /// Le chemin réel traverse `StoryPublishService` (queue actor singleton +
    /// rafraîchissement du `failedItems` publié) — un état global qu'une
    /// suite de tests ne doit pas muter.
    var failedItemDiscarder: (StoryPublishQueueItem) async -> Void = { item in
        await StoryPublishService.shared.discard(item)
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
    private func currentPendingStoryItems() -> [StoryItem] {
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

    // MARK: - Shared Upload Pipeline (UI-driven + queue-driven)

    /// Lightweight handle for a slide that just landed server-side, surfaced
    /// to callers of `runStoryUpload` so the UI path can prepend it to the
    /// story tray and the queue path can ignore it.
    fileprivate struct PublishedSlide {
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
    private func runStoryUpload(
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

            let canvasMentions = Self.declaredMentions(
                declared: upload.declaredMentions, effects: updatedEffects
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

    /// Ce qu'une publication ou une édition DÉCLARE au serveur : les modes que
    /// l'auteur a choisis, PLUS les badges posés sur le canevas.
    ///
    /// On ne dérive plus les `@handle` des objets texte : le serveur les relit
    /// lui-même (`content` ET `storyEffects.textObjects[].text`), et deux
    /// dériveurs finiraient par ne plus dire la même chose.
    ///
    /// Les badges, eux, ne peuvent venir que d'ici : le serveur les EXCLUT de
    /// sa relecture — `referenceUserId` est ce qui distingue un badge d'une
    /// phrase — et ils survivent à ce que la liste déclarée ne traverse pas
    /// toujours (reprise de brouillon, édition d'une story publiée). Sans cette
    /// union, une pastille visible sur la slide ne préviendrait personne.
    static func declaredMentions(
        declared: [PostMentionInput],
        effects: StoryEffects
    ) -> [PostMentionInput] {
        var seen = Set(declared.compactMap(\.userId))
        let badges = effects.textObjects.compactMap { object -> PostMentionInput? in
            guard let userId = object.referenceUserId,
                  seen.insert(userId).inserted else { return nil }
            return PostMentionInput.id(userId, display: .pinned)
        }
        return declared + badges
    }

    /// Variante prenant l'état VIVANT du composer plutôt que sa charge utile —
    /// le chemin d'édition n'a pas de `StoryUploadState` où la figer.
    static func declaredMentions(
        references: [ComposerReference],
        effects: StoryEffects
    ) -> [PostMentionInput] {
        declaredMentions(declared: ComposerReferences.payload(references), effects: effects)
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
    private struct LoadedMedia {
        let slideImages: [String: UIImage]
        let loadedImages: [String: UIImage]
        let loadedVideoURLs: [String: URL]
        let loadedAudioURLs: [String: URL]
    }

    private func loadMediaFromReferences(_ refs: [StoryMediaReference]) throws -> LoadedMedia {
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
    private func cleanupUploadTempFiles(_ upload: StoryUploadState) {
        for (_, url) in upload.loadedVideoURLs {
            try? FileManager.default.removeItem(at: url)
        }
        for (_, url) in upload.loadedAudioURLs {
            try? FileManager.default.removeItem(at: url)
        }
    }

    // MARK: - Delete Story

    func deleteStory(storyId: String) async -> Bool {
        do {
            try await storyService.delete(storyId: storyId)
            // Même chemin que les tombstones et l'event socket. Une suppression
            // explicite l'emporte sur l'exception accordée à l'auteur pour ses
            // propres stories expirées : c'est une volonté, pas un délai.
            purgeDeadStories(deletedIds: [storyId], includingExpired: false)
            return true
        } catch {
            return false
        }
    }
    // MARK: - Socket.IO Real-Time Updates

    /// Mimics the sort applied by `Array<APIPost>.toStoryGroups(currentUserId:)`
    /// so the tray ordering stays consistent between cold-start (REST fetch)
    /// and live updates (Socket.IO sink). Without this re-sort, a new story
    /// from an existing author would land in their group but the group would
    /// stay frozen at its initial tray position — the user would never see
    /// the "most recent author bubbles up to the front" behaviour they
    /// expect from Stories.
    private func sortStoryGroupsInPlace() {
        let currentUserId = AuthManager.shared.currentUser?.id
        storyGroups.sort { a, b in
            if let uid = currentUserId {
                if a.id == uid { return true }
                if b.id == uid { return false }
            }
            if a.hasUnviewed != b.hasUnviewed { return a.hasUnviewed }
            return (a.latestStory?.createdAt ?? .distantPast) > (b.latestStory?.createdAt ?? .distantPast)
        }
    }

    /// Insertion/merge d'un lot de groupes fraîchement convertis dans le tray
    /// — extrait du sink `storyCreated` (R4 inc.2) et partagé avec le fetch
    /// unitaire par postId. Contrat : auteur existant → append dédupliqué par
    /// id, stories triées ascendantes par createdAt (`latestStory` ==
    /// stories.last reste la plus fraîche) ; nouvel auteur → append puis
    /// `sortStoryGroupsInPlace` le promeut (self → tête, puis non-vu > vu,
    /// puis plus récent d'abord) ; persistance cache dans la foulée.
    /// `replacingExisting: false` (défaut, sink storyCreated) = append-dédup
    /// pur, comportement historique. `true` (delta-sync R8) = une story déjà
    /// connue est REMPLACÉE par sa version serveur (compteurs, traductions)
    /// avec la garde isViewed MONOTONE du sink storyUpdated / fetch full —
    /// un `isViewedByMe` serveur en retard ne dé-voit jamais un anneau local.
    func insertOrMergeStoryGroups(_ groups: [StoryGroup], replacingExisting: Bool = false) {
        let selfId = AuthManager.shared.currentUser?.id
        for newGroup in groups {
            if let idx = storyGroups.firstIndex(where: { $0.id == newGroup.id }) {
                let isOwnGroup = newGroup.id == selfId
                var stories = storyGroups[idx].stories
                for story in newGroup.stories {
                    if let j = stories.firstIndex(where: { $0.id == story.id }) {
                        guard replacingExisting else { continue }
                        var replacement = story
                        // Monotone raffinée : cède quand le CONTENU a été édité
                        // après la vue locale (reset d'engagement) — jamais pour
                        // ses propres stories (état « vu » client-only).
                        if stories[j].isViewed && !replacement.isViewed,
                           isOwnGroup || Self.shouldKeepLocalViewed(
                               localViewedAt: stories[j].viewedAt,
                               contentEditedAt: replacement.contentEditedAt
                           ) {
                            replacement.isViewed = true
                            replacement.viewedAt = stories[j].viewedAt
                        }
                        stories[j] = replacement
                    } else {
                        stories.append(story)
                    }
                }
                stories.sort { $0.createdAt < $1.createdAt }
                storyGroups[idx] = storyGroups[idx].with(stories: stories)
            } else {
                storyGroups.append(newGroup)
            }
        }
        sortStoryGroupsInPlace()
        persistStoryCache()
    }

    /// R8 inc.1 — curseur delta DÉRIVÉ du cache affiché : max(updatedAt) des
    /// stories. nil (cache legacy sans le champ, ou tray vide) → full fetch.
    static func deltaSince(for groups: [StoryGroup]) -> Date? {
        groups.flatMap(\.stories).compactMap(\.updatedAt).max()
    }

    /// Le jeu de références AUTORITAIRE d'une story — celui que la lecture
    /// UNITAIRE sert à son auteur, silencieuses comprises.
    ///
    /// Le tray en sert un jeu amputé : son select écarte les SILENCIEUSES
    /// (`postMentionInclude`, gateway). Republier celui-là au PUT les
    /// révoquerait sans que l'auteur les ait seulement vues, et retirerait du
    /// même coup l'accès au contenu aux personnes concernées. C'est donc cette
    /// relecture, et elle seule, qui autorise l'édition à REMPLACER l'ensemble
    /// déclaré.
    ///
    /// `nil` en échec — l'édition se taira, ce qui préserve.
    func fetchDeclaredReferences(postId: String) async -> [PostReference]? {
        do {
            return try await storyService.fetchPost(id: postId).mentions
        } catch {
            Logger.messages.error("[StoryVM] declared references fetch failed postId=\(postId, privacy: .public): \(error.localizedDescription)")
            return nil
        }
    }

    /// R4 inc.2 — le tray ignore ce post mais le point d'entrée connaît son
    /// id exact (bookmark, notification, deep link) : fetch unitaire LÉGER
    /// (`GET /posts/:id`) au lieu du refetch full-tray bloquant.
    /// `toStoryGroups` ne filtre pas l'expiry (contrat tray) — on écarte ici
    /// les stories mortes pour qu'un deep link périmé n'insère pas de groupe
    /// fantôme. Retourne true si la story est disponible après coup.
    func ensureStoryLoaded(postId: String) async -> Bool {
        if storyGroups.contains(where: { $0.stories.contains(where: { $0.id == postId }) }) {
            return true
        }
        let post: APIPost
        do {
            post = try await storyService.fetchPost(id: postId)
        } catch {
            Logger.messages.error("[StoryVM] ensureStoryLoaded fetch failed postId=\(postId, privacy: .public): \(error.localizedDescription)")
            return false
        }
        // Exception AUTEUR (cohérente avec `purgeDeadStories` et le
        // skip-resolver) : mes propres stories expirées restent chargeables —
        // deep link depuis « Mes stories » vers une story archivée.
        let myId = AuthManager.shared.currentUser?.id
        let groups = [post].toStoryGroups(currentUserId: myId)
            .compactMap { group -> StoryGroup? in
                let alive = group.id == myId
                    ? group.stories
                    // Task 9 (post-references) — une story expirée dont le lecteur
                    // détient un droit de référence ACCORDÉ reste ouvrable : le
                    // droit se DÉCLARE (`referenceAccess`), il ne se déduit jamais
                    // de `expiresAt`. Le serveur ne sert jamais dans ce payload une
                    // story où le lecteur n'a ni auteur ni référence (§3.5 spec) —
                    // ce filtre ne fait donc qu'éviter de faire disparaître une
                    // story DÉJÀ présente à son échéance.
                    : group.stories.filter { !$0.isExpired() || $0.referenceAccess == .granted }
                return alive.isEmpty ? nil : group.with(stories: alive)
            }
        guard !groups.isEmpty else { return false }
        insertOrMergeStoryGroups(groups)
        return true
    }

    /// R4 inc.2b — le chemin notification (`StoryNotificationTargetViewModel.load()`)
    /// a DÉJÀ fetché ce post en réseau et l'a mis en cache dans
    /// `storyService.cachedPost(id:)` (même singleton `StoryService.shared`
    /// en production) quelques millisecondes avant que ce viewer ne se
    /// monte. `ensureStoryLoaded` a un contrat cache-first VOLONTAIRE — il
    /// ne refetch jamais un postId déjà présent dans le tray (voir
    /// `test_ensureStoryLoaded_storyAlreadyInTray_skipsNetwork`) — donc un
    /// tray qui contient DÉJÀ ce post (compteurs périmés, ex: `commentCount`)
    /// n'était jamais rafraîchi par ce chemin, et un bouton dont
    /// l'apparition dépend de ce compteur (rail d'actions du viewer, voir
    /// `StoryActionRailPlan.showsComments`) restait manquant pour toute la
    /// lecture du slide. Cette méthode ne fait AUCUN réseau : elle relit
    /// uniquement le cache SDK déjà chaud et fusionne via
    /// `insertOrMergeStoryGroups(replacingExisting: true)` (même mécanisme
    /// que le delta-sync R8 inc.1) — no-op silencieux si rien n'est en
    /// cache (chemin normal, sans notification).
    func refreshFromCachedPostIfAvailable(postId: String) {
        guard let cached = storyService.cachedPost(id: postId) else { return }
        // Même exception auteur que `ensureStoryLoaded` ci-dessus.
        let myId = AuthManager.shared.currentUser?.id
        let groups = [cached].toStoryGroups(currentUserId: myId)
            .compactMap { group -> StoryGroup? in
                let alive = group.id == myId
                    ? group.stories
                    // Task 9 (post-references) — une story expirée dont le lecteur
                    // détient un droit de référence ACCORDÉ reste ouvrable : le
                    // droit se DÉCLARE (`referenceAccess`), il ne se déduit jamais
                    // de `expiresAt`. Le serveur ne sert jamais dans ce payload une
                    // story où le lecteur n'a ni auteur ni référence (§3.5 spec) —
                    // ce filtre ne fait donc qu'éviter de faire disparaître une
                    // story DÉJÀ présente à son échéance.
                    : group.stories.filter { !$0.isExpired() || $0.referenceAccess == .granted }
                return alive.isEmpty ? nil : group.with(stories: alive)
            }
        guard !groups.isEmpty else { return }
        insertOrMergeStoryGroups(groups, replacingExisting: true)
    }

    /// Set dédié aux sinks socket (le `cancellables` partagé porte aussi le
    /// sink de reconnexion posé à l'init) — garde d'idempotence resettable,
    /// même idiome que `FeedViewModel.subscribeToSocketEvents`.
    private var socketCancellables = Set<AnyCancellable>()

    func subscribeToSocketEvents() {
        // Un second appel (re-run du `.task` racine) dupliquerait les 12+
        // sinks — les handlers à delta ±1 (`applyPostReactionDelta`,
        // `applyStoryReactionDelta`) compteraient alors double.
        guard socketCancellables.isEmpty else { return }

        // rts-02 — rattrapage du tray au reconnect social : des stories ont pu
        // être créées ou supprimées pendant la coupure. Le curseur se calcule
        // au moment de l'ÉVÉNEMENT (pas à l'armement) — insertOrMergeStoryGroups,
        // la garde isViewed monotone, les tombstones et le fallback full sur
        // échec du delta garantissent déjà l'idempotence côté
        // fetchStoriesFromNetwork.
        socialSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self, !self.isLoading else { return }
                Task { await self.fetchStoriesFromNetwork(deltaSince: Self.deltaSince(for: self.storyGroups)) }
            }
            .store(in: &socketCancellables)

        socialSocket.storyCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                let currentUserId = AuthManager.shared.currentUser?.id
                self.insertOrMergeStoryGroups([apiPost].toStoryGroups(currentUserId: currentUserId))
            }
            .store(in: &socketCancellables)

        socialSocket.storyViewed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] viewedData in
                guard let self else { return }
                for i in self.storyGroups.indices {
                    if let j = self.storyGroups[i].stories.firstIndex(where: { $0.id == viewedData.storyId }) {
                        var updatedStories = self.storyGroups[i].stories
                        // viewCount = total autoritatif porté par l'event ; toujours appliqué.
                        // (Avant : ignoré → le compteur de vues restait stale chez l'auteur
                        // qui regarde sa propre story pendant que des viewers arrivent.)
                        updatedStories[j].viewCount = viewedData.viewCount
                        updatedStories[j].isViewed = true
                        self.storyGroups[i] = self.storyGroups[i].with(stories: updatedStories)
                        // Re-sort: `hasUnviewed` may flip when the last
                        // unviewed story is consumed, dropping the group
                        // below the "fresh" bubbles.
                        self.sortStoryGroupsInPlace()
                        self.persistStoryCache()
                        return
                    }
                }
            }
            .store(in: &socketCancellables)

        socialSocket.storyUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                let selfId = AuthManager.shared.currentUser?.id
                // Reset d'engagement (édition de contenu) : le serveur a effacé
                // vues et réactions — la story redevient non-vue pour les
                // viewers. Jamais pour l'auteur lui-même (son état « vu » est
                // client-only, recordView l'exclut côté serveur).
                let engagementReset = event.engagementReset ?? false
                let updated = [event.story].toStoryGroups(currentUserId: selfId)
                for updatedGroup in updated {
                    guard let groupIdx = self.storyGroups.firstIndex(where: { $0.id == updatedGroup.id }) else { continue }
                    let isOwnGroup = updatedGroup.id == selfId
                    var stories = self.storyGroups[groupIdx].stories
                    for newStory in updatedGroup.stories {
                        if let storyIdx = stories.firstIndex(where: { $0.id == newStory.id }) {
                            var replacement = newStory
                            // Local-first : `isViewed` est posé en optimiste par markViewed
                            // (fire-and-forget) ; le serveur peut lagger → un `isViewedByMe`
                            // stale dans story:updated reverterait l'anneau en « non-vu ».
                            // Viewed est MONOTONE (une fois vu, reste vu) — SAUF quand
                            // l'édition a remis l'engagement à zéro (flag de l'event, ou
                            // `contentEditedAt` postérieur à la vue locale pour le chemin
                            // REST). Même garde que fetchStoriesFromNetwork.
                            if stories[storyIdx].isViewed && !replacement.isViewed,
                               isOwnGroup || (!engagementReset && Self.shouldKeepLocalViewed(
                                   localViewedAt: stories[storyIdx].viewedAt,
                                   contentEditedAt: replacement.contentEditedAt
                               )) {
                                replacement.isViewed = true
                                replacement.viewedAt = stories[storyIdx].viewedAt
                            }
                            stories[storyIdx] = replacement
                        }
                    }
                    self.storyGroups[groupIdx] = self.storyGroups[groupIdx].with(stories: stories)
                    // L'anneau du groupe peut redevenir « non-vu » — même
                    // re-tri que storyViewed pour remonter la bulle fraîche.
                    self.sortStoryGroupsInPlace()
                }
                self.persistStoryCache()
            }
            .store(in: &socketCancellables)

        // Prisme realtime : traductions de texte de story par text-object.
        // Le gateway diffuse `story:translation-updated` (postId + textObjectIndex
        // + translations) après avoir traduit un overlay. On fusionne dans la story
        // en cache pour que le reader (qui résout via la chaine préférée) bascule
        // sur la langue demandée dès l'arrivée — branche le picker langue d'« Exploration »
        // au-delà des traductions déjà en cache (parité avec `storyUpdated`).
        socialSocket.storyTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                for groupIdx in self.storyGroups.indices {
                    var stories = self.storyGroups[groupIdx].stories
                    guard let storyIdx = stories.firstIndex(where: { $0.id == payload.postId }) else { continue }
                    stories[storyIdx] = stories[storyIdx].mergingTextObjectTranslations(
                        at: payload.textObjectIndex,
                        translations: payload.translations
                    )
                    self.storyGroups[groupIdx] = self.storyGroups[groupIdx].with(stories: stories)
                    self.persistStoryCache()
                    return
                }
            }
            .store(in: &socketCancellables)

        // Prisme realtime : traduction du CONTENU de la story (sa légende), que
        // le gateway diffuse via `post:translation-updated` — un événement
        // DISTINCT de `story:translation-updated` ci-dessus, qui ne porte que
        // les textes du canvas.
        //
        // Seul le feed s'y abonnait. Le lecteur ignorait donc la traduction
        // qu'il venait lui-même de demander : elle arrivait en base, mais la
        // story en mémoire gardait ses anciennes langues et la feuille
        // « Langues » laissait tourner son anneau indéfiniment sur une langue
        // pourtant traduite (constaté au simulateur le 2026-07-27, allemand
        // présent côté serveur et absent côté lecteur).
        socialSocket.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                for groupIdx in self.storyGroups.indices {
                    var stories = self.storyGroups[groupIdx].stories
                    guard let storyIdx = stories.firstIndex(where: { $0.id == payload.postId }) else { continue }
                    stories[storyIdx] = stories[storyIdx].mergingContentTranslation(
                        language: payload.language,
                        content: payload.translation.text
                    )
                    self.storyGroups[groupIdx] = self.storyGroups[groupIdx].with(stories: stories)
                    self.persistStoryCache()
                    return
                }
            }
            .store(in: &socketCancellables)

        // Même chemin de retrait que les tombstones du delta-sync : re-tri du
        // tray, réécriture du cache et libération des médias épinglés compris.
        // (L'ancien retrait en place ne faisait que sortir la story du tableau,
        // laissant ses médias pinnés sur disque jusqu'à l'échéance du pin.)
        socialSocket.storyDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.purgeDeadStories(deletedIds: [event.storyId], includingExpired: false)
            }
            .store(in: &socketCancellables)

        // === Real-time counter sync (user spec 2026-05-28) ===
        // When anyone comments / reacts to a story we already have in the
        // tray, update its denormalized counters in place. Without these
        // sinks the sidebar `storyCommentCount` / `storyReactionCount`
        // reset to the cached `StoryItem` value on every slide change —
        // the « brayan a commenté Belva mais on voit comments=0 »
        // symptom.

        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyStoryCommentCountDelta(postId: data.postId, newCount: data.commentCount)
            }
            .store(in: &socketCancellables)

        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                // `commentCount` autoritatif porté par l'event (parité avec commentAdded).
                // Avant : `-1` local qui dérivait sur events manqués / hors-ordre / doublons,
                // et asymétrique avec commentAdded (qui utilise déjà data.commentCount).
                self?.applyStoryCommentCountDelta(postId: data.postId, newCount: data.commentCount)
            }
            .store(in: &socketCancellables)

        socialSocket.postReactionSync
            .receive(on: DispatchQueue.main)
            .sink { [weak self] sync in
                guard let self else { return }
                self.mutateStoryItem(byPostId: sync.postId) { item in
                    item.reactionCount = sync.totalCount
                    item.currentUserReactions = sync.userReactions
                }
            }
            .store(in: &socketCancellables)

        // Optimistic deltas — the SDK ack already mutates the post, but
        // peers don't get a sync event; the *-added/*-removed broadcast is
        // their only signal. We use totalCount when present, otherwise we
        // step the counter ±1 around the user's currentUserReactions.
        socialSocket.postReactionAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyPostReactionDelta(event: event, delta: +1)
            }
            .store(in: &socketCancellables)

        socialSocket.postReactionRemoved
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyPostReactionDelta(event: event, delta: -1)
            }
            .store(in: &socketCancellables)

        // Realtime story reactions : le gateway émet `story:reacted`/`story:unreacted`
        // À LA STORY ROOM (viewers) — fan-out distinct des events POST (cf.
        // routes/posts/interactions.ts). Sans ces sinks, le compteur de réactions
        // d'une story en cours de visionnage ne bougeait pas en temps réel quand un
        // autre utilisateur réagissait/dé-réagissait (bug it.23, callback non branché).
        socialSocket.storyReacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyStoryReactionDelta(storyId: event.storyId, userId: event.userId,
                                              emoji: event.emoji, delta: +1)
            }
            .store(in: &socketCancellables)

        socialSocket.storyUnreacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyStoryReactionDelta(storyId: event.storyId, userId: event.userId,
                                              emoji: event.emoji, delta: -1)
            }
            .store(in: &socketCancellables)
    }

    /// Apply an authoritative `commentCount` snapshot to the matching story.
    /// Called by `comment:added` sinks — the gateway already incremented
    /// the denormalized counter and broadcast the new total.
    private func applyStoryCommentCountDelta(postId: String, newCount: Int) {
        mutateStoryItem(byPostId: postId) { item in
            item.commentCount = newCount
        }
    }

    /// Increment or decrement the story's `reactionCount` and toggle the
    /// current viewer's emoji presence in `currentUserReactions` if the
    /// event was triggered by this device.
    private func applyPostReactionDelta(event: SocketPostReactionUpdateEvent, delta: Int) {
        let myId = AuthManager.shared.currentUser?.id
        mutateStoryItem(byPostId: event.postId) { item in
            item.reactionCount = max(0, item.reactionCount + delta)
            if let myId, event.userId == myId {
                var mine = item.currentUserReactions ?? []
                if delta > 0 {
                    if !mine.contains(event.emoji) { mine.append(event.emoji) }
                } else {
                    mine.removeAll { $0 == event.emoji }
                }
                item.currentUserReactions = mine
            }
        }
    }

    /// Realtime delta for a STORY reaction (`story:reacted`/`story:unreacted` — fan-out
    /// distinct des events POST). L'optimiste du viewer vit dans son @State
    /// (`StoryViewerView.sendReaction` incrémente `storyReactionCount` localement,
    /// PAS `item.reactionCount`) ; l'écho de sa propre action fournit ici le +1 sur
    /// l'item, et le miroir absolu (`storyReactionCount = currentStory?.reactionCount`)
    /// écrase l'optimiste — les deux chemins convergent sans double-compte.
    /// Non-`private` pour permettre la vérification unitaire.
    func applyStoryReactionDelta(storyId: String, userId: String, emoji: String, delta: Int) {
        let myId = AuthManager.shared.currentUser?.id
        mutateStoryItem(byPostId: storyId) { item in
            item.reactionCount = max(0, item.reactionCount + delta)
            if let myId, userId == myId {
                var mine = item.currentUserReactions ?? []
                if delta > 0 {
                    if !mine.contains(emoji) { mine.append(emoji) }
                } else {
                    mine.removeAll { $0 == emoji }
                }
                item.currentUserReactions = mine
            }
        }
    }

    /// Locates the `StoryItem` carrying `postId` in any group and applies
    /// `mutation` in place. Persists the cache so the next cold start
    /// reflects the live counter. No-op when the story isn't in the tray
    /// (e.g. the user's own post that never feeds back into `getStories`).
    private func mutateStoryItem(byPostId postId: String, _ mutation: (inout StoryItem) -> Void) {
        for i in storyGroups.indices {
            guard let j = storyGroups[i].stories.firstIndex(where: { $0.id == postId }) else { continue }
            var stories = storyGroups[i].stories
            mutation(&stories[j])
            storyGroups[i] = storyGroups[i].with(stories: stories)
            persistStoryCache()
            return
        }
    }


    // MARK: - Helpers

    private func buildFeedMedia(from post: APIPost, fallback uploadResult: TusUploadResult?) -> [FeedMedia] {
        let apiMedia = (post.media ?? []).map { m in
            FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl, thumbHash: m.thumbHash,
                      thumbnailColor: MeeshyColors.brandPrimaryHex, width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
        }
        if !apiMedia.isEmpty { return apiMedia }
        if let uploaded = uploadResult {
            return [FeedMedia(id: uploaded.id, type: .image, url: uploaded.fileUrl,
                              thumbHash: uploaded.thumbHash, thumbnailColor: MeeshyColors.brandPrimaryHex,
                              width: uploaded.width, height: uploaded.height)]
        }
        return []
    }

    private func insertOrAppendStoryItem(_ item: StoryItem, forAuthor author: APIAuthor) {
        insertOrAppendStoryItem(
            item,
            authorId: author.id,
            authorName: author.name,
            authorAvatar: author.avatar
        )
    }

    /// Variante à champs primitifs : `APIAuthor` n'expose pas d'init public
    /// (memberwise interne au SDK), donc le chemin optimiste hors-ligne — qui
    /// construit l'auteur depuis `AuthManager.currentUser` — ne peut pas passer
    /// par la surcharge `APIAuthor`. Le corps est identique (insertion dédupliquée
    /// par id, création du groupe si absent).
    private func insertOrAppendStoryItem(_ item: StoryItem, authorId: String, authorName: String, authorAvatar: String?) {
        if let idx = storyGroups.firstIndex(where: { $0.id == authorId }) {
            var updated = storyGroups[idx].stories
            // Déduplication par id : un insert optimiste suivi de l'écho serveur /
            // socket (ou d'un 2e chemin de publish) ne doit JAMAIS produire deux
            // entrées identiques dans le groupe — sinon le viewer affiche la même
            // story deux fois (2 segments de progression identiques).
            if let existing = updated.firstIndex(where: { $0.id == item.id }) {
                updated[existing] = item
            } else {
                updated.append(item)
            }
            storyGroups[idx] = storyGroups[idx].with(stories: updated)
        } else {
            storyGroups.insert(StoryGroup(
                id: authorId,
                username: authorName,
                avatarColor: DynamicColorGenerator.colorForName(authorName),
                avatarURL: authorAvatar,
                stories: [item]
            ), at: 0)
        }
        persistStoryCache()
    }

    /// R12 inc.2 — TOUS les callers de ce wrapper sont des mutations locales
    /// ou des pushs socket (classification it.48, plan
    /// 2026-07-04-story-store-dirty-write-plan.md) : écriture DIRTY débouncée
    /// (L1 + markDirty → flush coalescé ~2 s), freshness PRÉSERVÉE — ces
    /// chemins n'ont pas re-validé le tray entier auprès du serveur, le
    /// prochain `.stale` doit toujours déclencher son refetch delta. Le SEUL
    /// write full + freshness-reset est le `save()` direct du fetch réseau
    /// complet (fetchStoriesFromNetwork). Fenêtre de perte ≤2 s sur kill dur
    /// assumée : cache dont la vérité est serveur ; le « vu » est durable via
    /// l'outbox markStoryViewed (R6), pas via ce cache.
    private func persistStoryCache() {
        let snapshot = storyGroups
        Task { await CacheCoordinator.shared.stories.mergeUpdate(for: Self.storiesCacheKey) { _ in snapshot } }
    }
}
