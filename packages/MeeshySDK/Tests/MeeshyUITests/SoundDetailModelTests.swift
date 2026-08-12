import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// La « page du son » pagine des USAGES, pas des publications. Le serveur peut
/// donc rendre une page sans aucune publication nouvelle sans que ce soit la
/// fin : plusieurs usages désignent parfois la même publication, et les non
/// publiques sont écartées. C'est ce décalage que ces tests verrouillent.
@MainActor
final class SoundDetailModelTests: XCTestCase {

    /// Faux service qui sert des pages scriptées et enregistre les curseurs.
    final class FakeService: SoundLibraryServiceProviding, @unchecked Sendable {
        var pages: [SoundPostPage] = []
        var shouldThrow = false
        private(set) var cursors: [Date?] = []
        private var index = 0

        func posts(soundId: String, cursor: Date?, limit: Int) async throws -> SoundPostPage {
            cursors.append(cursor)
            if shouldThrow { throw URLError(.notConnectedToInternet) }
            guard index < pages.count else { return SoundPostPage(posts: [], nextCursor: nil) }
            defer { index += 1 }
            return pages[index]
        }

        func mySounds(query: String?, cursor: Date?, limit: Int) async throws -> SoundPage {
            SoundPage(sounds: [], nextCursor: nil)
        }
        func trendingSounds(query: String?, limit: Int) async throws -> [APISound] { [] }
        func rename(soundId: String, title: String) async throws -> APISound {
            throw URLError(.badURL)
        }
    }

    private func post(_ id: String, views: Int = 0) -> APISoundPost {
        APISoundPost(id: id, viewCount: views)
    }

    private func makeModel(_ service: FakeService) -> SoundDetailModel {
        SoundDetailModel(soundId: "s1", service: service)
    }

    // MARK: - Chargement

    func test_chargement_initial_remplitLaGrille() async {
        let service = FakeService()
        service.pages = [SoundPostPage(posts: [post("p1"), post("p2")], nextCursor: nil)]
        let model = makeModel(service)

        await model.loadIfNeeded()

        XCTAssertEqual(model.posts.map(\.id), ["p1", "p2"])
        XCTAssertFalse(model.isEmpty)
        XCTAssertEqual(service.cursors, [nil])
    }

    func test_loadIfNeeded_neChargeQuUneSeuleFois() async {
        let service = FakeService()
        service.pages = [SoundPostPage(posts: [post("p1")], nextCursor: nil)]
        let model = makeModel(service)

        await model.loadIfNeeded()
        await model.loadIfNeeded()

        XCTAssertEqual(service.cursors.count, 1)
    }

    // MARK: - Pagination

    func test_loadMore_ajouteEtSuitLeCurseur() async {
        let curseur = Date(timeIntervalSince1970: 1_785_000_000)
        let service = FakeService()
        service.pages = [
            SoundPostPage(posts: [post("p1")], nextCursor: curseur),
            SoundPostPage(posts: [post("p2")], nextCursor: nil),
        ]
        let model = makeModel(service)
        await model.loadIfNeeded()

        await model.loadMore()

        XCTAssertEqual(model.posts.map(\.id), ["p1", "p2"])
        XCTAssertEqual(service.cursors.last, curseur)
    }

    func test_loadMore_sansCurseur_neFaitRien() async {
        let service = FakeService()
        service.pages = [SoundPostPage(posts: [post("p1")], nextCursor: nil)]
        let model = makeModel(service)
        await model.loadIfNeeded()

        await model.loadMore()

        XCTAssertEqual(service.cursors.count, 1)
        XCTAssertFalse(model.canLoadMore)
    }

    func test_dedoublonne_unePublicationRevenueSurDeuxPages() async {
        // Une publication qui pose le son sur plusieurs pistes revient une fois
        // PAR USAGE : sans dédoublonnage, la même vignette s'affiche deux fois.
        let curseur = Date(timeIntervalSince1970: 1_785_000_000)
        let service = FakeService()
        service.pages = [
            SoundPostPage(posts: [post("p1")], nextCursor: curseur),
            SoundPostPage(posts: [post("p1"), post("p2")], nextCursor: nil),
        ]
        let model = makeModel(service)
        await model.loadIfNeeded()

        await model.loadMore()

        XCTAssertEqual(model.posts.map(\.id), ["p1", "p2"])
    }

    func test_unePageSansNOUVEAUTE_nArretePasLaPagination() async {
        // Le piège : une page peut ne rien apporter de neuf et pourtant ne pas
        // être la fin. S'arrêter au premier vide tronquerait la liste.
        let c1 = Date(timeIntervalSince1970: 1_785_000_000)
        let c2 = Date(timeIntervalSince1970: 1_784_000_000)
        let service = FakeService()
        service.pages = [
            SoundPostPage(posts: [post("p1")], nextCursor: c1),
            SoundPostPage(posts: [post("p1")], nextCursor: c2),   // rien de neuf
            SoundPostPage(posts: [post("p2")], nextCursor: nil),
        ]
        let model = makeModel(service)
        await model.loadIfNeeded()

        await model.loadMore()
        await model.loadMore()

        XCTAssertEqual(model.posts.map(\.id), ["p1", "p2"])
    }

    func test_apresPlusieursPagesSteriles_laPaginationSArrete() async {
        // Mais il faut bien s'arrêter : sinon la roue tourne indéfiniment sur
        // des usages qui ne produisent plus aucune publication visible.
        let c = Date(timeIntervalSince1970: 1_785_000_000)
        let service = FakeService()
        service.pages = [
            SoundPostPage(posts: [post("p1")], nextCursor: c),
            SoundPostPage(posts: [], nextCursor: c),
            SoundPostPage(posts: [], nextCursor: c),
            SoundPostPage(posts: [], nextCursor: c),
        ]
        let model = makeModel(service)
        await model.loadIfNeeded()

        await model.loadMore()
        await model.loadMore()
        await model.loadMore()

        XCTAssertFalse(model.canLoadMore, "trois pages stériles doivent clore la pagination")
    }

    // MARK: - Échecs

    func test_echec_initial_marqueLEtatSansPlanter() async {
        let service = FakeService()
        service.shouldThrow = true
        let model = makeModel(service)

        await model.loadIfNeeded()

        XCTAssertTrue(model.posts.isEmpty)
        XCTAssertTrue(model.didFail)
        XCTAssertTrue(model.isEmpty)
    }

    func test_echec_dUnePageSUIVANTE_conserveCeQuiEstAffiche() async {
        // Une page manquante ne doit pas effacer ce que l'utilisateur regarde.
        let c = Date(timeIntervalSince1970: 1_785_000_000)
        let service = FakeService()
        service.pages = [SoundPostPage(posts: [post("p1")], nextCursor: c)]
        let model = makeModel(service)
        await model.loadIfNeeded()
        service.shouldThrow = true

        await model.loadMore()

        XCTAssertEqual(model.posts.map(\.id), ["p1"])
        XCTAssertFalse(model.didFail, "la liste affichée n'est pas un échec")
    }

    // MARK: - Décodage

    func test_decode_dUnePublication_toleresLesChampsAbsents() throws {
        let json = #"{ "id": "p1" }"#
        let post = try JSONDecoder().decode(APISoundPost.self, from: Data(json.utf8))

        XCTAssertEqual(post.id, "p1")
        XCTAssertEqual(post.viewCount, 0)
        XCTAssertEqual(post.likeCount, 0)
        XCTAssertTrue(post.media.isEmpty)
        XCTAssertNil(post.thumbnail)
    }

    func test_thumbnail_prendLePremierMedia() {
        let p = APISoundPost(id: "p1", media: [
            APISoundPostMedia(id: "m1", thumbnailUrl: "https://cdn/a.jpg"),
            APISoundPostMedia(id: "m2"),
        ])
        XCTAssertEqual(p.thumbnail?.id, "m1")
    }
}
