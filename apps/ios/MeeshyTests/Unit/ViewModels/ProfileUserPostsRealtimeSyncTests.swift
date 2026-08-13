import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// Synchronisation temps réel du listing posts/réels d'un profil
/// (`ProfileUserPostsViewModel`).
///
/// Le listing ne s'abonnait qu'à `post:translation-updated` : un like reçu, un
/// commentaire posté depuis la feuille hoistée, une suppression ou une édition
/// faite ailleurs ne touchaient JAMAIS les cartes affichées. Seul l'optimisme
/// local bougeait, par-dessus une base serveur figée au fetch — d'où des
/// compteurs qui « ne se synchronisent pas » tant que la vue reste ouverte.
///
/// Les sinks passent par `.receive(on: DispatchQueue.main)` : la livraison est
/// un saut de boucle d'exécution, d'où le `waitForCondition` (et non une
/// assertion synchrone) après chaque `send`.
@MainActor
final class ProfileUserPostsRealtimeSyncTests: XCTestCase {

    private static let userId = "profile-user-rt"
    private static let cacheKey = "user:profile-user-rt"
    private static let meId = "me-1"

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: Self.cacheKey)
        await CacheCoordinator.shared.feed.saveCursor(nextCursor: nil, hasMore: true, for: Self.cacheKey)
    }

    // MARK: - SUT

    private func makeSUT(
        currentUserId: String? = ProfileUserPostsRealtimeSyncTests.meId
    ) -> (sut: ProfileUserPostsViewModel, post: MockPostService, socket: MockSocialSocket) {
        let post = MockPostService()
        let socket = MockSocialSocket()
        let sut = ProfileUserPostsViewModel(
            userId: Self.userId,
            postService: post,
            userService: MockUserService(),
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            socialSocket: socket,
            currentUserIdProvider: { currentUserId }
        )
        return (sut, post, socket)
    }

    /// SUT déjà peuplé d'un poste unique aux compteurs serveur explicites.
    private func loaded(
        likeCount: Int = 10,
        commentCount: Int = 2,
        repostCount: Int = 3,
        isLikedByMe: Bool = false
    ) async -> (sut: ProfileUserPostsViewModel, socket: MockSocialSocket) {
        let (sut, mock, socket) = makeSUT()
        mock.getUserPostsResultsQueue = [.success(Self.page(
            likeCount: likeCount, commentCount: commentCount,
            repostCount: repostCount, isLikedByMe: isLikedByMe))]
        await sut.loadInitial()
        XCTAssertEqual(sut.posts.count, 1, "précondition : la page est servie")
        return (sut, socket)
    }

    // MARK: - Fixtures

    private static func page(
        id: String = "p1",
        likeCount: Int = 10,
        commentCount: Int = 2,
        repostCount: Int = 3,
        isLikedByMe: Bool = false
    ) -> PaginatedAPIResponse<[APIPost]> {
        JSONStub.decode("""
        {"success":true,"data":[{"id":"\(id)","type":"POST","content":"c","createdAt":"2026-01-15T12:00:00.000Z",
        "likeCount":\(likeCount),"commentCount":\(commentCount),"repostCount":\(repostCount),
        "isLikedByMe":\(isLikedByMe),
        "author":{"id":"\(Self.userId)","username":"alice"}}],
        "pagination":{"hasMore":false,"limit":20}}
        """)
    }

    private static func liked(postId: String, userId: String, likeCount: Int) -> SocketPostLikedData {
        JSONStub.decode("""
        {"postId":"\(postId)","userId":"\(userId)","emoji":"❤️","likeCount":\(likeCount),"reactionSummary":{}}
        """)
    }

    private static func unliked(postId: String, userId: String, likeCount: Int) -> SocketPostUnlikedData {
        JSONStub.decode("""
        {"postId":"\(postId)","userId":"\(userId)","likeCount":\(likeCount),"reactionSummary":{}}
        """)
    }

    private static func commentAdded(postId: String, commentCount: Int) -> SocketCommentAddedData {
        JSONStub.decode("""
        {"postId":"\(postId)","commentCount":\(commentCount),
        "comment":{"id":"c1","content":"hello","createdAt":"2026-01-15T12:05:00.000Z",
        "author":{"id":"other-1","username":"bob"}}}
        """)
    }

    private static func reposted(originalPostId: String, repostId: String, authorId: String) -> SocketPostRepostedData {
        JSONStub.decode("""
        {"originalPostId":"\(originalPostId)","repost":{"id":"\(repostId)","type":"POST","content":"rt",
        "createdAt":"2026-01-15T13:00:00.000Z","author":{"id":"\(authorId)","username":"carol"}}}
        """)
    }

    // MARK: - Room

    /// Le profil peut être ouvert hors du feed (conversation, recherche) : sans
    /// join de la feed room, aucun de ces événements n'arrive.
    func test_init_joinsFeedRoom_soEventsReachAProfileOpenedOutsideTheFeed() {
        let (_, _, socket) = makeSUT()

        XCTAssertEqual(socket.connectCallCount, 1)
        XCTAssertEqual(socket.subscribeFeedCallCount, 1)
        XCTAssertEqual(socket.unsubscribeFeedCallCount, 0,
                       "le profil ne quitte JAMAIS la feed room — elle appartient au feed")
    }

    // MARK: - Likes

    func test_postLiked_byAnotherUser_updatesTheDisplayedCount() async throws {
        let (sut, socket) = await loaded(likeCount: 10)

        socket.postLiked.send(Self.liked(postId: "p1", userId: "other-1", likeCount: 11))
        try await waitForCondition { sut.likeCount(sut.posts[0]) == 11 }

        XCTAssertFalse(sut.isLiked(sut.posts[0]), "le like d'un tiers n'allume pas NOTRE cœur")
    }

    /// Le cœur du bug de compteur : l'écho serveur de NOTRE propre like porte un
    /// total qui inclut DÉJÀ ce like. Garder l'override optimiste par-dessus
    /// afficherait +1 de trop.
    func test_postLiked_ownEcho_adoptsServerTotalWithoutDoubleCounting() async throws {
        let (sut, socket) = await loaded(likeCount: 10)

        await sut.toggleLike("p1")
        XCTAssertEqual(sut.likeCount(sut.posts[0]), 11, "optimisme immédiat")

        socket.postLiked.send(Self.liked(postId: "p1", userId: Self.meId, likeCount: 11))
        try await waitForCondition { sut.likedOverrides["p1"] == nil }

        XCTAssertEqual(sut.likeCount(sut.posts[0]), 11, "l'écho ne s'ajoute pas à l'optimisme")
        XCTAssertTrue(sut.isLiked(sut.posts[0]))
    }

    func test_postUnliked_ownEcho_adoptsServerTotalWithoutDoubleCounting() async throws {
        let (sut, socket) = await loaded(likeCount: 10, isLikedByMe: true)

        await sut.toggleLike("p1")
        XCTAssertEqual(sut.likeCount(sut.posts[0]), 9)

        socket.postUnliked.send(Self.unliked(postId: "p1", userId: Self.meId, likeCount: 9))
        try await waitForCondition { sut.likedOverrides["p1"] == nil }

        XCTAssertEqual(sut.likeCount(sut.posts[0]), 9)
        XCTAssertFalse(sut.isLiked(sut.posts[0]))
    }

    // MARK: - Commentaires

    func test_commentAdded_updatesTheCommentCounterOnTheCard() async throws {
        let (sut, socket) = await loaded(commentCount: 2)

        socket.commentAdded.send(Self.commentAdded(postId: "p1", commentCount: 3))

        try await waitForCondition { sut.posts[0].commentCount == 3 }
    }

    func test_commentDeleted_updatesTheCommentCounterOnTheCard() async throws {
        let (sut, socket) = await loaded(commentCount: 2)

        socket.commentDeleted.send(JSONStub.decode("""
        {"postId":"p1","commentId":"c1","commentCount":1}
        """) as SocketCommentDeletedData)

        try await waitForCondition { sut.posts[0].commentCount == 1 }
    }

    // MARK: - Reposts

    /// `post:reposted` ne porte qu'un delta : une re-livraison ne doit pas
    /// faire dériver le compteur.
    func test_postReposted_duplicateDelivery_isCountedOnce() async throws {
        let (sut, socket) = await loaded(repostCount: 3)

        let event = Self.reposted(originalPostId: "p1", repostId: "rp1", authorId: "other-1")
        socket.postReposted.send(event)
        try await waitForCondition { sut.repostCount(sut.posts[0]) == 4 }

        socket.postReposted.send(event)
        try? await Task.sleep(nanoseconds: 150_000_000)

        XCTAssertEqual(sut.repostCount(sut.posts[0]), 4)
    }

    func test_postReposted_byTheProfileOwner_insertsTheRepostAtTheTop() async throws {
        let (sut, socket) = await loaded()

        socket.postReposted.send(Self.reposted(originalPostId: "other-post",
                                               repostId: "rp1", authorId: Self.userId))

        try await waitForCondition { sut.posts.map(\.id) == ["rp1", "p1"] }
    }

    // MARK: - Suppression / édition distantes

    func test_postDeleted_removesTheCardFromTheListing() async throws {
        let (sut, socket) = await loaded()

        socket.postDeleted.send("p1")

        try await waitForCondition { sut.posts.isEmpty }
    }

    func test_postUpdated_patchesContentButKeepsOurOwnLikeState() async throws {
        let (sut, socket) = await loaded(isLikedByMe: true)

        socket.postUpdated.send(JSONStub.decode("""
        {"id":"p1","type":"POST","content":"édité","createdAt":"2026-01-15T12:00:00.000Z",
        "likeCount":10,"author":{"id":"\(Self.userId)","username":"alice"}}
        """) as APIPost)
        try await waitForCondition { sut.posts[0].content == "édité" }

        XCTAssertTrue(sut.isLiked(sut.posts[0]),
                      "un broadcast destiné à toute l'audience ne porte pas notre état personnel")
    }

    // MARK: - Favoris

    func test_postBookmarked_adoptsServerFlagAndCount() async throws {
        let (sut, socket) = await loaded()

        socket.postBookmarked.send(JSONStub.decode("""
        {"postId":"p1","bookmarked":true,"bookmarkCount":7}
        """) as SocketPostBookmarkedData)
        try await waitForCondition { sut.isBookmarked(sut.posts[0]) }

        XCTAssertEqual(sut.bookmarkCount(sut.posts[0]), 7)
    }
}
