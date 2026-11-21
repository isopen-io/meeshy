import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// #19519 — la carte d'un lien de fiche dans une bulle : cache d'abord (jamais de squelette sur une carte déjà
/// vue), relue en silence quand elle est périmée, neutre sur 404, et ses deux gestes reprennent les voies de l'app.
@MainActor
final class ProfileLinkCardViewModelTests: XCTestCase {

    private final class StubService: ProfileLinkCardProviding, @unchecked Sendable {
        var cache: CacheResult<ProfileLinkCardResolution> = .empty
        var served: ProfileLinkCardResolution = .unavailable
        private(set) var refreshCount = 0

        func cached(handle: String) -> CacheResult<ProfileLinkCardResolution> { cache }

        func refresh(handle: String) async -> ProfileLinkCardResolution {
            refreshCount += 1
            return served
        }
    }

    @MainActor
    private final class SpyPerformer: ProfileLinkCardActionPerforming {
        private(set) var openedUsernames: [String] = []
        private(set) var writtenUserIds: [String] = []

        func openProfile(username: String) { openedUsernames.append(username) }
        func write(to userId: String) async { writtenUserIds.append(userId) }
    }

    private static func card(isSelf: Bool = false) -> ProfileLinkCard {
        ProfileLinkCard(userId: "u1", username: "aissa", name: "Aïssa Ndiaye", bio: "Designer sonore à Dakar.",
                        isSelf: isSelf, bioOriginalLanguage: "fr", bioTranslations: ["it": "Sound designer a Dakar."])
    }

    private func makeModel(_ service: StubService, performer: SpyPerformer = SpyPerformer(),
                           prism: [String] = ["it", "fr"]) -> ProfileLinkCardViewModel {
        ProfileLinkCardViewModel(handle: "aissa", service: service, performer: performer, prism: prism)
    }

    func test_init_emptyCache_showsTheSkeleton_thenTheServedCard() async {
        let service = StubService()
        service.served = .card(Self.card())
        let model = makeModel(service)

        XCTAssertEqual(model.phase, .loading)
        await model.load()

        XCTAssertEqual(model.phase, .card(ProfileLinkCardFace(card: Self.card(), prism: ["it", "fr"])))
    }

    func test_init_freshCache_showsTheCardAtOnce_andDoesNotRefresh() async {
        let service = StubService()
        service.cache = .fresh(.card(Self.card()), age: 5)
        let model = makeModel(service)

        guard case .card = model.phase else { return XCTFail("une carte déjà vue s'affiche dès la première image") }
        await model.load()

        XCTAssertEqual(service.refreshCount, 0)
    }

    func test_init_staleCache_showsTheCard_thenRefreshesSilently() async {
        let service = StubService()
        service.cache = .stale(.card(Self.card()), age: 600)
        service.served = .closed
        let model = makeModel(service)

        guard case .card = model.phase else { return XCTFail("jamais de squelette sur un cache non vide") }
        await model.load()

        XCTAssertEqual(service.refreshCount, 1)
        XCTAssertEqual(model.phase, .closed)
    }

    func test_load_404_isTheNeutralCard() async {
        let service = StubService()
        service.served = .closed
        let model = makeModel(service)

        await model.load()

        XCTAssertEqual(model.phase, .closed)
    }

    func test_load_unavailable_fallsBackToTheGenericPreview() async {
        let model = makeModel(StubService())

        await model.load()

        XCTAssertEqual(model.phase, .unavailable)
    }

    func test_open_opensTheShowcaseByHandle() async {
        let service = StubService()
        service.cache = .fresh(.card(Self.card()), age: 1)
        let performer = SpyPerformer()
        let model = makeModel(service, performer: performer)

        model.open()

        XCTAssertEqual(performer.openedUsernames, ["aissa"])
    }

    func test_write_opensTheDirectConversation_butNeverOnMyOwnCard() async {
        let service = StubService()
        service.cache = .fresh(.card(Self.card()), age: 1)
        let performer = SpyPerformer()
        await makeModel(service, performer: performer).write()

        service.cache = .fresh(.card(Self.card(isSelf: true)), age: 1)
        await makeModel(service, performer: performer).write()

        XCTAssertEqual(performer.writtenUserIds, ["u1"])
    }
}
