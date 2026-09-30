import XCTest
@testable import MeeshySDK

/// La vitrine (#8855) affiche le VRAI accueil d'un lien sans passerelle : l'aperçu fixé est
/// servi à la place de la requête, et seulement pour son propre identifiant.
final class ShareLinkServiceVitrineTests: XCTestCase {
    override func tearDown() {
        ShareLinkService.debugLinkInfoOverride = nil
        super.tearDown()
    }

    func test_getLinkInfo_withVitrineOverride_servesTheFixtureWithoutNetwork() async throws {
        let mock = MockAPIClient()
        let service = ShareLinkService(api: mock)
        let fixture = try Self.info(linkId: "lisboa-2026")
        ShareLinkService.debugLinkInfoOverride = { $0 == "lisboa-2026" ? fixture : nil }

        let info = try await service.getLinkInfo(identifier: "lisboa-2026")

        XCTAssertEqual(info.linkId, "lisboa-2026")
        XCTAssertEqual(mock.requestCount, 0)
    }

    func test_getLinkInfo_overrideForAnotherLink_stillCallsTheGateway() async throws {
        let mock = MockAPIClient()
        let service = ShareLinkService(api: mock)
        let fixture = try Self.info(linkId: "lisboa-2026")
        ShareLinkService.debugLinkInfoOverride = { $0 == "lisboa-2026" ? fixture : nil }

        _ = try? await service.getLinkInfo(identifier: "autre-lien")

        XCTAssertEqual(mock.requestCount, 1)
    }

    private static func info(linkId: String) throws -> ShareLinkInfo {
        let json = #"{"id":"l1","linkId":"LINK","conversation":{"id":"c1","type":"group","createdAt":"2026-09-30T12:00:00.000Z"},"creator":{"id":"u1","username":"aiko.t"},"stats":{"totalParticipants":6,"memberCount":6,"anonymousCount":0,"languageCount":5,"spokenLanguages":["ja","pt","en","ko","es"]}}"#
            .replacingOccurrences(of: "LINK", with: linkId)
        return try APIClient.makeAPIPayloadDecoder().decode(ShareLinkInfo.self, from: Data(json.utf8))
    }
}
