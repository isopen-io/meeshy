import XCTest
@testable import Meeshy

/// Un message vocal à plusieurs pièces met plusieurs entrées dans la file de lecture. Supprimé, il n'en retirait que
/// la première : l'enchaînement automatique jouait encore les autres pièces d'un message effacé.
@MainActor
final class AudioQueueDeletedMessageTests: XCTestCase {

    private func audio(_ attachment: String, message: String) -> QueuedAudio {
        QueuedAudio(attachmentId: attachment, messageId: message, conversationId: "c", fileUrl: "https://x/\(attachment)",
                    durationMs: 1000, senderName: "A", senderAvatarURL: nil, receivedAt: Date(timeIntervalSince1970: 0))
    }

    func test_deletingAMessage_removesEveryOneOfItsClips() {
        let queue = [audio("a1", message: "m1"), audio("b1", message: "m2"), audio("a2", message: "m1"), audio("a3", message: "m1")]
        let remaining = ConversationAudioCoordinator.queue(queue, afterDeleting: "m1")
        XCTAssertEqual(remaining.map(\.attachmentId), ["b1"])
    }

    func test_deletingAnUnknownMessage_keepsTheQueue() {
        let queue = [audio("a1", message: "m1")]
        XCTAssertEqual(ConversationAudioCoordinator.queue(queue, afterDeleting: "zz"), queue)
    }

    func test_theSocketHook_usesTheRule() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift"))
        XCTAssertTrue(code.contains("Self.queue(self.queue, afterDeleting: messageId)"))
        XCTAssertFalse(code.contains("self.queue.firstIndex(where: { $0.messageId == messageId })"))
    }
}
