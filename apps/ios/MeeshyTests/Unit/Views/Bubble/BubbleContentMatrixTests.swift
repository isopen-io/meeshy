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

    /// Un emoji envoyé EN RÉPONSE à un message doit rester détecté comme
    /// emoji-only — la bulle l'affiche alors agrandi & centré au-dessus du
    /// quote, au lieu de le rendre comme du texte normal 15pt. La détection
    /// ne doit donc PAS dépendre de l'absence de `replyTo`.
    func test_emojiOnly_withReply_isStillFlagged() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let msg = makeMessage(content: "🔥🔥🔥", replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.isEmojiOnly)
        XCTAssertNotNil(content.reply)
        XCTAssertEqual(content.text?.emojiFontSize, 45)
    }

    /// Un emoji-réponse possède bien un quote ET le flag emoji — l'orchestrateur
    /// route ce cas vers la bulle (avec quote) et non vers le rendu libre.
    func test_emojiOnly_withReply_keepsTextPayload() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let msg = makeMessage(content: "😍", replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.isEmojiOnly)
        XCTAssertEqual(content.text?.raw, "😍")
        XCTAssertEqual(content.text?.emojiFontSize, 90)
    }

    /// Non-régression : un emoji SANS réponse reste emoji-only (rendu libre,
    /// hors bulle) — comportement à conserver.
    func test_emojiOnly_withoutReply_remainsFlaggedAndUnquoted() {
        let msg = makeMessage(content: "👍")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.isEmojiOnly)
        XCTAssertNil(content.reply)
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

    /// Multi-audio (count 2) routes to `.audio([a1, a2])` carrying BOTH tracks
    /// in order. Protects the carousel's `filter`-vs-`first` change: a regression
    /// to `audioAttachments.first` would drop track 2 and the carousel would
    /// never render. The pure-`.audio`-case gate in BubbleStandardLayout keys
    /// the carousel branch off exactly this shape.
    func test_twoAudioAttachments_routesToAudioCaseWithBothTracks() {
        let a1 = makeAttachment(type: .audio)
        let a2 = makeAttachment(type: .audio)
        let msg = makeMessage(content: "", attachments: [a1, a2])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        guard case .audio(let auds) = content.attachments else {
            return XCTFail("expected .audio, got \(content.attachments)")
        }
        XCTAssertEqual(auds.count, 2)
        XCTAssertEqual(auds.map(\.id), [a1.id, a2.id])
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
        XCTAssertEqual(audioAtt.map(\.id), [audio.id])
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
        XCTAssertEqual(audioAtt.map(\.id), [audio.id])
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
        XCTAssertEqual(audioAtt.map(\.id), [audio.id])
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

    // MARK: - Reply routing (audioHostsReply / visualHostsReply)

    /// Un audio seul en reply doit héberger la citation dans son widget — pas
    /// de chat bubble parasite autour.
    func test_audioHostsReply_pureAudioWithReply_isTrue() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "", attachments: [audio], replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.audioHostsReply)
        XCTAssertFalse(content.visualHostsReply)
    }

    /// Audio avec caption courte + reply : `isAudioOnlyWithText` force
    /// `hasTextOrNonMediaContent == false` → l'audio reste l'unique hôte de
    /// la citation (caption rendue par `AudioMediaView.body`, transcription par
    /// `inlineTranscription`, footer par bottomSlot).
    func test_audioHostsReply_audioWithCaptionAndReply_isTrue() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "ma caption", attachments: [audio], replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.audioHostsReply)
    }

    /// Visual seul en reply doit basculer vers le conteneur unifié — pas de
    /// chat bubble séparée sous la grille.
    func test_visualHostsReply_pureVisualWithReply_isTrue() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let img = makeAttachment(type: .image)
        let msg = makeMessage(content: "", attachments: [img], replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.visualHostsReply)
        XCTAssertFalse(content.audioHostsReply)
    }

    /// Texte + reply : la bulle texte reste légitime — ni audioHostsReply ni
    /// visualHostsReply ne doivent s'activer.
    func test_neitherHostsReply_textWithReply_isFalse() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let msg = makeMessage(content: "ma reponse", replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertFalse(content.audioHostsReply)
        XCTAssertFalse(content.visualHostsReply)
    }

    /// Pas de reply du tout : aucun host actif (le widget audio/visual rend
    /// son footer standalone, comportement non touché par la refonte).
    func test_neitherHostsReply_noReply_isFalse() {
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "", attachments: [audio])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertFalse(content.audioHostsReply)
        XCTAssertFalse(content.visualHostsReply)
    }

    /// Emoji-only + reply : l'emoji est rendu agrandi dans la bulle texte ;
    /// ni audio ni visual ne hostent — comportement préservé.
    func test_neitherHostsReply_emojiOnlyWithReply_isFalse() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let msg = makeMessage(content: "🔥", replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertFalse(content.audioHostsReply)
        XCTAssertFalse(content.visualHostsReply)
    }

    // MARK: - Timestamp fallback (createdAt when cachedTimeString is nil)

    /// Quand `cachedTimeString` est `nil` (cache GRDB legacy, race fresh-socket,
    /// optimistic outgoing), le builder doit formater `message.createdAt` pour
    /// que la bulle affiche toujours son heure.
    func test_timeString_fallsBackToCreatedAt_whenCachedTimeStringIsNil() {
        let msg = makeMessage(content: "Salut", cachedTimeString: nil)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertFalse(content.meta.timeString.isEmpty,
                       "timeString should not be empty when cachedTimeString is nil — must fall back to formatted createdAt")
        XCTAssertEqual(content.meta.timeString.count, 5,
                       "Format expected: HH:mm (5 characters)")
        XCTAssertTrue(content.meta.timeString.contains(":"),
                      "Format expected: HH:mm with colon separator")
    }

    /// Quand `cachedTimeString` est présent, le builder l'utilise tel quel —
    /// pas de re-formatage de `createdAt`.
    func test_timeString_prefersCachedTimeString_overFallback() {
        let msg = makeMessage(content: "Salut", cachedTimeString: "09:15")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertEqual(content.meta.timeString, "09:15")
    }

    /// Quand un `timeString` explicite est passé en paramètre (ex: tests ou
    /// rendu groupé futur), il l'emporte sur tout le reste.
    func test_timeString_prefersExplicitParameter_overCachedAndFallback() {
        let msg = makeMessage(content: "Salut", cachedTimeString: "09:15")
        let content = BubbleContent(
            message: msg,
            translations: [],
            preferredTranslation: nil,
            currentUserId: "u1",
            timeString: "EXPLICIT"
        )

        XCTAssertEqual(content.meta.timeString, "EXPLICIT")
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
        reactions: [MeeshyReaction] = [],
        createdAt: Date = Date(timeIntervalSince1970: 0),
        cachedTimeString: String? = "12:34"
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
            createdAt: createdAt,
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
            cachedTimeString: cachedTimeString
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
