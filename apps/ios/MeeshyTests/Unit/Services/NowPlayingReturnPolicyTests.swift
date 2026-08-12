import XCTest
@testable import Meeshy

@MainActor
final class NowPlayingReturnPolicyTests: XCTestCase {

    private func makeContext(
        conversationId: String = "conv-1",
        messageId: String = "msg-1"
    ) -> ActiveAudioContext {
        ActiveAudioContext(
            attachmentId: "att-1",
            messageId: messageId,
            conversationId: conversationId,
            conversationName: "Équipe",
            conversationArtworkURL: nil,
            senderName: "Alice",
            senderAvatarURL: nil,
            durationMs: 4_000
        )
    }

    func test_target_playingKnownConversation_returnsConversationAndMessage() {
        let target = NowPlayingReturnPolicy.target(
            context: makeContext(),
            isPlaying: true,
            isKnownConversation: { $0 == "conv-1" }
        )
        XCTAssertEqual(target, .init(conversationId: "conv-1", messageId: "msg-1"))
    }

    func test_target_notPlaying_returnsNil() {
        let target = NowPlayingReturnPolicy.target(
            context: makeContext(),
            isPlaying: false,
            isKnownConversation: { _ in true }
        )
        XCTAssertNil(target, "Une file en pause ne doit pas détourner la navigation à chaque retour au premier plan")
    }

    func test_target_noContext_returnsNil() {
        let target = NowPlayingReturnPolicy.target(
            context: nil,
            isPlaying: true,
            isKnownConversation: { _ in true }
        )
        XCTAssertNil(target)
    }

    func test_target_unknownConversation_returnsNil() {
        let target = NowPlayingReturnPolicy.target(
            context: makeContext(conversationId: "post-42"),
            isPlaying: true,
            isKnownConversation: { _ in false }
        )
        XCTAssertNil(target, "L'audio d'un post/commentaire porte un id qui n'est pas une conversation — pas de navigation")
    }
}
