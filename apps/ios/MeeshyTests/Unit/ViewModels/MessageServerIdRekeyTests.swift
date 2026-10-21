import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class MessageServerIdRekeyTests: XCTestCase {

    private func makeMessage(_ id: String) -> Message {
        Message(
            id: id,
            conversationId: "000000000000000000000096",
            senderId: "u1",
            content: "contenu",
            originalLanguage: "en",
            replyToId: "parent",
            createdAt: Date(timeIntervalSince1970: 42),
            updatedAt: Date(timeIntervalSince1970: 43),
            senderName: "Alice",
            senderUsername: "alice",
            deliveryStatus: .delivered,
            isMe: true,
            deliveredCount: 2,
            readCount: 1
        )
    }

    func test_rewrite_mapsTempIdsToServerIds_andKeepsEveryCopiedField() throws {
        let rewritten = MessageServerIdRekey.rewrite([makeMessage("cid_1")], mapping: ["cid_1": "srv_1"])

        let message = try XCTUnwrap(rewritten.first)
        XCTAssertEqual(message.id, "srv_1")
        XCTAssertEqual(message.content, "contenu")
        XCTAssertEqual(message.originalLanguage, "en")
        XCTAssertEqual(message.replyToId, "parent")
        XCTAssertEqual(message.createdAt, Date(timeIntervalSince1970: 42))
        XCTAssertEqual(message.senderName, "Alice")
        XCTAssertEqual(message.deliveryStatus, .delivered)
        XCTAssertTrue(message.isMe)
        XCTAssertEqual(message.deliveredCount, 2)
        XCTAssertEqual(message.readCount, 1)
    }

    func test_unmappedMessages_areUntouched() {
        let original = makeMessage("srv_9")

        let rewritten = MessageServerIdRekey.rewrite([original], mapping: ["cid_1": "srv_1"])

        XCTAssertEqual(rewritten.map(\.id), ["srv_9"])
        XCTAssertEqual(rewritten.first?.content, original.content)
    }

    func test_emptyMapping_returnsTheSameMessages() {
        let messages = [makeMessage("a"), makeMessage("b")]

        XCTAssertEqual(MessageServerIdRekey.rewrite(messages, mapping: [:]).map(\.id), ["a", "b"])
    }
}
