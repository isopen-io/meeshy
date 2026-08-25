import XCTest
@testable import MeeshySDK

final class PostServiceTests: XCTestCase {
    private var mock: MockAPIClient!
    private var service: PostService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = PostService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private let postId = "post123"

    private func makePost(id: String = "post123") -> APIPost {
        APIPost(
            id: id, type: "POST", visibility: "PUBLIC", visibilityUserIds: nil, content: "Hello world",
            originalLanguage: "en", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: APIAuthor(id: "author1", username: "alice", displayName: "Alice", avatar: nil),
            likeCount: 10, commentCount: 2, repostCount: 1, viewCount: 100, postOpenCount: nil, qualifiedViewCount: nil, playCount: nil,
            bookmarkCount: 3, shareCount: 0, reactionSummary: nil, isPinned: false,
            isEdited: false, media: nil, comments: nil, repostOf: nil,
            originalRepostOfId: nil, isQuote: nil,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: nil,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil, isRepostedByMe: nil,
            isViewedByMe: nil, currentUserReactions: nil, viaUsername: nil
        )
    }

    private func makeComment(id: String = "comment1") -> APIPostComment {
        APIPostComment(
            id: id, content: "Great post!", originalLanguage: "en",
            parentId: nil,
            translations: nil, likeCount: 0, replyCount: 0,
            effectFlags: nil,
            createdAt: Date(),
            author: APIAuthor(id: "author2", username: "bob", displayName: "Bob", avatar: nil),
            currentUserReactions: nil,
            media: nil
        )
    }

    // MARK: - getFeed

    func testGetFeedReturnsPosts() async throws {
        let post = makePost()
        let expected = PaginatedAPIResponse(
            success: true,
            data: [post],
            pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: 20),
            error: nil
        )
        mock.stub("/posts/feed", result: expected)

        let result = try await service.getFeed()

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(result.data[0].id, "post123")
        XCTAssertTrue(result.success)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/feed")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - create

    func testCreateReturnsNewPost() async throws {
        let newPost = makePost(id: "newPost1")
        let response = APIResponse(success: true, data: newPost, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.create(content: "Hello world", type: "POST", visibility: "PUBLIC")

        XCTAssertEqual(result.id, "newPost1")
        XCTAssertEqual(result.content, "Hello world")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - delete

    func testDeleteCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["deleted": true], error: nil)
        mock.stub("/posts/\(postId)", result: response)

        try await service.delete(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - like

    func testLikeCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "liked"], error: nil)
        mock.stub("/posts/\(postId)/like", result: response)

        try await service.like(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/like")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - unlike

    func testUnlikeCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["unliked": true], error: nil)
        mock.stub("/posts/\(postId)/like", result: response)

        try await service.unlike(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/like")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - bookmark

    func testBookmarkCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "bookmarked"], error: nil)
        mock.stub("/posts/\(postId)/bookmark", result: response)

        try await service.bookmark(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/bookmark")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - addComment

    func testAddCommentReturnsNewComment() async throws {
        let comment = makeComment()
        let response = APIResponse(success: true, data: comment, error: nil)
        mock.stub("/posts/\(postId)/comments", result: response)

        let result = try await service.addComment(postId: postId, content: "Great post!")

        XCTAssertEqual(result.id, "comment1")
        XCTAssertEqual(result.content, "Great post!")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/comments")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - likeComment

    func testLikeCommentCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "liked"], error: nil)
        mock.stub("/posts/\(postId)/comments/comment1/like", result: response)

        try await service.likeComment(postId: postId, commentId: "comment1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/comments/comment1/like")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - repost

    func testRepostCallsCorrectEndpoint() async throws {
        let post = makePost()
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts/\(postId)/repost", result: response)

        _ = try await service.repost(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/repost")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testRepostWithQuoteCallsCorrectEndpoint() async throws {
        let post = makePost()
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts/\(postId)/repost", result: response)

        _ = try await service.repost(postId: postId, content: "Check this out!", isQuote: true)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/repost")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - repost with targetType (B.5)

    func test_RepostRequest_encodes_targetType() throws {
        let req = RepostRequest(content: "hi", isQuote: false, targetType: "POST")
        let data = try JSONEncoder().encode(req)
        let json = String(data: data, encoding: .utf8) ?? ""
        XCTAssertTrue(json.contains("\"targetType\":\"POST\""), "Expected JSON to contain targetType:POST, got: \(json)")
    }

    func test_PostService_repost_sends_targetType() async throws {
        let post = makePost(id: "story-1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts/story-1/repost", result: response)

        _ = try await service.repost(postId: "story-1", targetType: .post, content: "Mon commentaire", isQuote: false)

        XCTAssertEqual(mock.lastRequest?.path, "/posts/story-1/repost")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["targetType"] as? String, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["content"] as? String, "Mon commentaire")
    }

    /// Le composer de repost affiche un sélecteur d'audience. Sa valeur ne
    /// traversait AUCUNE couche — ni le handler, ni cette requête, ni la
    /// gateway, qui recopiait la visibilité de l'original. Un repost n'étant
    /// permis que sur un original PUBLIC, tout repost sortait PUBLIC : choisir
    /// « Privé » publiait en grand public, sans le moindre signal.
    func test_PostService_repost_sends_theChosenVisibility() async throws {
        let response = APIResponse(success: true, data: makePost(id: "story-1"), error: nil)
        mock.stub("/posts/story-1/repost", result: response)

        _ = try await service.repost(postId: "story-1", targetType: .post,
                                     content: nil, isQuote: false, visibility: "PRIVATE")

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["visibility"] as? String, "PRIVATE")
    }

    /// Sans choix explicite, la gateway garde l'héritage historique — le
    /// champ ne doit donc PAS être envoyé.
    func test_PostService_repost_omitsVisibility_whenNoneChosen() async throws {
        let response = APIResponse(success: true, data: makePost(id: "story-1"), error: nil)
        mock.stub("/posts/story-1/repost", result: response)

        _ = try await service.repost(postId: "story-1")

        XCTAssertNil(mock.lastRequest?.bodyJSON?["visibility"] ?? nil)
    }

    // MARK: - repost IDEMPOTENT (fil rouge du repost, lot 7 tâche 7.5)

    /// `repostPost` fabrique un `Post` NEUF à chaque appel : rien ne le rend
    /// naturellement idempotent. Sans cet en-tête, `withMutationOutcome`
    /// (tâche 7.1b) n'a aucune clé pour reconnaître un rejeu — deux taps après
    /// un délai d'expiration, ou une ligne d'outbox rejouée au retour du
    /// réseau, font deux republications.
    func test_PostService_repost_sendsTheClientMutationIdHeader() async throws {
        let response = APIResponse(success: true, data: makePost(id: "story-1"), error: nil)
        mock.stub("/posts/story-1/repost", result: response)

        _ = try await service.repost(postId: "story-1", targetType: .story, content: nil,
                                     isQuote: false, visibility: nil,
                                     clientMutationId: "cmid_11111111-2222-3333-4444-555555555555")

        XCTAssertEqual(mock.lastRequest?.path, "/posts/story-1/repost")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(
            mock.lastRequest?.headers?["X-Client-Mutation-Id"],
            "cmid_11111111-2222-3333-4444-555555555555"
        )
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["targetType"] as? String, "STORY",
                       "Le format doit voyager AVEC le jeton — loi 5, le repost miroite.")
    }

    /// Un jeton absent ou vide retombe sur le chemin sans en-tête : la
    /// surcharge idempotente ne doit pas fabriquer un `X-Client-Mutation-Id`
    /// vide, que la regex serveur refuserait.
    func test_PostService_repost_withoutMutationId_fallsBackToThePlainCall() async throws {
        let response = APIResponse(success: true, data: makePost(id: "story-1"), error: nil)
        mock.stub("/posts/story-1/repost", result: response)

        _ = try await service.repost(postId: "story-1", targetType: .post, content: nil,
                                     isQuote: false, visibility: nil, clientMutationId: "")

        XCTAssertNil(mock.lastRequest?.headers?["X-Client-Mutation-Id"] ?? nil)
        XCTAssertEqual(mock.lastRequest?.path, "/posts/story-1/repost")
    }

    // MARK: - share

    func testShareCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "shared"], error: nil)
        mock.stub("/posts/\(postId)/share", result: response)

        try await service.share(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/share")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - createStory

    func testCreateStoryReturnsPost() async throws {
        let storyPost = makePost(id: "story1")
        let response = APIResponse(success: true, data: storyPost, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.createStory(content: "My story", storyEffects: nil)

        XCTAssertEqual(result.id, "story1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - create / createStory with repostOfId (B.5c)

    func test_create_includes_repostOfId_when_provided() async throws {
        let post = makePost(id: "newPost1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        _ = try await service.create(content: "x", type: "POST", repostOfId: "root-1")

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["repostOfId"] as? String, "root-1")
    }

    func test_createStory_includes_repostOfId_when_provided() async throws {
        let post = makePost(id: "story1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        _ = try await service.createStory(content: "x", storyEffects: nil, repostOfId: "root-1")

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["repostOfId"] as? String, "root-1")
    }

    // MARK: - createWithType

    func testCreateWithTypePostDelegatesToCreate() async throws {
        let post = makePost(id: "typed1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.createWithType(.post, content: "Typed post")

        XCTAssertEqual(result.id, "typed1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testCreateWithTypeStoryDelegatesToCreateStory() async throws {
        let storyPost = makePost(id: "storyTyped1")
        let response = APIResponse(success: true, data: storyPost, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.createWithType(.story, content: "Story content")

        XCTAssertEqual(result.id, "storyTyped1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testCreateWithTypeStatusDelegatesToCreate() async throws {
        let statusPost = makePost(id: "statusTyped1")
        let response = APIResponse(success: true, data: statusPost, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.createWithType(.status, content: "Feeling happy", moodEmoji: "smile")

        XCTAssertEqual(result.id, "statusTyped1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testCreateWithTypeReelWithoutMediaDegradesToPost() async throws {
        let post = makePost(id: "reelTyped1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        _ = try await service.createWithType(.reel, content: "Would-be reel")

        // Règle produit 2026-08-02 : un REEL exige vidéo || audio || >= 2 images.
        // `createWithType` ne transporte AUCUN média → la composition ne peut pas
        // qualifier ; le service publie un POST au lieu d'un REEL invalide.
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["type"] as? String, "POST")
    }

    // MARK: - Error case

    func testGetFeedThrowsOnNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.getFeed()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.network(.noConnection), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }

        XCTAssertEqual(mock.requestCount, 1)
    }

    func test_recordEngagement_postsBatch_toEngagementEndpoint() async throws {
        let response = APIResponse(success: true, data: ["recorded": 1], error: nil)
        mock.stub("/posts/engagement/batch", result: response)

        let session = EngagementSession(
            sessionId: "s1", userId: "u1", postId: "p1", contentType: .reel, surface: .reels,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000), dwellMs: 4000, watchMs: 3800,
            mediaDurationMs: 15000, completed: false, truncated: false, consent: "granted",
            actions: [], watchSamples: []
        )

        try await service.recordEngagement([session])

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/engagement/batch")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func test_recordEngagement_emptyArray_doesNotCallNetwork() async throws {
        try await service.recordEngagement([])
        XCTAssertEqual(mock.requestCount, 0)
    }

    func test_recordImpression_postsTo_singleImpressionEndpoint() async throws {
        let response = APIResponse(success: true, data: ["recorded": true], error: nil)
        mock.stub("/posts/\(postId)/impression", result: response)

        try await service.recordImpression(postId: postId, source: "detail")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/impression")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - update : tri-état du lieu (gestion de la position à l'édition)

    func test_update_setLocation_encodesThePlaceObject() async throws {
        let response = APIResponse(success: true, data: makePost(id: "p1"), error: nil)
        mock.stub("/posts/p1", result: response)
        let place = SharedPlace(latitude: 48.8584, longitude: 2.2945, name: "Tour Eiffel")

        _ = try await service.update(postId: "p1", location: .set(place))

        let encoded = mock.lastRequest?.bodyJSON?["location"] as? [String: Any]
        XCTAssertEqual(encoded?["latitude"] as? Double ?? 0, 48.8584, accuracy: 0.0001)
        XCTAssertEqual(encoded?["name"] as? String, "Tour Eiffel")
    }

    func test_update_removeLocation_encodesExplicitNull() async throws {
        // Le retrait DOIT partir en `location: null` — une clé absente
        // signifie « inchangé » pour le gateway (tri-état).
        let response = APIResponse(success: true, data: makePost(id: "p1"), error: nil)
        mock.stub("/posts/p1", result: response)

        _ = try await service.update(postId: "p1", location: .remove)

        XCTAssertTrue(mock.lastRequest?.bodyJSON?["location"] is NSNull,
                      "`.remove` doit émettre un null JSON explicite, pas omettre la clé")
    }

    func test_update_withoutLocation_omitsTheKey() async throws {
        let response = APIResponse(success: true, data: makePost(id: "p1"), error: nil)
        mock.stub("/posts/p1", result: response)

        _ = try await service.update(postId: "p1", content: "nouveau texte")

        XCTAssertNil(mock.lastRequest?.bodyJSON?["location"],
                     "Sans modification du lieu, la clé ne doit pas partir (inchangé)")
    }
}

// MARK: - update : tri-état des références déclarées

/// `mentions` à l'édition n'a de sens qu'à TROIS états, et la clé absente est
/// l'un d'eux : sans elle, le gateway (`reconcilePostMentions`) préserve ce que
/// le post porte déjà. C'est ce qui permet à un chemin d'édition qui ne gère
/// pas les références — l'édition de texte d'un post, par exemple — de ne rien
/// détruire au passage.
extension PostServiceTests {

    /// La forme COMPLÈTE de `update` n'a aucune valeur par défaut (sinon tout
    /// appel court deviendrait ambigu avec la forme courte) : ce raccourci
    /// évite d'écrire onze `nil` dans chaque test.
    private func updateDeclaring(mentions: [PostMentionInput]?, on postId: String) async throws -> APIPost {
        try await service.update(postId: postId, content: nil, visibility: nil, visibilityUserIds: nil,
                                 moodEmoji: nil, originalLanguage: nil, type: nil, removeMediaIds: nil,
                                 storyEffects: nil, mediaIds: nil, location: nil, mentions: mentions)
    }

    func test_update_withoutMentions_omitsTheKey() async throws {
        let response = APIResponse(success: true, data: makePost(id: "p1"), error: nil)
        mock.stub("/posts/p1", result: response)

        _ = try await service.update(postId: "p1", content: "nouveau texte")

        XCTAssertNil(mock.lastRequest?.bodyJSON?["mentions"],
                     "Sans déclaration, la clé ne doit pas partir — le serveur préserve")
    }

    func test_update_emptyMentions_encodesAnEmptyArray() async throws {
        // `[]` est un VERDICT, pas une absence : « je n'en déclare plus
        // aucune ». Omettre la clé ici laisserait vivre des références que
        // l'auteur vient de retirer.
        let response = APIResponse(success: true, data: makePost(id: "p1"), error: nil)
        mock.stub("/posts/p1", result: response)

        _ = try await updateDeclaring(mentions: [], on: "p1")

        let encoded = mock.lastRequest?.bodyJSON?["mentions"] as? [Any]
        XCTAssertEqual(encoded?.count, 0,
                       "`[]` doit partir tel quel — c'est l'effacement explicite")
    }

    func test_update_mentions_carryTheirDeclaredMode() async throws {
        let response = APIResponse(success: true, data: makePost(id: "p1"), error: nil)
        mock.stub("/posts/p1", result: response)

        _ = try await updateDeclaring(mentions: [
            PostMentionInput.id("u-alice", display: .pinned),
            PostMentionInput.handle("bob", display: .silent)
        ], on: "p1")

        let encoded = mock.lastRequest?.bodyJSON?["mentions"] as? [[String: Any]]
        XCTAssertEqual(encoded?.count, 2)
        XCTAssertEqual(encoded?[0]["userId"] as? String, "u-alice")
        XCTAssertEqual(encoded?[0]["display"] as? String, "PINNED")
        XCTAssertEqual(encoded?[1]["username"] as? String, "bob")
        XCTAssertEqual(encoded?[1]["display"] as? String, "SILENT")
    }
}

// MARK: - create/update : allowSoundExtraction + mediaAlt

/// Repêchage C7b : `allowSoundExtraction` était déclaré de bout en bout côté
/// gateway (schéma, persistance, `mediaCaptureTracks`) mais AUCUN client ne
/// l'envoyait jamais — un drapeau qui voyage sans être posé équivaut à
/// l'absence du canal. `mediaAlt` est le canal manquant pour `PostMedia.alt`
/// (le champ existe en base et se LIT déjà ; rien ne l'écrivait à
/// l'ingestion). Ces tests épinglent le SEUL chemin qui les transporte
/// réellement : la surcharge complète de `create`/`update`.
extension PostServiceTests {
    func test_create_withoutAllowSoundExtractionOrMediaAlt_omitsBothKeys() async throws {
        let response = APIResponse(success: true, data: makePost(id: "newPost1"), error: nil)
        mock.stub("/posts", result: response)

        _ = try await service.create(content: "Hello", type: "POST", visibility: "PUBLIC")

        XCTAssertNil(mock.lastRequest?.bodyJSON?["allowSoundExtraction"])
        XCTAssertNil(mock.lastRequest?.bodyJSON?["mediaAlt"])
    }

    func test_create_withAllowSoundExtractionAndMediaAlt_sendsBoth() async throws {
        let response = APIResponse(success: true, data: makePost(id: "newPost1"), error: nil)
        mock.stub("/posts", result: response)

        _ = try await service.create(
            content: nil, type: "REEL", visibility: "PUBLIC", moodEmoji: nil,
            mediaIds: ["media-1"], audioUrl: nil, audioDuration: nil, originalLanguage: nil,
            mobileTranscription: nil, repostOfId: nil, location: nil, mentions: nil,
            allowSoundExtraction: true, mediaAlt: ["media-1": "A cat on a windowsill"]
        )

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["allowSoundExtraction"] as? Bool, true)
        let alt = mock.lastRequest?.bodyJSON?["mediaAlt"] as? [String: String]
        XCTAssertEqual(alt?["media-1"], "A cat on a windowsill")
    }

    func test_update_withAllowSoundExtractionAndMediaAlt_sendsBoth() async throws {
        let response = APIResponse(success: true, data: makePost(id: "p1"), error: nil)
        mock.stub("/posts/p1", result: response)

        _ = try await service.update(
            postId: "p1", content: nil, visibility: nil, visibilityUserIds: nil,
            moodEmoji: nil, originalLanguage: nil, type: nil, removeMediaIds: nil,
            storyEffects: nil, mediaIds: ["new-m1"], location: nil, mentions: nil,
            allowSoundExtraction: false, mediaAlt: ["new-m1": "A sunset over the bay"]
        )

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["allowSoundExtraction"] as? Bool, false)
        let alt = mock.lastRequest?.bodyJSON?["mediaAlt"] as? [String: String]
        XCTAssertEqual(alt?["new-m1"], "A sunset over the bay")
    }

    func test_update_withoutAllowSoundExtractionOrMediaAlt_omitsBothKeys() async throws {
        let response = APIResponse(success: true, data: makePost(id: "p1"), error: nil)
        mock.stub("/posts/p1", result: response)

        _ = try await service.update(postId: "p1", content: "nouveau texte")

        XCTAssertNil(mock.lastRequest?.bodyJSON?["allowSoundExtraction"])
        XCTAssertNil(mock.lastRequest?.bodyJSON?["mediaAlt"])
    }
}
