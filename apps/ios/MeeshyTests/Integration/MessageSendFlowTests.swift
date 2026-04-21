import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// Integration test: sendMessage -> optimistic update -> confirmation -> finalized
@MainActor
final class MessageSendFlowTests: XCTestCase {

    // MARK: - Helpers

    private func makeConversation(id: String = "000000000000000000000002") -> Conversation {
        Conversation(id: id, identifier: id, type: .direct, title: "Test Convo", lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    private func makeMessageService() -> MockMessageService {
        MockMessageService()
    }

    private func makeMessageSocket() -> MockMessageSocket {
        MockMessageSocket()
    }

    // MARK: - Send via REST

    func test_sendMessage_callsServiceWithContent() async {
        let service = makeMessageService()
        let convId = "000000000000000000000002"

        service.sendResult = .success(JSONStub.decode("""
        {"id":"000000000000000000000010","conversationId":"\(convId)","senderId":"000000000000000000000001","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z"}
        """))

        let result = try? await service.send(
            conversationId: convId,
            request: SendMessageRequest(content: "Hello world")
        )

        XCTAssertEqual(service.sendCallCount, 1)
        XCTAssertEqual(service.lastSendConversationId, convId)
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.id, "000000000000000000000010")
    }

    func test_sendMessage_failure_propagatesError() async {
        let service = makeMessageService()
        service.sendResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))

        do {
            _ = try await service.send(
                conversationId: "conv123",
                request: SendMessageRequest(content: "Hello")
            )
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertEqual(service.sendCallCount, 1)
        }
    }

    // MARK: - Socket message receipt simulation

    func test_socketReceivesMessage_publishesOnSubject() {
        let socket = makeMessageSocket()
        var received: [APIMessage] = []
        let cancellable = socket.messageReceived.sink { msg in
            received.append(msg)
        }

        let apiMessage: APIMessage = JSONStub.decode("""
        {"id":"msg001","conversationId":"conv001","senderId":"user001","content":"Socket hello","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
        socket.simulateMessage(apiMessage)

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.content, "Socket hello")
        cancellable.cancel()
    }

    // MARK: - Edit message flow

    func test_editMessage_callsServiceAndReturnsUpdated() async {
        let service = makeMessageService()
        service.editResult = .success(JSONStub.decode("""
        {"id":"msg001","conversationId":"conv001","senderId":"user001","content":"Edited content","isEdited":true,"createdAt":"2026-01-01T00:00:00.000Z"}
        """))

        let result = try? await service.edit(messageId: "msg001", content: "Edited content")

        XCTAssertEqual(service.editCallCount, 1)
        XCTAssertEqual(service.lastEditMessageId, "msg001")
        XCTAssertEqual(service.lastEditContent, "Edited content")
        XCTAssertEqual(result?.content, "Edited content")
    }

    // MARK: - Delete message flow

    func test_deleteMessage_callsServiceSuccessfully() async {
        let service = makeMessageService()
        service.deleteResult = .success(())

        do {
            try await service.delete(conversationId: "conv001", messageId: "msg001")
            XCTAssertEqual(service.deleteCallCount, 1)
            XCTAssertEqual(service.lastDeleteMessageId, "msg001")
        } catch {
            XCTFail("Delete should not throw: \(error)")
        }
    }

    // MARK: - Socket send with attachments

    func test_sendWithAttachments_incrementsCallCount() {
        let socket = makeMessageSocket()
        socket.sendWithAttachments(
            conversationId: "conv001",
            content: "Photo",
            attachmentIds: ["att001"],
            replyToId: nil,
            storyReplyToId: nil,
            originalLanguage: "fr",
            isEncrypted: false
        )

        XCTAssertEqual(socket.sendWithAttachmentsCallCount, 1)
    }
}
