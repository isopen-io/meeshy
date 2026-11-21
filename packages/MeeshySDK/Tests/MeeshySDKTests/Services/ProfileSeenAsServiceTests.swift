import XCTest
@testable import MeeshySDK

/// « Voir comme » sur le fil (#18869) : `GET /directory/people/:handle?as=<CERCLE>&expand=circle,…`,
/// le contrat que la passerelle sert depuis #18861. Un serveur qui ignore `as` rend MA fiche sans
/// `viewAs` : elle ne doit jamais passer pour la vue d'un cercle.
final class ProfileSeenAsServiceTests: XCTestCase {

    private func makeService() -> (ProfileSeenAsService, MockAPIClient) {
        let mock = MockAPIClient()
        return (ProfileSeenAsService(api: mock), mock)
    }

    private let servedAsFriend = """
    {"success":true,"data":{"id":"u1","username":"aissa","displayName":"Aïssa Ndiaye","viewAs":"FRIEND",
     "circle":{"isSelf":false,"level":"FRIEND","sharesCommunity":false,
       "capabilities":{"presence":{"state":"open","circle":"FRIEND","consentRequired":false},
                       "gameSparks":{"state":"locked","circle":"CLOSE","consentRequired":false}}}}}
    """

    func test_vitrine_asksTheCircleAndItsCapabilities() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/directory/people/aissa", json: servedAsFriend)

        _ = try await service.vitrine(handle: "aissa", seenAs: .friend)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/people/aissa")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        let items = mock.lastRequest?.queryItems ?? []
        XCTAssertEqual(items.first { $0.name == "as" }?.value, "FRIEND")
        XCTAssertEqual(items.first { $0.name == "expand" }?.value, "circle,presence,stats")
    }

    func test_vitrine_readsTheAppliedCircleAndTheView() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/directory/people/aissa", json: servedAsFriend)

        let profile = try await service.vitrine(handle: "aissa", seenAs: .friend)

        XCTAssertEqual(profile.viewAs, .friend)
        XCTAssertEqual(profile.circle?.level, .friend)
        XCTAssertEqual(profile.circle?.state(of: .presence)?.isOpen, true)
        XCTAssertEqual(profile.circle?.state(of: .gameSparks)?.isOpen, false)
        XCTAssertEqual(profile.user.username, "aissa")
    }

    func test_vitrine_anOldServerWithoutViewAsIsNotAViewByCircle() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/directory/people/aissa", json: #"{"success":true,"data":{"id":"u1","username":"aissa"}}"#)

        let profile = try await service.vitrine(handle: "aissa", seenAs: .public)

        XCTAssertNil(profile.viewAs)
        XCTAssertNil(profile.circle)
    }

    func test_vitrine_anUnreadableCircleBlockDoesNotDropTheProfile() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/directory/people/aissa", json: #"{"success":true,"data":{"id":"u1","username":"aissa","viewAs":"ATOM","circle":"oops"}}"#)

        let profile = try await service.vitrine(handle: "aissa", seenAs: .blood)

        XCTAssertNil(profile.viewAs)
        XCTAssertNil(profile.circle)
        XCTAssertEqual(profile.user.id, "u1")
    }

    func test_vitrine_percentEncodesTheHandle() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/directory/people/a%20b", json: #"{"success":true,"data":{"id":"u1","username":"ab"}}"#)

        _ = try await service.vitrine(handle: "a b", seenAs: .public)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/people/a%20b")
    }
}
