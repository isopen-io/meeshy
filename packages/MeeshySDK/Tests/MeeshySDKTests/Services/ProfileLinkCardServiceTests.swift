import XCTest
@testable import MeeshySDK

/// #19519 — la carte d'un lien de fiche se lit à la porte de la fiche (`?via=link&expand=presence`, #18865),
/// cache d'abord ; une 404 est un verdict neutre caché, une panne ne remplace rien.
final class ProfileLinkCardServiceTests: XCTestCase {

    private final class Clock: @unchecked Sendable {
        var date = Date(timeIntervalSince1970: 1_000_000)
    }

    private func makeService(_ api: MockAPIClient, clock: Clock = Clock()) -> ProfileLinkCardService {
        ProfileLinkCardService(api: api, now: { clock.date })
    }

    private let served = """
    {"success":true,"data":{"id":"u1","username":"aissa","displayName":"Aïssa Ndiaye","avatar":"https://cdn/a.jpg",
     "bio":"Designer sonore à Dakar.","profileAccentColor":"#a855f7","isOnline":true,
     "bioOriginalLanguage":"fr","bioTranslations":{"it":"Sound designer a Dakar."}}}
    """

    func test_refresh_asksTheLinkCardWithPresence_andProjectsTheCard() async {
        let api = MockAPIClient()
        api.stubWire("/directory/people/aissa", json: served)

        let resolution = await makeService(api).refresh(handle: "aissa")

        XCTAssertEqual(api.lastRequest?.endpoint, "/directory/people/aissa")
        let items = api.lastRequest?.queryItems ?? []
        XCTAssertEqual(items.first { $0.name == "via" }?.value, "link")
        XCTAssertEqual(items.first { $0.name == "expand" }?.value, "presence")
        guard case .card(let card) = resolution else { return XCTFail("la carte servie doit se lire") }
        XCTAssertEqual(card.userId, "u1")
        XCTAssertEqual(card.name, "Aïssa Ndiaye")
        XCTAssertEqual(card.profileAccentColor, "#A855F7")
        XCTAssertEqual(card.isOnline, true)
        XCTAssertEqual(card.bioTranslations["it"], "Sound designer a Dakar.")
    }

    func test_refresh_cachesTheCard_fresh() async {
        let api = MockAPIClient()
        api.stubWire("/directory/people/aissa", json: served)
        let service = makeService(api)

        _ = await service.refresh(handle: "aissa")

        guard case .fresh(.card(let cached), _) = service.cached(handle: "aissa") else {
            return XCTFail("la carte relue doit être en cache, fraîche")
        }
        XCTAssertEqual(cached.username, "aissa")
    }

    func test_refresh_404_isTheNeutralCard_cachedAsAVerdict() async {
        let api = MockAPIClient()
        api.stubError("/directory/people/ghost", error: MeeshyError.server(statusCode: 404, message: "User not found"))
        let service = makeService(api)

        let resolution = await service.refresh(handle: "ghost")

        XCTAssertEqual(resolution, .closed)
        guard case .fresh(.closed, _) = service.cached(handle: "ghost") else {
            return XCTFail("la 404 est un verdict caché")
        }
    }

    func test_refresh_403WithoutAccount_fallsBackToTheGenericPreview() async {
        let api = MockAPIClient()
        api.stubError("/directory/people/aissa", error: MeeshyError.forbidden(reason: "Account required", body: nil))

        let resolution = await makeService(api).refresh(handle: "aissa")

        XCTAssertEqual(resolution, .unavailable)
    }

    func test_refresh_networkFailure_keepsWhatTheCacheHad() async {
        let api = MockAPIClient()
        api.stubWire("/directory/people/aissa", json: served)
        let clock = Clock()
        let service = makeService(api, clock: clock)
        let first = await service.refresh(handle: "aissa")
        api.stubError("/directory/people/aissa", error: URLError(.notConnectedToInternet))
        clock.date = clock.date.addingTimeInterval(120)

        let second = await service.refresh(handle: "aissa")

        XCTAssertEqual(second, first)
    }

    func test_refresh_networkFailureOnEmptyCache_isUnavailable() async {
        let api = MockAPIClient()
        api.stubError("/directory/people/aissa", error: URLError(.notConnectedToInternet))

        let resolution = await makeService(api).refresh(handle: "aissa")

        XCTAssertEqual(resolution, .unavailable)
    }

    func test_cached_staleAfterAMinute_expiredAfterADay() async {
        let api = MockAPIClient()
        api.stubWire("/directory/people/aissa", json: served)
        let clock = Clock()
        let service = makeService(api, clock: clock)
        _ = await service.refresh(handle: "aissa")

        clock.date = clock.date.addingTimeInterval(120)
        guard case .stale = service.cached(handle: "aissa") else { return XCTFail("au-delà d'une minute : périmée") }
        clock.date = clock.date.addingTimeInterval(24 * 60 * 60)
        guard case .expired = service.cached(handle: "aissa") else { return XCTFail("au-delà d'un jour : expirée") }
    }

    func test_invalidateAll_forgetsEveryCard() async {
        let api = MockAPIClient()
        api.stubWire("/directory/people/aissa", json: served)
        let service = makeService(api)
        _ = await service.refresh(handle: "aissa")

        service.invalidateAll()

        guard case .empty = service.cached(handle: "aissa") else { return XCTFail("le logout oublie les cartes") }
    }
}
