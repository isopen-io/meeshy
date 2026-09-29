import XCTest
@testable import MeeshySDK

/// #8651 — un identifiant VIDE ne part jamais dans une URL.
///
/// Relevé de production du 2026-09-29 : `GET /conversations/messages?…` → 404.
/// `ConversationsEndpoint.byIdMessages(id: "")` compose
/// `/api/v1/conversations//messages`, qu'un intermédiaire ramène à une AUTRE
/// route. La requête doit échouer AVANT le réseau, pour tout appelant.
final class APIClientEmptyPathSegmentTests: XCTestCase {

    func test_containsEmptyPathSegment_flagsAnEmptySegment() {
        XCTAssertTrue(APIClient.containsEmptyPathSegment("/api/v1/conversations//messages"))
        XCTAssertTrue(APIClient.containsEmptyPathSegment("/api/v1/conversations/"))
    }

    func test_containsEmptyPathSegment_acceptsAWellFormedPath() {
        XCTAssertFalse(APIClient.containsEmptyPathSegment("/api/v1/conversations/abc/messages"))
        XCTAssertFalse(APIClient.containsEmptyPathSegment("/api/v1/conversations"))
        XCTAssertFalse(APIClient.containsEmptyPathSegment("/"))
    }

    func test_request_withAnEmptyConversationId_failsBeforeTheNetwork() async {
        do {
            let _: MessagesAPIResponse = try await APIClient.shared.request(
                ConversationsEndpoint.byIdMessages(id: "")
            )
            XCTFail("une URL à segment vide ne doit pas partir")
        } catch MeeshyError.server(let status, let message) {
            XCTAssertEqual(status, 0)
            XCTAssertEqual(message, "URL invalide")
        } catch {
            XCTFail("attendu un refus local, reçu \(error)")
        }
    }
}
