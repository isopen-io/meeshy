import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
final class StatusViewModelTests: XCTestCase {

    private var sut: StatusViewModel!
    private var mockStatusService: MockStatusService!
    private var mockSocket: MockSocialSocket!
    private var mockAuthManager: MockAuthManager!
    private var mockPostService: MockPostService!
    private var cancellables: Set<AnyCancellable>!

    override func setUp() async throws {
        try await super.setUp()
        // Clear any cached statuses from previous tests to ensure fresh state
        await CacheCoordinator.shared.statuses.invalidate(for: "statuses_friends")
        await CacheCoordinator.shared.statuses.invalidate(for: "statuses_discover")
        mockStatusService = MockStatusService()
        mockSocket = MockSocialSocket()
        mockAuthManager = MockAuthManager()
        mockPostService = MockPostService()
        cancellables = []
        sut = StatusViewModel(
            mode: .friends,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager,
            postService: mockPostService
        )
    }

    override func tearDown() async throws {
        cancellables = nil
        sut = nil
        mockStatusService = nil
        mockSocket = nil
        mockAuthManager = nil
        mockPostService = nil
        try await super.tearDown()
    }

    // MARK: - Factory Helpers

    private static func makeStatusAPIPost(
        id: String = "status-1",
        content: String? = "Feeling great",
        moodEmoji: String = "\u{1F389}",
        authorId: String = "author-1",
        authorUsername: String = "alice",
        createdAt: String = "2026-01-15T12:00:00.000Z"
    ) -> APIPost {
        let contentJSON = content.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STATUS",
            "content": \(contentJSON),
            "moodEmoji": "\(moodEmoji)",
            "createdAt": "\(createdAt)",
            "author": {"id": "\(authorId)", "username": "\(authorUsername)"}
        }
        """)
    }

    private static func makeStatusesResponse(
        posts: [APIPost],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPost]> {
        let cursorJSON: String
        if let cursor = nextCursor {
            cursorJSON = """
            {"nextCursor":"\(cursor)","hasMore":\(hasMore),"limit":20}
            """
        } else {
            cursorJSON = "null"
        }
        let items = posts.map { p in
            let contentJSON = p.content.map { "\"\($0)\"" } ?? "null"
            let moodJSON = p.moodEmoji.map { "\"\($0)\"" } ?? "null"
            let createdAtFormatter = ISO8601DateFormatter()
            createdAtFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let createdAtStr = createdAtFormatter.string(from: p.createdAt)
            return """
            {"id":"\(p.id)","type":"STATUS","content":\(contentJSON),"moodEmoji":\(moodJSON),"createdAt":"\(createdAtStr)","author":{"id":"\(p.author.id)","username":"\(p.author.username ?? "user")"}}
            """
        }
        let postsJSON = "[\(items.joined(separator: ","))]"
        return JSONStub.decode("""
        {"success":true,"data":\(postsJSON),"pagination":\(cursorJSON),"error":null}
        """)
    }

    private func makeStatusEntry(
        id: String = "entry-1",
        userId: String = "user-1",
        username: String = "alice",
        moodEmoji: String = "\u{1F389}",
        content: String? = "Test status"
    ) -> StatusEntry {
        StatusEntry(
            id: id,
            userId: userId,
            username: username,
            avatarColor: "FF2E63",
            moodEmoji: moodEmoji,
            content: content,
            audioUrl: nil,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(3600)
        )
    }

    // MARK: - loadStatuses() Tests

    func test_loadStatuses_success_populatesStatuses() async {
        let status1 = Self.makeStatusAPIPost(id: "s1", content: "Happy", moodEmoji: "\u{1F389}", authorId: "u1", authorUsername: "alice")
        let status2 = Self.makeStatusAPIPost(id: "s2", content: "Working", moodEmoji: "\u{1F4AA}", authorId: "u2", authorUsername: "bob")
        let response = Self.makeStatusesResponse(posts: [status1, status2])
        mockStatusService.listResult = .success(response)

        await sut.loadStatuses()

        XCTAssertEqual(sut.statuses.count, 2)
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadStatuses_friendsMode_setsMyStatusToFirst() async {
        let status1 = Self.makeStatusAPIPost(id: "my-status", content: "My mood", moodEmoji: "\u{1F525}", authorId: "me", authorUsername: "me")
        let response = Self.makeStatusesResponse(posts: [status1])
        mockStatusService.listResult = .success(response)

        await sut.loadStatuses()

        XCTAssertNotNil(sut.myStatus)
        XCTAssertEqual(sut.myStatus?.id, "my-status")
    }

    func test_loadStatuses_discoverMode_doesNotSetMyStatus() async {
        let discoverVM = StatusViewModel(
            mode: .discover,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager
        )
        let status1 = Self.makeStatusAPIPost(id: "discover-status", moodEmoji: "\u{1F389}", authorId: "other")
        let response = Self.makeStatusesResponse(posts: [status1])
        mockStatusService.listResult = .success(response)

        await discoverVM.loadStatuses()

        XCTAssertNil(discoverVM.myStatus, "Discover mode should not set myStatus")
    }

    func test_loadStatuses_failure_friendsMode_setsError() async {
        mockStatusService.listResult = .failure(APIError.networkError(URLError(.notConnectedToInternet)))

        await sut.loadStatuses()

        XCTAssertTrue(sut.statuses.isEmpty, "Should not populate statuses on failure")
        XCTAssertNotNil(sut.error, "Should set error on failure")
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadStatuses_failure_discoverMode_setsError() async {
        let discoverVM = StatusViewModel(
            mode: .discover,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager
        )
        mockStatusService.listResult = .failure(APIError.networkError(URLError(.notConnectedToInternet)))

        await discoverVM.loadStatuses()

        XCTAssertTrue(discoverVM.statuses.isEmpty, "Discover mode should not populate statuses on failure")
        XCTAssertNotNil(discoverVM.error, "Should set error on failure")
    }

    func test_loadStatuses_responseNotSuccess_setsError() async {
        let failResponse: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":false,"data":[],"pagination":null,"error":"Unavailable"}
        """)
        mockStatusService.listResult = .success(failResponse)

        await sut.loadStatuses()

        XCTAssertTrue(sut.statuses.isEmpty, "Should not populate statuses on non-success response")
        XCTAssertNotNil(sut.error, "Should set error on non-success response")
    }

    func test_loadStatuses_guardsAgainstDoubleLoad() async {
        let response: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        mockStatusService.listResult = .success(response)

        await sut.loadStatuses()
        await sut.loadStatuses()

        XCTAssertLessThanOrEqual(mockStatusService.listCallCount, 2)
    }

    func test_loadStatuses_passesCorrectMode() async {
        let response: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        mockStatusService.listResult = .success(response)

        await sut.loadStatuses()

        XCTAssertEqual(mockStatusService.lastListMode, .friends)
    }

    // MARK: - setStatus() Tests

    func test_setStatus_success_setsMyStatusAndInsertsAtIndexZero() async {
        let createdPost = Self.makeStatusAPIPost(id: "new-status", content: "New mood", moodEmoji: "\u{1F525}", authorId: "me")
        mockStatusService.createResult = .success(createdPost)

        await sut.setStatus(emoji: "\u{1F525}", content: "New mood")

        XCTAssertNotNil(sut.myStatus)
        XCTAssertEqual(sut.myStatus?.moodEmoji, "\u{1F525}")
        XCTAssertEqual(sut.statuses.count, 1)
        XCTAssertEqual(sut.statuses[0].id, "new-status")
        XCTAssertEqual(mockStatusService.createCallCount, 1)
    }

    func test_setStatus_failure_doesNotCreateLocalEntry() async {
        mockStatusService.createResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.setStatus(emoji: "\u{2615}", content: "Coffee time")

        XCTAssertNil(sut.myStatus, "Should not create local entry on failure")
        XCTAssertTrue(sut.statuses.isEmpty, "No entry should be inserted on failure")
    }

    func test_setStatus_passesCorrectParameters() async {
        let createdPost = Self.makeStatusAPIPost(id: "param-test", moodEmoji: "\u{1F389}", authorId: "me")
        mockStatusService.createResult = .success(createdPost)

        await sut.setStatus(emoji: "\u{1F389}", content: "Party", visibility: "FRIENDS", visibilityUserIds: ["u1", "u2"])

        XCTAssertEqual(mockStatusService.lastCreateMoodEmoji, "\u{1F389}")
        XCTAssertEqual(mockStatusService.lastCreateContent, "Party")
        XCTAssertEqual(mockStatusService.lastCreateVisibility, "FRIENDS")
        XCTAssertEqual(mockStatusService.lastCreateVisibilityUserIds, ["u1", "u2"])
        XCTAssertEqual(
            mockStatusService.lastCreateOriginalLanguage, "fr",
            "Le mood part en français par défaut (Prisme, public cible France — directive 2026-07-30)"
        )
    }

    // MARK: - L'ANCRAGE (loi 5) — republier un mood en POST permanent

    /// **Un ancrage est un POST, jamais un mood.**
    ///
    /// Le MIROIR (`setStatus`) republie en `STATUS` — éphémère, détruit une
    /// heure plus tard par le balayage d'expiration. L'ANCRAGE part par
    /// `POST /posts/:id/repost` avec `targetType: .post`, le seul chemin qui
    /// instantanie les octets d'une source éphémère.
    ///
    /// `targetType` est mesuré ICI plutôt que laissé au serveur : le gateway a
    /// un filet (`?? POST`) qui rendrait un `nil` client invisible en
    /// production. Ce test nomme l'INTENTION, pas le résultat.
    func test_lAncrage_republieLaSourceEnPOST_etNonEnStatus() async {
        let accepte = await sut.anchorStatusAsPost(
            sourceStatusId: "mood-7", content: nil, visibility: "FRIENDS"
        )

        XCTAssertTrue(accepte, "Un serveur qui accepte doit rendre une acceptation — le meuble n'en referme pas d'autre.")
        XCTAssertEqual(mockPostService.repostCallCount, 1)
        XCTAssertEqual(mockPostService.lastRepostPostId, "mood-7")
        XCTAssertEqual(
            mockPostService.lastRepostTargetType, .post,
            "Sans `targetType: .post`, seule la valeur par défaut du gateway sauverait l'ancrage — un défaut "
                + "client invisible depuis l'app."
        )
        XCTAssertEqual(mockPostService.lastRepostVisibility, "FRIENDS")
        XCTAssertEqual(
            mockStatusService.createCallCount, 0,
            "L'ancrage n'emprunte JAMAIS le chemin du mood : `POST /statuses` produirait un contenu qui expire."
        )
    }

    /// **Republier sans un mot est un repost SIMPLE, jamais une citation.**
    ///
    /// **Ce que `isQuote` coûte ICI n'est PAS l'enracinement des réactions**, et
    /// la rédaction précédente l'invoquait à tort. C'est l'argument des deux
    /// publieurs jumeaux (`FeedViewModel.repostPost`, `StoryViewerView`), dont
    /// les sources sont des POSTS. Le gateway ajoute un troisième terme —
    /// `!post.isQuote && post.repostOfId && !repostRootIsEphemeral` — et une
    /// source `STATUS` EST éphémère : `reactionRootId` est le repost lui-même,
    /// quel que soit `isQuote`. Vérifier au bon étage compte : croire l'argument
    /// sans le descendre ferait « corriger » cette garde dans le mauvais sens.
    ///
    /// Ce qu'une fausse citation coûte réellement sur cette porte est double, et
    /// se lit dans `PostService.repostPost` : sans `content`, un reshare de
    /// `STATUS` hérite du corps de sa source ET de son `originalLanguage`
    /// DÉCLARÉ (`inheritStatusBody`) ; avec un `content`, le post affiche deux
    /// fois la même phrase — une en commentaire, une dans la carte citée — et sa
    /// langue est re-DÉTECTÉE sur ces trois mots, ce qui mal-étiquette le Prisme
    /// au rang 0.
    ///
    /// **Ce que ce test NE couvre pas, et qui vit ailleurs** : le composer
    /// PRÉREMPLIT sa saisie avec la phrase de la source, si bien que le cas
    /// nominal n'arrive jamais ici avec `content: nil`. C'est
    /// `ComposerAnchorComment.authored` qui le ramène à `nil`, et
    /// `ComposerMoodSurfaceTests` l'éprouve. Le modèle, lui, garde la règle du
    /// BLANC — deux questions distinctes, deux étages.
    func test_lAncrage_sansUnMot_estUnRepostSIMPLE_jamaisUneCitation() async {
        _ = await sut.anchorStatusAsPost(sourceStatusId: "mood-7", content: nil, visibility: "PUBLIC")

        XCTAssertNil(mockPostService.lastRepostContent)
        XCTAssertEqual(mockPostService.lastRepostIsQuote, false)

        _ = await sut.anchorStatusAsPost(sourceStatusId: "mood-7", content: "   \n ", visibility: "PUBLIC")

        XCTAssertNil(
            mockPostService.lastRepostContent,
            "Trois espaces et un retour à la ligne ne sont pas un commentaire."
        )
        XCTAssertEqual(
            mockPostService.lastRepostIsQuote, false,
            "Un blanc déclaré « citation » ferait enraciner les réactions sur le repost au lieu de l'original."
        )
    }

    /// … et republier AVEC un mot est une citation, sans quoi la garde
    /// ci-dessus serait verte sur un publieur qui ne cite jamais.
    func test_lAncrage_avecUnMot_estUneCITATION() async {
        _ = await sut.anchorStatusAsPost(sourceStatusId: "mood-7", content: "je garde", visibility: "PUBLIC")

        XCTAssertEqual(mockPostService.lastRepostContent, "je garde")
        XCTAssertEqual(mockPostService.lastRepostIsQuote, true)
    }

    /// **Un refus se DIT, et il se REMONTE.**
    ///
    /// C'est ce que la branche MIROIR ne sait pas faire : `setStatus` avale son
    /// erreur réseau dans un `catch` qui se contente d'un toast, et le meuble
    /// referme donc sur une perte. L'ancrage rend `false`, le meuble reste
    /// ouvert, et l'auteur garde sa saisie.
    func test_lAncrage_renduFalse_quandLeServeurRefuse() async {
        mockPostService.repostResult = .failure(APIError.networkError(URLError(.timedOut)))

        let accepte = await sut.anchorStatusAsPost(
            sourceStatusId: "mood-7", content: "je garde", visibility: "PUBLIC"
        )

        XCTAssertFalse(
            accepte,
            "Un `true` inconditionnel referait le défaut du miroir : le composer se referme sur un envoi perdu, "
                + "et cette fermeture-là reste PLAUSIBLE — elle ressemble à un succès."
        )
    }

    /// **L'ancrage n'écrit RIEN dans la barre de moods** — et c'est la mutation
    /// la plus tentante du lot.
    ///
    /// `setStatus` insère son entrée (`myStatus = entry ; statuses.insert(entry,
    /// at: 0)`) parce qu'un mood publié EST une humeur. Un ancrage produit un
    /// POST : recopier ces deux lignes ferait apparaître dans la barre une
    /// entrée que le prochain `loadStatuses` effacerait sans un mot.
    func test_lAncrage_nInsereRienDansLesMoods_carUnAncrageEstUnPOST() async {
        let entry = makeStatusEntry(id: "deja-la", userId: "me")
        sut.statuses = [entry]

        let accepte = await sut.anchorStatusAsPost(
            sourceStatusId: "deja-la", content: "je garde", visibility: "PUBLIC"
        )

        XCTAssertTrue(accepte)
        XCTAssertEqual(sut.statuses.map(\.id), ["deja-la"], "La barre de moods ne gagne pas une entrée pour un POST.")
        XCTAssertNil(sut.myStatus, "Un ancrage n'est pas l'humeur courante de son auteur.")
    }

    /// **Hors ligne, le refus se dit TOUT DE SUITE.**
    ///
    /// L'ancrage n'a pas de file durable — il n'enfile rien, il appelle le
    /// réseau. Le doc-comment promettait déjà « hors ligne, le refus est DIT et
    /// la saisie gardée » ; sans ce garde, il ne l'était qu'après le délai
    /// d'expiration d'`URLSession`, la flèche restant grise
    /// (`isPublishingDocument`) tout ce temps pour finir sur le même toast.
    ///
    /// Le prédicat est celui que le modèle possède DÉJÀ, injecté et doublé —
    /// celui sur lequel `setStatus` bascule vers sa file. La différence entre
    /// les deux branches n'est pas la lecture du réseau : c'est que le MIROIR a
    /// un endroit où retomber.
    func test_lAncrage_horsLigne_refuseSansToucherLeReseau() async {
        let horsLigne = StatusViewModel(
            mode: .friends,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager,
            postService: mockPostService,
            isOffline: { true }
        )

        let accepte = await horsLigne.anchorStatusAsPost(
            sourceStatusId: "mood-7", content: "je garde", visibility: "PUBLIC"
        )

        XCTAssertFalse(accepte, "Le meuble doit garder la saisie : un ancrage perdu hors ligne ne se rejoue pas.")
        XCTAssertEqual(
            mockPostService.repostCallCount, 0,
            "Hors ligne, l'ancrage ne doit pas partir sur le réseau pour y attendre son délai d'expiration."
        )
    }

    /// … et EN LIGNE il part, sans quoi la garde ci-dessus resterait verte sur
    /// un publieur qui aurait cessé de publier.
    func test_lAncrage_enLigne_partBienSurLeReseau() async {
        let enLigne = StatusViewModel(
            mode: .friends,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager,
            postService: mockPostService,
            isOffline: { false }
        )

        let accepte = await enLigne.anchorStatusAsPost(
            sourceStatusId: "mood-7", content: "je garde", visibility: "PUBLIC"
        )

        XCTAssertTrue(accepte)
        XCTAssertEqual(mockPostService.repostCallCount, 1)
    }

    // MARK: - clearStatus() Tests

    func test_clearStatus_clearsMyStatusAndRemovesFromList() async {
        let entry = makeStatusEntry(id: "to-clear", userId: "me")
        sut.myStatus = entry
        sut.statuses = [entry]

        await sut.clearStatus()

        XCTAssertNil(sut.myStatus)
        XCTAssertTrue(sut.statuses.isEmpty)
        XCTAssertEqual(mockStatusService.deleteCallCount, 1)
        XCTAssertEqual(mockStatusService.lastDeleteStatusId, "to-clear")
    }

    func test_clearStatus_noMyStatus_doesNothing() async {
        sut.myStatus = nil

        await sut.clearStatus()

        XCTAssertEqual(mockStatusService.deleteCallCount, 0, "Should not call delete when no myStatus exists")
    }

    func test_clearStatus_serviceFailure_rollsBack() async {
        let entry = makeStatusEntry(id: "fail-clear", userId: "me")
        sut.myStatus = entry
        sut.statuses = [entry]
        mockStatusService.deleteResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.clearStatus()

        XCTAssertNotNil(sut.myStatus, "Should rollback on service failure")
        XCTAssertEqual(sut.statuses.count, 1, "Should restore status in list on service failure")
        XCTAssertEqual(sut.statuses[0].id, "fail-clear")
    }

    // MARK: - Socket.IO Tests

    func test_socketStatusCreated_insertsAtIndexZero() async {
        sut.subscribeToSocketEvents()

        let statusPost = Self.makeStatusAPIPost(
            id: "socket-status",
            content: "From socket",
            moodEmoji: "\u{1F389}",
            authorId: "someone"
        )
        mockSocket.statusCreated.send(statusPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.statuses.count, 1)
        XCTAssertEqual(sut.statuses[0].id, "socket-status")
    }

    func test_socketStatusCreated_deduplicatesExistingStatus() async {
        let existing = makeStatusEntry(id: "dup-status")
        sut.statuses = [existing]

        sut.subscribeToSocketEvents()

        let duplicatePost = Self.makeStatusAPIPost(
            id: "dup-status",
            moodEmoji: "\u{1F389}",
            authorId: "author-1"
        )
        mockSocket.statusCreated.send(duplicatePost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.statuses.count, 1, "Duplicate status should not be added")
    }

    func test_socketStatusDeleted_removesById() async {
        let entry = makeStatusEntry(id: "delete-me-status")
        sut.statuses = [entry]

        sut.subscribeToSocketEvents()

        mockSocket.statusDeleted.send("delete-me-status")

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(sut.statuses.isEmpty, "Status should be removed after socket delete event")
    }

    func test_socketStatusUpdated_updatesExistingEntry() async {
        let existing = makeStatusEntry(id: "update-me", content: "Old content")
        sut.statuses = [existing]

        sut.subscribeToSocketEvents()

        let updatedPost = Self.makeStatusAPIPost(
            id: "update-me",
            content: "Updated content",
            moodEmoji: "\u{1F525}",
            authorId: "author-1"
        )
        mockSocket.statusUpdated.send(updatedPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.statuses.count, 1)
        XCTAssertEqual(sut.statuses[0].content, "Updated content")
    }

    // MARK: - reactToStatus() optimistic + statusReacted reception

    func test_reactToStatus_optimisticallyIncrementsReactionSummary() async {
        let entry = StatusEntry(id: "s1", userId: "u", username: "a", avatarColor: "FFFFFF", moodEmoji: "\u{1F389}")
        sut.statuses = [entry]
        mockStatusService.reactResult = .success(())

        await sut.reactToStatus("s1", emoji: "\u{2764}")

        XCTAssertEqual(sut.statuses[0].reactionSummary?["\u{2764}"], 1)
    }

    func test_reactToStatus_failure_rollsBackReactionSummary() async {
        let entry = StatusEntry(id: "s1", userId: "u", username: "a", avatarColor: "FFFFFF",
                                moodEmoji: "\u{1F389}", reactionSummary: ["\u{2764}": 2])
        sut.statuses = [entry]
        mockStatusService.reactResult = .failure(NSError(domain: "test", code: 1))

        await sut.reactToStatus("s1", emoji: "\u{2764}")

        // L'optimisme (3) est annule : on revient a l'etat anterieur (2).
        XCTAssertEqual(sut.statuses[0].reactionSummary?["\u{2764}"], 2)
    }

    func test_socketStatusReacted_fromOtherUser_incrementsReactionSummary() async {
        let entry = StatusEntry(id: "s1", userId: "u", username: "a", avatarColor: "FFFFFF", moodEmoji: "\u{1F389}")
        sut.statuses = [entry]
        sut.subscribeToSocketEvents()

        let json = "{\"statusId\":\"s1\",\"userId\":\"other\",\"emoji\":\"\u{1F44D}\"}".data(using: .utf8)!
        let payload = try! JSONDecoder().decode(SocketStatusReactedData.self, from: json)
        mockSocket.statusReacted.send(payload)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.statuses[0].reactionSummary?["\u{1F44D}"], 1)
    }

    // MARK: - loadMoreIfNeeded() Tests

    func test_loadMoreIfNeeded_triggersWhenNearEnd() async {
        // First load with hasMore and a cursor
        let initialStatuses = (0..<5).map { i in
            Self.makeStatusAPIPost(
                id: "status-\(i)",
                content: "Status \(i)",
                moodEmoji: "\u{1F389}",
                authorId: "u\(i)",
                authorUsername: "user\(i)"
            )
        }
        let initialResponse = Self.makeStatusesResponse(
            posts: initialStatuses,
            hasMore: true,
            nextCursor: "cursor-1"
        )
        mockStatusService.listResult = .success(initialResponse)
        await sut.loadStatuses()

        XCTAssertEqual(sut.statuses.count, 5)

        // Set up the next page response
        let moreStatuses = [
            Self.makeStatusAPIPost(id: "status-5", moodEmoji: "\u{1F389}", authorId: "u5", authorUsername: "user5")
        ]
        let moreResponse = Self.makeStatusesResponse(posts: moreStatuses)
        mockStatusService.listResult = .success(moreResponse)

        // Trigger loadMore with the last item (within threshold of 3)
        let lastStatus = sut.statuses.last!
        await sut.loadMoreIfNeeded(currentStatus: lastStatus)

        XCTAssertEqual(sut.statuses.count, 6, "More statuses should be appended")
        XCTAssertFalse(sut.isLoadingMore)
    }

    func test_loadMoreIfNeeded_doesNotTriggerWhenNotNearEnd() async {
        let initialStatuses = (0..<10).map { i in
            Self.makeStatusAPIPost(
                id: "status-\(i)",
                content: "Status \(i)",
                moodEmoji: "\u{1F389}",
                authorId: "u\(i)",
                authorUsername: "user\(i)"
            )
        }
        let initialResponse = Self.makeStatusesResponse(
            posts: initialStatuses,
            hasMore: true,
            nextCursor: "cursor-1"
        )
        mockStatusService.listResult = .success(initialResponse)
        await sut.loadStatuses()

        // Reset count after initial load
        let loadCountAfterInit = mockStatusService.listCallCount

        // Trigger with the first item (not near end)
        let firstStatus = sut.statuses.first!
        await sut.loadMoreIfNeeded(currentStatus: firstStatus)

        XCTAssertEqual(mockStatusService.listCallCount, loadCountAfterInit, "Should not load more when not near end")
    }

    // MARK: - refresh() Tests

    func test_refresh_resetsStateAndReloads() async {
        let response: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        mockStatusService.listResult = .success(response)

        await sut.refresh()

        XCTAssertEqual(mockStatusService.listCallCount, 1)
    }

    // MARK: - Lookup Tests

    func test_statusForUser_returnsMatchingEntry() {
        let entry = makeStatusEntry(id: "lookup-entry", userId: "target-user")
        sut.statuses = [entry]

        let result = sut.statusForUser(userId: "target-user")

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.id, "lookup-entry")
    }

    func test_statusForUser_returnsNilForUnknownUser() {
        let entry = makeStatusEntry(userId: "known-user")
        sut.statuses = [entry]

        let result = sut.statusForUser(userId: "unknown-user")

        XCTAssertNil(result)
    }

    // MARK: - Current User Info Tests

    func test_currentUserDisplayName_usesDisplayName() {
        let user = MeeshyUser(id: "me", username: "testuser", displayName: "Test Display")
        mockAuthManager.simulateLoggedIn(user: user)

        XCTAssertEqual(sut.currentUserDisplayName, "Test Display")
    }

    func test_currentUserDisplayName_fallsBackToUsername() {
        let user = MeeshyUser(id: "me", username: "testuser")
        mockAuthManager.simulateLoggedIn(user: user)

        XCTAssertEqual(sut.currentUserDisplayName, "testuser")
    }

    func test_currentUserDisplayName_fallsBackToMoi() {
        mockAuthManager.currentUser = nil

        XCTAssertEqual(sut.currentUserDisplayName, "Moi")
    }

    func test_currentUserInitial_usesFirstName() {
        let user = MeeshyUser(id: "me", username: "testuser", firstName: "Alice")
        mockAuthManager.simulateLoggedIn(user: user)

        XCTAssertEqual(sut.currentUserInitial, "A")
    }

    func test_currentUserInitial_fallsBackToUsername() {
        let user = MeeshyUser(id: "me", username: "testuser")
        mockAuthManager.simulateLoggedIn(user: user)

        XCTAssertEqual(sut.currentUserInitial, "T")
    }

    func test_currentUserInitial_fallsBackToM() {
        mockAuthManager.currentUser = nil

        XCTAssertEqual(sut.currentUserInitial, "M")
    }

    // MARK: - reactToStatus() Tests

    func test_reactToStatus_callsService() async {
        await sut.reactToStatus("status-react", emoji: "\u{2764}")

        XCTAssertEqual(mockStatusService.reactCallCount, 1)
        XCTAssertEqual(mockStatusService.lastReactStatusId, "status-react")
        XCTAssertEqual(mockStatusService.lastReactEmoji, "\u{2764}")
    }

    // MARK: - Mode Tests

    func test_modeIsStoredCorrectly() {
        XCTAssertEqual(sut.mode, .friends)

        let discoverVM = StatusViewModel(
            mode: .discover,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager
        )
        XCTAssertEqual(discoverVM.mode, .discover)
    }

    // MARK: - moodTapHandler Tests

    func test_moodTapHandler_returnsHandlerWhenStatusExists() {
        let entry = makeStatusEntry(userId: "tap-user")
        sut.statuses = [entry]

        let handler = sut.moodTapHandler(for: "tap-user")

        XCTAssertNotNil(handler, "Should return a handler when a status exists for the user")
    }

    func test_moodTapHandler_returnsNilWhenNoStatus() {
        let handler = sut.moodTapHandler(for: "no-status-user")

        XCTAssertNil(handler, "Should return nil when no status exists for the user")
    }

    // MARK: - Status Lifecycle Tests (Point 85)

    func test_publishStatus_success_addsToList() async {
        let createdPost = Self.makeStatusAPIPost(id: "new-pub", content: "Published", moodEmoji: "\u{1F60A}", authorId: "me")
        mockStatusService.createResult = .success(createdPost)

        await sut.setStatus(emoji: "\u{1F60A}", content: "Published")

        XCTAssertNotNil(sut.myStatus)
        XCTAssertEqual(sut.myStatus?.moodEmoji, "\u{1F60A}")
        XCTAssertFalse(sut.statuses.isEmpty, "Status should be added to the list")
        XCTAssertEqual(sut.statuses.first?.content, "Published")
    }

    func test_updateStatus_success_modifiesInList() async {
        // First create a status
        let initialPost = Self.makeStatusAPIPost(id: "update-target", content: "Initial", moodEmoji: "\u{1F60A}", authorId: "me")
        mockStatusService.createResult = .success(initialPost)
        await sut.setStatus(emoji: "\u{1F60A}", content: "Initial")
        XCTAssertEqual(sut.myStatus?.content, "Initial")

        // Simulate socket update modifying the status
        sut.subscribeToSocketEvents()

        let updatedPost = Self.makeStatusAPIPost(
            id: "update-target",
            content: "Modified content",
            moodEmoji: "\u{1F525}",
            authorId: "me"
        )
        mockSocket.statusUpdated.send(updatedPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.statuses.count, 1)
        XCTAssertEqual(sut.statuses[0].content, "Modified content")
    }

    func test_deleteStatus_success_removesFromList() async {
        // First set a status
        let createdPost = Self.makeStatusAPIPost(id: "delete-target", content: "To delete", moodEmoji: "\u{1F389}", authorId: "me")
        mockStatusService.createResult = .success(createdPost)
        await sut.setStatus(emoji: "\u{1F389}", content: "To delete")
        XCTAssertEqual(sut.statuses.count, 1)

        // Set the myStatus so clearStatus works
        let entry = makeStatusEntry(id: "delete-target", userId: "me")
        sut.myStatus = entry
        sut.statuses = [entry]

        await sut.clearStatus()

        XCTAssertNil(sut.myStatus)
        XCTAssertTrue(sut.statuses.isEmpty, "Status should be removed from the list")
        XCTAssertEqual(mockStatusService.deleteCallCount, 1)
    }

    // MARK: - Offline durability + draft recovery

    func test_setStatus_whenOffline_enqueuesDurableStatusRow_notDirectCreate() async {
        let queue = MockOfflineQueue()
        let offlineSUT = StatusViewModel(
            mode: .friends,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager,
            offlineQueue: queue,
            isOffline: { true }
        )

        await offlineSUT.setStatus(emoji: "🎉", content: "Offline mood", visibility: "PUBLIC")

        // Durable outbox path — NOT a direct statusService.create (lost offline).
        XCTAssertEqual(mockStatusService.createCallCount, 0)
        XCTAssertEqual(queue.enqueueCalls.count, 1)
        XCTAssertEqual(queue.enqueueCalls.first?.kind, .createPost)
        let payload = queue.enqueueCalls.first?.payload as? CreatePostPayload
        XCTAssertEqual(payload?.type, "STATUS")
        XCTAssertEqual(payload?.moodEmoji, "🎉")
        XCTAssertEqual(payload?.content, "Offline mood")
        XCTAssertEqual(
            payload?.originalLanguage, "fr",
            "La ligne outbox porte la langue française par défaut pour que le rejeu la transmette au gateway"
        )
    }

    func test_recoverUnsentStatus_queriesStatusTypeWithOfflineThreshold() async {
        let queue = MockOfflineQueue()
        queue.recoverLastUnsentPostResult = RecoveredOfflinePost(
            clientMutationId: "cmid_mood",
            content: "Stuck mood",
            visibility: "PUBLIC",
            originalLanguage: nil,
            type: "STATUS",
            moodEmoji: "😎",
            audioUrl: nil,
            audioDuration: nil,
            visibilityUserIds: nil,
            localMediaURLs: [],
            createdAt: Date()
        )
        let offlineSUT = StatusViewModel(
            mode: .friends,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager,
            offlineQueue: queue
        )

        let draft = await offlineSUT.recoverUnsentStatus()

        XCTAssertEqual(draft?.moodEmoji, "😎")
        XCTAssertEqual(queue.recoverLastUnsentPostCalls.first?.types, ["STATUS"])
        XCTAssertEqual(queue.recoverLastUnsentPostCalls.first?.olderThan, StatusViewModel.offlineStuckThreshold)
    }

    func test_supersedeRecoveredStatus_cancelsTheStuckRow() async {
        let queue = MockOfflineQueue()
        let offlineSUT = StatusViewModel(
            mode: .friends,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager,
            offlineQueue: queue
        )

        await offlineSUT.supersedeRecoveredStatus(clientMutationId: "cmid_mood")

        XCTAssertEqual(queue.cancelCreatePostCalls, ["cmid_mood"])
    }

    // MARK: - Portée du mood (impressions & vues)

    /// Un mood EST un post (`PostType.STATUS`) et porte `impressionCount` /
    /// `viewCount`, mais AUCUNE surface ne les alimentait : la barre de moods
    /// était le seul contenu du produit dont la portée restait à zéro.
    func test_trackImpression_flushesTheBatchWithTheStatusSource() async {
        sut.trackImpression("s1")
        sut.trackImpression("s2")

        try? await Task.sleep(nanoseconds: 3_400_000_000)

        XCTAssertEqual(mockPostService.recordImpressionsCallCount, 1)
        XCTAssertEqual(mockPostService.lastRecordImpressionPostIds, ["s1", "s2"])
        XCTAssertEqual(mockPostService.lastRecordImpressionsSource, "status")
    }

    /// Une impression par APPARITION : revoir le même mood recompte, sinon le
    /// compteur plafonnerait à 1 par lancement d'app.
    func test_trackImpression_countsEveryAppearance_notOncePerStatus() async {
        sut.trackImpression("s1")
        sut.trackImpression("s1")
        sut.trackImpression("s1")

        try? await Task.sleep(nanoseconds: 3_400_000_000)

        XCTAssertEqual(mockPostService.lastRecordImpressionPostIds, ["s1", "s1", "s1"])
    }

    func test_markStatusViewed_recordsAUniqueView() async {
        sut.markStatusViewed("s1")

        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(mockPostService.viewPostCallCount, 1)
        XCTAssertEqual(mockPostService.lastViewPostId, "s1")
    }
}
