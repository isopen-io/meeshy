import XCTest
import MeeshySDK
@testable import Meeshy

final class BubbleContentMatrixTests: XCTestCase {

    func test_simpleText_hasOnlyTextAndMeta() {
        let msg = makeMessage(content: "Salut")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertNotNil(content.text)
        XCTAssertNil(content.reply)
        XCTAssertEqual(content.attachments, .none)
        XCTAssertNil(content.ephemeral)
        XCTAssertNil(content.editedAt)
        XCTAssertTrue(content.reactions.isEmpty)
        XCTAssertNotNil(content.meta)
    }

    func test_emojiOnly_isFlagged() {
        let msg = makeMessage(content: "🔥🔥🔥")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertTrue(content.isEmojiOnly)
    }

    func test_messageWithImages_hasVisualGrid() {
        let img1 = makeAttachment(type: .image)
        let img2 = makeAttachment(type: .image)
        let msg = makeMessage(content: "", attachments: [img1, img2])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        guard case .visualGrid(let items) = content.attachments else {
            return XCTFail("expected visualGrid, got \(content.attachments)")
        }
        XCTAssertEqual(items.count, 2)
    }

    func test_audioMessage_routesToAudioCase() {
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "", attachments: [audio])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        guard case .audio = content.attachments else {
            return XCTFail("expected audio")
        }
    }

    func test_deletedMessage_routesToDeletedKind() {
        let msg = makeMessage(content: "ignored", deletedAt: Date())
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertEqual(content.kind, .deleted)
    }

    func test_burnedViewOnce_routesToBurnedKind() {
        let msg = makeMessage(content: "secret", isViewOnce: true, viewOnceCount: 1)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertEqual(content.kind, .burned)
    }

    // MARK: - Pure helper tests (Step 2.4)

    func test_buildAvailableFlags_excludesActiveLang() {
        let flags = BubbleContent.buildAvailableFlags(
            activeLang: "fr",
            originalLang: "fr",
            preferredLang: "en",
            regional: "es",
            custom: nil,
            translations: [
                MessageTranslation(
                    id: "t1",
                    messageId: "m1",
                    sourceLanguage: "fr",
                    targetLanguage: "en",
                    translatedContent: "Hi",
                    translationModel: "nllb",
                    confidenceScore: nil
                ),
                MessageTranslation(
                    id: "t2",
                    messageId: "m1",
                    sourceLanguage: "fr",
                    targetLanguage: "es",
                    translatedContent: "Hola",
                    translationModel: "nllb",
                    confidenceScore: nil
                ),
            ],
            translatedAudios: []
        )
        XCTAssertEqual(flags, ["en", "es"])
    }

    func test_resolveEffectiveContent_returnsOriginalWhenActiveLangIsOriginal() {
        let msg = makeMessage(content: "Bonjour")
        let resolved = BubbleContent.resolveEffectiveContent(
            message: msg,
            preferredTranslation: nil,
            activeLangCode: "fr"
        )
        XCTAssertEqual(resolved, "Bonjour")
    }

    // MARK: - Helpers

    private func makeMessage(
        id: String = "m1",
        content: String,
        senderId: String = "u1",
        isMe: Bool = false,
        attachments: [MeeshyMessageAttachment] = [],
        replyTo: ReplyReference? = nil,
        deletedAt: Date? = nil,
        expiresAt: Date? = nil,
        isViewOnce: Bool = false,
        viewOnceCount: Int = 0,
        pinnedAt: Date? = nil,
        forwardedFromId: String? = nil,
        isEdited: Bool = false,
        reactions: [MeeshyReaction] = []
    ) -> MeeshyMessage {
        var effects = MessageEffects(flags: [])
        if isViewOnce {
            effects.flags.insert(.viewOnce)
        }
        return MeeshyMessage(
            id: id,
            conversationId: "c1",
            senderId: senderId,
            content: content,
            originalLanguage: "fr",
            messageType: .text,
            messageSource: .user,
            isEdited: isEdited,
            editedAt: nil,
            deletedAt: deletedAt,
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: nil,
            expiresAt: expiresAt,
            effects: effects,
            maxViewOnceCount: nil,
            viewOnceCount: viewOnceCount,
            pinnedAt: pinnedAt,
            pinnedBy: nil,
            isEncrypted: false,
            encryptionMode: nil,
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0),
            attachments: attachments,
            reactions: reactions,
            replyTo: replyTo,
            forwardedFrom: nil,
            senderName: "Tester",
            senderUsername: "tester",
            senderColor: "#888",
            senderAvatarURL: nil,
            senderUserId: senderId,
            deliveryStatus: .sent,
            isMe: isMe,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            deliveredCount: 0,
            readCount: 0,
            cachedTimeString: "12:34"
        )
    }

    private func makeAttachment(
        id: String = UUID().uuidString,
        type: MeeshyMessageAttachment.AttachmentType
    ) -> MeeshyMessageAttachment {
        let mime: String = {
            switch type {
            case .image: return "image/jpeg"
            case .video: return "video/mp4"
            case .audio: return "audio/m4a"
            case .file: return "application/octet-stream"
            case .location: return "application/x-location"
            }
        }()
        return MeeshyMessageAttachment(
            id: id,
            messageId: "m1",
            fileName: "f",
            originalName: "f",
            mimeType: mime,
            fileSize: 1024,
            filePath: "",
            fileUrl: "https://example.com/f",
            uploadedBy: "u1",
            createdAt: Date(timeIntervalSince1970: 0)
        )
    }
}
