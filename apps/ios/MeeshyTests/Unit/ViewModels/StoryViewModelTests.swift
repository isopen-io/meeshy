import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// `StoryViewModel` — le CHARGEMENT du tray : pages, delta, purge, fetch unitaire,
/// persistance des mutations locales, recherche, archive de l'auteur.
@MainActor
final class StoryViewModelTests: StoryViewModelTestCase {

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

    // MARK: - R4 inc.2 : fetch unitaire par postId (story hors tray)

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
}
