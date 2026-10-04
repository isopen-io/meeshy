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

// MARK: - Toucher le mini-lecteur (#9300)

/// Le web ouvre `/c/<id>?message=<id>` et saute à la bulle du vocal (#9294) ;
/// iOS ouvrait la conversation sans ancrage. Même geste, même effet : le
/// toucher nomme le message du vocal, que le saut du fil consomme.
@MainActor
final class MiniPlayerTapPolicyTests: XCTestCase {

    private func makeContext(conversationId: String = "conv-1", messageId: String = "msg-1") -> ActiveAudioContext {
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

    func test_target_activeContext_anchorsOnVoiceMessage() {
        XCTAssertEqual(
            MiniPlayerTapPolicy.target(context: makeContext()),
            .init(conversationId: "conv-1", highlightMessageId: "msg-1")
        )
    }

    func test_target_noContext_returnsNil() {
        XCTAssertNil(MiniPlayerTapPolicy.target(context: nil))
    }

    func test_target_emptyConversationId_returnsNil() {
        XCTAssertNil(MiniPlayerTapPolicy.target(context: makeContext(conversationId: "")))
    }

    func test_target_emptyMessageId_opensWithoutAnchor() {
        XCTAssertEqual(
            MiniPlayerTapPolicy.target(context: makeContext(messageId: "")),
            .init(conversationId: "conv-1", highlightMessageId: nil),
            "Sans message nommé, la conversation s'ouvre à sa position normale — jamais un saut vers un id vide"
        )
    }

    private func rootSource(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/\(name)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_onMiniPlayerTap_bothRoots_passVoiceMessageAsHighlight() throws {
        for name in ["RootView.swift", "iPadRootView.swift"] {
            let source = try rootSource(name)
            XCTAssertTrue(source.contains("MiniPlayerTapPolicy.target("),
                          "\(name) : le toucher du mini-lecteur passe par la politique testée")
            XCTAssertTrue(source.contains("highlightMessageId: target.highlightMessageId"),
                          "\(name) : le toucher du mini-lecteur ancre la conversation sur la bulle du vocal (#9300)")
        }
    }
}
