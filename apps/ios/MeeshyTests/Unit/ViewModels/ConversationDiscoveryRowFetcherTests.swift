import XCTest
import MeeshySDK
@testable import Meeshy

/// #8561 — une conversation DÉCOUVERTE par le socket (ajout à un groupe,
/// `conversation:new`) entre dans la liste par la route RICHE, qui porte
/// l'aperçu du dernier message ; la route de détail ne le porte pas, et la
/// ligne restait « Nouvelle conversation » au-dessus d'un fil qui disait
/// « Demo a ajouté Recette Appel ».
@MainActor
final class ConversationDiscoveryRowFetcherTests: XCTestCase {

    private let conversationId = "6ab950015f4cb220d4afa185"
    private let viewerId = "6ab9b389da11b9117ab1b3d8"

    private func richRow(id: String, notice: String) -> APIConversation {
        JSONStub.decode("""
        {"id":"\(id)","type":"group","title":"Recette flamme 8351",
         "createdAt":"2026-09-27T17:18:57.000Z",
         "lastMessageAt":"2026-09-29T05:05:20.559Z",
         "lastMessage":{"id":"6abb47107da8d6e1909a8446","content":"\(notice)",
           "messageType":"system","createdAt":"2026-09-29T05:05:20.559Z",
           "systemEvent":{"key":"system.member-added","params":{"actor":"Demo","target":"Recette Appel"}}}}
        """)
    }

    private func detailRow(id: String) -> APIConversation {
        JSONStub.decode("""
        {"id":"\(id)","type":"group","title":"Recette flamme 8351",
         "createdAt":"2026-09-27T17:18:57.000Z",
         "lastMessageAt":"2026-09-29T05:05:20.559Z"}
        """)
    }

    private func page(_ rows: [APIConversation]) -> ConversationPage {
        ConversationPage(
            items: rows.map { $0.toConversation(currentUserId: viewerId) },
            rawItems: rows,
            nextCursor: nil,
            hasMore: false
        )
    }

    func test_row_discoveredConversationInRichPage_carriesItsLastMessagePreview() async throws {
        let service = MockConversationService()
        service.listPageResult = .success(page([
            richRow(id: conversationId, notice: "Demo a ajouté Recette Appel")
        ]))
        service.getByIdResult = .success(detailRow(id: conversationId))

        let row = try await ConversationDiscoveryRowFetcher(service: service)
            .row(id: conversationId, currentUserId: viewerId)

        XCTAssertEqual(row.id, conversationId)
        XCTAssertEqual(row.lastMessagePreview, "Demo a ajouté Recette Appel",
                       "la ligne découverte doit porter l'aperçu servi par la route riche")
        XCTAssertEqual(service.getByIdCallCount, 0,
                       "la route riche a rendu la ligne : le détail, qui n'a pas d'aperçu, n'est pas lu")
    }

    func test_row_discoveredConversationAbsentFromRichPage_fallsBackToDetail() async throws {
        let service = MockConversationService()
        service.listPageResult = .success(page([
            richRow(id: "6ab9b392da11b9117ab1b3e2", notice: "autre")
        ]))
        service.getByIdResult = .success(detailRow(id: conversationId))

        let row = try await ConversationDiscoveryRowFetcher(service: service)
            .row(id: conversationId, currentUserId: viewerId)

        XCTAssertEqual(row.id, conversationId)
        XCTAssertEqual(service.getByIdCallCount, 1)
        XCTAssertEqual(service.lastGetByIdConversationId, conversationId)
    }

    func test_row_richPageFails_fallsBackToDetail() async throws {
        let service = MockConversationService()
        service.listPageResult = .failure(URLError(.notConnectedToInternet))
        service.getByIdResult = .success(detailRow(id: conversationId))

        let row = try await ConversationDiscoveryRowFetcher(service: service)
            .row(id: conversationId, currentUserId: viewerId)

        XCTAssertEqual(row.id, conversationId)
        XCTAssertEqual(service.getByIdCallCount, 1)
    }
}
