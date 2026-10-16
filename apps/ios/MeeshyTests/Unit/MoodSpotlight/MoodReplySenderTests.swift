import XCTest
import MeeshySDK
@testable import Meeshy

/// La réponse envoyée depuis la page d'une humeur (#10814) part en
/// `storyReplyToId` dans la DERNIÈRE conversation directe avec l'auteur, ou
/// dans une conversation directe créée pour elle — et elle est chiffrée
/// exactement quand le composer de la conversation la chiffrerait.
@MainActor
final class MoodReplySenderTests: XCTestCase {

    private struct FailingEncryptor: DirectMessageEncrypting {
        func encryptMessage(_ payload: Data, for userId: String, conversationId: String) async throws -> Data {
            throw URLError(.cannotConnectToHost)
        }
    }

    private struct ReversingEncryptor: DirectMessageEncrypting {
        func encryptMessage(_ payload: Data, for userId: String, conversationId: String) async throws -> Data {
            Data(payload.reversed())
        }
    }

    private func makeEntry() -> StatusEntry {
        StatusEntry(id: "mood-1", userId: "author-1", username: "Alice", avatarColor: "6366F1", moodEmoji: "😄", content: "Heureux")
    }

    private func makeSUT(encryptor: DirectMessageEncrypting = FailingEncryptor()) -> (MoodReplySender, MockConversationService, MockMessageService) {
        let conversations = MockConversationService()
        let messages = MockMessageService()
        let sut = MoodReplySender(conversations: conversations, messages: messages, encryptor: encryptor,
                                  composingLanguages: { ["fr"] })
        return (sut, conversations, messages)
    }

    private func directConversation(id: String) -> APIConversation {
        JSONStub.decode("""
        {"id":"\(id)","type":"direct","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    }

    func test_sendReply_existingDirectConversation_sendsThereAsAReplyToTheMood() async throws {
        let (sut, conversations, messages) = makeSUT()
        conversations.findDirectWithResult = .success(directConversation(id: "0000000000000000000000aa"))

        let conversationId = try await sut.sendReply("Trop bien", to: makeEntry())

        XCTAssertEqual(conversationId, "0000000000000000000000aa")
        XCTAssertEqual(conversations.lastFindDirectWithUserId, "author-1")
        XCTAssertEqual(conversations.createCallCount, 0)
        XCTAssertEqual(messages.lastSendConversationId, "0000000000000000000000aa")
        XCTAssertEqual(messages.lastSendRequest?.storyReplyToId, "mood-1")
        XCTAssertEqual(messages.lastSendRequest?.content, "Trop bien")
    }

    func test_sendReply_noDirectConversation_createsOneWithTheAuthor() async throws {
        let (sut, conversations, messages) = makeSUT()

        _ = try await sut.sendReply("Coucou", to: makeEntry())

        XCTAssertEqual(conversations.createCallCount, 1)
        XCTAssertEqual(conversations.lastCreateType, "direct")
        XCTAssertEqual(conversations.lastCreateParticipantIds, ["author-1"])
        XCTAssertEqual(messages.lastSendRequest?.storyReplyToId, "mood-1")
    }

    func test_sendReply_withoutE2EESession_sendsInPlaintext() async throws {
        let (sut, _, messages) = makeSUT()

        _ = try await sut.sendReply("Salut", to: makeEntry())

        XCTAssertEqual(messages.lastSendRequest?.content, "Salut")
        XCTAssertNil(messages.lastSendRequest?.isEncrypted)
    }

    func test_sendReply_withE2EESession_sendsSealed() async throws {
        let (sut, _, messages) = makeSUT(encryptor: ReversingEncryptor())

        _ = try await sut.sendReply("Salut", to: makeEntry())

        XCTAssertEqual(messages.lastSendRequest?.isEncrypted, true)
        XCTAssertEqual(messages.lastSendRequest?.encryptionMode, "E2EE")
        XCTAssertNotEqual(messages.lastSendRequest?.content, "Salut")
    }

    func test_sendReply_sendFails_throws() async {
        let (sut, _, messages) = makeSUT()
        messages.sendResult = .failure(URLError(.timedOut))

        do {
            _ = try await sut.sendReply("Salut", to: makeEntry())
            XCTFail("expected a failure")
        } catch {}
    }
}
