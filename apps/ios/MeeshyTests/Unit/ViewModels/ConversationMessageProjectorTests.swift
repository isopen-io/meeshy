import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationMessageProjectorTests: XCTestCase {

    private func makeAttachment(
        id: String,
        mimeType: String,
        caption: String? = nil,
        isViewOnce: Bool = false
    ) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: mimeType, fileUrl: "https://cdn/\(id)", caption: caption, isViewOnce: isViewOnce)
    }

    private func makeMessage(
        id: String,
        content: String = "",
        attachments: [MessageAttachment] = [],
        username: String? = nil,
        senderId: String = "p1",
        sticker: MessageSticker? = nil
    ) -> Message {
        Message(
            id: id,
            conversationId: "000000000000000000000097",
            senderId: senderId,
            content: content,
            attachments: attachments,
            senderName: username.map { $0.capitalized },
            senderUsername: username,
            sticker: sticker
        )
    }

    private func makeTranslatedAudio(attachmentId: String, language: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: "t-\(attachmentId)-\(language)", attachmentId: attachmentId, targetLanguage: language,
            url: "https://cdn/\(language).m4a", transcription: "…",
            durationMs: 1_000, format: "m4a", cloned: false, quality: 0.9, ttsModel: "tts"
        )
    }

    func test_visualAttachments_excludeViewOnceAndGalleryExcludedStickers_keepImagesAndVideosInOrder() {
        let messages = [
            makeMessage(id: "m1", attachments: [makeAttachment(id: "img", mimeType: "image/jpeg"), makeAttachment(id: "doc", mimeType: "application/pdf")]),
            makeMessage(id: "m2", attachments: [makeAttachment(id: "secret", mimeType: "image/jpeg", isViewOnce: true)]),
            makeMessage(id: "m3", attachments: [makeAttachment(id: "stk", mimeType: "image/png")], sticker: MessageSticker(emoji: "😀")),
            makeMessage(id: "m4", attachments: [makeAttachment(id: "vid", mimeType: "video/mp4")]),
        ]

        let result = ConversationMessageProjector.visualAttachments(of: messages)

        XCTAssertEqual(result.map(\.id), ["img", "vid"])
    }

    func test_audioItems_takeTranscriptionOfTheirOwnAttachment_andPerAttachmentTranslationsBeforePerMessageFallback() {
        let first = makeAttachment(id: "a1", mimeType: "audio/mp4")
        let second = makeAttachment(id: "a2", mimeType: "audio/mp4")
        let messages = [makeMessage(id: "m1", attachments: [first, second])]
        let own = makeTranslatedAudio(attachmentId: "a1", language: "en")
        let fallback = makeTranslatedAudio(attachmentId: "a2", language: "es")
        let foreign = makeTranslatedAudio(attachmentId: "a1", language: "de")

        let items = ConversationMessageProjector.audioItems(
            of: messages,
            transcription: { attachment, _ in MessageTranscription(attachmentId: attachment.id, text: "t-\(attachment.id)", language: "fr") },
            translatedByAttachment: ["a1": [own]],
            translatedByMessage: ["m1": [foreign, fallback]]
        )

        XCTAssertEqual(items.map(\.id), ["a1", "a2"])
        XCTAssertEqual(items.map { $0.transcription?.text }, ["t-a1", "t-a2"])
        XCTAssertEqual(items[0].translatedAudios.map(\.targetLanguage), ["en"])
        XCTAssertEqual(items[1].translatedAudios.map(\.targetLanguage), ["es"])
    }

    func test_mentionCandidates_dedupeByUsername_keepFirstOccurrence_useViewingKeyAsId() {
        let messages = [
            makeMessage(id: "m1", username: "alice", senderId: "p-alice"),
            makeMessage(id: "m2", username: "bob", senderId: "p-bob"),
            makeMessage(id: "m3", username: "alice", senderId: "p-other"),
            makeMessage(id: "m4"),
        ]

        let candidates = ConversationMessageProjector.mentionCandidates(of: messages)

        XCTAssertEqual(candidates.map(\.username), ["alice", "bob"])
        XCTAssertEqual(candidates.first?.id, messages[0].viewingKey.isEmpty ? "alice" : messages[0].viewingKey)
    }

    func test_mediaSenderInfo_mapsEveryAttachmentToItsMessageSender() {
        let messages = [
            makeMessage(id: "m1", attachments: [makeAttachment(id: "a1", mimeType: "image/jpeg"), makeAttachment(id: "a2", mimeType: "image/jpeg")], username: "alice"),
            makeMessage(id: "m2", attachments: [makeAttachment(id: "a3", mimeType: "image/jpeg")], username: "bob"),
        ]

        let map = ConversationMessageProjector.mediaSenderInfo(of: messages)

        XCTAssertEqual(Set(map.keys), ["a1", "a2", "a3"])
        XCTAssertEqual(map["a1"]?.senderName, "Alice")
        XCTAssertEqual(map["a2"]?.senderName, "Alice")
        XCTAssertEqual(map["a3"]?.senderName, "Bob")
    }

    func test_captions_useServedTextWhenProvided() {
        let messages = [
            makeMessage(id: "m1", content: "Hello", attachments: [makeAttachment(id: "a1", mimeType: "image/jpeg")]),
            makeMessage(id: "m2", content: "Ignored", attachments: [makeAttachment(id: "a2", mimeType: "image/jpeg", caption: "Légende")]),
        ]

        let captions = ConversationMessageProjector.captions(of: messages) { "Bonjour(\($0.id))" }

        XCTAssertEqual(captions["a1"], "Bonjour(m1)")
        XCTAssertEqual(captions["a2"], "Légende")
    }
}
