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
    /// Pixel size of the cached cover — 9:16, crisp enough for the tray ring avatar.
    static let renderSize = CGSize(width: 270, height: 480)

    /// Disk-cache key (in `CacheCoordinator.thumbnails`) for a story's local cover.
    /// Synthetic scheme so it never collides with a media-URL cache entry.
    static func cacheKey(storyId: String) -> String { "story-cover:\(storyId)" }

    /// Tray cover resolution order: locally-rendered composite (captures every layer)
    /// → server thumbnail → raw media URL → author avatar. Pure + testable.
    static func preferredCoverURLString(
        localCover: URL?,
        serverThumbnailUrl: String?,
        mediaUrl: String?,
        avatarURL: String?
    ) -> String? {
        if let localCover { return localCover.absoluteString }
        if let t = serverThumbnailUrl, !t.isEmpty { return t }
        if let u = mediaUrl, !u.isEmpty { return u }
        return avatarURL
    }
}

@MainActor
class StoryViewModel: ObservableObject, StoryPublishExecutor {
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

    @Published var storyGroups: [StoryGroup] = []
    @Published var isLoading = false
    @Published var isPublishing = false
    @Published var publishError: String?
    @Published var showStoryComposer = false
    @Published var activeUpload: StoryUploadState?
    private var uploadTask: Task<Void, Never>?

    private let storyService: StoryServiceProviding
    private let postService: PostServiceProviding
    private var cancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    private let api: APIClientProviding

    init(
        storyService: StoryServiceProviding = StoryService.shared,
        postService: PostServiceProviding = PostService.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        api: APIClientProviding = APIClient.shared
    ) {
        self.storyService = storyService
        self.postService = postService
        self.socialSocket = socialSocket
        self.api = api
        observeReconnectionForRetry()
    }

    // MARK: - StoryPublishExecutor conformance (Pilier 22 V3)

    /// Reconstructs an upload from a queue item and runs it to completion.
    /// Called by `StoryPublishService` when the queue dequeues an item
    /// (offline → online transition, app cold start with pending items, ...).
    ///
    /// Decodes the queued payload, materializes the local media files, and
    /// drives the shared `runStoryUpload` pipeline to completion. Headless:
    /// no UI mutations on `activeUpload` so the queue path can run from
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
            visibilityUserIds: item.visibilityUserIds ?? []
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
    /// Note: this only handles uploads still in `activeUpload` (process is
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
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    if case .failed = self.activeUpload?.phase {
                        self.retryUpload()
                    }
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
        var progress: Double
        var phase: UploadPhase

        let authorId: String
        let authorName: String
        let authorAvatar: String?

        let slides: [StorySlide]
        let slideImages: [String: UIImage]
        let loadedImages: [String: UIImage]
        let loadedVideoURLs: [String: URL]
        let loadedAudioURLs: [String: URL]
        let originalLanguage: String?
        let visibility: String
        let visibilityUserIds: [String]
        /// IDs of slide-Posts already created server-side. Tracked so that:
        /// (a) `retryUpload()` skips them (otherwise a partial-failure retry creates
        ///     duplicate slides — what was previously committed plus the same again),
        /// (b) `cancelUpload()` can DELETE them (otherwise a 5-slide story that
        ///     fails at slide 3 leaves slides 1-2 visible to friends as orphans).
        var publishedPostIds: [String] = []

        enum UploadPhase: Sendable {
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
            sortStoryGroupsInPlace()
            prefetchAllStoryMedia(storyGroups)
            return
        case .stale(let data, _):
            storyGroups = data
            sortStoryGroupsInPlace()
            prefetchAllStoryMedia(storyGroups)
            // R8 inc.1 — le refresh silencieux passe en DELTA quand le cache
            // porte un curseur updatedAt (sinon nil → full historique).
            let since = Self.deltaSince(for: data)
            Task { [weak self] in await self?.fetchStoriesFromNetwork(deltaSince: since) }
            return
        case .expired, .empty:
            break
        }

        isLoading = true
        await fetchStoriesFromNetwork()
        isLoading = false
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
                let response = try await storyService.list(cursor: nil, limit: 50, updatedSince: deltaSince)
                if response.success {
                    let deltaGroups = response.data.toStoryGroups(currentUserId: AuthManager.shared.currentUser?.id)
                    if !deltaGroups.isEmpty {
                        insertOrMergeStoryGroups(deltaGroups, replacingExisting: true)
                        prefetchAllStoryMedia(storyGroups)
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
            let response = try await storyService.list(cursor: nil, limit: 50)

            if response.success {
                var groups = response.data.toStoryGroups()

                // Preserve locally-viewed state for stories the API hasn't synced yet
                let locallyViewed = buildLocallyViewedSet()
                if !locallyViewed.isEmpty {
                    groups = groups.map { group in
                        let merged = group.stories.map { story in
                            guard !story.isViewed, locallyViewed.contains(story.id) else { return story }
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
            }
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
            await withTaskGroup(of: Void.self) { taskGroup in
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
                    await Self.prefetchStoryMediaURLs(urls, in: story, imageCache: imageCache, prerollPlayer: false)
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
        let username: String
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
        intro.bannerURL = user.banner
        intro.bannerThumbHash = user.bannerThumbHash
    }

    // MARK: - R5 Offline replay pin (story vue = médias non-évincables jusqu'à expiry)

    /// Store disque cible d'un pin de média story.
    enum StoryPinStore: Equatable {
        case video, audio, images
    }

    /// Échéance du pin : l'expiry de la story (le pin ne doit jamais lui
    /// survivre). Fallback aligné sur `toStoryGroups` : createdAt + 21 h.
    static func pinDeadline(for story: StoryItem) -> Date {
        story.expiresAt ?? story.createdAt.addingTimeInterval(21 * 3600)
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

    /// Prefetch les URLs (déjà filtrées) d'une story dans les stores disque + mémoire.
    private static func prefetchStoryMediaURLs(_ urls: [String], in story: StoryItem, imageCache: DiskCacheStore, prerollPlayer: Bool) async {
        for urlString in urls {
            // R7 — type effectif (déclaré corrigé par sniff d'extension) : un
            // mp4 mal classé ne doit plus atterrir dans le store `images`.
            let mediaType = StoryMediaStoreRouter.effectiveKind(
                declaredType: story.media.first(where: { $0.url == urlString })?.type,
                urlString: urlString
            )

            if mediaType == .video {
                // Peupler le store `video` (celui que le canvas relit), pas
                // `images` — sinon cache-miss + re-download au moment de jouer.
                _ = try? await CacheCoordinator.shared.video.data(for: urlString)
                if prerollPlayer, let url = URL(string: urlString) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
                }
            } else if mediaType == .audio {
                _ = try? await CacheCoordinator.shared.audio.data(for: urlString)
            } else {
                _ = await imageCache.image(for: urlString)
            }
        }
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

    // MARK: - Lookup Methods

    func storyGroupForUser(userId: String) -> StoryGroup? {
        storyGroups.first { $0.id == userId }
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

    // MARK: - Publish Story

    func publishStory(effects: StoryEffects, content: String?, image: UIImage?, originalLanguage: String? = nil, visibility: String = "FRIENDS") async {
        guard !isPublishing else { return }
        isPublishing = true
        publishError = nil

        do {
            var uploadResult: TusUploadResult? = nil

            if let image {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = api.authToken else {
                    publishError = "Authentication required"
                    isPublishing = false
                    return
                }

                let compressed = await MediaCompressor.shared.compressImage(image)
                let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                try compressed.data.write(to: tempURL)
                defer { try? FileManager.default.removeItem(at: tempURL) }

                let thumbHash = image.toThumbHash()
                let uploader = TusUploadManager(baseURL: baseURL)
                uploadResult = try await uploader.uploadFile(fileURL: tempURL, mimeType: compressed.mimeType, token: token, uploadContext: "story", thumbHash: thumbHash)
            }

            let post = try await postService.createStory(
                content: content,
                storyEffects: effects,
                visibility: visibility,
                visibilityUserIds: nil,
                originalLanguage: originalLanguage,
                mediaIds: uploadResult.map { [$0.id] },
                repostOfId: nil
            )

            let media = buildFeedMedia(from: post, fallback: uploadResult)
            let newItem = StoryItem(id: post.id, content: post.content, media: media,
                                     storyEffects: effects, createdAt: post.createdAt, isViewed: true)
            insertOrAppendStoryItem(newItem, forAuthor: post.author)
            showStoryComposer = false
            FeedbackToastManager.shared.showSuccess(String(localized: "story.published", defaultValue: "Story published", bundle: .main))
        } catch {
            publishError = "Failed to publish story"
            FeedbackToastManager.shared.showError(String(localized: "story.publishError", defaultValue: "Failed to publish story", bundle: .main))
        }

        isPublishing = false
    }
    // MARK: - Publish Single Story (throws)

    @MainActor
    func publishStorySingle(
        effects: StoryEffects,
        content: String?,
        image: UIImage?,
        loadedImages: [String: UIImage] = [:],
        loadedVideoURLs: [String: URL] = [:],
        originalLanguage: String? = nil,
        visibility: String = "FRIENDS"
    ) async throws {
        let serverOrigin = MeeshyConfig.shared.serverOrigin
        guard let baseURL = URL(string: serverOrigin),
              let token = api.authToken else {
            throw URLError(.userAuthenticationRequired)
        }
        let uploader = TusUploadManager(baseURL: baseURL)

        // 1. Upload background thumbnail (image de fond du slide)
        var uploadResult: TusUploadResult? = nil
        if let image {
            let thumbHash = image.toThumbHash()
            let compressed = await MediaCompressor.shared.compressImage(image)
            let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try compressed.data.write(to: tempURL)
            defer { try? FileManager.default.removeItem(at: tempURL) }
            uploadResult = try await uploader.uploadFile(
                fileURL: tempURL, mimeType: compressed.mimeType,
                token: token, uploadContext: "story", thumbHash: thumbHash
            )
        }

        // 2. Upload médias foreground (image/vidéo posés sur le canvas)
        var updatedEffects = effects
        var foregroundMediaIds: [String] = []
        if var mediaObjects = updatedEffects.mediaObjects {
            for i in mediaObjects.indices where mediaObjects[i].postMediaId.isEmpty {
                let obj = mediaObjects[i]
                if obj.kind == .video, let videoURL = loadedVideoURLs[obj.id] {
                    let result = try await uploader.uploadFile(
                        fileURL: videoURL, mimeType: "video/mp4",
                        token: token, uploadContext: "story"
                    )
                    mediaObjects[i].postMediaId = result.id
                    mediaObjects[i].mediaURL = result.fileUrl
                    foregroundMediaIds.append(result.id)
                } else if obj.kind == .image, let uiImage = loadedImages[obj.id] {
                    let fgThumbHash = uiImage.toThumbHash()
                    let compressed = await MediaCompressor.shared.compressImage(uiImage)
                    let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                    try compressed.data.write(to: tempURL)
                    defer { try? FileManager.default.removeItem(at: tempURL) }
                    let result = try await uploader.uploadFile(
                        fileURL: tempURL, mimeType: compressed.mimeType,
                        token: token, uploadContext: "story", thumbHash: fgThumbHash
                    )
                    mediaObjects[i].postMediaId = result.id
                    mediaObjects[i].mediaURL = result.fileUrl
                    foregroundMediaIds.append(result.id)
                }
            }
            updatedEffects.mediaObjects = mediaObjects
        }

        // 3. Composer la liste complète des mediaIds (thumbnail + foreground)
        var allMediaIds: [String] = []
        if let id = uploadResult?.id { allMediaIds.append(id) }
        allMediaIds.append(contentsOf: foregroundMediaIds)

        let post = try await postService.createStory(
            content: content,
            storyEffects: updatedEffects,
            visibility: visibility,
            visibilityUserIds: nil,
            originalLanguage: originalLanguage,
            mediaIds: allMediaIds.isEmpty ? nil : allMediaIds,
            repostOfId: nil
        )

        let media = buildFeedMedia(from: post, fallback: uploadResult)
        let newItem = StoryItem(id: post.id, content: post.content, media: media,
                                 storyEffects: updatedEffects, createdAt: post.createdAt, isViewed: true)
        insertOrAppendStoryItem(newItem, forAuthor: post.author)
    }

    // MARK: - Background Publishing

    func publishStoryInBackground(
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL] = [:],
        originalLanguage: String? = nil,
        visibility: String = "FRIENDS",
        visibilityUserIds: [String] = []
    ) {
        guard activeUpload == nil else { return }

        // Offline-first: route through StoryPublishQueue instead of TUS so
        // the publish survives a cold start and reconnect. The queue handler
        // (registered via StoryPublishService.setExecutor in RootView)
        // replays via executeQueuedPublish on reconnect, reusing the same
        // runStoryUpload pipeline as the online path.
        if NetworkMonitor.shared.isOffline {
            Task { [weak self] in
                await self?.enqueueStoryForOfflinePublish(
                    slides: slides,
                    slideImages: slideImages,
                    loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs,
                    loadedAudioURLs: loadedAudioURLs,
                    originalLanguage: originalLanguage,
                    visibility: visibility,
                    visibilityUserIds: visibilityUserIds
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
            progress: 0,
            phase: .uploading,
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
            visibilityUserIds: visibilityUserIds
        )
        activeUpload = upload
        showStoryComposer = false

        // E5 — write-ahead : la MÊME persistance que le chemin offline court
        // AVANT l'upload, marquée in-flight pour que le drain (reconnect) ne
        // double-publie pas pendant que l'upload UI tourne. Un kill efface le
        // marqueur volatile → le drain de boot reprend l'item : une story en
        // cours de publication ne peut plus se perdre. Séquencé (persist PUIS
        // launch) pour que le succès puisse toujours retirer son intent.
        Task { [weak self] in
            guard let self else { return }
            if let intent = await self.persistPublishIntentToQueue(
                slides: slides,
                slideImages: slideImages,
                loadedImages: loadedImages,
                loadedVideoURLs: loadedVideoURLs,
                loadedAudioURLs: loadedAudioURLs,
                originalLanguage: originalLanguage,
                visibility: visibility,
                visibilityUserIds: visibilityUserIds
            ) {
                await StoryPublishQueue.shared.markInFlight(intent.queueId)
                self.activeUpload?.queueId = intent.queueId
                self.activeUpload?.queueTempStoryId = intent.tempStoryId
            }
            self.launchUploadTask()
        }
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
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL] = [:],
        originalLanguage: String? = nil,
        visibility: String = "FRIENDS",
        visibilityUserIds: [String] = []
    ) async {
        guard let intent = await persistPublishIntentToQueue(
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs,
            loadedAudioURLs: loadedAudioURLs,
            originalLanguage: originalLanguage,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds
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
    }

    /// E5 — cœur de persistance du publish (write-ahead) partagé par les DEUX
    /// chemins : offline (enqueue + UX optimiste ci-dessus) et online
    /// (`publishStoryInBackground` persiste AVANT de lancer l'upload, marque
    /// l'item in-flight, le retire au succès — un kill mid-upload laisse
    /// l'item en queue, repris au drain de boot). Retourne les ids de l'item
    /// persisté, `nil` si l'encodage échoue.
    func persistPublishIntentToQueue(
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL],
        originalLanguage: String? = nil,
        visibility: String,
        visibilityUserIds: [String]
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
        
        var mediaReferences: [StoryMediaReference] = []

        for (id, image) in allImages {
            let fileName = "\(id).jpg"
            let dest = offlineDir.appendingPathComponent(fileName)
            if let data = image.jpegData(compressionQuality: 0.85) {
                try? data.write(to: dest)
                mediaReferences.append(StoryMediaReference(elementId: id, mediaType: "image", localFilePath: dest.path))
            }
        }

        for (id, url) in loadedVideoURLs {
            let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension
            let fileName = "\(id).\(ext)"
            let dest = offlineDir.appendingPathComponent(fileName)
            try? fm.copyItem(at: url, to: dest)
            mediaReferences.append(StoryMediaReference(elementId: id, mediaType: "video", localFilePath: dest.path))
        }

        for (id, url) in loadedAudioURLs {
            let ext = url.pathExtension.isEmpty ? "m4a" : url.pathExtension
            let fileName = "\(id).\(ext)"
            let dest = offlineDir.appendingPathComponent(fileName)
            try? fm.copyItem(at: url, to: dest)
            mediaReferences.append(StoryMediaReference(elementId: id, mediaType: "audio", localFilePath: dest.path))
        }

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
            repostOfId: nil,
            mediaReferences: mediaReferences,
            tempStoryId: tempStoryId,
            visibilityUserIds: visibilityUserIds,
            originalLanguage: originalLanguage
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
            if let cover = StorySlideRenderer.renderComposite(
                slide: slide,
                bgImage: slideImages[slide.id],
                loadedImages: loadedImages,
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

    private func launchUploadTask() {
        guard let upload = activeUpload else { return }

        uploadTask = Task { [weak self] in
            guard let self else { return }
            do {
                _ = try await self.runStoryUpload(
                    upload,
                    onProgress: { [weak self] progress in
                        self?.activeUpload?.progress = progress
                    },
                    onPhase: { [weak self] phase in
                        self?.activeUpload?.phase = phase
                    },
                    onPublishedSlide: { [weak self] published in
                        self?.activeUpload?.publishedPostIds.append(published.post.id)
                        self?.insertOrAppendStoryItem(
                            published.item, forAuthor: published.post.author
                        )
                    }
                )

                // Upload complete — cleanup temp files now
                self.cleanupUploadTempFiles(upload)
                // E5 — l'upload online a abouti : retirer l'intent write-ahead
                // (queue + dossier médias), sinon le boot suivant re-publierait.
                if let queueId = self.activeUpload?.queueId {
                    let tempId = self.activeUpload?.queueTempStoryId
                    Task.detached {
                        await StoryPublishQueue.shared.dequeue(queueId)
                        if let tempId { Self.removeOfflineQueueMediaDirectory(tempStoryId: tempId) }
                    }
                }
                self.activeUpload = nil
                self.uploadTask = nil
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "story.published", defaultValue: "Story published", bundle: .main))
            } catch {
                if !Task.isCancelled {
                    self.activeUpload?.phase = .failed(error.localizedDescription)
                    FeedbackToastManager.shared.showError(String(localized: "story.publishError", defaultValue: "Failed to publish story", bundle: .main))
                    // Don't cleanup temp files on failure — retry may need them
                }
            }
        }
    }

    // MARK: - Shared Upload Pipeline (UI-driven + queue-driven)

    /// Lightweight handle for a slide that just landed server-side, surfaced
    /// to callers of `runStoryUpload` so the UI path can prepend it to the
    /// story tray and the queue path can ignore it.
    fileprivate struct PublishedSlide {
        let post: APIPost
        let item: StoryItem
    }

    /// Headless story upload pipeline shared by:
    ///   1. `launchUploadTask` (composer flow) — wraps progress/phase/published
    ///       callbacks to drive the `activeUpload` banner and tray prepend.
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
                    token: token, uploadContext: "story", thumbHash: thumbHash
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
                            token: token, uploadContext: "story"
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
                            token: token, uploadContext: "story", thumbHash: fgThumbHash
                        )
                        // Seed the image cache under the server URL — metadata-only
                        // reconciliation: viewer gets a cache hit, never re-downloads.
                        await CacheCoordinator.shared.images.adoptImage(localFile: tempURL, for: result.fileUrl)
                        mediaObjects[i].postMediaId = result.id
                        mediaObjects[i].mediaURL = result.fileUrl
                        foregroundMediaIds.append(result.id)
                    }
                    mediaIdx += 1
                    let mediaProgress = Double(mediaIdx) / Double(max(1, mediaCount))
                    onProgress(baseProgress + (0.30 + mediaProgress * 0.50) * slideShare)
                }
                updatedEffects.mediaObjects = mediaObjects
            }

            if var audioObjects = updatedEffects.audioPlayerObjects {
                os.Logger.storyAudio.info(
                    "publish slide=\(slide.id, privacy: .public) preUpload audioCount=\(audioObjects.count) loadedAudioKeys=\(upload.loadedAudioURLs.keys.joined(separator: ","), privacy: .public)"
                )
                for i in audioObjects.indices where audioObjects[i].postMediaId.isEmpty {
                    guard !Task.isCancelled else { return newPostIds }
                    let obj = audioObjects[i]
                    guard let audioURL = upload.loadedAudioURLs[obj.id] ?? upload.loadedVideoURLs[obj.id] else {
                        os.Logger.storyAudio.error(
                            "publish audio URL missing audioId=\(obj.id, privacy: .public) — clip will be uploaded but unplayable (postMediaId stays empty)"
                        )
                        continue
                    }
                    let result = try await uploader.uploadFile(
                        fileURL: audioURL, mimeType: "audio/mp4",
                        token: token, uploadContext: "story"
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

            let post = try await postService.createStory(
                content: slide.content,
                storyEffects: updatedEffects,
                visibility: upload.visibility,
                visibilityUserIds: upload.visibilityUserIds,
                originalLanguage: upload.originalLanguage,
                mediaIds: allMediaIds.isEmpty ? nil : allMediaIds,
                repostOfId: nil
            )

            newPostIds.append(post.id)

            // Local-first cover (hybrid Phase 1): render the FULL composite of this
            // slide — text + drawing + media + stickers + filter, including a video
            // background's poster frame (it.26) — and cache it under the published
            // story id. The tray prefers it so the author instantly sees their fully
            // composed story, instead of the server thumbnail (raw bg, no overlays).
            if let cover = StorySlideRenderer.renderComposite(
                slide: slide,
                bgImage: upload.slideImages[slide.id],
                loadedImages: upload.loadedImages,
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

    func retryUpload() {
        guard case .failed = activeUpload?.phase else { return }
        activeUpload?.progress = 0
        activeUpload?.phase = .uploading
        launchUploadTask()
    }

    func cancelUpload() {
        if let upload = activeUpload {
            cleanupUploadTempFiles(upload)
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
        }
        // E5 — annulation EXPLICITE : l'intent write-ahead part avec (sinon la
        // story annulée ressusciterait au prochain boot via le drain de queue).
        if let queueId = activeUpload?.queueId {
            let tempId = activeUpload?.queueTempStoryId
            Task.detached {
                await StoryPublishQueue.shared.dequeue(queueId)
                if let tempId { Self.removeOfflineQueueMediaDirectory(tempStoryId: tempId) }
            }
        }
        uploadTask?.cancel()
        uploadTask = nil
        activeUpload = nil
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

            // Remove from local state
            for i in storyGroups.indices {
                if let j = storyGroups[i].stories.firstIndex(where: { $0.id == storyId }) {
                    var updated = storyGroups[i].stories
                    updated.remove(at: j)
                    if updated.isEmpty {
                        storyGroups.remove(at: i)
                    } else {
                        storyGroups[i] = storyGroups[i].with(stories: updated)
                    }
                    break
                }
            }
            persistStoryCache()
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
        for newGroup in groups {
            if let idx = storyGroups.firstIndex(where: { $0.id == newGroup.id }) {
                var stories = storyGroups[idx].stories
                for story in newGroup.stories {
                    if let j = stories.firstIndex(where: { $0.id == story.id }) {
                        guard replacingExisting else { continue }
                        var replacement = story
                        if stories[j].isViewed && !replacement.isViewed {
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
        let groups = [post].toStoryGroups(currentUserId: AuthManager.shared.currentUser?.id)
            .compactMap { group -> StoryGroup? in
                let alive = group.stories.filter { !$0.isExpired() }
                return alive.isEmpty ? nil : group.with(stories: alive)
            }
        guard !groups.isEmpty else { return false }
        insertOrMergeStoryGroups(groups)
        return true
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
                let updated = [event.story].toStoryGroups(currentUserId: AuthManager.shared.currentUser?.id)
                for updatedGroup in updated {
                    guard let groupIdx = self.storyGroups.firstIndex(where: { $0.id == updatedGroup.id }) else { continue }
                    var stories = self.storyGroups[groupIdx].stories
                    for newStory in updatedGroup.stories {
                        if let storyIdx = stories.firstIndex(where: { $0.id == newStory.id }) {
                            var replacement = newStory
                            // Local-first : `isViewed` est posé en optimiste par markViewed
                            // (fire-and-forget) ; le serveur peut lagger → un `isViewedByMe`
                            // stale dans story:updated reverterait l'anneau en « non-vu ».
                            // Viewed est MONOTONE (une fois vu, reste vu). Même garde que
                            // fetchStoriesFromNetwork (buildLocallyViewedSet) appliquée ici
                            // au chemin socket pour éviter la divergence REST/temps-réel.
                            if stories[storyIdx].isViewed && !replacement.isViewed {
                                replacement.isViewed = true
                            }
                            stories[storyIdx] = replacement
                        }
                    }
                    self.storyGroups[groupIdx] = self.storyGroups[groupIdx].with(stories: stories)
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

        socialSocket.storyDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                for i in self.storyGroups.indices {
                    let filtered = self.storyGroups[i].stories.filter { $0.id != event.storyId }
                    if filtered.count != self.storyGroups[i].stories.count {
                        if filtered.isEmpty {
                            self.storyGroups.remove(at: i)
                        } else {
                            self.storyGroups[i] = self.storyGroups[i].with(stories: filtered)
                        }
                        // Tray order can shift when a group loses its
                        // last unviewed story or disappears altogether.
                        self.sortStoryGroupsInPlace()
                        self.persistStoryCache()
                        return
                    }
                }
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
    /// distinct des events POST). La réaction propre est fire-and-forget (`sendReaction`
    /// n'incrémente pas en optimiste), donc l'écho de sa propre action fournit le +1 sans
    /// double-compte. Non-`private` pour permettre la vérification unitaire.
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
