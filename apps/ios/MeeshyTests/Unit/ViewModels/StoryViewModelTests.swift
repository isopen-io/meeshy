import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class StoryViewModelTests: XCTestCase {

    private var sut: StoryViewModel!
    private var mockStoryService: MockStoryService!
    private var mockPostService: MockPostService!
    private var mockSocket: MockSocialSocket!
    private var mockAPI: MockAPIClientForApp!
    private var cancellables: Set<AnyCancellable>!
    /// Suite jetable : cette suite publie une dizaine de fois, et
    /// `UserDefaults.standard` est celui de l'app hôte — la préférence
    /// d'audience écrite ici serait le défaut du composer au lancement suivant.
    private var defaultsSuiteName: String!
    private var defaults: UserDefaults!

    override func setUp() async throws {
        try await super.setUp()
        // `publishStoryInBackground` branches on the LIVE `NetworkMonitor.shared.isOffline`
        // (not injected). The simulator's real network state is non-deterministic, so when
        // it reports offline these tests take the enqueue branch that never sets
        // `activeUpload` and flake. Force the singleton online and flush the async state
        // update onto the main queue before the test body runs.
        NetworkMonitor.shared.simulateOnline()
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        mockStoryService = MockStoryService()
        mockPostService = MockPostService()
        mockSocket = MockSocialSocket()
        mockAPI = MockAPIClientForApp()
        cancellables = []
        defaultsSuiteName = "StoryViewModelTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuiteName)
        sut = StoryViewModel(
            storyService: mockStoryService,
            postService: mockPostService,
            socialSocket: mockSocket,
            api: mockAPI,
            visibilityStore: StoryVisibilityPreferenceStore(defaults: defaults)
        )
    }

    override func tearDown() async throws {
        // Cette suite publie : sans purge, la queue de publication, les dossiers
        // médias hors-ligne et le cache du tray restent VISIBLES dans l'app au
        // lancement suivant (leçon `reference_outbox_db_path_and_test_residue`).
        await StoryPublishFixtureCleanup.purge(sut, defaults: defaults)
        defaults.removePersistentDomain(forName: defaultsSuiteName)
        defaults = nil
        defaultsSuiteName = nil
        cancellables = nil
        sut = nil
        mockStoryService = nil
        mockPostService = nil
        mockSocket = nil
        mockAPI = nil
        try await super.tearDown()
    }

    // MARK: - Factory Helpers

    private static func makeStoryAPIPost(
        id: String = "story-1",
        content: String? = "Story content",
        authorId: String = "author-1",
        authorUsername: String = "alice",
        createdAt: String = "2026-01-15T12:00:00.000Z",
        expiresAt: String? = "2026-01-16T09:00:00.000Z",
        commentCount: Int? = nil,
        referenceAccess: ReferenceAccess? = nil
    ) -> APIPost {
        let expiresAtJSON = expiresAt.map { "\"\($0)\"" } ?? "null"
        let contentJSON = content.map { "\"\($0)\"" } ?? "null"
        let commentCountJSON = commentCount.map { ", \"commentCount\": \($0)" } ?? ""
        let referenceAccessJSON = referenceAccess.map { ", \"referenceAccess\": \"\($0.rawValue)\"" } ?? ""
        return JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STORY",
            "content": \(contentJSON),
            "createdAt": "\(createdAt)",
            "expiresAt": \(expiresAtJSON),
            "author": {"id": "\(authorId)", "username": "\(authorUsername)"}\(commentCountJSON)\(referenceAccessJSON)
        }
        """)
    }

    private static func makeStoriesResponse(
        posts: [APIPost]
    ) -> PaginatedAPIResponse<[APIPost]> {
        JSONStub.decode("""
        {"success":true,"data":\(storyPostsJSON(posts)),"pagination":null,"error":null}
        """)
    }

    /// Expiry hors d'atteinte de l'horloge du runner : le chemin delta purge les
    /// stories périmées, donc un fixture daté du passé disparaîtrait avant
    /// l'assertion — et une date « aujourd'hui + n » ferait dépendre le témoin
    /// de la date d'exécution.
    private static let farFutureExpiry = "2099-01-01T00:00:00.000Z"

    /// Page de tray complète : `pagination` + `meta`, les deux blocs que le
    /// drain lit. `makeStoriesResponse` ci-dessus reste la forme sans pagination
    /// (ce que rendait un serveur d'avant ces champs).
    private static func makeStoriesPage(
        posts: [APIPost] = [],
        hasMore: Bool = false,
        nextCursor: String? = nil,
        deletedStoryIds: [String] = [],
        deletedStoryIdsTruncated: Bool = false
    ) -> PaginatedAPIResponse<[APIPost]> {
        let cursorJSON = nextCursor.map { "\"\($0)\"" } ?? "null"
        let deletedJSON = deletedStoryIds.map { "\"\($0)\"" }.joined(separator: ",")
        return JSONStub.decode("""
        {"success":true,"data":\(storyPostsJSON(posts)),\
        "pagination":{"limit":50,"hasMore":\(hasMore),"nextCursor":\(cursorJSON)},\
        "error":null,\
        "meta":{"deletedStoryIds":[\(deletedJSON)],"deletedStoryIdsTruncated":\(deletedStoryIdsTruncated)}}
        """)
    }

    private static func storyPostsJSON(_ posts: [APIPost]) -> String {
        let items = posts.map { p in
            let contentJSON = p.content.map { "\"\($0)\"" } ?? "null"
            let expiresAtJSON: String
            if let e = p.expiresAt {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                expiresAtJSON = "\"\(formatter.string(from: e))\""
            } else {
                expiresAtJSON = "null"
            }
            let createdAtFormatter = ISO8601DateFormatter()
            createdAtFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let createdAtStr = createdAtFormatter.string(from: p.createdAt)
            return """
            {"id":"\(p.id)","type":"STORY","content":\(contentJSON),"createdAt":"\(createdAtStr)","expiresAt":\(expiresAtJSON),"author":{"id":"\(p.author.id)","username":"\(p.author.username ?? "user")"}}
            """
        }
        return "[\(items.joined(separator: ","))]"
    }

    private func makeStoryGroup(
        userId: String = "user-1",
        username: String = "alice",
        stories: [StoryItem] = []
    ) -> StoryGroup {
        StoryGroup(
            id: userId,
            username: username,
            avatarColor: "FF2E63",
            stories: stories.isEmpty ? [makeStoryItem()] : stories
        )
    }

    private func makeStoryItem(
        id: String = "item-1",
        content: String? = "Test story",
        isViewed: Bool = false,
        createdAt: Date = Date(),
        updatedAt: Date? = nil
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: [],
            storyEffects: nil,
            createdAt: createdAt,
            expiresAt: createdAt.addingTimeInterval(72000),
            isViewed: isViewed,
            updatedAt: updatedAt
        )
    }

    // MARK: - loadStories() Tests

    func test_loadStories_success_populatesStoryGroups() async {
        let storyPost1 = Self.makeStoryAPIPost(id: "s1", content: "First story", authorId: "u1", authorUsername: "alice")
        let storyPost2 = Self.makeStoryAPIPost(id: "s2", content: "Second story", authorId: "u2", authorUsername: "bob")
        let response = Self.makeStoriesResponse(posts: [storyPost1, storyPost2])
        mockStoryService.listResult = .success(response)

        await sut.loadStories(forceNetwork: true)

        XCTAssertEqual(sut.storyGroups.count, 2)
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadStories_groupsStoriesBySameAuthor() async {
        let storyPost1 = Self.makeStoryAPIPost(id: "s1", content: "First", authorId: "u1", authorUsername: "alice")
        let storyPost2 = Self.makeStoryAPIPost(id: "s2", content: "Second", authorId: "u1", authorUsername: "alice")
        let response = Self.makeStoriesResponse(posts: [storyPost1, storyPost2])
        mockStoryService.listResult = .success(response)

        await sut.loadStories(forceNetwork: true)

        XCTAssertEqual(sut.storyGroups.count, 1, "Same author stories should be grouped")
        XCTAssertEqual(sut.storyGroups[0].stories.count, 2)
    }

    func test_loadStories_failure_showsEmptyState() async {
        mockStoryService.listResult = .failure(APIError.networkError(URLError(.notConnectedToInternet)))

        await sut.loadStories(forceNetwork: true)

        XCTAssertTrue(sut.storyGroups.isEmpty, "Should show empty state on failure")
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadStories_responseNotSuccess_showsEmptyState() async {
        let failResponse: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":false,"data":[],"pagination":null,"error":"Stories unavailable"}
        """)
        mockStoryService.listResult = .success(failResponse)

        await sut.loadStories(forceNetwork: true)

        XCTAssertTrue(sut.storyGroups.isEmpty, "Should show empty state on non-success response")
    }

    func test_loadStories_guardsAgainstDoubleLoad() async {
        let response: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        mockStoryService.listResult = .success(response)

        await sut.loadStories(forceNetwork: true)
        await sut.loadStories(forceNetwork: true)

        XCTAssertLessThanOrEqual(mockStoryService.listCallCount, 2)
    }

    // MARK: - Purge des stories mortes
    //
    // Le merge delta est additif : il ne peut RIEN retirer. Une story supprimée
    // pendant que l'app était fermée ou hors-ligne (event socket `story:deleted`
    // manqué, aucun replay) restait donc dans le tray — illisible, puisque le
    // lecteur la saute ou tombe sur des médias 404, et indéboulonnable jusqu'à
    // l'expiration du cache 24 h. Deux canaux la font maintenant sortir : les
    // tombstones du serveur (`meta.deletedStoryIds`) et le filtre d'expiry local.

    private static func makeDeltaResponse(deletedStoryIds: [String] = []) -> PaginatedAPIResponse<[APIPost]> {
        let ids = deletedStoryIds.map { "\"\($0)\"" }.joined(separator: ",")
        return JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null,"meta":{"deletedStoryIds":[\(ids)]}}
        """)
    }

    func test_deltaRefresh_purgesStoryReportedDeletedByServer() async {
        let kept = makeStoryItem(id: "s1")
        let deleted = makeStoryItem(id: "s2")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [kept, deleted])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["s2"]))

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s1"])
    }

    func test_deltaRefresh_dropsGroupEmptiedByDeletion() async {
        sut.storyGroups = [
            makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1")]),
            makeStoryGroup(userId: "u2", username: "bob", stories: [makeStoryItem(id: "s2")])
        ]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["s1"]))

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.map(\.id), ["u2"])
    }

    func test_deltaRefresh_purgesExpiredStory() async {
        // Le serveur balaie les périmées toutes les heures seulement : le client
        // ne doit pas attendre son passage pour cesser d'afficher une bulle morte.
        let expired = makeStoryItem(id: "old", createdAt: Date().addingTimeInterval(-90_000))
        let fresh = makeStoryItem(id: "new")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [expired, fresh])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse())

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["new"])
    }

    func test_deltaRefresh_healthyTrayIsLeftIntact() async {
        // Garde-fou : la purge ne doit toucher QUE ce qui est mort.
        sut.storyGroups = [
            makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1")]),
            makeStoryGroup(userId: "u2", username: "bob", stories: [makeStoryItem(id: "s2")])
        ]
        mockStoryService.listResult = .success(Self.makeDeltaResponse())

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.flatMap { $0.stories.map(\.id) }.sorted(), ["s1", "s2"])
    }

    func test_deltaRefresh_evictsPurgedStoryFromTheByIdCache() async {
        // Ce cache sert les deep-links AVANT le réseau : y laisser la story
        // purgée la ferait réapparaître au premier tap de notification.
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1"), makeStoryItem(id: "s2")])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["s1"]))

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertTrue(mockStoryService.invalidatedPostIds.contains("s1"))
        XCTAssertFalse(mockStoryService.invalidatedPostIds.contains("s2"))
    }

    func test_deltaRefresh_ignoresDeletedIdsAbsentFromTray() async {
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1")])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["never-had-it"]))

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s1"])
    }

    // MARK: - Drain de pagination du tray
    //
    // `GET /posts/feed/stories` plafonne `limit` à 50 et annonce la suite par
    // `pagination.hasMore`/`nextCursor`. Ces deux champs n'avaient AUCUN lecteur
    // dans le dépôt : le tray était coupé à 50 stories pour tout le monde, sans
    // qu'aucune ligne de code puisse s'en apercevoir.
    //
    // Paginer est le bon geste ICI (et pas escalader vers un fetch complet comme
    // pour les conversations) pour deux raisons : la page est ordonnée par
    // `(createdAt, id)` et son curseur porte sur ce même couple — le parcours
    // est donc exact ; et le fetch complet emprunte la MÊME route plafonnée à
    // 50, il ne rattraperait rien.

    func test_fullFetch_followsNextCursorUntilTheServerStopsAnnouncingMore() async {
        mockStoryService.listResults = [
            .success(Self.makeStoriesPage(
                posts: [Self.makeStoryAPIPost(id: "s1", authorId: "u1", authorUsername: "alice")],
                hasMore: true,
                nextCursor: "cursor-page-2"
            )),
            .success(Self.makeStoriesPage(
                posts: [Self.makeStoryAPIPost(id: "s2", authorId: "u2", authorUsername: "bob")],
                hasMore: false
            ))
        ]

        await sut.loadStories(forceNetwork: true)

        XCTAssertEqual(mockStoryService.listCallCount, 2)
        XCTAssertEqual(mockStoryService.listCursors, [nil, "cursor-page-2"])
        XCTAssertEqual(sut.storyGroups.flatMap { $0.stories.map(\.id) }.sorted(), ["s1", "s2"])
    }

    func test_fullFetch_asksForTheServerSideMaximumPageSize() async {
        // Annoncer plus que le plafond serveur ne rend pas une ligne de plus et
        // désarme les gardes qui comparent au `limit` demandé (cycle 79).
        mockStoryService.listResult = .success(Self.makeStoriesPage())

        await sut.loadStories(forceNetwork: true)

        XCTAssertEqual(mockStoryService.lastListLimit, 50)
    }

    func test_fullFetch_stopsAtThePageCapWhenTheServerNeverStops() async {
        // Un serveur qui annonce `hasMore` sans fin ne doit pas faire boucler le
        // client indéfiniment.
        mockStoryService.listResult = .success(Self.makeStoriesPage(
            posts: [Self.makeStoryAPIPost(id: "s1")],
            hasMore: true,
            nextCursor: "always-more"
        ))

        await sut.loadStories(forceNetwork: true)

        XCTAssertEqual(mockStoryService.listCallCount, StoryViewModel.maxTrayPagesPerPass)
    }

    func test_fullFetch_stopsWhenHasMoreCarriesNoCursor() async {
        // `hasMore: true` sans `nextCursor` est une page suivante qu'on ne sait
        // pas demander : rejouer la même page en boucle serait pire que s'arrêter.
        mockStoryService.listResult = .success(Self.makeStoriesPage(
            posts: [Self.makeStoryAPIPost(id: "s1")],
            hasMore: true,
            nextCursor: nil
        ))

        await sut.loadStories(forceNetwork: true)

        XCTAssertEqual(mockStoryService.listCallCount, 1)
    }

    func test_deltaRefresh_followsNextCursorAcrossPages() async {
        // Expiry au futur : le chemin delta passe par `purgeDeadStories`, qui
        // retire les stories périmées — le défaut de `makeStoryAPIPost` est une
        // date de 2026-01 et serait purgé avant l'assertion.
        mockStoryService.listResults = [
            .success(Self.makeStoriesPage(
                posts: [Self.makeStoryAPIPost(
                    id: "s1", authorId: "u1", authorUsername: "alice", expiresAt: Self.farFutureExpiry
                )],
                hasMore: true,
                nextCursor: "cursor-page-2"
            )),
            .success(Self.makeStoriesPage(
                posts: [Self.makeStoryAPIPost(
                    id: "s2", authorId: "u2", authorUsername: "bob", expiresAt: Self.farFutureExpiry
                )],
                hasMore: false
            ))
        ]

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(mockStoryService.listCursors, [nil, "cursor-page-2"])
        XCTAssertEqual(sut.storyGroups.flatMap { $0.stories.map(\.id) }.sorted(), ["s1", "s2"])
    }

    func test_deltaRefresh_unionsTombstonesAcrossPages() async {
        // Les tombstones voyagent page par page : ne lire que la première en
        // perdrait silencieusement une partie.
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [
            makeStoryItem(id: "s1"), makeStoryItem(id: "ghost")
        ])]
        mockStoryService.listResults = [
            .success(Self.makeStoriesPage(hasMore: true, nextCursor: "cursor-page-2")),
            .success(Self.makeStoriesPage(deletedStoryIds: ["ghost"]))
        ]

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s1"])
    }

    // MARK: - Troncature des tombstones ⇒ escalade
    //
    // Contrairement à la page, les tombstones n'ont AUCUN curseur de reprise :
    // il n'existe pas de « page suivante » de disparitions à demander. Le seul
    // geste qui purge les fantômes restants est le REMPLACEMENT du tray par un
    // fetch complet — donc ici on escalade, là où la page se rattrapait en
    // paginant. Deux signaux, deux gestes.

    func test_deltaRefresh_whenTombstonesTruncated_escalatesToAFullFetch() async {
        // Le fantôme n'est PAS dans les tombstones reçus (ils ont été coupés) :
        // seul le remplacement du tray par le fetch complet le fait sortir.
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "ghost")])]
        mockStoryService.listResults = [
            .success(Self.makeStoriesPage(deletedStoryIds: [], deletedStoryIdsTruncated: true)),
            .success(Self.makeStoriesPage(
                posts: [Self.makeStoryAPIPost(
                    id: "s1", authorId: "u1", authorUsername: "alice", expiresAt: Self.farFutureExpiry
                )]
            ))
        ]

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(mockStoryService.listCallCount, 2)
        // Le second appel est bien un fetch COMPLET, pas un autre delta.
        XCTAssertNil(mockStoryService.lastListUpdatedSince)
        XCTAssertEqual(sut.storyGroups.flatMap { $0.stories.map(\.id) }, ["s1"])
    }

    func test_deltaRefresh_completeTombstoneWindow_doesNotEscalate() async {
        // Garde-fou : une fenêtre complète ne doit PAS déclencher de fetch
        // complet, sinon chaque delta en paierait un.
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1")])]
        mockStoryService.listResult = .success(Self.makeStoriesPage(
            deletedStoryIds: [],
            deletedStoryIdsTruncated: false
        ))
        let since = Date().addingTimeInterval(-300)

        await sut.fetchStoriesFromNetwork(deltaSince: since)

        XCTAssertEqual(mockStoryService.listCallCount, 1)
        XCTAssertNotNil(mockStoryService.lastListUpdatedSince)
    }

    func test_deltaRefresh_serverWithoutTheTruncationField_doesNotEscalate() async {
        // Rétro-compatibilité : un gateway antérieur au champ omet `meta`. Son
        // absence doit se lire « pas de troncature » — le comportement d'avant.
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1")])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse())

        await sut.fetchStoriesFromNetwork(deltaSince: Date().addingTimeInterval(-300))

        XCTAssertEqual(mockStoryService.listCallCount, 1)
    }

    // MARK: - storyRingState(forUserId:) Tests

    func test_storyRingState_userWithUnviewedStories_returnsUnread() {
        let group = makeStoryGroup(userId: "u1", stories: [makeStoryItem(isViewed: false)])
        sut.storyGroups = [group]

        XCTAssertEqual(sut.storyRingState(forUserId: "u1"), .unread)
    }

    func test_storyRingState_userWithAllViewedStories_returnsRead() {
        let group = makeStoryGroup(userId: "u1", stories: [makeStoryItem(isViewed: true)])
        sut.storyGroups = [group]

        XCTAssertEqual(sut.storyRingState(forUserId: "u1"), .read)
    }

    func test_storyRingState_userWithoutStories_returnsNone() {
        sut.storyGroups = []

        XCTAssertEqual(sut.storyRingState(forUserId: "u1"), StoryRingState.none)
    }

    func test_storyRingState_userWithFullyExpiredGroup_returnsNone() {
        let expired = makeStoryItem(id: "old", createdAt: Date(timeIntervalSinceNow: -100_000))
        let group = makeStoryGroup(userId: "u1", stories: [expired])
        sut.storyGroups = [group]

        XCTAssertEqual(sut.storyRingState(forUserId: "u1"), StoryRingState.none)
    }

    // MARK: - markViewed() Tests

    func test_markViewed_updatesLocalStateToViewed() async {
        let item = makeStoryItem(id: "view-me", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "view-me")

        XCTAssertTrue(sut.storyGroups[0].stories[0].isViewed)
    }

    func test_markViewed_enqueuesDurableOutboxRecord() async {
        // R6 — le « vu » passe par l'outbox durable (survit kill/offline),
        // plus par le POST fire-and-forget direct.
        let item = makeStoryItem(id: "view-service-test", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]
        var enqueuedStoryIds: [String] = []
        sut.markViewedOutboxEnqueuer = { enqueuedStoryIds.append($0) }

        sut.markViewed(storyId: "view-service-test")

        // Give the fire-and-forget Task time to execute
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(enqueuedStoryIds, ["view-service-test"])
    }

    func test_markViewed_nonExistentStoryId_doesNothing() {
        let item = makeStoryItem(id: "existing", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "non-existent")

        XCTAssertFalse(sut.storyGroups[0].stories[0].isViewed, "Should not modify unrelated stories")
    }

    // MARK: - R5 offline replay : pin plan + wiring

    private func makeMediaStoryItem(id: String = "pin-item",
                                    videoURL: String? = "https://cdn.test/clip.mp4",
                                    audioURL: String? = "https://cdn.test/voice.m4a",
                                    imageURL: String? = "https://cdn.test/photo.jpg",
                                    expiresAt: Date = Date().addingTimeInterval(3600)) -> StoryItem {
        var media: [FeedMedia] = []
        if let videoURL {
            media.append(FeedMedia(id: "m-video", type: .video, url: videoURL, duration: 5))
        }
        if let audioURL {
            media.append(FeedMedia(id: "m-audio", type: .audio, url: audioURL, duration: 5))
        }
        if let imageURL {
            media.append(FeedMedia(id: "m-image", type: .image, url: imageURL))
        }
        return StoryItem(
            id: id,
            content: nil,
            media: media,
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: expiresAt,
            isViewed: false
        )
    }

    func test_pinTargets_routesMediaByType() {
        let story = makeMediaStoryItem()

        let targets = StoryViewModel.pinTargets(for: story)

        XCTAssertEqual(targets.count, 3)
        XCTAssertEqual(targets.first(where: { $0.urlString == "https://cdn.test/clip.mp4" })?.store, .video)
        XCTAssertEqual(targets.first(where: { $0.urlString == "https://cdn.test/voice.m4a" })?.store, .audio)
        XCTAssertEqual(targets.first(where: { $0.urlString == "https://cdn.test/photo.jpg" })?.store, .images,
                       "Images (and unknown types) route to the images store, mirroring the prefetch path")
    }

    func test_pinTargets_contradictoryDeclaredType_sniffedByExtension() {
        // R7 — un mp4 déclaré image doit être pinné dans le store video
        // (là où prefetch/lecture le rangent réellement).
        let media = [FeedMedia(id: "m-x", type: .image, url: "https://cdn.test/really-a-video.mp4")]
        let story = StoryItem(
            id: "pin-sniff", content: nil, media: media, storyEffects: nil,
            createdAt: Date(), expiresAt: Date().addingTimeInterval(3600), isViewed: false
        )

        let targets = StoryViewModel.pinTargets(for: story)

        XCTAssertEqual(targets.first(where: { $0.urlString.hasSuffix(".mp4") })?.store, .video)
    }

    func test_pinDeadline_usesStoryExpiry() {
        let expiry = Date().addingTimeInterval(1234)
        let story = makeMediaStoryItem(expiresAt: expiry)

        XCTAssertEqual(StoryViewModel.pinDeadline(for: story), expiry,
                       "The pin must not outlive the story")
    }

    func test_markViewed_pinsViewedStoryMediaUntilExpiry() async {
        let unique = UUID().uuidString
        let videoURL = "https://cdn.test/\(unique).mp4"
        let story = makeMediaStoryItem(id: "pin-wiring", videoURL: videoURL,
                                       audioURL: nil, imageURL: nil)
        let group = makeStoryGroup(userId: "u1", stories: [story])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "pin-wiring")

        // The pin runs in a fire-and-forget Task — give it time to land.
        try? await Task.sleep(nanoseconds: 200_000_000)

        let pinned = await CacheCoordinator.shared.video.isPinned(videoURL)
        XCTAssertTrue(pinned, "Viewing a story must pin its media for offline replay until expiry")
    }

    func test_offlineReplay_viewedStory_mediaResolvesFromDiskThroughViewerKeys() async {
        // R5(c) — contrat d'intégration de la relecture offline. L'ÉCRITURE
        // (prefetch/pin) travaille avec la clé BRUTE `FeedMedia.url` ; la
        // LECTURE (StoryViewerView.mediaIndex) reconstruit la clé via
        // `URL(string: raw).absoluteString` puis les layers résolvent en
        // DISK-ONLY (`videoLocalFileURL` / `imageLocalFileURL` /
        // `audioLocalFileURL` — zéro réseau par construction). Toute
        // divergence de chaîne ou de store entre les deux bouts casserait la
        // relecture offline en silence : ce test dérive chaque clé
        // indépendamment et exige le disk-hit + le pin sous la clé VIEWER.
        let unique = UUID().uuidString
        let rawVideo = "https://cdn.test/\(unique)/clip.mp4"
        let rawAudio = "https://cdn.test/\(unique)/voice.m4a"
        let rawImage = "https://cdn.test/\(unique)/photo.jpg"
        let story = makeMediaStoryItem(id: "offline-replay", videoURL: rawVideo,
                                       audioURL: rawAudio, imageURL: rawImage)
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [story])]

        let payload = Data("offline-replay-bytes".utf8)
        await CacheCoordinator.shared.video.save(payload, for: rawVideo)
        await CacheCoordinator.shared.audio.save(payload, for: rawAudio)
        await CacheCoordinator.shared.images.save(payload, for: rawImage)

        sut.markViewed(storyId: "offline-replay")
        try? await Task.sleep(nanoseconds: 200_000_000)

        guard let viewerVideoKey = URL(string: rawVideo)?.absoluteString,
              let viewerAudioKey = URL(string: rawAudio)?.absoluteString,
              let viewerImageKey = URL(string: rawImage)?.absoluteString else {
            return XCTFail("Fixture URLs must parse — the viewer would drop them from mediaIndex")
        }

        XCTAssertNotNil(CacheCoordinator.videoLocalFileURL(for: viewerVideoKey),
                        "Video bg must replay from disk (StoryBackgroundLayer path) without network")
        XCTAssertNotNil(CacheCoordinator.audioLocalFileURL(for: viewerAudioKey),
                        "Audio must replay from disk (ReaderAudioMixer path) without network")
        XCTAssertNotNil(CacheCoordinator.imageLocalFileURL(for: viewerImageKey),
                        "Image bg must replay from disk (loadImage disk-hit) without network")

        let videoPinned = await CacheCoordinator.shared.video.isPinned(viewerVideoKey)
        let audioPinned = await CacheCoordinator.shared.audio.isPinned(viewerAudioKey)
        let imagePinned = await CacheCoordinator.shared.images.isPinned(viewerImageKey)
        XCTAssertTrue(videoPinned, "The viewer's video key must be pinned against eviction")
        XCTAssertTrue(audioPinned, "The viewer's audio key must be pinned against eviction")
        XCTAssertTrue(imagePinned, "The viewer's image key must be pinned against eviction")
    }

    // MARK: - R4 inc.2 : fetch unitaire par postId (story hors tray)

    private static func isoDate(offset: TimeInterval) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date().addingTimeInterval(offset))
    }

    func test_ensureStoryLoaded_fetchesAndInsertsMissingGroup() async {
        mockStoryService.fetchPostResult = .success(Self.makeStoryAPIPost(
            id: "p-solo", authorId: "u-out", authorUsername: "outsider",
            createdAt: Self.isoDate(offset: -60), expiresAt: Self.isoDate(offset: 3600)))

        let loaded = await sut.ensureStoryLoaded(postId: "p-solo")

        XCTAssertTrue(loaded)
        XCTAssertNotNil(sut.groupIndex(forUserId: "u-out"),
                        "A story outside the tray must become viewable after the unit fetch")
        XCTAssertEqual(mockStoryService.fetchPostCallCount, 1)
    }

    func test_ensureStoryLoaded_storyAlreadyInTray_skipsNetwork() async {
        let story = makeStoryItem(id: "p-known")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [story])]

        let loaded = await sut.ensureStoryLoaded(postId: "p-known")

        XCTAssertTrue(loaded)
        XCTAssertEqual(mockStoryService.fetchPostCallCount, 0,
                       "Cache-first: a story already in the tray must not refetch")
    }

    func test_ensureStoryLoaded_expiredStory_isNotInserted() async {
        // Factory defaults date from January 2026 — expired relative to now.
        mockStoryService.fetchPostResult = .success(Self.makeStoryAPIPost(
            id: "p-dead", authorId: "u-dead", authorUsername: "ghost"))

        let loaded = await sut.ensureStoryLoaded(postId: "p-dead")

        XCTAssertFalse(loaded)
        XCTAssertNil(sut.groupIndex(forUserId: "u-dead"),
                     "An expired deep link must not insert a ghost group into the tray")
    }

    /// Task 9 (post-references) — un droit de référence ACCORDÉ garde une
    /// story expirée ouvrable via le deep link unitaire, exactement comme
    /// l'exception auteur juste au-dessus, mais pour un auteur QUELCONQUE
    /// (`u-referenced` n'est pas l'utilisateur courant du test).
    func test_ensureStoryLoaded_expiredStoryWithGrantedReferenceAccess_isInserted() async {
        mockStoryService.fetchPostResult = .success(Self.makeStoryAPIPost(
            id: "p-referenced", authorId: "u-referenced", authorUsername: "referenced",
            referenceAccess: .granted))

        let loaded = await sut.ensureStoryLoaded(postId: "p-referenced")

        XCTAssertTrue(loaded)
        XCTAssertNotNil(sut.groupIndex(forUserId: "u-referenced"),
                        "An expired story with a granted reference right must remain openable")
    }

    /// Le pendant négatif : un droit ÉTEINT (consumed) n'accorde aucune
    /// exception — le comportement historique (story expirée écartée)
    /// s'applique, comme sans référence du tout.
    func test_ensureStoryLoaded_expiredStoryWithConsumedReferenceAccess_isNotInserted() async {
        mockStoryService.fetchPostResult = .success(Self.makeStoryAPIPost(
            id: "p-spent", authorId: "u-spent", authorUsername: "spent",
            referenceAccess: .consumed))

        let loaded = await sut.ensureStoryLoaded(postId: "p-spent")

        XCTAssertFalse(loaded)
        XCTAssertNil(sut.groupIndex(forUserId: "u-spent"))
    }

    func test_ensureStoryLoaded_fetchFailure_returnsFalse() async {
        mockStoryService.fetchPostResult = .failure(APIError.networkError(URLError(.notConnectedToInternet)))

        let loaded = await sut.ensureStoryLoaded(postId: "p-fail")

        XCTAssertFalse(loaded)
        XCTAssertTrue(sut.storyGroups.isEmpty)
    }

    func test_ensureStoryLoaded_existingAuthor_mergesWithoutDuplicates() async {
        let existing = makeStoryItem(id: "s-old", createdAt: Date().addingTimeInterval(-120))
        sut.storyGroups = [makeStoryGroup(userId: "u-merge", stories: [existing])]
        mockStoryService.fetchPostResult = .success(Self.makeStoryAPIPost(
            id: "s-new", authorId: "u-merge", authorUsername: "merger",
            createdAt: Self.isoDate(offset: -30), expiresAt: Self.isoDate(offset: 3600)))

        let loaded = await sut.ensureStoryLoaded(postId: "s-new")

        XCTAssertTrue(loaded)
        let group = sut.storyGroups.first { $0.id == "u-merge" }
        XCTAssertEqual(group?.stories.map(\.id), ["s-old", "s-new"],
                       "Merge appends ascending by createdAt without duplicating (storyCreated sink contract)")
    }

    // MARK: - refreshFromCachedPostIfAvailable (Fix A — bouton commentaires manquant sur entrée notification)

    /// Le chemin notification (`StoryNotificationTargetViewModel.load()`) a
    /// déjà fetché ce post en réseau et l'a mis en cache dans
    /// `storyService.cachedPost(id:)` quelques millisecondes avant que ce
    /// viewer ne se monte. `ensureStoryLoaded` a un contrat cache-first
    /// VOLONTAIRE — il ne refetch jamais un postId déjà dans le tray (voir
    /// `test_ensureStoryLoaded_storyAlreadyInTray_skipsNetwork` ci-dessus) —
    /// donc un tray qui contient DÉJÀ ce post avec un `commentCount` périmé
    /// n'était jamais rafraîchi par ce chemin. `refreshFromCachedPostIfAvailable`
    /// ne fait AUCUN réseau : elle relit le cache SDK déjà chaud et fusionne.
    func test_refreshFromCachedPostIfAvailable_staleStoryInTray_mergesFreshCommentCountFromCache() {
        let stale = makeStoryItem(id: "s-known")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [stale])]
        mockStoryService.cachedPostResult = Self.makeStoryAPIPost(
            id: "s-known", authorId: "u1", authorUsername: "alice",
            createdAt: Self.isoDate(offset: -60), expiresAt: Self.isoDate(offset: 3600),
            commentCount: 7)

        sut.refreshFromCachedPostIfAvailable(postId: "s-known")

        let refreshed = sut.storyGroups.first(where: { $0.id == "u1" })?
            .stories.first(where: { $0.id == "s-known" })
        XCTAssertEqual(refreshed?.commentCount, 7,
                       "A commentCount already in the tray but stale relative to the notification's fresh fetch must be updated")
        XCTAssertEqual(mockStoryService.fetchPostCallCount, 0,
                       "Must read the already-warm SDK cache, never hit the network again")
    }

    /// Task 9 (post-references) — même exception que `ensureStoryLoaded` sur
    /// ce second point d'entrée : un droit ACCORDÉ sur le post fraîchement
    /// mis en cache par le chemin notification doit fusionner dans le tray
    /// même si ce post est expiré, au lieu de faire disparaître silencieusement
    /// le groupe (`alive.isEmpty` aurait vidé le merge).
    func test_refreshFromCachedPostIfAvailable_expiredWithGrantedReferenceAccess_stillMerges() {
        let stale = makeStoryItem(id: "s-known")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [stale])]
        mockStoryService.cachedPostResult = Self.makeStoryAPIPost(
            id: "s-known", authorId: "u1", authorUsername: "alice",
            createdAt: Self.isoDate(offset: -7200), expiresAt: Self.isoDate(offset: -3600),
            commentCount: 7, referenceAccess: .granted)

        sut.refreshFromCachedPostIfAvailable(postId: "s-known")

        let refreshed = sut.storyGroups.first(where: { $0.id == "u1" })?
            .stories.first(where: { $0.id == "s-known" })
        XCTAssertEqual(refreshed?.commentCount, 7,
                       "An expired post with a granted reference right must still merge, not vanish from the tray")
    }

    func test_refreshFromCachedPostIfAvailable_nothingCached_isNoOp() {
        let stale = makeStoryItem(id: "s-known")
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [stale])]
        // mockStoryService.cachedPostResult stays nil — the normal, non-notification path.

        sut.refreshFromCachedPostIfAvailable(postId: "s-known")

        XCTAssertEqual(sut.storyGroups.first?.stories.first?.commentCount, 0)
        XCTAssertEqual(mockStoryService.fetchPostCallCount, 0)
    }

    // MARK: - R8 inc.1 : delta-sync du refetch silencieux

    func test_deltaSince_derivesMaxUpdatedAtFromCache() {
        let t1 = Date(timeIntervalSince1970: 1_000)
        let t2 = Date(timeIntervalSince1970: 2_000)
        let groups = [
            makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "a", updatedAt: t1)]),
            makeStoryGroup(userId: "u2", stories: [makeStoryItem(id: "b", updatedAt: t2), makeStoryItem(id: "c")]),
        ]

        XCTAssertEqual(StoryViewModel.deltaSince(for: groups), t2)
        XCTAssertNil(StoryViewModel.deltaSince(for: [makeStoryGroup(userId: "u3", stories: [makeStoryItem(id: "d")])]),
                     "A legacy cache without updatedAt must disable the delta (full fetch)")
    }

    private static func makeDeltaResponse(postsJSON: String) -> PaginatedAPIResponse<[APIPost]> {
        JSONStub.decode("""
        {"success":true,"data":[\(postsJSON)],"pagination":null,"error":null}
        """)
    }

    /// Horodatage ISO8601 RELATIF à maintenant.
    ///
    /// Ces fixtures portaient des dates absolues (`expiresAt: 2026-07-05`). Une
    /// fois cette date passée, les stories du delta arrivaient déjà expirées et
    /// la purge du tray les retirait aussitôt — les tests échouaient sur un
    /// détail de calendrier, pas sur ce qu'ils vérifient (la propagation des
    /// compteurs, l'insertion d'un nouveau groupe).
    private static func iso(_ offset: TimeInterval) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date().addingTimeInterval(offset))
    }

    func test_deltaRefresh_passesUpdatedSince_andReplacesModifiedStory_preservingLocalViewed() async {
        let local = makeStoryItem(id: "s-mod", isViewed: true)
        sut.storyGroups = [makeStoryGroup(userId: "u-delta", stories: [local])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(postsJSON: """
        {"id":"s-mod","type":"STORY","content":"updated","createdAt":"\(Self.iso(-7200))",
         "updatedAt":"\(Self.iso(-3600))","expiresAt":"\(Self.iso(72000))",
         "viewCount":5,"isViewedByMe":false,
         "author":{"id":"u-delta","username":"delta"}}
        """))
        let since = Date(timeIntervalSince1970: 5_000)

        await sut.fetchStoriesFromNetwork(deltaSince: since)

        XCTAssertEqual(mockStoryService.lastListUpdatedSince, since,
                       "The silent refresh must forward the delta cursor to the service")
        let merged = sut.storyGroups.first { $0.id == "u-delta" }?.stories.first { $0.id == "s-mod" }
        XCTAssertEqual(merged?.viewCount, 5, "Server-side counters must land through the delta merge")
        XCTAssertEqual(merged?.isViewed, true, "A stale server isViewedByMe must never un-view a local ring (monotone)")
        XCTAssertNotNil(merged?.updatedAt, "updatedAt must survive the merge — it advances the next delta cursor")
    }

    func test_deltaRefresh_insertsBrandNewStoryGroup() async {
        sut.storyGroups = [makeStoryGroup(userId: "u-old", stories: [makeStoryItem(id: "s-old")])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(postsJSON: """
        {"id":"s-new","type":"STORY","content":"fresh","createdAt":"\(Self.iso(-1800))",
         "updatedAt":"\(Self.iso(-1800))","expiresAt":"\(Self.iso(72000))",
         "author":{"id":"u-new","username":"newcomer"}}
        """))

        await sut.fetchStoriesFromNetwork(deltaSince: Date(timeIntervalSince1970: 5_000))

        XCTAssertNotNil(sut.groupIndex(forUserId: "u-new"), "A new author's delta story must appear in the tray")
        XCTAssertNotNil(sut.groupIndex(forUserId: "u-old"), "The delta merge must never drop untouched groups")
    }

    func test_deltaRefresh_emptyDelta_keepsTrayIntact() async {
        let existing = makeStoryGroup(userId: "u-keep", stories: [makeStoryItem(id: "s-keep")])
        sut.storyGroups = [existing]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(postsJSON: ""))

        await sut.fetchStoriesFromNetwork(deltaSince: Date(timeIntervalSince1970: 5_000))

        XCTAssertEqual(sut.storyGroups.map(\.id), ["u-keep"],
                       "An empty delta must not overwrite the displayed tray")
        XCTAssertEqual(mockStoryService.listCallCount, 1)
    }

    // MARK: - R12 inc.2 : persistance dirty des mutations locales

    func test_persistStoryCache_localMutation_landsInStoreAndSurvivesDirtyFlush() async {
        // R12 inc.2 — persistStoryCache est passé de save() synchrone (full
        // rewrite + freshness reset) à mergeUpdate (dirty débouncé, freshness
        // préservée — sémantique pinnée par GRDBCacheStoreFreshnessTests côté
        // SDK). Ce test caractérise le câblage : une mutation locale traverse
        // le nouveau chemin et survit au flush dirty.
        let unique = UUID().uuidString
        let storyId = "flush-\(unique)"
        let item = makeStoryItem(id: storyId, isViewed: false)
        sut.storyGroups = [makeStoryGroup(userId: "u-\(unique)", stories: [item])]

        sut.markViewed(storyId: storyId)
        try? await Task.sleep(nanoseconds: 300_000_000)

        await CacheCoordinator.shared.stories.flushDirtyKeys()
        let result = await CacheCoordinator.shared.stories.load(for: StoryViewModel.storiesCacheKey)

        let groups: [StoryGroup]
        switch result {
        case .fresh(let g, _), .stale(let g, _): groups = g
        case .expired, .empty:
            return XCTFail("The mutated tray must be readable back from the stories store")
        }
        let story = groups.first { $0.id == "u-\(unique)" }?.stories.first { $0.id == storyId }
        XCTAssertEqual(story?.isViewed, true,
                       "A local mutation must land in the store through the dirty mergeUpdate path")
    }

    // MARK: - Group intro (interstitiel inter-groupes)

    private func makeIntroGroup(id: String = "intro-user-\(UUID().uuidString)",
                                username: String = "alice") -> StoryGroup {
        StoryGroup(id: id, username: username, avatarColor: "6366F1",
                   stories: [makeStoryItem()])
    }

    private static func makeStatusPost(authorId: String, authorName: String,
                                       mood: String, content: String?) -> APIPost {
        let contentJSON = content.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        {
            "id": "status-\(authorId)",
            "type": "STATUS",
            "moodEmoji": "\(mood)",
            "content": \(contentJSON),
            "createdAt": "2026-07-03T10:00:00.000Z",
            "author": {"id": "\(authorId)", "username": "\(authorName)"}
        }
        """)
    }

    func test_resolveGroupIntro_mapsProfileFromResolver() async {
        let group = makeIntroGroup()
        sut.introProfileResolver = { _ in
            MeeshyUser(id: group.id, username: "alice",
                       firstName: "Alice", lastName: "Martin",
                       banner: "https://cdn.test/banner.jpg", bannerThumbHash: "bh")
        }
        sut.introMoodFeedLoader = { [] }

        let intro = await sut.resolveGroupIntro(for: group)

        XCTAssertEqual(intro.displayName, "Alice Martin",
                       "Full name is built from first+last when displayName is absent")
        XCTAssertEqual(intro.bannerURL, "https://cdn.test/banner.jpg")
        XCTAssertEqual(intro.bannerThumbHash, "bh")
    }

    /// Directive user 2026-08-20 : après « @ », l'interlude affiche le PSEUDO.
    /// `StoryGroup.username` porte en réalité `APIAuthor.name` (displayName ??
    /// username) — le profil résolu doit donc écraser `intro.username` avec le
    /// vrai handle, sinon la carte rend « @Alice Martin ».
    func test_resolveGroupIntro_usernameComesFromProfileHandle_notGroupDisplayName() async {
        let group = makeIntroGroup(username: "Alice Martin")
        sut.introProfileResolver = { _ in
            MeeshyUser(id: group.id, username: "alice.m",
                       firstName: "Alice", lastName: "Martin")
        }
        sut.introMoodFeedLoader = { [] }

        let intro = await sut.resolveGroupIntro(for: group)

        XCTAssertEqual(intro.username, "alice.m",
                       "The @handle line must show the profile's username, never the group's display name")
    }

    func test_resolveGroupIntro_mapsMoodFromStatusFeed() async {
        let group = makeIntroGroup()
        sut.introProfileResolver = { _ in MeeshyUser(id: group.id, username: "alice") }
        sut.introMoodFeedLoader = {
            [Self.makeStatusPost(authorId: group.id, authorName: "alice",
                                 mood: "🔥", content: "En feu aujourd'hui")]
        }

        let intro = await sut.resolveGroupIntro(for: group)

        XCTAssertEqual(intro.moodEmoji, "🔥")
        XCTAssertEqual(intro.moodMessage, "En feu aujourd'hui")
    }

    func test_resolveGroupIntro_moodFeedFetchedOncePerSession() async {
        let group = makeIntroGroup()
        sut.introProfileResolver = { _ in MeeshyUser(id: group.id, username: "alice") }
        var fetchCount = 0
        sut.introMoodFeedLoader = { fetchCount += 1; return [] }

        _ = await sut.resolveGroupIntro(for: group)
        _ = await sut.resolveGroupIntro(for: makeIntroGroup(username: "bob"))

        XCTAssertEqual(fetchCount, 1,
                       "The statuses feed is fetched once per ViewModel session, then reused")
    }

    func test_resolveGroupIntro_survivesResolverFailure() async {
        let group = makeIntroGroup(username: "carol")
        sut.introProfileResolver = { _ in throw URLError(.notConnectedToInternet) }
        sut.introMoodFeedLoader = { throw URLError(.notConnectedToInternet) }

        let intro = await sut.resolveGroupIntro(for: group)

        XCTAssertEqual(intro.userId, group.id)
        XCTAssertEqual(intro.username, "carol",
                       "Offline: the intro still renders with the group's own data")
        XCTAssertNil(intro.displayName)
        XCTAssertNil(intro.moodEmoji)
    }

    func test_markViewed_expiredStory_doesNotPin() async {
        let unique = UUID().uuidString
        let videoURL = "https://cdn.test/\(unique).mp4"
        let story = makeMediaStoryItem(id: "pin-expired", videoURL: videoURL,
                                       audioURL: nil, imageURL: nil,
                                       expiresAt: Date().addingTimeInterval(-60))
        let group = makeStoryGroup(userId: "u1", stories: [story])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "pin-expired")

        try? await Task.sleep(nanoseconds: 200_000_000)

        let pinned = await CacheCoordinator.shared.video.isPinned(videoURL)
        XCTAssertFalse(pinned, "An already-expired story must not leave a pin behind")
    }

    func test_markViewed_preservesAllStoryFields() {
        // markViewed ne doit poser QUE isViewed=true. Avant le fix il reconstruisait
        // le StoryItem via un init partiel → ~13 champs (translations, réactions,
        // chaîne de repost, audio, compteurs) retombaient à leur défaut nil/0.
        // Régressions : Prisme Linguistique cassé après visionnage, réaction perdue,
        // attribution de repost effacée — et persistStoryCache gravait l'état corrompu.
        let rich = StoryItem(
            id: "rich",
            content: "Bonjour",
            media: [],
            storyEffects: nil,
            createdAt: Date(timeIntervalSince1970: 1_000_000),
            expiresAt: Date(timeIntervalSince1970: 1_072_000),
            repostOfId: "parent-1",
            originalRepostOfId: "root-1",
            repostAuthorName: "alice",
            visibility: "PUBLIC",
            audioUrl: "https://cdn/audio.m4a",
            isViewed: false,
            translations: [StoryTranslation(language: "fr", content: "Bonjour")],
            backgroundAudio: nil,
            reactionCount: 7,
            commentCount: 3,
            shareCount: 2,
            viewCount: 42,
            repostCount: 5,
            currentUserReactions: ["❤️"]
        )
        let group = makeStoryGroup(userId: "u1", stories: [rich])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "rich")

        let updated = sut.storyGroups[0].stories[0]
        XCTAssertTrue(updated.isViewed)
        XCTAssertEqual(updated.translations?.first?.content, "Bonjour", "translations préservées (Prisme)")
        XCTAssertEqual(updated.currentUserReactions, ["❤️"], "réaction utilisateur préservée")
        XCTAssertEqual(updated.reactionCount, 7)
        XCTAssertEqual(updated.commentCount, 3)
        XCTAssertEqual(updated.shareCount, 2)
        XCTAssertEqual(updated.viewCount, 42)
        XCTAssertEqual(updated.repostCount, 5)
        XCTAssertEqual(updated.repostOfId, "parent-1", "chaîne de repost préservée")
        XCTAssertEqual(updated.originalRepostOfId, "root-1")
        XCTAssertEqual(updated.repostAuthorName, "alice")
        XCTAssertEqual(updated.audioUrl, "https://cdn/audio.m4a")
        XCTAssertEqual(updated.visibility, "PUBLIC")
    }

    // MARK: - deleteStory() Tests

    func test_deleteStory_removesStoryFromGroup() async {
        let item1 = makeStoryItem(id: "keep-me")
        let item2 = makeStoryItem(id: "delete-me")
        let group = makeStoryGroup(userId: "u1", stories: [item1, item2])
        sut.storyGroups = [group]

        let result = await sut.deleteStory(storyId: "delete-me")

        XCTAssertTrue(result)
        XCTAssertEqual(sut.storyGroups[0].stories.count, 1)
        XCTAssertEqual(sut.storyGroups[0].stories[0].id, "keep-me")
    }

    func test_deleteStory_removesEmptyGroupAfterLastStoryDeleted() async {
        let item = makeStoryItem(id: "only-story")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        let result = await sut.deleteStory(storyId: "only-story")

        XCTAssertTrue(result)
        XCTAssertTrue(sut.storyGroups.isEmpty, "Empty group should be removed")
    }

    func test_deleteStory_serviceFailure_returnsFalse() async {
        let item = makeStoryItem(id: "fail-delete")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]
        mockStoryService.deleteResult = .failure(APIError.networkError(URLError(.timedOut)))

        let result = await sut.deleteStory(storyId: "fail-delete")

        XCTAssertFalse(result)
        XCTAssertEqual(sut.storyGroups[0].stories.count, 1, "Story should remain on failure")
    }

    func test_deleteStory_callsServiceDelete() async {
        let item = makeStoryItem(id: "tracked-delete")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        _ = await sut.deleteStory(storyId: "tracked-delete")

        XCTAssertEqual(mockStoryService.deleteCallCount, 1)
        XCTAssertEqual(mockStoryService.lastDeleteStoryId, "tracked-delete")
    }

    // MARK: - Socket.IO Tests

    func test_socketStoryCreated_addsToExistingGroup() async {
        let existingItem = makeStoryItem(id: "existing-story")
        let existingGroup = makeStoryGroup(userId: "author-1", username: "alice", stories: [existingItem])
        sut.storyGroups = [existingGroup]

        sut.subscribeToSocketEvents()

        let newStoryPost = Self.makeStoryAPIPost(
            id: "socket-story-new",
            content: "New story from socket",
            authorId: "author-1",
            authorUsername: "alice"
        )
        mockSocket.storyCreated.send(newStoryPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 1, "Should still have one group for same author")
        XCTAssertEqual(sut.storyGroups[0].stories.count, 2, "New story should be appended to existing group")
    }

    func test_socketStoryCreated_createsNewGroupForNewAuthor() async {
        // Anchor both timestamps explicitly so the test asserts ordering by
        // the Instagram-style sort (hasUnviewed → latestStory desc), not by
        // the legacy "always insert at 0" rule. Bob posts a story timestamped
        // AFTER alice's existing one — so Bob must land at index 0.
        let existingItem = makeStoryItem(
            id: "existing-story",
            createdAt: Date(timeIntervalSince1970: 1_000_000)
        )
        let existingGroup = makeStoryGroup(userId: "author-1", username: "alice", stories: [existingItem])
        sut.storyGroups = [existingGroup]

        sut.subscribeToSocketEvents()

        let newStoryPost = Self.makeStoryAPIPost(
            id: "new-author-story",
            content: "From new author",
            authorId: "author-2",
            authorUsername: "bob",
            createdAt: "2026-12-01T12:00:00.000Z"
        )
        mockSocket.storyCreated.send(newStoryPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 2, "New author should create a new group")
        XCTAssertEqual(
            sut.storyGroups[0].id, "author-2",
            "Bob's group sits at index 0 because his latest story (Dec 2026) is more recent than alice's (Jan 1970)"
        )
    }

    func test_socketStoryCreated_deduplicatesExistingStory() async {
        let existingItem = makeStoryItem(id: "dup-story")
        let existingGroup = makeStoryGroup(userId: "author-1", username: "alice", stories: [existingItem])
        sut.storyGroups = [existingGroup]

        sut.subscribeToSocketEvents()

        let duplicatePost = Self.makeStoryAPIPost(
            id: "dup-story",
            authorId: "author-1",
            authorUsername: "alice"
        )
        mockSocket.storyCreated.send(duplicatePost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups[0].stories.count, 1, "Duplicate story should not be added")
    }

    // MARK: - socket storyUpdated tests

    func test_socketStoryUpdated_preservesLocalViewedState() async {
        // Local-first : la story s1 a été vue localement (markViewed optimiste,
        // fire-and-forget). Un event story:updated (ex: bump de reactionCount)
        // arrive avec isViewedByMe absent (→ false, serveur pas encore synchronisé).
        // L'anneau « vu » ne doit PAS reverter — viewed est monotone.
        let viewed = makeStoryItem(id: "s1", isViewed: true)
        let group = makeStoryGroup(userId: "u1", username: "alice", stories: [viewed])
        sut.storyGroups = [group]

        sut.subscribeToSocketEvents()

        let event: SocketStoryUpdatedData = JSONStub.decode("""
        {"story":{"id":"s1","type":"STORY","content":"reaction bump","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"u1","username":"alice"}}}
        """)
        mockSocket.storyUpdated.send(event)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(
            sut.storyGroups[0].stories[0].isViewed,
            "story:updated avec isViewedByMe stale ne doit pas reverter l'état vu local (monotone)"
        )
    }

    func test_socketStoryViewed_appliesAuthoritativeViewCount() async {
        // L'event story:viewed porte le viewCount autoritatif. Avant le fix il était
        // ignoré → le compteur de vues (StoryViewerView lit currentStory?.viewCount)
        // restait stale chez l'auteur pendant que des viewers arrivent en temps réel.
        let item = makeStoryItem(id: "v1")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.subscribeToSocketEvents()

        let event: SocketStoryViewedData = JSONStub.decode("""
        {"storyId":"v1","viewerId":"viewer","viewerUsername":"bob","viewCount":9}
        """)
        mockSocket.storyViewed.send(event)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups[0].stories[0].viewCount, 9,
                       "le viewCount realtime autoritatif doit être appliqué au temps réel")
    }

    func test_socketCommentDeleted_appliesAuthoritativeCommentCount() async {
        // comment:deleted porte le commentCount autoritatif (comme comment:added).
        // Avant le fix, le sink faisait `-1` → dérive sur events manqués/hors-ordre +
        // asymétrie avec commentAdded. Ici la story a 5 commentaires, l'event annonce 3
        // (suppression concurrente de 2) → on doit afficher 3, pas 4 (= 5-1).
        let item = StoryItem(id: "c1", commentCount: 5)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.subscribeToSocketEvents()

        let event: SocketCommentDeletedData = JSONStub.decode("""
        {"postId":"c1","commentId":"cm9","commentCount":3}
        """)
        mockSocket.commentDeleted.send(event)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups[0].stories[0].commentCount, 3,
                       "comment:deleted doit appliquer le commentCount autoritatif (pas un -1 qui dérive)")
    }

    // MARK: - Tray re-sort tests (sortStoryGroupsInPlace)

    /// Regression for the bug where an existing author posting a new story did
    /// NOT bubble their group back to the top of the tray. The pre-fix sink
    /// only mutated `storyGroups[idx]` in place — the slot index was frozen.
    func test_socketStoryCreated_promotesExistingAuthorToFrontOfTray() async {
        // Two friends, both with unviewed stories so the only tie-break is
        // latestStory.createdAt desc. Bob's latest is more recent than alice's
        // initial story, so Bob sits at index 0 at startup.
        let aliceOldStory = makeStoryItem(
            id: "alice-old",
            isViewed: false,
            createdAt: Date(timeIntervalSince1970: 1_000_000)
        )
        let bobStory = makeStoryItem(
            id: "bob",
            isViewed: false,
            createdAt: Date(timeIntervalSince1970: 1_500_000)
        )
        sut.storyGroups = [
            makeStoryGroup(userId: "bob", username: "bob", stories: [bobStory]),
            makeStoryGroup(userId: "alice", username: "alice", stories: [aliceOldStory]),
        ]

        sut.subscribeToSocketEvents()

        // Alice posts a brand new story, more recent than Bob's.
        let aliceFreshPost = Self.makeStoryAPIPost(
            id: "alice-fresh",
            authorId: "alice",
            authorUsername: "alice",
            createdAt: "2026-01-15T13:00:00.000Z"
        )
        mockSocket.storyCreated.send(aliceFreshPost)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 2)
        XCTAssertEqual(
            sut.storyGroups[0].id, "alice",
            "Alice should bubble to index 0 because her latest story is now the most recent across all unviewed groups"
        )
        XCTAssertEqual(sut.storyGroups[0].stories.count, 2, "Alice keeps both stories")
        XCTAssertEqual(
            sut.storyGroups[0].stories.last?.id, "alice-fresh",
            "Per-group order stays ascending by createdAt so `latestStory` (stories.last) points to the freshest"
        )
    }

    /// Unviewed groups always sit above all-viewed groups, regardless of
    /// per-story timestamps. New groups must respect that ordering too — not
    /// just be plopped at index 0.
    func test_socketStoryCreated_newGroupRespectsUnviewedPriorityOverViewedRecent() async {
        // Carol's existing story was already seen, but it's the most recent
        // by createdAt. Without `sortStoryGroupsInPlace`, a newly arriving
        // group with an unviewed but older story would still be inserted at
        // index 0 — which is the bug. With it, Carol stays in front only if
        // she still has unviewed content. Test the inverse here: Carol is
        // all-viewed, Alice posts a new unviewed older story → Alice goes on
        // top because hasUnviewed beats createdAt.
        let carolViewedRecent = makeStoryItem(
            id: "carol",
            isViewed: true,
            createdAt: Date(timeIntervalSince1970: 2_000_000)
        )
        sut.storyGroups = [
            makeStoryGroup(userId: "carol", username: "carol", stories: [carolViewedRecent]),
        ]

        sut.subscribeToSocketEvents()

        let aliceNewerButOlderPost = Self.makeStoryAPIPost(
            id: "alice-new",
            authorId: "alice",
            authorUsername: "alice",
            createdAt: "2026-01-10T12:00:00.000Z" // older than carol's timestamp
        )
        mockSocket.storyCreated.send(aliceNewerButOlderPost)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 2)
        XCTAssertEqual(
            sut.storyGroups[0].id, "alice",
            "Alice (unviewed) must outrank carol (viewed) even though carol's story is more recent"
        )
        XCTAssertEqual(sut.storyGroups[1].id, "carol")
    }

    /// When a remote `story:deleted` removes the last unviewed story of a
    /// group, that group must drop below remaining unviewed peers on the
    /// next sort pass (same invariant as storyViewed, but the trigger is
    /// removal instead of transition).
    func test_socketStoryDeleted_rebalancesTrayAfterUnviewedStoryGone() async {
        // Alice has 2 stories: one viewed (old), one unviewed (recent) →
        // group is hasUnviewed=true and sits in front of Bob's all-viewed
        // group. When the unviewed story is deleted remotely, alice goes
        // all-viewed and Bob takes the front slot.
        let aliceViewed = makeStoryItem(
            id: "alice-viewed",
            isViewed: true,
            createdAt: Date(timeIntervalSince1970: 1_000_000)
        )
        let aliceUnviewed = makeStoryItem(
            id: "alice-unviewed-target",
            isViewed: false,
            createdAt: Date(timeIntervalSince1970: 2_000_000)
        )
        let bobViewed = makeStoryItem(
            id: "bob-viewed",
            isViewed: true,
            createdAt: Date(timeIntervalSince1970: 1_500_000)
        )
        sut.storyGroups = [
            makeStoryGroup(userId: "alice", username: "alice", stories: [aliceViewed, aliceUnviewed]),
            makeStoryGroup(userId: "bob", username: "bob", stories: [bobViewed]),
        ]

        sut.subscribeToSocketEvents()

        let deletedData: SocketStoryDeletedData = JSONStub.decode("""
        {"storyId":"alice-unviewed-target","authorId":"alice"}
        """)
        mockSocket.storyDeleted.send(deletedData)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 2, "Alice still has remaining story → group not removed")
        XCTAssertEqual(
            sut.storyGroups[0].id, "bob",
            "Both groups now all-viewed; bob's latest (1_500_000) outranks alice's surviving story (1_000_000)"
        )
        XCTAssertFalse(sut.storyGroups[0].hasUnviewed)
        XCTAssertFalse(sut.storyGroups[1].hasUnviewed)
    }

    /// When the last unviewed story of a group is marked as viewed, the group
    /// must drop below any remaining unviewed group on the next sort pass.
    func test_socketStoryViewed_dropsAllViewedGroupBelowUnviewedPeers() async {
        let aliceStory = makeStoryItem(id: "alice-1", isViewed: false,
                                       createdAt: Date(timeIntervalSince1970: 2_500_000))
        let bobStory = makeStoryItem(id: "bob-1", isViewed: false,
                                     createdAt: Date(timeIntervalSince1970: 1_000_000))
        // Alice on top initially (both unviewed, alice more recent).
        sut.storyGroups = [
            makeStoryGroup(userId: "alice", username: "alice", stories: [aliceStory]),
            makeStoryGroup(userId: "bob", username: "bob", stories: [bobStory]),
        ]

        sut.subscribeToSocketEvents()

        // Mark Alice's only story as viewed → alice.hasUnviewed flips to false,
        // bob is still unviewed → bob takes the front slot. `SocketStoryViewedData`
        // is a `Decodable`-only struct (no public memberwise init), so we
        // synthesize it via the JSON path the live socket would actually use.
        let viewedData: SocketStoryViewedData = JSONStub.decode("""
        {"storyId":"alice-1","viewerId":"me","viewerUsername":"me","viewCount":1}
        """)
        mockSocket.storyViewed.send(viewedData)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(sut.storyGroups[0].id == "bob",
                      "Bob keeps unviewed content so he must outrank the now-all-viewed Alice")
        XCTAssertFalse(sut.storyGroups[1].hasUnviewed,
                       "Alice's group is now fully viewed")
    }

    // MARK: - didReconnect Tests (rts-02)

    /// Après un flap réseau, des stories ont pu être créées/supprimées pendant
    /// la coupure : le reconnect social doit rattraper le tray par un delta
    /// depuis le curseur max(updatedAt) des stories affichées.
    func test_didReconnect_fetchesStoriesDeltaFromTrayCursor() async {
        let t1 = Date(timeIntervalSinceNow: -600)
        let t2 = Date(timeIntervalSinceNow: -300)
        sut.storyGroups = [
            makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1", updatedAt: t1)]),
            makeStoryGroup(userId: "u2", stories: [makeStoryItem(id: "s2", updatedAt: t2)]),
        ]
        mockStoryService.listResult = .success(Self.makeDeltaResponse())
        sut.subscribeToSocketEvents()

        mockSocket.didReconnect.send(())
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(mockStoryService.listCallCount, 1,
                       "le reconnect social déclenche un fetch stories")
        XCTAssertEqual(mockStoryService.lastListUpdatedSince, t2,
                       "le curseur delta = max(updatedAt) du tray, calculé au moment de l'événement")
    }

    /// Un fetch déjà en vol ne doit pas être doublé par le reconnect.
    func test_didReconnect_whileLoading_skipsFetch() async {
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "s1", updatedAt: Date())])]
        sut.isLoading = true
        sut.subscribeToSocketEvents()

        mockSocket.didReconnect.send(())
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(mockStoryService.listCallCount, 0,
                       "un chargement en vol absorbe le rattrapage du reconnect")
    }

    /// Vérifie le CÂBLAGE didReconnect → fetchStoriesFromNetwork : la purge
    /// par tombstones est une logique existante déjà testée par ailleurs.
    func test_didReconnect_deltaWithTombstones_purgesDeletedStories() async {
        let kept = makeStoryItem(id: "s1", updatedAt: Date())
        let deleted = makeStoryItem(id: "s2", updatedAt: Date())
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [kept, deleted])]
        mockStoryService.listResult = .success(Self.makeDeltaResponse(deletedStoryIds: ["s2"]))
        sut.subscribeToSocketEvents()

        mockSocket.didReconnect.send(())
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s1"],
                       "la story tombstonée pendant la coupure sort du tray au reconnect")
    }

    // MARK: - Lookup Method Tests

    func test_storyGroupForUser_returnsMatchingGroup() {
        let group = makeStoryGroup(userId: "lookup-user")
        sut.storyGroups = [group]

        let result = sut.storyGroupForUser(userId: "lookup-user")

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.id, "lookup-user")
    }

    func test_storyGroupForUser_returnsNilForUnknownUser() {
        let group = makeStoryGroup(userId: "known-user")
        sut.storyGroups = [group]

        let result = sut.storyGroupForUser(userId: "unknown-user")

        XCTAssertNil(result)
    }

    func test_hasStories_returnsTrueWhenGroupExists() {
        let group = makeStoryGroup(userId: "has-stories-user")
        sut.storyGroups = [group]

        XCTAssertTrue(sut.hasStories(forUserId: "has-stories-user"))
    }

    func test_hasStories_returnsFalseWhenNoGroup() {
        XCTAssertFalse(sut.hasStories(forUserId: "no-group-user"))
    }

    func test_hasUnviewedStories_returnsTrueWhenUnviewedExist() {
        let item = makeStoryItem(id: "unviewed", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        XCTAssertTrue(sut.hasUnviewedStories(forUserId: "u1"))
    }

    func test_hasUnviewedStories_returnsFalseWhenAllViewed() {
        let item = makeStoryItem(id: "viewed", isViewed: true)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        XCTAssertFalse(sut.hasUnviewedStories(forUserId: "u1"))
    }

    func test_groupIndex_returnsCorrectIndex() {
        let group1 = makeStoryGroup(userId: "first")
        let group2 = makeStoryGroup(userId: "second")
        sut.storyGroups = [group1, group2]

        XCTAssertEqual(sut.groupIndex(forUserId: "second"), 1)
    }

    func test_groupIndex_returnsNilForUnknownUser() {
        let group = makeStoryGroup(userId: "known")
        sut.storyGroups = [group]

        XCTAssertNil(sut.groupIndex(forUserId: "unknown"))
    }

    // MARK: - Background Publishing

    func test_publishStoryInBackground_setsActiveUpload() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertNotNil(sut.activeUpload)
        XCTAssertEqual(sut.activeUpload?.progress, 0)
    }

    func test_publishStoryInBackground_closesComposer() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())
        sut.showStoryComposer = true

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertFalse(sut.showStoryComposer)
    }

    /// C5 — composer une 2e story pendant qu'une monte n'est plus interdit.
    /// L'ancien `test_publishStoryInBackground_blocksSecondPublish` verrouillait
    /// exactement le rejet silencieux que ce lot supprime.
    func test_publishStoryInBackground_secondPublishDuringUpload_isStackedNotDropped() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )
        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertEqual(sut.activeUploads.count, 2, "La 2e publication est empilée, pas rejetée")
        XCTAssertEqual(Set(sut.activeUploads.map(\.id)).count, 2, "Deux entrées distinctes")
    }

    /// Synchrone après les deux taps : l'invariant « une seule monte à la fois »
    /// est pinné par `StoryUploadQueueTests` (qui suspend le 1er upload) ; ici
    /// on ne vérifie que l'état de NAISSANCE des entrées.
    func test_publishStoryInBackground_secondPublish_bothEntriesStartPreparing() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()], slideImages: [:], loadedImages: [:], loadedVideoURLs: [:]
        )
        sut.publishStoryInBackground(
            slides: [StorySlide()], slideImages: [:], loadedImages: [:], loadedVideoURLs: [:]
        )

        // Les deux entrées naissent `.preparing` : leur intent write-ahead
        // n'est pas encore durable, aucune n'est drainable.
        XCTAssertEqual(sut.activeUploads.filter { $0.phase == .preparing }.count, 2)
    }

    func test_cancelUpload_clearsActiveUpload() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        guard let uploadId = sut.activeUpload?.id else {
            XCTFail("publishStoryInBackground doit créer une entrée active")
            return
        }
        sut.cancelUpload(id: uploadId)
        XCTAssertNil(sut.activeUpload)
    }

    // MARK: - Publish Story Tests (Point 84)

    func test_publishStory_multiSlides_callsService() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "multi-slide-story"))

        sut.publishStoryInBackground(
            slides: [StorySlide(), StorySlide(), StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertNotNil(sut.activeUpload, "Should start an upload for multi-slide story")
        XCTAssertFalse(sut.showStoryComposer, "Composer should close when publishing starts")
    }

    // MARK: - executeQueuedPublish() Tests (V3 reconstruction)

    private static func makeTextOnlySlide(
        id: String = UUID().uuidString,
        content: String = "Hello"
    ) -> StorySlide {
        StorySlide(id: id, content: content, effects: StoryEffects(), duration: 5, order: 0)
    }

    private static func makeQueueItem(
        slides: [StorySlide],
        mediaReferences: [StoryMediaReference] = [],
        visibility: String = "PUBLIC"
    ) throws -> StoryPublishQueueItem {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode(slides)
        return StoryPublishQueueItem(
            visibility: visibility,
            slidesPayload: payload,
            repostOfId: nil,
            mediaReferences: mediaReferences
        )
    }

    /// Exercises the queue-driven (headless) story upload path. Pure model
    /// + mock-service tests; the TUS network branches in `runStoryUpload`
    /// only fire when slides include local media, so the success-path
    /// tests use text-only slides and validate the post-creation hops.
    func test_executeQueuedPublish_corruptPayload_throwsUnrecoverable() async {
        mockAPI.authToken = "test-token"
        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: Data("not valid json".utf8),
            mediaReferences: []
        )

        do {
            _ = try await sut.executeQueuedPublish(item: item)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            // EXPECTED — terminal failure, queue should drop the item
        } catch {
            XCTFail("Expected StoryPublishUnrecoverableError, got \(type(of: error))")
        }
        XCTAssertEqual(mockPostService.createStoryCallCount, 0)
    }

    func test_executeQueuedPublish_emptySlides_throwsUnrecoverable() async {
        mockAPI.authToken = "test-token"
        let item = try? Self.makeQueueItem(slides: [])
        XCTAssertNotNil(item)

        do {
            _ = try await sut.executeQueuedPublish(item: item!)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            // EXPECTED
        } catch {
            XCTFail("Expected StoryPublishUnrecoverableError, got \(type(of: error))")
        }
        XCTAssertEqual(mockPostService.createStoryCallCount, 0)
    }

    func test_executeQueuedPublish_missingMediaFile_throwsUnrecoverable() async throws {
        mockAPI.authToken = "test-token"
        let slide = Self.makeTextOnlySlide()
        let bogusRef = StoryMediaReference(
            elementId: "slide-bg-\(slide.id)",
            mediaType: "image",
            localFilePath: "/tmp/this-file-does-not-exist-\(UUID().uuidString).jpg"
        )
        let item = try Self.makeQueueItem(slides: [slide], mediaReferences: [bogusRef])

        do {
            _ = try await sut.executeQueuedPublish(item: item)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            // EXPECTED
        } catch {
            XCTFail("Expected StoryPublishUnrecoverableError, got \(type(of: error))")
        }
        XCTAssertEqual(mockPostService.createStoryCallCount, 0)
    }

    func test_executeQueuedPublish_unknownMediaType_throwsUnrecoverable() async throws {
        mockAPI.authToken = "test-token"
        let slide = Self.makeTextOnlySlide()
        // Real temp file so the existence check passes — failure should
        // come from the dispatch on `mediaType`, not the missing-file guard.
        let tempPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("test-\(UUID().uuidString).bin").path
        FileManager.default.createFile(atPath: tempPath, contents: Data())
        defer { try? FileManager.default.removeItem(atPath: tempPath) }

        let strangeRef = StoryMediaReference(
            elementId: "weird",
            mediaType: "hologram",
            localFilePath: tempPath
        )
        let item = try Self.makeQueueItem(slides: [slide], mediaReferences: [strangeRef])

        do {
            _ = try await sut.executeQueuedPublish(item: item)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            // EXPECTED
        } catch {
            XCTFail("Expected StoryPublishUnrecoverableError, got \(type(of: error))")
        }
    }

    /// P2 — a foreground media object declared in the slide's effects but with
    /// no matching entry in `loadedImages`/`loadedVideoURLs` (composer/state
    /// desync — e.g. the queue replay has no `StoryMediaReference` for it)
    /// used to be silently dropped: neither the `.video` nor `.image` branch
    /// of the upload loop matched, no log fired, and the layer would simply
    /// never render for any viewer. Symmetrical with the audio branch (which
    /// already logs `"clip will be uploaded but unplayable"` on the same kind
    /// of miss): the publish must still succeed, just without that one layer.
    func test_executeQueuedPublish_mediaObjectWithoutLoadedAsset_skipsWithoutThrowing() async throws {
        mockAPI.authToken = "test-token"
        let orphanMedia = StoryMediaObject(
            id: "orphan-1",
            mediaType: "image",
            aspectRatio: 1.0
        )
        let slide = StorySlide(
            id: UUID().uuidString,
            content: "Text with a dangling media ref",
            effects: StoryEffects(mediaObjects: [orphanMedia]),
            duration: 5,
            order: 0
        )
        // No `StoryMediaReference` for "orphan-1" — `loadedImages` stays empty.
        let item = try Self.makeQueueItem(slides: [slide])
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-orphan-media", content: slide.content, authorId: "a1", authorUsername: "alice"
        ))

        let result = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(result, "post-orphan-media",
            "A media object without a loaded asset must be skipped, not crash the whole publish")
        XCTAssertEqual(mockPostService.createStoryCallCount, 1)
    }

    func test_executeQueuedPublish_textOnlySingleSlide_returnsLastPostId() async throws {
        mockAPI.authToken = "test-token"
        let slide = Self.makeTextOnlySlide(content: "First story ever")
        let item = try Self.makeQueueItem(slides: [slide])
        let serverId = "post-server-\(UUID().uuidString)"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: serverId, content: "First story ever",
            authorId: "a1", authorUsername: "alice"
        ))

        let result = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(result, serverId,
            "executeQueuedPublish should return the server-assigned post id")
        XCTAssertEqual(mockPostService.createStoryCallCount, 1)
    }

    func test_executeQueuedPublish_textOnlyMultiSlide_returnsLastPostId() async throws {
        mockAPI.authToken = "test-token"
        let slides = [
            Self.makeTextOnlySlide(content: "Slide 1"),
            Self.makeTextOnlySlide(content: "Slide 2"),
            Self.makeTextOnlySlide(content: "Slide 3")
        ]
        let item = try Self.makeQueueItem(slides: slides)
        // Mock returns the same stub id for every call; we validate the
        // call count, not the id-per-call mapping (mock isn't queue-aware).
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-stub", content: "stub", authorId: "a1", authorUsername: "alice"
        ))

        let result = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(result, "post-stub")
        XCTAssertEqual(mockPostService.createStoryCallCount, 3,
            "createStory should be called once per slide")
    }

    func test_executeQueuedPublish_doesNotMutate_activeUpload() async throws {
        mockAPI.authToken = "test-token"
        XCTAssertNil(sut.activeUpload, "Precondition: no active upload")
        let item = try Self.makeQueueItem(slides: [Self.makeTextOnlySlide()])
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-1", content: "stub", authorId: "a1", authorUsername: "alice"
        ))

        _ = try await sut.executeQueuedPublish(item: item)

        XCTAssertNil(sut.activeUpload,
            "Queue path must not touch activeUpload (no banner side-effects)")
    }

    func test_executeQueuedPublish_createStoryFailure_throwsRetryable() async throws {
        mockAPI.authToken = "test-token"
        let item = try Self.makeQueueItem(slides: [Self.makeTextOnlySlide()])
        mockPostService.createStoryResult = .failure(
            APIError.networkError(URLError(.timedOut))
        )

        do {
            _ = try await sut.executeQueuedPublish(item: item)
            XCTFail("Expected throw")
        } catch is StoryPublishUnrecoverableError {
            XCTFail("Network errors should remain retryable, not unrecoverable")
        } catch {
            // EXPECTED — any non-Unrecoverable error bubbles so the queue
            // schedules a retry per its exponential backoff policy.
        }
    }

    // MARK: - executeQueuedPublish() Cleanup

    func test_executeQueuedPublish_cleansUpMediaReferences_onSuccess() async throws {
        mockAPI.authToken = "test-token"
        // Create a real temp file so loadMediaFromReferences can resolve it,
        // and we can later assert it was removed.
        let tempPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("test-cleanup-\(UUID().uuidString).bin").path
        FileManager.default.createFile(atPath: tempPath, contents: Data())
        XCTAssertTrue(FileManager.default.fileExists(atPath: tempPath),
            "Precondition: temp file exists")

        // The reference uses "video" so `loadMediaFromReferences` does NOT
        // attempt to decode it as an image (would fail on empty Data). Only
        // the file path is plumbed; runStoryUpload skips video upload when
        // there is no matching mediaObject in the slide effects.
        let ref = StoryMediaReference(
            elementId: "elt-\(UUID().uuidString)",
            mediaType: "video",
            localFilePath: tempPath
        )
        let item = try Self.makeQueueItem(
            slides: [Self.makeTextOnlySlide()],
            mediaReferences: [ref]
        )
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-1", content: "stub", authorId: "a1", authorUsername: "alice"
        ))

        _ = try await sut.executeQueuedPublish(item: item)

        XCTAssertFalse(FileManager.default.fileExists(atPath: tempPath),
            "Persisted draft media file should be deleted after successful publish")
    }

    // MARK: - enqueueStoryForOfflinePublish() Tests

    func test_enqueueStoryForOfflinePublish_addsItemToQueue() async throws {
        // Reset the queue so the count assertion is deterministic.
        await StoryPublishQueue.shared.clearAll()
        let initialCount = await StoryPublishQueue.shared.count
        XCTAssertEqual(initialCount, 0, "Precondition: queue is empty")

        let slide = Self.makeTextOnlySlide(content: "Offline story")

        await sut.enqueueStoryForOfflinePublish(
            slides: [slide],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            loadedAudioURLs: [:],
            visibility: "PUBLIC",
            visibilityUserIds: []
        )

        let count = await StoryPublishQueue.shared.count
        XCTAssertEqual(count, 1, "Queue should hold the enqueued item")

        let items = await StoryPublishQueue.shared.pendingItems
        XCTAssertEqual(items.first?.visibility, "PUBLIC")
        XCTAssertNil(items.first?.repostOfId)

        // Cleanup so unrelated tests don't see this item.
        await StoryPublishQueue.shared.clearAll()
    }

    func test_enqueueStoryForOfflinePublish_doesNotMutate_activeUpload() async {
        await StoryPublishQueue.shared.clearAll()
        XCTAssertNil(sut.activeUpload, "Precondition: no active upload")

        await sut.enqueueStoryForOfflinePublish(
            slides: [Self.makeTextOnlySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            loadedAudioURLs: [:],
            visibility: "PUBLIC",
            visibilityUserIds: []
        )

        XCTAssertNil(sut.activeUpload,
            "Offline path must not touch activeUpload (no banner side-effect)")

        await StoryPublishQueue.shared.clearAll()
    }

    // MARK: - F3 — originalLanguage forwarded on the publish entry points (Prisme)

    /// The offline enqueue entry point must STAMP the resolved source language
    /// onto the persisted `StoryPublishQueueItem` so the gateway routes NLLB-200
    /// on flush. Pre-WS5.1 this argument was hardcoded `nil` (Prisme regression):
    /// a non-nil `originalLanguage` here must survive into the queue.
    func test_enqueueStoryForOfflinePublish_forwardsOriginalLanguage() async throws {
        await StoryPublishQueue.shared.clearAll()

        await sut.enqueueStoryForOfflinePublish(
            slides: [Self.makeTextOnlySlide(content: "Hallo")],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            loadedAudioURLs: [:],
            originalLanguage: "de",
            visibility: "PUBLIC",
            visibilityUserIds: []
        )

        let items = await StoryPublishQueue.shared.pendingItems
        XCTAssertEqual(items.first?.originalLanguage, "de",
                       "the resolved source language must be persisted onto the queue item")

        await StoryPublishQueue.shared.clearAll()
    }

    /// The queued-REPLAY entry point (`executeQueuedPublish`) must thread the
    /// item's persisted `originalLanguage` into the `createStory` call. This is
    /// the previously-buggy path (hardcoded nil before WS5.1) and has no other
    /// app-side coverage — a missed argument here would silently drop the source
    /// language on every offline story that flushes after reconnect.
    func test_executeQueuedPublish_forwardsOriginalLanguageToCreateStory() async throws {
        mockAPI.authToken = "test-token"
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode([Self.makeTextOnlySlide(content: "Hej")])
        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: payload,
            originalLanguage: "sv"
        )
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(
            id: "post-sv", content: "Hej", authorId: "a1", authorUsername: "alice"
        ))

        _ = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(mockPostService.lastCreateStoryOriginalLanguage, "sv",
                       "the queued item's originalLanguage must reach createStory on replay")
    }

    // MARK: - Realtime story reactions (it.23 — story:reacted/unreacted wiring)

    func test_applyStoryReactionDelta_reacted_incrementsCount() {
        var item = makeStoryItem(id: "react-me")
        item.reactionCount = 2
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [item])]

        sut.applyStoryReactionDelta(storyId: "react-me", userId: "other", emoji: "❤️", delta: +1)
        XCTAssertEqual(sut.storyGroups[0].stories[0].reactionCount, 3,
                       "story:reacted doit +1 le compteur en temps réel")
    }

    func test_applyStoryReactionDelta_unreacted_decrementsCount() {
        var item = makeStoryItem(id: "react-me")
        item.reactionCount = 2
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [item])]

        sut.applyStoryReactionDelta(storyId: "react-me", userId: "other", emoji: "❤️", delta: -1)
        XCTAssertEqual(sut.storyGroups[0].stories[0].reactionCount, 1,
                       "story:unreacted doit -1 le compteur en temps réel")
    }

    func test_applyStoryReactionDelta_clampsAtZero() {
        var item = makeStoryItem(id: "react-me")
        item.reactionCount = 0
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [item])]

        sut.applyStoryReactionDelta(storyId: "react-me", userId: "other", emoji: "❤️", delta: -1)
        XCTAssertEqual(sut.storyGroups[0].stories[0].reactionCount, 0,
                       "le compteur ne descend jamais sous 0")
    }

    func test_storyUnreacted_socketEvent_decrementsCount() {
        var item = makeStoryItem(id: "react-me")
        item.reactionCount = 3
        sut.storyGroups = [makeStoryGroup(userId: "u1", stories: [item])]
        sut.subscribeToSocketEvents()  // câble les sinks (la View l'appelle au onAppear)

        // Vérifie le câblage complet : sink `storyUnreacted` → applyStoryReactionDelta.
        let exp = expectation(description: "story:unreacted applied")
        mockSocket.storyUnreacted.send(
            SocketStoryUnreactedData(storyId: "react-me", userId: "other", emoji: "❤️"))
        DispatchQueue.main.async { exp.fulfill() }  // après le hop receive(on:.main) du sink
        wait(for: [exp], timeout: 1.0)

        XCTAssertEqual(sut.storyGroups[0].stories[0].reactionCount, 2,
                       "le sink story:unreacted doit décrémenter via applyStoryReactionDelta")
    }

    // MARK: - StoryCoverThumbnail (local-first tray cover, hybrid Phase 1)

    func test_storyCoverThumbnail_cacheKey_isSyntheticAndStoryScoped() {
        XCTAssertEqual(StoryCoverThumbnail.cacheKey(storyId: "abc123"), "story-cover:abc123")
        // Distinct per story so covers never collide; synthetic scheme so it never
        // collides with a media-URL cache entry.
        XCTAssertNotEqual(StoryCoverThumbnail.cacheKey(storyId: "a"),
                          StoryCoverThumbnail.cacheKey(storyId: "b"))
    }

    func test_preferredCoverURL_prefersLocalComposite_overServerThumbnail() {
        let local = URL(fileURLWithPath: "/tmp/story-cover.jpg")
        let resolved = StoryCoverThumbnail.preferredCoverURLString(
            localCover: local, serverThumbnailUrl: "https://cdn/x.jpg",
            mediaUrl: "https://cdn/raw.mp4", mediaIsImage: false, avatarURL: "https://cdn/avatar.png")
        XCTAssertEqual(resolved, local.absoluteString,
                       "local composite (captures text/drawing) must win over the server thumbnail")
    }

    func test_preferredCoverURL_fallbackChain_whenNoLocalCover() {
        // server thumb wins when no local cover
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: "https://cdn/thumb.jpg",
                mediaUrl: "https://cdn/raw.mp4", mediaIsImage: false, avatarURL: "av"),
            "https://cdn/thumb.jpg")
        // empty server thumb is skipped → image media url
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: "",
                mediaUrl: "https://cdn/raw.jpg", mediaIsImage: true, avatarURL: "av"),
            "https://cdn/raw.jpg")
        // nothing but avatar
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: nil, mediaUrl: nil, mediaIsImage: false, avatarURL: "av"),
            "av")
    }

    func test_preferredCoverURL_videoWithoutThumbnail_skipsMediaURL_fallsBackToAvatar() {
        // A video mediaUrl is never decodable by CachedAvatarImage — must not be
        // used as the tray cover, even when there is no server thumbnail.
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: nil,
                mediaUrl: "https://cdn/raw.mp4", mediaIsImage: false, avatarURL: "https://cdn/avatar.png"),
            "https://cdn/avatar.png",
            "video without a thumbnail must fall through to the avatar, never the raw mp4 URL")
    }

    func test_preferredCoverURL_imageWithoutThumbnail_usesMediaURL() {
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: nil,
                mediaUrl: "https://cdn/raw.jpg", mediaIsImage: true, avatarURL: "https://cdn/avatar.png"),
            "https://cdn/raw.jpg",
            "image without a thumbnail can safely use the raw (decodable) media URL")
    }

    // MARK: - ReceiverCoverPlan (aperçu à la volée côté récepteur)

    private func makeReceiverStory(
        id: String = "recv-1",
        media: [FeedMedia] = [],
        effects: StoryEffects?
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: "story",
            media: media,
            storyEffects: effects,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(72000),
            isViewed: false
        )
    }

    func test_receiverCoverPlan_textOnColoredBackground_isRenderableWithoutAnyImage() {
        var fx = StoryEffects()
        fx.background = "FF5733"
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(media: [FeedMedia(id: "m-audio", type: .audio, url: "https://cdn/voice.m4a")], effects: fx))

        XCTAssertNotNil(plan, "texte/fond coloré + audio : la composition est dérivable sans aucune image")
        XCTAssertNil(plan?.legacyBackgroundURL)
        XCTAssertEqual(plan?.imageURLsByObjectId, [:])
        XCTAssertEqual(plan?.requiredObjectIds, [])
    }

    func test_receiverCoverPlan_modernImageBackground_requiresItsImage() {
        var fx = StoryEffects()
        var bg = StoryMediaObject(id: "obj-bg", mediaURL: "https://cdn/bg.jpg", kind: .image, aspectRatio: 1.0)
        bg.isBackground = true
        fx.mediaObjects = [bg]
        let plan = StoryCoverThumbnail.receiverCoverPlan(for: makeReceiverStory(effects: fx))

        XCTAssertEqual(plan?.imageURLsByObjectId["obj-bg"], "https://cdn/bg.jpg")
        XCTAssertEqual(plan?.requiredObjectIds, ["obj-bg"],
                       "le fond moderne est la couche dominante : sans son image, pas de cover")
    }

    func test_receiverCoverPlan_videoBackground_isNotRenderable() {
        var fx = StoryEffects()
        var bg = StoryMediaObject(id: "obj-bg", mediaURL: "https://cdn/bg.mp4", kind: .video, aspectRatio: 1.0)
        bg.isBackground = true
        fx.mediaObjects = [bg]
        XCTAssertNil(StoryCoverThumbnail.receiverCoverPlan(for: makeReceiverStory(effects: fx)),
                     "fond vidéo : pas de poster frame côté récepteur — laisser la chaîne existante décider")

        var colorFx = StoryEffects()
        colorFx.background = "112233"
        XCTAssertNil(
            StoryCoverThumbnail.receiverCoverPlan(
                for: makeReceiverStory(media: [FeedMedia(id: "m-v", type: .video, url: "https://cdn/raw.mp4")], effects: colorFx)),
            "fond legacy vidéo : idem, jamais de cover sans la couche dominante")
    }

    func test_receiverCoverPlan_legacyImageBackground_fillsBgImageSlot() {
        var fx = StoryEffects()
        fx.background = "000000"
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(media: [FeedMedia(id: "m-bg", type: .image, url: "https://cdn/legacy.jpg")], effects: fx))

        XCTAssertEqual(plan?.legacyBackgroundURL, "https://cdn/legacy.jpg")
        XCTAssertEqual(plan?.requiredObjectIds, [])
    }

    func test_receiverCoverPlan_imageSticker_loadsItsPostMediaUnderTheElementId() {
        var fx = StoryEffects()
        fx.background = "101010"
        fx.stickerObjects = [StorySticker(id: "st-1", emoji: "🖼️", postMediaId: "pm-sticker")]
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(
                media: [FeedMedia(id: "pm-sticker", type: .image, url: "https://cdn/sticker.png")],
                effects: fx))

        XCTAssertEqual(plan?.imageURLsByObjectId["st-1"], "https://cdn/sticker.png",
                       "l'image d'un sticker entre par le MÊME slot que les autres médias, keyée par id d'élément")
        XCTAssertEqual(plan?.requiredObjectIds, [],
                       "jamais indispensable : sans elle le renderer peint l'emoji de repli, ce qui vaut mieux que pas de cover")
    }

    func test_receiverCoverPlan_emojiSticker_loadsNothing() {
        var fx = StoryEffects()
        fx.background = "101010"
        fx.stickerObjects = [StorySticker(id: "st-1", emoji: "🔥")]
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(
                media: [FeedMedia(id: "pm-other", type: .image, url: "https://cdn/other.png")],
                effects: fx))

        XCTAssertEqual(plan?.imageURLsByObjectId, [:],
                       "un sticker emoji n'a aucune image à charger")
    }

    func test_receiverCoverPlan_stickerMedia_isNeverMistakenForTheLegacyBackground() {
        var fx = StoryEffects()
        fx.background = "101010"
        fx.stickerObjects = [StorySticker(id: "st-1", emoji: "🖼️", postMediaId: "pm-sticker")]
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(
                media: [FeedMedia(id: "pm-sticker", type: .image, url: "https://cdn/sticker.png")],
                effects: fx))

        XCTAssertNil(plan?.legacyBackgroundURL,
                     "l'image d'un sticker est attachée au post comme les autres : la prendre pour le fond la peindrait PLEIN CADRE derrière la composition")
        XCTAssertEqual(plan?.imageURLsByObjectId["st-1"], "https://cdn/sticker.png",
                       "elle reste chargée — à sa place, celle du sticker")
    }

    func test_receiverCoverPlan_stickerWhosePostMediaIsMissing_stillYieldsACover() {
        var fx = StoryEffects()
        fx.background = "101010"
        fx.stickerObjects = [StorySticker(id: "st-1", emoji: "🖼️", postMediaId: "pm-vanished")]
        let plan = StoryCoverThumbnail.receiverCoverPlan(for: makeReceiverStory(effects: fx))

        XCTAssertNotNil(plan, "un média de sticker introuvable ne doit pas priver la story de sa cover")
        XCTAssertEqual(plan?.imageURLsByObjectId, [:])
    }

    func test_receiverCoverPlan_withoutEffects_isNil() {
        XCTAssertNil(StoryCoverThumbnail.receiverCoverPlan(for: makeReceiverStory(effects: nil)))
    }

    func test_receiverCoverCandidates_skipLastStoriesAlreadyCovered() {
        let coveredLast = makeStoryItem(id: "covered-last")
        let uncoveredLast = makeStoryItem(id: "uncovered-last")
        let groups = [
            makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "u1-old"), coveredLast]),
            makeStoryGroup(userId: "u2", username: "bob", stories: [uncoveredLast])
        ]

        let candidates = StoryCoverThumbnail.receiverCoverCandidates(
            groups: groups, hasLocalCover: { $0 == "covered-last" })

        XCTAssertEqual(candidates.map(\.id), ["uncovered-last"],
                       "seule la DERNIÈRE story de chaque groupe compte, et jamais celles déjà couvertes")
    }

    // MARK: - mediaURLStrings (prefetch dedup — extraction pure)

    func test_mediaURLStrings_extractsAndDeduplicatesMediaURLs() {
        let media = [
            FeedMedia(id: "m-bg", type: .image, url: "https://cdn/bg.jpg"),
            FeedMedia(id: "m-fg", type: .video, url: "https://cdn/fg.mp4"),
            FeedMedia(id: "m-dup", type: .image, url: "https://cdn/bg.jpg") // doublon d'URL
        ]
        let item = StoryItem(id: "s1", media: media, storyEffects: nil, createdAt: Date())

        let urls = Set(StoryViewModel.mediaURLStrings(for: item))

        XCTAssertEqual(urls, ["https://cdn/bg.jpg", "https://cdn/fg.mp4"],
                       "URLs média extraites et dédupliquées")
    }

    func test_mediaURLStrings_emptyMedia_returnsEmpty() {
        let item = StoryItem(id: "s1", media: [], storyEffects: nil, createdAt: Date())
        XCTAssertTrue(StoryViewModel.mediaURLStrings(for: item).isEmpty)
    }

    // MARK: - Offline optimistic visibility (P4 — voir ses stories hors-ligne)

    func test_optimisticStoryId_isTempIdScopedAndIndexed() {
        XCTAssertEqual(StoryViewModel.optimisticStoryId(tempStoryId: "pending_abc", slideIndex: 0),
                       "pending_abc#0")
        XCTAssertEqual(StoryViewModel.optimisticStoryId(tempStoryId: "pending_abc", slideIndex: 2),
                       "pending_abc#2")
        // Préfixé par le tempStoryId → retrait par préfixe possible.
        XCTAssertTrue(StoryViewModel.optimisticStoryId(tempStoryId: "pending_abc", slideIndex: 1)
            .hasPrefix("pending_abc#"))
    }

    func test_removeOptimisticStories_removesPendingKeepsPublished() {
        let pending0 = makeStoryItem(id: "pending_x#0")
        let pending1 = makeStoryItem(id: "pending_x#1")
        let published = makeStoryItem(id: "server-real-id")
        sut.storyGroups = [makeStoryGroup(userId: "me", stories: [published, pending0, pending1])]

        sut.removeOptimisticStories(tempStoryId: "pending_x")

        XCTAssertEqual(sut.storyGroups.count, 1)
        XCTAssertEqual(sut.storyGroups[0].stories.map(\.id), ["server-real-id"],
                       "seuls les placeholders pending_x#* sont retirés, la vraie story reste")
    }

    func test_removeOptimisticStories_removesGroupWhenAllPending() {
        let pending0 = makeStoryItem(id: "pending_y#0")
        sut.storyGroups = [makeStoryGroup(userId: "me", stories: [pending0])]

        sut.removeOptimisticStories(tempStoryId: "pending_y")

        XCTAssertTrue(sut.storyGroups.isEmpty,
                      "un groupe ne contenant que des pending devient vide → retiré")
    }

    func test_removeOptimisticStories_unrelatedTempId_isNoOp() {
        let pending0 = makeStoryItem(id: "pending_x#0")
        sut.storyGroups = [makeStoryGroup(userId: "me", stories: [pending0])]

        sut.removeOptimisticStories(tempStoryId: "pending_OTHER")

        XCTAssertEqual(sut.storyGroups[0].stories.map(\.id), ["pending_x#0"],
                       "un tempId sans correspondance ne touche à rien")
    }

    func test_insertOptimisticOfflineStories_insertsUnderCurrentUserAsViewed() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")
        sut.storyGroups = []

        sut.insertOptimisticOfflineStories(
            slides: [Self.makeTextOnlySlide(id: "slide-a", content: "Bonjour"),
                     Self.makeTextOnlySlide(id: "slide-b", content: "Coucou")],
            slideImages: [:],
            loadedImages: [:],
            tempStoryId: "pending_z",
            visibility: "PUBLIC"
        )

        XCTAssertEqual(sut.storyGroups.count, 1, "groupe créé pour l'auteur")
        XCTAssertEqual(sut.storyGroups[0].id, "me-id")
        let ids = sut.storyGroups[0].stories.map(\.id)
        XCTAssertTrue(ids.contains("pending_z#0") && ids.contains("pending_z#1"),
                      "une story optimiste par slide, id préfixé par le tempStoryId")
        XCTAssertTrue(sut.storyGroups[0].stories.allSatisfy { $0.isViewed },
                      "ses propres stories sont marquées vues (pas d'anneau non-lu sur soi-même)")
    }

    func test_insertOptimisticOfflineStories_noCurrentUser_isNoOp() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = nil
        sut.storyGroups = []

        sut.insertOptimisticOfflineStories(
            slides: [Self.makeTextOnlySlide()],
            slideImages: [:], loadedImages: [:],
            tempStoryId: "pending_z", visibility: "PUBLIC"
        )

        XCTAssertTrue(sut.storyGroups.isEmpty, "sans utilisateur courant, aucune insertion")
    }

    // MARK: - Archive auteur (« Mes stories », stories en cours ET passées)

    func test_loadMyStoriesArchive_mergesMissingStoriesIntoSelfGroup() async {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        let live = makeStoryItem(id: "s-live")
        sut.storyGroups = [makeStoryGroup(userId: "me-id", username: "Moi", stories: [live])]
        // L'archive renvoie la story vivante ET une story passée absente du tray.
        let archived = Self.makeStoryAPIPost(id: "s-archived", authorId: "me-id", authorUsername: "me")
        let liveAgain = Self.makeStoryAPIPost(id: "s-live", authorId: "me-id", authorUsername: "me")
        mockStoryService.listMineResult = .success(Self.makeStoriesResponse(posts: [liveAgain, archived]))

        await sut.loadMyStoriesArchive()

        let selfIds = sut.storyGroups.first(where: { $0.id == "me-id" })?.stories.map(\.id) ?? []
        XCTAssertTrue(selfIds.contains("s-archived"),
                      "la story passée rejoint le groupe self — « Mes stories » liste l'historique complet")
        XCTAssertEqual(selfIds.filter { $0 == "s-live" }.count, 1,
                       "dédup par id : la story déjà présente n'est pas dupliquée")
        XCTAssertEqual(mockStoryService.listMineCallCount, 1)
    }

    func test_loadMyStoriesArchive_networkFailure_leavesTrayUntouched() async {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        let live = makeStoryItem(id: "s-live")
        sut.storyGroups = [makeStoryGroup(userId: "me-id", username: "Moi", stories: [live])]
        mockStoryService.listMineResult = .failure(NSError(domain: "test", code: -1009))

        await sut.loadMyStoriesArchive()

        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["s-live"])
    }

    /// Local-first : un drain ABOUTI verrouille les suivants (chaque
    /// apparition de MyStoriesView relançait jusqu'à 10 pages de refetch d'une
    /// archive immuable) ; un drain raté reste RETENTABLE.
    func test_loadMyStoriesArchive_successfulDrainRunsOnce_failedDrainRetries() async {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")
        sut.storyGroups = [makeStoryGroup(userId: "me-id", username: "Moi", stories: [makeStoryItem(id: "s-live")])]

        // Échec réseau : le garde ne se verrouille pas, le retry re-frappe.
        mockStoryService.listMineResult = .failure(NSError(domain: "test", code: -1009))
        await sut.loadMyStoriesArchive()
        XCTAssertEqual(mockStoryService.listMineCallCount, 1)

        // Drain abouti…
        let archived = Self.makeStoryAPIPost(id: "s-archived", authorId: "me-id", authorUsername: "me")
        mockStoryService.listMineResult = .success(Self.makeStoriesResponse(posts: [archived]))
        await sut.loadMyStoriesArchive()
        XCTAssertEqual(mockStoryService.listMineCallCount, 2)

        // …puis plus AUCUN refetch aux apparitions suivantes.
        await sut.loadMyStoriesArchive()
        XCTAssertEqual(mockStoryService.listMineCallCount, 2,
                       "l'archive déjà drainée se ressert du local sans réseau")
    }

    func test_applyRepublishedStory_replacesItemInPlace_sameId() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        let stale = makeStoryItem(id: "s-repub")
        sut.storyGroups = [makeStoryGroup(userId: "me-id", username: "Moi", stories: [stale])]
        let republished = Self.makeStoryAPIPost(id: "s-repub", authorId: "me-id", authorUsername: "me")

        sut.applyRepublishedStory(republished)

        let selfStories = sut.storyGroups.first(where: { $0.id == "me-id" })?.stories ?? []
        XCTAssertEqual(selfStories.filter { $0.id == "s-repub" }.count, 1,
                       "la republication remplace l'item EN PLACE — même id, jamais de doublon")
    }

    func test_loadStories_forceNetwork_preservesPendingOptimisticStories() async {
        // L'auteur a une story optimiste hors-ligne en attente. Un refetch réseau
        // (qui ne la contient pas) ne doit PAS la faire disparaître du tray.
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        let pending = makeStoryItem(id: "pending_keep#0")
        sut.storyGroups = [makeStoryGroup(userId: "me-id", username: "Moi", stories: [pending])]

        // Le serveur renvoie une story d'un AUTRE auteur, sans la pending.
        let serverPost = Self.makeStoryAPIPost(id: "s-other", authorId: "other", authorUsername: "bob")
        mockStoryService.listResult = .success(Self.makeStoriesResponse(posts: [serverPost]))

        await sut.loadStories(forceNetwork: true)

        let allIds = sut.storyGroups.flatMap { $0.stories.map(\.id) }
        XCTAssertTrue(allIds.contains("pending_keep#0"),
                      "la story optimiste en attente survit au refetch réseau")
        XCTAssertTrue(allIds.contains("s-other"),
                      "les stories serveur sont bien chargées en parallèle")
    }

    // MARK: - Garde « viewed monotone » raffinée (édition de story, 2026-07-29)
    //
    // Une fois vue localement, une story reste vue même si le serveur (laggé)
    // dit le contraire — SAUF quand son contenu a été édité APRÈS la vue
    // locale : le serveur a alors volontairement effacé les vues (reset
    // d'engagement) et la story redevient légitimement non-vue.

    func test_shouldKeepLocalViewed_noContentEdit_keepsViewed() {
        XCTAssertTrue(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: Date(), contentEditedAt: nil))
        XCTAssertTrue(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: nil, contentEditedAt: nil))
    }

    func test_shouldKeepLocalViewed_editAfterLocalView_yieldsToServer() {
        let viewedAt = Date(timeIntervalSinceNow: -3600)
        let editedAt = Date()
        XCTAssertFalse(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: viewedAt, contentEditedAt: editedAt),
            "Édition postérieure à la vue → la story redevient non-vue")
    }

    func test_shouldKeepLocalViewed_viewAfterEdit_keepsViewed() {
        let editedAt = Date(timeIntervalSinceNow: -3600)
        let viewedAt = Date()
        XCTAssertTrue(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: viewedAt, contentEditedAt: editedAt),
            "Une vue POSTÉRIEURE à l'édition reste acquise (re-vue de la nouvelle version)")
    }

    func test_shouldKeepLocalViewed_editedButNoLocalTimestamp_yieldsToServer() {
        XCTAssertFalse(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: nil, contentEditedAt: Date(timeIntervalSinceNow: -60)),
            "Vue sans horodatage (cache legacy) : impossible de prouver qu'elle est postérieure à l'édition → la vérité serveur gagne")
    }

    func test_insertOrMergeStoryGroups_replacing_contentEditedAfterView_resetsViewed() {
        let viewedAt = Date(timeIntervalSinceNow: -3600)
        var local = makeStoryItem(id: "s-edit")
        local.isViewed = true
        local.viewedAt = viewedAt
        sut.storyGroups = [makeStoryGroup(userId: "author-1", username: "alice", stories: [local])]

        var incoming = makeStoryItem(id: "s-edit")
        incoming.isViewed = false
        incoming.contentEditedAt = Date()
        sut.insertOrMergeStoryGroups(
            [makeStoryGroup(userId: "author-1", username: "alice", stories: [incoming])],
            replacingExisting: true
        )

        XCTAssertEqual(sut.storyGroups.first?.stories.first?.isViewed, false,
                       "Le reset d'engagement fait céder la monotonie : la story redevient non-vue")
    }

    func test_insertOrMergeStoryGroups_replacing_noContentEdit_staysViewed() {
        var local = makeStoryItem(id: "s-lag")
        local.isViewed = true
        local.viewedAt = Date()
        sut.storyGroups = [makeStoryGroup(userId: "author-1", username: "alice", stories: [local])]

        var incoming = makeStoryItem(id: "s-lag")
        incoming.isViewed = false
        sut.insertOrMergeStoryGroups(
            [makeStoryGroup(userId: "author-1", username: "alice", stories: [incoming])],
            replacingExisting: true
        )

        XCTAssertEqual(sut.storyGroups.first?.stories.first?.isViewed, true,
                       "Sans édition de contenu, le lag serveur ne dévisse jamais l'état vu local")
    }

    func test_insertOrMergeStoryGroups_replacing_ownStory_neverResetsViewed() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        var local = makeStoryItem(id: "s-mine")
        local.isViewed = true
        local.viewedAt = Date(timeIntervalSinceNow: -3600)
        sut.storyGroups = [makeStoryGroup(userId: "me-id", username: "Moi", stories: [local])]

        var incoming = makeStoryItem(id: "s-mine")
        incoming.isViewed = false
        incoming.contentEditedAt = Date()
        sut.insertOrMergeStoryGroups(
            [makeStoryGroup(userId: "me-id", username: "Moi", stories: [incoming])],
            replacingExisting: true
        )

        XCTAssertEqual(sut.storyGroups.first?.stories.first?.isViewed, true,
                       "L'état « vu » de ses PROPRES stories est client-only (recordView exclut l'auteur) — jamais dévissé")
    }

    // MARK: - BW-IOS-02 : politique d'auto-téléchargement du préchargement de stories

    /// Le préchargement du tray tirait le corps MP4 ENTIER sans consulter
    /// `MediaDownloadPolicyEngine` : « Vidéo : Wi-Fi uniquement » — le RÉGLAGE
    /// PAR DÉFAUT — n'avait aucun effet en cellulaire.
    func test_shouldPrefetchStoryMedia_videoOnCellularWithWifiOnlyPolicy_returnsFalse() {
        let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .video, condition: .goodCellular, prefs: .defaults
        )

        XCTAssertFalse(StoryViewModel.shouldPrefetchStoryMedia(
            kind: .video, allowImage: true, allowVideo: allowVideo, allowAudio: true
        ), "prefs.video vaut .wifiOnly par défaut : aucun octet vidéo en cellulaire")
    }

    func test_shouldPrefetchStoryMedia_videoOnWifi_returnsTrue() {
        let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .video, condition: .wifi, prefs: .defaults
        )

        XCTAssertTrue(StoryViewModel.shouldPrefetchStoryMedia(
            kind: .video, allowImage: false, allowVideo: allowVideo, allowAudio: false
        ), "en Wi-Fi, rien ne change : l'ouverture d'une story vidéo reste instantanée")
    }

    func test_shouldPrefetchStoryMedia_imageOnGoodCellularWithDefaults_returnsTrue() {
        let allowImage = MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .image, condition: .goodCellular, prefs: .defaults
        )

        XCTAssertTrue(StoryViewModel.shouldPrefetchStoryMedia(
            kind: .image, allowImage: allowImage, allowVideo: false, allowAudio: false
        ), "prefs.image vaut .wifiAndGoodCellular par défaut : la vignette passe")
    }

    /// Axe propre à la story (la jumelle du carousel de bulle n'a que
    /// image/vidéo) : un vocal de story suit `prefs.audio`, jamais `prefs.image`.
    func test_shouldPrefetchStoryMedia_audio_gatedOnAllowAudio() {
        XCTAssertTrue(StoryViewModel.shouldPrefetchStoryMedia(
            kind: .audio, allowImage: false, allowVideo: false, allowAudio: true
        ))
        XCTAssertFalse(StoryViewModel.shouldPrefetchStoryMedia(
            kind: .audio, allowImage: true, allowVideo: true, allowAudio: false
        ))
    }

    // MARK: - Source guard — le prefetch consulte bien la politique (câblage, pas seulement la table de vérité)

    /// Les tests `test_shouldPrefetchStoryMedia_*` ci-dessus couvrent la table
    /// de vérité du prédicat PUR, jamais son câblage : supprimer le
    /// `guard Self.shouldPrefetchStoryMedia(…) else { … }` dans
    /// `prefetchStoryMediaURLs` les laisserait tous verts alors que le défaut
    /// BW-IOS-02 serait entièrement rétabli. Garde de SOURCE visant le BLOC de
    /// la fonction (jamais le fichier entier), équilibrée par accolades via
    /// `DeclarationBodyScanner` — insensible aux commentaires ajoutés au-dessus.
    func test_prefetchStoryMediaURLs_blockConsultsTheDownloadPolicy() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/ViewModels
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/ViewModels/StoryViewModel.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))

        guard let body = DeclarationBodyScanner.body(containing: "private static func prefetchStoryMediaURLs(", in: source) else {
            XCTFail("prefetchStoryMediaURLs body not found — StoryViewModel.swift changed shape, update this guard's anchor.")
            return
        }

        XCTAssertTrue(
            body.contains("shouldPrefetchStoryMedia("),
            "prefetchStoryMediaURLs must consult StoryViewModel.shouldPrefetchStoryMedia(...) before touching a URL — " +
            "otherwise the truth-table tests above stay green while the download policy is silently bypassed."
        )
    }

}
