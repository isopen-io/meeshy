import XCTest
@testable import MeeshySDK

/// Defensive cap on `lastMessagePreview` at the API→domain boundary.
///
/// The list row only ever renders 1–2 lines, but CoreText typesets the FULL
/// string on every row measurement (cost is O(total length); `lineLimit`
/// does not bound it). The gateway caps the wire field too — this client-side
/// cap keeps the invariant when payloads arrive from older gateways or other
/// code paths.
final class ConversationPreviewTruncationTests: XCTestCase {

    // MARK: - Factory

    private func makeLastMessage(content: String) throws -> APIConversationLastMessage {
        let payload: [String: Any] = [
            "id": "m1",
            "content": content,
            "createdAt": "2026-07-05T10:00:00Z"
        ]
        let data = try JSONSerialization.data(withJSONObject: payload)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIConversationLastMessage.self, from: data)
    }

    private func makeAPIConversation(lastMessageContent: String) throws -> APIConversation {
        APIConversation(
            id: "conv1",
            type: "direct",
            lastMessage: try makeLastMessage(content: lastMessageContent),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    // MARK: - Truncation

    func test_toConversation_oversizedContent_capsPreviewAt300() throws {
        let api = try makeAPIConversation(lastMessageContent: String(repeating: "x", count: 5000))

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.lastMessagePreview?.count, 300)
    }

    func test_toConversation_shortContent_keepsPreviewIntact() throws {
        let api = try makeAPIConversation(lastMessageContent: "salut ✋")

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.lastMessagePreview, "salut ✋")
    }

    func test_toConversation_emojiAtBoundary_neverSplitsGrapheme() throws {
        let api = try makeAPIConversation(
            lastMessageContent: String(repeating: "a", count: 299) + "😀😀😀"
        )

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.lastMessagePreview, String(repeating: "a", count: 299) + "😀")
    }

    // MARK: - Helper semantics

    func test_meeshyPreviewTruncated_atExactCap_returnsSelf() {
        let exact = String(repeating: "y", count: 300)
        XCTAssertEqual(exact.meeshyPreviewTruncated, exact)
    }
}
