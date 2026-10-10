import XCTest
@testable import MeeshySDK

/// #9848 — retirer un son de sa bibliothèque part en `DELETE` sur l'adresse du
/// son, et la réponse dit combien de publications le jouent encore.
final class SoundLibraryServiceRemovalTests: XCTestCase {

    private func removalResponse(postCount: Int) throws -> APIResponse<SoundRemoval> {
        let json = """
        {"success":true,"data":{"id":"s1","deletedAt":"2026-10-09T20:00:00.000Z","postCount":\(postCount)}}
        """
        return try JSONDecoder().decode(APIResponse<SoundRemoval>.self, from: Data(json.utf8))
    }

    func test_remove_sendsADeleteOnTheSoundAddress() async throws {
        let api = MockAPIClient()
        api.stub("/sounds/s1", result: try removalResponse(postCount: 3))
        let service = SoundLibraryService(api: api)

        let removal = try await service.remove(soundId: "s1")

        XCTAssertEqual(api.lastRequest?.method, "DELETE")
        XCTAssertEqual(api.lastRequest?.endpoint, "/sounds/s1")
        XCTAssertEqual(removal.id, "s1")
        XCTAssertEqual(removal.postCount, 3)
    }

    func test_remove_decodesAnAnswerWithoutPostCount() throws {
        let json = #"{"id":"s1","deletedAt":null}"#
        let removal = try JSONDecoder().decode(SoundRemoval.self, from: Data(json.utf8))
        XCTAssertEqual(removal.postCount, 0)
        XCTAssertNil(removal.deletedAt)
    }

    func test_remove_serverRefusal_propagates() async {
        let api = MockAPIClient()
        api.stubError("/sounds/s1", error: URLError(.badServerResponse))
        let service = SoundLibraryService(api: api)
        do {
            _ = try await service.remove(soundId: "s1")
            XCTFail("un refus du serveur doit remonter — sinon le client ne remet jamais la ligne")
        } catch {}
    }
}
