import XCTest
@testable import Meeshy
import MeeshySDK

/// **Un réel s'ouvre dans le lecteur de réels, quelle que soit la porte** (#7805, #7806).
///
/// La notification iPhone ouvrait `ReelsPresenter`, mais la notification iPad,
/// le lien `/reel/<id>` et le lien de suivi REEL ouvraient le détail d'un post.
/// Toutes passent désormais par `ReelDoor`, qui rend la décision de
/// `ReelNotificationOpener` : le lecteur de réels, le détail pour un post
/// trouvé qui n'est pas un réel, et sinon l'état d'échec du lecteur.
@MainActor
final class ReelDoorTests: XCTestCase {

    private final class SpyReelsPresenter: ReelsPresenting {
        var presented: (posts: [FeedPost], startId: String?, commentId: String?, parentCommentId: String?)?
        var failed: (failure: ContentFetchFailure, postId: String, commentId: String?, parentCommentId: String?)?

        func present(posts: [FeedPost], startId: String?, commentId: String?, parentCommentId: String?) {
            presented = (posts, startId, commentId, parentCommentId)
        }

        func presentFailure(_ failure: ContentFetchFailure, postId: String, commentId: String?, parentCommentId: String?) {
            failed = (failure, postId, commentId, parentCommentId)
        }
    }

    private func makeAPIPost(id: String, type: String) -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"\(type)","content":"","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    private func makeSUT(served: Result<APIPost, Error>) -> (door: ReelDoor, presenter: SpyReelsPresenter) {
        let postService = MockPostService()
        postService.getPostResult = served
        let presenter = SpyReelsPresenter()
        let door = ReelDoor(
            opener: ReelNotificationOpener(
                postService: postService,
                cachedPost: { _ in nil },
                preferredLanguages: { [] },
                drainPrefetchedPosts: {}
            ),
            presenter: presenter
        )
        return (door, presenter)
    }

    func test_open_unReel_ouvreLeLecteurDeReelsSurCeReel_avecSaCibleCommentaire() async {
        let (door, presenter) = makeSUT(served: .success(makeAPIPost(id: "r1", type: "REEL")))
        var detail: FeedPost?

        await door.open(postId: "r1", commentId: "c1", parentCommentId: "c0") { detail = $0 }

        XCTAssertEqual(presenter.presented?.posts.map(\.id), ["r1"])
        XCTAssertEqual(presenter.presented?.startId, "r1")
        XCTAssertEqual(presenter.presented?.commentId, "c1")
        XCTAssertEqual(presenter.presented?.parentCommentId, "c0")
        XCTAssertNil(detail)
    }

    func test_open_unPostQuiNEstPasUnReel_ouvreLeDetailAvecLePostCharge() async {
        let (door, presenter) = makeSUT(served: .success(makeAPIPost(id: "p1", type: "POST")))
        var detail: FeedPost?

        await door.open(postId: "p1") { detail = $0 }

        XCTAssertEqual(detail?.id, "p1")
        XCTAssertNil(presenter.presented)
        XCTAssertNil(presenter.failed)
    }

    func test_open_unEchec_ouvreLEchecDuLecteur_jamaisLeDetail() async {
        let (door, presenter) = makeSUT(served: .failure(MeeshyError.server(statusCode: 404, message: "Post not found")))
        var detail: FeedPost?

        await door.open(postId: "r1", commentId: "c1") { detail = $0 }

        guard case .notFound = presenter.failed?.failure else {
            return XCTFail("un 404 ouvre l'indisponibilité du lecteur")
        }
        XCTAssertEqual(presenter.failed?.postId, "r1")
        XCTAssertEqual(presenter.failed?.commentId, "c1")
        XCTAssertNil(detail)
    }
}
