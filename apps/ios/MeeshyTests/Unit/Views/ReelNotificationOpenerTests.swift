import XCTest
@testable import Meeshy
import MeeshySDK

/// **Un tap sur la notification d'un réel ne fait qu'UNE requête** (#6508).
///
/// `RootView.openReelFromNotification` avalait l'échec par `try?`, puis
/// retombait sur le détail du post, qui refaisait la même requête : deux
/// échecs pour un seul tap, et un écran qui disait « vérifiez votre
/// connexion » pendant une panne serveur. La décision vit désormais ici,
/// injectable, et le repli sur le détail n'a lieu que si le post est TROUVÉ et
/// n'est pas un réel.
@MainActor
final class ReelNotificationOpenerTests: XCTestCase {

    private func makeAPIPost(id: String, type: String) -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"\(type)","content":"","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    private func makeSUT(cached: FeedPost? = nil) -> (sut: ReelNotificationOpener, postService: MockPostService) {
        let postService = MockPostService()
        let sut = ReelNotificationOpener(
            postService: postService,
            cachedPost: { _ in cached },
            preferredLanguages: { [] },
            drainPrefetchedPosts: {}
        )
        return (sut, postService)
    }

    func test_unReelEnCache_souvreSansAucuneRequete() async {
        let reel = makeAPIPost(id: "r1", type: "REEL").toFeedPost(preferredLanguages: [])
        let (sut, postService) = makeSUT(cached: reel)

        guard case let .reel(post) = await sut.destination(for: "r1") else {
            return XCTFail("un réel en cache s'ouvre dans le lecteur")
        }
        XCTAssertEqual(post.id, "r1")
        XCTAssertEqual(postService.getPostCallCount, 0)
    }

    func test_unReelAbsentDuCache_souvreApresUneSeuleRequete() async {
        let (sut, postService) = makeSUT()
        postService.getPostResult = .success(makeAPIPost(id: "r1", type: "REEL"))

        guard case let .reel(post) = await sut.destination(for: "r1") else {
            return XCTFail("un réel servi par le réseau s'ouvre dans le lecteur")
        }
        XCTAssertEqual(post.id, "r1")
        XCTAssertEqual(postService.getPostCallCount, 1)
    }

    /// Le seul repli sur le détail : le post EXISTE et n'est pas un réel. Il
    /// part avec le post chargé, pour que le détail le rende sans attendre.
    func test_unPostTrouveQuiNEstPasUnReel_retombeSurLeDetail_avecLePostCharge() async {
        let (sut, postService) = makeSUT()
        postService.getPostResult = .success(makeAPIPost(id: "p1", type: "POST"))

        guard case let .postDetail(post) = await sut.destination(for: "p1") else {
            return XCTFail("un post non-réel trouvé retombe sur le détail")
        }
        XCTAssertEqual(post.id, "p1")
        XCTAssertEqual(postService.getPostCallCount, 1)
    }

    /// Le cas du 2026-09-14 : un 500. Une requête, et l'échec du LECTEUR —
    /// jamais le détail, qui en ferait une seconde.
    func test_unEchecServeur_rendLEchecDuLecteur_apresUneSeuleRequete() async {
        let (sut, postService) = makeSUT()
        postService.getPostResult = .failure(MeeshyError.server(statusCode: 500, message: "Erreur serveur"))

        guard case .failure(.server) = await sut.destination(for: "r1") else {
            return XCTFail("un 500 rend l'échec serveur du lecteur")
        }
        XCTAssertEqual(postService.getPostCallCount, 1)
    }

    func test_unReseauAbsent_rendLEchecReseau() async {
        let (sut, postService) = makeSUT()
        postService.getPostResult = .failure(MeeshyError.network(.noConnection))

        guard case .failure(.network) = await sut.destination(for: "r1") else {
            return XCTFail("sans réseau, l'échec dit la connexion")
        }
        XCTAssertEqual(postService.getPostCallCount, 1)
    }

    func test_unReelIntrouvable_rendLIndisponible_sansRetomberSurLeDetail() async {
        let (sut, postService) = makeSUT()
        postService.getPostResult = .failure(MeeshyError.server(statusCode: 404, message: "Post not found"))

        guard case .failure(.notFound) = await sut.destination(for: "r1") else {
            return XCTFail("un 404 rend l'indisponibilité, pas le détail")
        }
        XCTAssertEqual(postService.getPostCallCount, 1)
    }

    /// Un cache qui tient un post NON-réel ne tranche pas : le réseau décide.
    func test_unCacheNonReel_revalideParUneSeuleRequete() async {
        let cachedPost = makeAPIPost(id: "r1", type: "POST").toFeedPost(preferredLanguages: [])
        let (sut, postService) = makeSUT(cached: cachedPost)
        postService.getPostResult = .success(makeAPIPost(id: "r1", type: "REEL"))

        guard case .reel = await sut.destination(for: "r1") else {
            return XCTFail("le réseau a reclassé le post en réel")
        }
        XCTAssertEqual(postService.getPostCallCount, 1)
    }
}
