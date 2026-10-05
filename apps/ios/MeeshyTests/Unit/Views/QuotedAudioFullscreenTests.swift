import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #8230 — un vocal cité s'ouvre EN PLEIN ÉCRAN depuis la citation.
///
/// Les pages que le plein écran reçoit : toutes les pistes de la fenêtre quand
/// la pièce y est (le balayage continue sur les vocaux voisins), la seule pièce
/// reconstruite sinon — son auteur relu dans la citation qui la désigne.
@MainActor
final class QuotedAudioFullscreenTests: XCTestCase {

    private func makeVoice(id: String, messageId: String) -> MessageAttachment {
        MessageAttachment(id: id, messageId: messageId, mimeType: "audio/m4a",
                          fileUrl: "https://cdn.meeshy.me/\(id).m4a", duration: 12_000)
    }

    private func makeMessage(id: String, attachments: [MessageAttachment] = [], replyTo: ReplyReference? = nil) -> Message {
        Message(
            id: id,
            conversationId: "c1",
            senderId: "p-bob",
            content: "",
            attachments: attachments,
            replyTo: replyTo,
            senderName: "Bob",
            isMe: false
        )
    }

    private func makeItem(_ attachment: MessageAttachment, in message: Message) -> ConversationViewModel.AudioItem {
        ConversationViewModel.AudioItem(id: attachment.id, attachment: attachment, message: message,
                                        transcription: nil, translatedAudios: [])
    }

    func test_sources_voiceInTheWindow_opensEveryWindowTrack_forSwiping() {
        let first = makeVoice(id: "a1", messageId: "m1")
        let second = makeVoice(id: "a2", messageId: "m2")
        let items = [
            makeItem(first, in: makeMessage(id: "m1", attachments: [first])),
            makeItem(second, in: makeMessage(id: "m2", attachments: [second]))
        ]

        let sources = QuotedAudioFullscreen.sources(
            start: second, items: items, quotingMessages: [],
            conversationName: "Famille", queueTail: { _ in [] }
        )

        XCTAssertEqual(sources.map(\.id), ["a1", "a2"])
        XCTAssertEqual(sources.last?.nowPlayingContextName, "Famille")
    }

    func test_sources_voiceOutOfTheWindow_opensTheReconstructedPieceAlone_underItsQuotedAuthor() {
        let reference = ReplyReference(
            messageId: "m-old", authorName: "Alice", previewText: "",
            authorAvatarUrl: "https://cdn.meeshy.me/alice.jpg",
            attachmentType: "audio", attachmentFileUrl: "https://cdn.meeshy.me/old.m4a"
        )
        guard let piece = reference.quotedAttachment else {
            return XCTFail("un vocal cité avec son adresse doit se reconstruire")
        }
        let quoting = makeMessage(id: "m-reply", replyTo: reference)

        let sources = QuotedAudioFullscreen.sources(
            start: piece, items: [], quotingMessages: [quoting],
            conversationName: nil, queueTail: { _ in [] }
        )

        XCTAssertEqual(sources.count, 1)
        XCTAssertEqual(sources.first?.id, piece.id)
        XCTAssertEqual(sources.first?.attachment.fileUrl, "https://cdn.meeshy.me/old.m4a")
        XCTAssertEqual(sources.first?.authorName, "Alice", "l'auteur du vocal est celui que la citation nomme")
        XCTAssertEqual(sources.first?.authorAvatarURL, "https://cdn.meeshy.me/alice.jpg")
        XCTAssertEqual(sources.first?.messageId, "m-old")
    }
}
