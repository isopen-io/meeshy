import XCTest
import MeeshySDK
@testable import Meeshy

final class BubbleContentMatrixTests: XCTestCase {

    func test_simpleText_hasOnlyTextAndMeta() {
        let msg = makeMessage(content: "Salut")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

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
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.isEmojiOnly)
    }

    func test_messageWithImages_hasVisualGrid() {
        let img1 = makeAttachment(type: .image)
        let img2 = makeAttachment(type: .image)
        let msg = makeMessage(content: "", attachments: [img1, img2])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        guard case .visualGrid(let items) = content.attachments else {
            return XCTFail("expected visualGrid, got \(content.attachments)")
        }
        XCTAssertEqual(items.count, 2)
    }

    func test_audioMessage_routesToAudioCase() {
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "", attachments: [audio])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        guard case .audio = content.attachments else {
            return XCTFail("expected audio")
        }
    }

    func test_deletedMessage_routesToDeletedKind() {
        let msg = makeMessage(content: "ignored", deletedAt: Date())
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertEqual(content.kind, .deleted)
    }

    func test_burnedViewOnce_routesToBurnedKind() {
        let msg = makeMessage(content: "secret", isViewOnce: true, viewOnceCount: 1)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertEqual(content.kind, .burned)
    }

    /// Legacy `ThemedMessageBubble.isViewOnceBurned` does NOT exclude `isMe`:
    /// the sender also sees the "Vu et efface" state once their view-once
    /// message has been consumed. BubbleContent.kind must mirror that.
    func test_burnedViewOnce_includesSenderSide() {
        let msg = makeMessage(content: "secret", isMe: true, isViewOnce: true, viewOnceCount: 1)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertEqual(content.kind, .burned)
    }

    func test_mixedVisualAndAudio_carriesBothInMixedCase() {
        let img = makeAttachment(type: .image)
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "Hi", attachments: [img, audio])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        guard case .mixed(let visual, let audioAtt, let nonMedia) = content.attachments else {
            return XCTFail("expected .mixed, got \(content.attachments)")
        }
        XCTAssertEqual(visual.map(\.id), [img.id])
        XCTAssertEqual(audioAtt?.id, audio.id)
        XCTAssertTrue(nonMedia.isEmpty)
    }

    func test_mixedVisualAudioFile_carriesAllThreeCategories() {
        let img = makeAttachment(type: .image)
        let audio = makeAttachment(type: .audio)
        let file = makeAttachment(type: .file)
        let msg = makeMessage(content: "", attachments: [img, audio, file])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        guard case .mixed(let visual, let audioAtt, let nonMedia) = content.attachments else {
            return XCTFail("expected .mixed, got \(content.attachments)")
        }
        XCTAssertEqual(visual.map(\.id), [img.id])
        XCTAssertEqual(audioAtt?.id, audio.id)
        XCTAssertEqual(nonMedia.map(\.id), [file.id])
    }

    /// Legacy `ThemedMessageBubble.hasTextOrNonMediaContent` returns false
    /// for an audio bubble whose only "text" is the transcription — the
    /// audio sub-view renders the transcription itself, so the text bubble
    /// must be suppressed. Lock that visual fidelity rule here.
    func test_audioWithTranscriptionText_suppressesTextBubble() {
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "transcription text", attachments: [audio])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertFalse(content.hasTextOrNonMediaContent)
    }

    func test_textOnly_hasTextOrNonMediaContent_isTrue() {
        let msg = makeMessage(content: "Hello")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.hasTextOrNonMediaContent)
    }

    func test_audioPlusFile_routesToMixedWithAudioField() {
        let audio = makeAttachment(type: .audio)
        let file = makeAttachment(type: .file)
        let msg = makeMessage(content: "", attachments: [audio, file])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        guard case .mixed(let visual, let audioAtt, let nonMedia) = content.attachments else {
            return XCTFail("expected .mixed, got \(content.attachments)")
        }
        XCTAssertTrue(visual.isEmpty)
        XCTAssertEqual(audioAtt?.id, audio.id)
        XCTAssertEqual(nonMedia.map(\.id), [file.id])
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
