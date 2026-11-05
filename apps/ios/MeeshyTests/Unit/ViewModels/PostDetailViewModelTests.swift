import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// `PostDetailViewModel` — le POST lui-même : chargement, édition, ouverture,
/// like (optimiste, outbox, temps réel), reconnexion, annulation d'un envoi en file.
@MainActor
final class PostDetailViewModelTests: PostDetailViewModelTestCase {

    // MARK: - loadPost

    func test_loadPost_success_setsPost() async {
        let (sut, mock) = makeSUT()
        let apiPost = Self.makeAPIPost(id: "p1", content: "Test")
        mock.getPostResult = .success(apiPost)

        await sut.loadPost("p1")

        XCTAssertNotNil(sut.post)
        XCTAssertEqual(sut.post?.id, "p1")
        XCTAssertEqual(mock.getPostCallCount, 1)
    }

    /// #6508 — le ViewModel retient la CAUSE, pas une phrase : c'est elle qui
    /// décide si l'écran parle de connexion, du serveur ou d'indisponibilité.
    func test_loadPost_serverError_recordsTheServerCause() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .failure(MeeshyError.server(statusCode: 500, message: "Erreur serveur"))

        await sut.loadPost("p1")

        XCTAssertEqual(sut.loadFailure, .server)
        XCTAssertNil(sut.post)
    }

    func test_loadPost_notFound_recordsTheAbsence() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .failure(MeeshyError.server(statusCode: 404, message: "Post not found"))

        await sut.loadPost("p1")

        XCTAssertEqual(sut.loadFailure, .notFound)
        XCTAssertNil(sut.post)
    }

    // MARK: - updatePost (position à l'édition)

    func test_updatePost_forwardsLocationSet_andAppliesItOptimistically() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let place = SharedPlace(latitude: 48.8584, longitude: 2.2945, name: "Tour Eiffel")

        await sut.updatePost(content: "Hello", location: .set(place))

        XCTAssertEqual(mock.lastUpdateLocation, .set(place),
                       "Le tri-état .set doit partir tel quel au service")
    }

    func test_updatePost_forwardsLocationRemove() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")

        await sut.updatePost(content: "Hello", location: .remove)

        XCTAssertEqual(mock.lastUpdateLocation, .remove)
    }

    func test_updatePost_withoutLocation_forwardsNil() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")

        await sut.updatePost(content: "Hello")

        XCTAssertNil(mock.lastUpdateLocation,
                     "Sans modification, la position ne doit pas partir (inchangée)")
    }

    // MARK: - registerDetailOpen

    func test_registerDetailOpen_recordsImpression_withDetailSource() async {
        let (sut, mock) = makeSUT()

        await sut.registerDetailOpen("p1")

        XCTAssertEqual(mock.recordedImpressions, [.impression(postId: "p1", source: "detail", surface: .detail)])
    }

    func test_registerDetailOpen_optimisticallyBumpsTotalViewAndImpression() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let beforeOpens = sut.post?.postOpenCount ?? -1
        let beforeImpr = sut.post?.impressionCount ?? -1

        await sut.registerDetailOpen("p1")

        XCTAssertEqual(sut.post?.postOpenCount, beforeOpens + 1)
        XCTAssertEqual(sut.post?.impressionCount, beforeImpr + 1)
    }

    // MARK: - likePost

    func test_likePost_togglesLikeState() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")

        let initialLikes = sut.post?.likes ?? 0
        await sut.likePost()

        XCTAssertEqual(sut.post?.isLiked, true)
        XCTAssertEqual(sut.post?.likes, initialLikes + 1)
        XCTAssertEqual(queue.enqueueCalls.count, 1)
    }

    func test_likePost_outboxRefuses_rollsBack() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(NSError(domain: "test", code: 500))
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()

        XCTAssertEqual(sut.post?.isLiked, false)
        XCTAssertEqual(sut.post?.likes, initialLikes)
    }

    // MARK: - Outbox terminal outcome (R5) — rollback on .exhausted

    func test_likePost_rollsBack_whenOutcomeExhausted() async {
        // R5 — a like that enqueues successfully but later EXHAUSTS its retry
        // budget (server permanently rejected it) must roll back. Before this
        // fix nobody observed the outcome, so the like was stuck forever.
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()
        XCTAssertEqual(sut.post?.isLiked, true, "optimistic like applied")
        XCTAssertEqual(sut.post?.likes, initialLikes + 1)

        guard let payload = queue.enqueueCalls.first?.payload as? ToggleLikePostPayload else {
            return XCTFail("no toggleLikePost enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.exhausted(cmid: payload.clientMutationId), for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.post?.isLiked, false, "exhausted outbox row must roll back the optimistic like")
        XCTAssertEqual(sut.post?.likes, initialLikes, "like count must revert on exhausted")
    }

    func test_likePost_doesNotRollBack_whenOutcomeApplied() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()
        guard let payload = queue.enqueueCalls.first?.payload as? ToggleLikePostPayload else {
            return XCTFail("no toggleLikePost enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.applied(cmid: payload.clientMutationId), for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.post?.isLiked, true, "applied outcome keeps the optimistic like")
        XCTAssertEqual(sut.post?.likes, initialLikes + 1)
    }

    // MARK: - likePost: write-through vers la clé cache détail (stores-09)

    func test_likePost_enqueueSucceeds_writesThroughToDetailCacheKey() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()

        let cached = await waitForCachedLikes(key: "p1", expected: initialLikes + 1)
        XCTAssertEqual(cached?.isLiked, true,
                       "le like optimiste doit être écrit sous la clé cache détail, pas seulement en RAM")
        XCTAssertEqual(cached?.likes, initialLikes + 1)
    }

    func test_likePost_outboxExhausted_rollsBackCacheKey() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()
        _ = await waitForCachedLikes(key: "p1", expected: initialLikes + 1)

        guard let payload = queue.enqueueCalls.first?.payload as? ToggleLikePostPayload else {
            return XCTFail("no toggleLikePost enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.exhausted(cmid: payload.clientMutationId), for: payload.clientMutationId)

        let cached = await waitForCachedLikes(key: "p1", expected: initialLikes)
        XCTAssertEqual(cached?.isLiked, false,
                       "le rollback doit aussi restaurer la clé cache détail (valeurs de restauration, pas optimistes)")
        XCTAssertEqual(cached?.likes, initialLikes)
    }

    func test_sendComment_rollsBack_whenOutcomeExhausted() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")

        await sut.sendComment("doomed comment", originalLanguage: "en")
        XCTAssertEqual(sut.comments.count, 1, "optimistic comment inserted")
        XCTAssertEqual(sut.comments[0].content, "doomed comment")

        guard let payload = queue.enqueueCalls.first?.payload as? CreateCommentPayload else {
            return XCTFail("no createComment enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.exhausted(cmid: payload.clientMutationId), for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(sut.comments.isEmpty, "optimistic comment must be removed on exhausted")
    }

    // MARK: - LanguageProviding DI

    /// `userLanguage` must come from the injected provider, not from
    /// `AuthManager.shared`. Without DI this test would be flaky because
    /// other suites pollute the singleton with their own `currentUser`.
    func test_userLanguage_usesInjectedLanguageProvider() {
        let (sut, _) = makeSUT(preferredLanguages: ["es", "pt"])

        XCTAssertEqual(sut.userLanguage, "es")
        XCTAssertEqual(sut.preferredLanguages, ["es", "pt"])
    }

    /// Empty preferred-languages list falls back to `"en"` (matches the
    /// FeedViewModel contract).
    func test_userLanguage_emptyProvider_fallsBackToEnglish() {
        let (sut, _) = makeSUT(preferredLanguages: [])

        XCTAssertEqual(sut.userLanguage, "en")
    }

    // MARK: - Like temps réel (post:liked / post:unliked)

    /// Le détail n'écoutait QUE les commentaires : un like posé depuis le feed,
    /// depuis le pager de réels ou par un autre utilisateur n'atteignait jamais
    /// l'écran ouvert, dont le compteur restait figé jusqu'au prochain fetch.
    func test_postLiked_appliesAbsoluteServerCountToTheDisplayedPost() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")

        socket.postLiked.send(Self.makeLiked(postId: "p1", userId: "other", likeCount: 17))
        await Task.yield()

        XCTAssertEqual(sut.post?.likes, 17)
    }

    func test_postUnliked_appliesAbsoluteServerCountToTheDisplayedPost() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")

        socket.postUnliked.send(Self.makeUnliked(postId: "p1", userId: "other", likeCount: 4))
        await Task.yield()

        XCTAssertEqual(sut.post?.likes, 4)
    }

    /// Un événement portant sur un AUTRE post ne doit pas écraser le compteur
    /// du post affiché (le filtre par postId est la seule garde).
    func test_postLiked_forAnotherPost_leavesTheDisplayedPostUntouched() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")
        let before = sut.post?.likes

        socket.postLiked.send(Self.makeLiked(postId: "another", userId: "other", likeCount: 999))
        await Task.yield()

        XCTAssertEqual(sut.post?.likes, before)
    }

    /// Le like d'un TIERS monte le compteur sans allumer le cœur de
    /// l'utilisateur courant.
    func test_postLiked_byAnotherUser_doesNotFlipIsLiked() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")

        socket.postLiked.send(Self.makeLiked(postId: "p1", userId: "definitely-not-me", likeCount: 17))
        await Task.yield()

        XCTAssertEqual(sut.post?.isLiked, false)
    }

    // MARK: - Reconnect (didReconnect) — vm-reconnect-stories-detail-01

    /// La room du post est re-jointe au .connect (le flux VIVANT reprend),
    /// mais les événements émis PENDANT la coupure restent irréconciliés :
    /// le reconnect doit refetch le post (compteurs absolus) + la page 1.
    func test_subscribeToSocket_reconnect_refetchesPostAndCommentsPage1() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1", content: "Fresh"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")
        let postsBefore = mock.getPostCallCount
        let commentsBefore = mock.getCommentsCallCount

        socket.didReconnect.send(())
        try? await waitForCondition(timeout: 5.0) {
            mock.getPostCallCount > postsBefore && mock.getCommentsCallCount > commentsBefore
        }

        XCTAssertEqual(mock.getPostCallCount, postsBefore + 1,
                       "le reconnect refetch le post pour les compteurs absolus")
        XCTAssertEqual(mock.getCommentsCallCount, commentsBefore + 1,
                       "le reconnect refetch la page 1 des commentaires")
    }

    /// La page 1 refetchée peut recouvrir des commentaires déjà affichés :
    /// la dédup par id rend l'append idempotent — jamais de flash-vide.
    func test_subscribeToSocket_reconnect_dedupesExistingComments() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: [Self.stubComment]))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        await sut.loadComments("p1")
        sut.subscribeToSocket("p1")
        XCTAssertEqual(sut.comments.count, 1)
        let commentsCallsBefore = mock.getCommentsCallCount

        socket.didReconnect.send(())
        try? await waitForCondition(timeout: 5.0) { mock.getCommentsCallCount > commentsCallsBefore }

        XCTAssertEqual(sut.comments.count, 1,
                       "même page 1 → dédup par id, pas de doublon ni de flash-vide")
    }

    // MARK: - #10331 — une publication en file s'annule, elle ne se supprime pas

    func test_deletePost_onPendingPublication_cancelsTheSendWithoutCallingServer() async {
        let queue = MockOfflineQueue()
        queue.cancelPendingPublicationResult = .removed
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let cmid = ClientMutationId.generate()

        let closed = await sut.deletePost(cmid)

        XCTAssertTrue(closed, "l'envoi est annulé : l'écran se referme")
        XCTAssertEqual(queue.cancelPendingPublicationCalls, [cmid])
        XCTAssertEqual(mock.deleteCallCount, 0, "un cmid n'existe pas côté serveur : aucun DELETE ne part")
    }

    func test_deletePost_onPendingPublicationAlreadySent_keepsTheScreen() async {
        let queue = MockOfflineQueue()
        queue.cancelPendingPublicationResult = .notFound
        let (sut, mock) = makeSUT(offlineQueue: queue)

        let closed = await sut.deletePost(ClientMutationId.generate())

        XCTAssertFalse(closed)
        XCTAssertEqual(mock.deleteCallCount, 0)
    }

    func test_deletePost_onServerPost_neverTouchesTheOutbox() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)

        _ = await sut.deletePost("665f1c2e9b1d4a0012345678")

        XCTAssertTrue(queue.cancelPendingPublicationCalls.isEmpty)
        XCTAssertEqual(mock.deleteCallCount, 1)
    }

    // MARK: - #14879 — le détail d'une publication en file ne parle pas au serveur

    func test_loadComments_onPendingPublication_neverCallsTheServer() async {
        let (sut, mock) = makeSUT()

        await sut.loadComments(ClientMutationId.generate())

        XCTAssertEqual(mock.getCommentsCallCount, 0, "aucun commentaire n'existe sous un cmid : pas de toast d'erreur non plus")
    }

    func test_loadPost_onPendingPublication_neverAsksTheServer() async {
        let (sut, mock) = makeSUT()

        await sut.loadPost(ClientMutationId.generate())

        XCTAssertEqual(mock.getPostCallCount, 0, "aucun GET ne part pour un cmid (#14929)")
        XCTAssertNil(sut.loadFailure, "la carte optimiste de l'hôte reste à l'écran, sans état d'absence")
        XCTAssertFalse(sut.isLoading)
    }

    func test_pendingDetail_offersNoEngagement() throws {
        let detail = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/PostDetailView.swift"))
        let barre = try XCTUnwrap(detail.range(of: "if !isPendingPublication {"))
        XCTAssertTrue(detail[barre.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
                        .hasPrefix("actionsBar(post, renderedItem: renderedItem, scrollProxy: scrollProxy)"),
                      "ni cœur, ni republier, ni favori sous une publication en attente")
        XCTAssertEqual(detail.components(separatedBy: "actionsBar(post, renderedItem:").count, 2,
                       "la barre n'est montée qu'à un seul endroit, derrière la garde")
        for geste in ["func toggleDetailBookmark() {\n        guard !isBookmarkInFlight, !isPendingPublication",
                      "func toggleDetailRepost() {\n        guard !isRepostInFlight, !isPendingPublication"] {
            XCTAssertTrue(detail.contains(geste), geste)
        }
        for (unite, garde) in [("Meeshy/Features/Main/Views/PostDetailView+Heart.swift",
                                "func toggleDetailPostHeart() {\n        guard !isPendingPublication else { return }"),
                               ("Meeshy/Features/Main/Views/PostDetailView+Reactions.swift",
                                "func sendDetailReaction(_ emoji: String) {\n        guard !isPendingPublication else { return }")] {
            XCTAssertTrue(AppSourceGuard.stripComments(try AppSourceGuard.unit(unite)).contains(garde), unite)
        }
    }

    func test_registerDetailOpen_onPendingPublication_recordsNothing() async {
        let (sut, mock) = makeSUT()

        await sut.registerDetailOpen(ClientMutationId.generate())

        XCTAssertEqual(mock.recordSocialEventsCallCount, 0)
    }

    func test_pendingDetail_offersOnlyTheCancellation_andNoComposer() throws {
        let detail = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/PostDetailView.swift"))
        let garde = try XCTUnwrap(detail.range(of: "if PendingPublicationMarker.isPending(postId: postId) {"))
        XCTAssertTrue(detail[garde.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
                        .hasPrefix("PublicationDestructiveMenuItems(postId: postId, onDelete:"),
                      "ni lien, ni épingle, ni modification : « Annuler l'envoi » seul")
        XCTAssertTrue(detail.contains("PostDateWithPoints(postId: post.id"), "l'en-tête date par la vue partagée avec la carte")
        let entete = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/FeedPostCard+Header.swift"))
        let date = try XCTUnwrap(entete.range(of: "struct PostDateWithPoints"))
        let corps = try XCTUnwrap(entete.range(of: "var body: some View {", range: date.upperBound..<entete.endIndex))
        XCTAssertTrue(entete[corps.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
                        .hasPrefix("if PendingPublicationMarker.isPending(postId: postId) {\n            PendingSendClock(color: color)"),
                      "l'horloge à la place de l'heure, au détail comme sur la carte")
        XCTAssertTrue(detail.contains("!PendingPublicationMarker.isPending(postId: postId) {\n                VStack(spacing: 0) {"),
                      "commenter une publication qui n'existe pas encore n'aboutirait jamais")
    }

    func test_commentPlaceholder_speaksTheInterfaceLanguage() throws {
        let racineDepot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let modes = try String(contentsOf: racineDepot.appendingPathComponent(
            "packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift"), encoding: .utf8)
        XCTAssertTrue(modes.contains(#"case .comment: return String(localized: "composer.placeholder.comment""#))
        let catalogue = try Data(contentsOf: racineDepot.appendingPathComponent(
            "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"))
        let racine = try XCTUnwrap(JSONSerialization.jsonObject(with: catalogue) as? [String: Any])
        let entree = try XCTUnwrap((racine["strings"] as? [String: Any])?["composer.placeholder.comment"] as? [String: Any])
        let langues = try XCTUnwrap(entree["localizations"] as? [String: [String: [String: String]]])
        XCTAssertEqual(Set(langues.keys), ["fr", "en", "es", "de", "it", "pt-BR", "ar"])
        XCTAssertEqual(langues["es"]?["stringUnit"]?["value"], "Comentar…")
    }
}
