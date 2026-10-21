import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// `LanguageProviding` and `AuthManagerLanguageProvider` were extracted to
// `Features/Main/Services/LanguageProviding.swift` so PostDetailViewModel /
// BookmarksViewModel can depend on them without importing FeedViewModel.

@MainActor
class FeedViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true
    @Published var hasLoaded = false
    @Published var error: String?

    /// Number of new posts received via Socket.IO while the user is scrolled down.
    /// Reset to 0 when the user taps the "New posts" banner or pulls to refresh.
    @Published var newPostsCount: Int = 0
    @Published var publishError: String?
    @Published var publishSuccess: Bool = false

    var nextCursor: String?
    let api: APIClientProviding
    let offlineQueue: OfflineQueueing
    let feedCache: any FeedCacheStoring
    let limit = 20
    private let cacheSaver: FeedCacheSaver
    private lazy var mediaPrefetcher = FeedMediaPrefetcher(posts: { [weak self] in self?.posts ?? [] })
    private var cancellables = Set<AnyCancellable>()
    /// Subscriptions owned by `subscribeToSocketEvents()` only — kept
    /// separate from the general `cancellables` set so the
    /// `cancellables.isEmpty` guard isn't tripped by init-time
    /// subscriptions like `observePreferredLanguageChanges()`. The
    /// `unsubscribeFromSocketEvents()` removes only this set so the
    /// language-change observer keeps living across socket re-subscribes.
    var socketCancellables = Set<AnyCancellable>()
    let socialSocket: SocialSocketProviding
    let postService: PostServiceProviding
    private let languageProvider: LanguageProviding
    var isFeedLoadInProgress = false
    /// Avance quand la liste repart de la page 1 (tirer pour rafraîchir,
    /// premier chargement). Une page « suivante » demandée AVANT et revenue
    /// APRÈS est jetée : collée derrière la nouvelle page 1, elle sautait les
    /// pages du milieu pour toujours.
    var feedGeneration = 0
    /// rts-01 — distingue le PREMIER armement de `subscribeToSocketEvents()`
    /// (la vue appelle déjà `loadFeed()` dans son `.task` si `posts.isEmpty`,
    /// pas de fetch redondant) d'un RÉ-armement après
    /// `unsubscribeFromSocketEvents()` (room quittée ET sinks désarmés hors
    /// écran — sans refetch explicite, rien ne rattrape le trou).
    var hasSubscribedOnce = false
    /// Tracks postIds whose comments are currently being prefetched, to coalesce
    /// duplicate calls triggered by repeated cell .onAppear events.
    var prefetchingComments: Set<String> = []
    /// PostIds dont le texte affiché a été fixé par une bascule MANUELLE du
    /// lecteur (`setTranslationOverride`, tap sur un drapeau). Une traduction
    /// arrivant ensuite par socket (#6531) merge dans `translations` mais ne
    /// doit PAS re-résoudre l'affichage — sinon le choix explicite du lecteur
    /// serait écrasé par la prochaine langue reçue. `clearTranslationOverride`
    /// (retour au Prisme) retire le postId de cet ensemble.
    var manualTranslationOverrides: Set<String> = []

    // MARK: - Persistence Layer

    private(set) var feedStore: FeedStore?
    private(set) var feedSocketHandler: FeedSocketHandler?
    var feedPersistence: FeedPersistenceActor?

    init(
        api: APIClientProviding = APIClient.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        postService: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        feedCache: any FeedCacheStoring = SharedFeedCache()
    ) {
        self.api = api
        self.socialSocket = socialSocket
        self.postService = postService
        self.languageProvider = languageProvider
        self.offlineQueue = offlineQueue
        self.feedCache = feedCache
        self.cacheSaver = FeedCacheSaver(feedCache: feedCache)
        observePreferredLanguageChanges()
    }

    /// B2 (Prisme Linguistique) — when the viewer's preferred-content
    /// languages change mid-session (Settings edit), re-resolve every
    /// already-mapped FeedPost. The `translations` dict stored on each
    /// post is enough; no network re-fetch is needed.
    ///
    /// Observed on `AuthManager.shared.currentUserPublisher` (the canonical
    /// source-of-truth — `LanguageProviding` is reactive too but exposes
    /// no publisher). Distinct duplicate filter avoids spurious work on
    /// unrelated `currentUser` mutations (e.g. avatar change).
    private func observePreferredLanguageChanges() {
        AuthManager.shared.currentUserPublisher
            .removeDuplicates { old, new in
                old?.systemLanguage == new?.systemLanguage
                && old?.regionalLanguage == new?.regionalLanguage
                && old?.customDestinationLanguage == new?.customDestinationLanguage
            }
            .dropFirst()
            .sink { [weak self] _ in
                guard let self else { return }
                let langs = self.preferredLanguages
                self.posts = self.posts.map { $0.resolved(preferredLanguages: langs) }
            }
            .store(in: &cancellables)
    }

    /// Wire persistence store and socket handler for GRDB-backed feed.
    /// Call once after init when the dependency container is available.
    func setupPersistence(store: FeedStore, socketHandler: FeedSocketHandler, persistence: FeedPersistenceActor) {
        self.feedStore = store
        self.feedSocketHandler = socketHandler
        self.feedPersistence = persistence
        socketHandler.arm()
    }

    var preferredLanguages: [String] {
        languageProvider.preferredLanguages
    }

    // MARK: - Media Prefetch

    func prefetchMediaForPost(_ postId: String) {
        mediaPrefetcher.prefetchMediaForPost(postId)
    }

    func prefetchMedia(around index: Int) {
        mediaPrefetcher.prefetchMedia(around: index)
    }

    nonisolated static func shouldPrefetchFeedMedia(
        kind: FeedMediaType,
        hasThumbnail: Bool,
        allowImage: Bool,
        allowVideo: Bool,
        allowAudio: Bool
    ) -> Bool {
        FeedMediaPrefetcher.shouldPrefetchFeedMedia(
            kind: kind,
            hasThumbnail: hasThumbnail,
            allowImage: allowImage,
            allowVideo: allowVideo,
            allowAudio: allowAudio
        )
    }

    func debouncedCacheSave() {
        cacheSaver.save(posts)
    }
}
