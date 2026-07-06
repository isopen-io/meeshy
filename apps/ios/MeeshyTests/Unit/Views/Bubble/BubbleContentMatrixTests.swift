import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
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

    func test_textWithURL_precomputesFirstLinkURL() {
        // Le lien est résolu UNE fois au build du value-model (plus de
        // NSDataDetector dans le body de chaque bulle au scroll).
        let msg = makeMessage(content: "Regarde https://meeshy.me/blog c'est cool")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertNotNil(content.text?.firstLinkURL)
        XCTAssertEqual(
            content.text?.firstLinkURL,
            LinkPreviewFetcher.firstURL(in: content.text?.raw ?? "")
        )
    }

    func test_textWithoutURL_firstLinkURLIsNil() {
        let msg = makeMessage(content: "Salut, ça va ?")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertNil(content.text?.firstLinkURL)
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

    /// P3 — call-summary messages arrive with `messageSource == .system` and
    /// must route to the centered `.system` notice, never a chat bubble.
    func test_systemSourceMessage_routesToSystemKind() {
        var msg = makeMessage(content: "Appel vidéo · 04:32")
        msg.messageSource = .system
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertEqual(content.kind, .system)
    }

    /// The system branch has priority: even a system message flagged deleted
    /// (defensive — should not happen) renders as a system notice, not deleted.
    func test_systemSource_takesPriorityOverOtherKinds() {
        var msg = makeMessage(content: "Appel refusé", isViewOnce: true, viewOnceCount: 1)
        msg.messageSource = .system
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertEqual(content.kind, .system)
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

    /// Prisme règle #1 — la langue active n'a aucune traduction correspondante et
    /// la `preferredTranslation` vise une AUTRE langue : on doit retomber sur
    /// l'ORIGINAL, jamais sur la traduction préférée.
    func test_resolveEffectiveContent_returnsOriginalWhenNoTranslationMatchesActive() {
        let msg = makeMessage(content: "Bonjour") // originalLanguage = fr
        let preferred = MessageTranslation(
            id: "t1",
            messageId: "m1",
            sourceLanguage: "fr",
            targetLanguage: "es",
            translatedContent: "Hola",
            translationModel: "nllb",
            confidenceScore: nil
        )
        let resolved = BubbleContent.resolveEffectiveContent(
            message: msg,
            translations: [],
            preferredTranslation: preferred,
            activeLangCode: "en"
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

    // MARK: - BubbleHeightCache (sizeThatFits short-circuit, content-keyed)

    private func makeContent(id: String = "m1", text: String) -> BubbleContent {
        BubbleContent(
            message: makeMessage(id: id, content: text),
            translations: [],
            preferredTranslation: nil,
            currentUserId: "u1"
        )
    }

    func test_heightCache_emptyCache_returnsNil() {
        let cache = BubbleHeightCache(capacity: 100)
        XCTAssertNil(cache.size(messageId: "m1", content: makeContent(text: "Salut"), width: 200))
    }

    func test_heightCache_storeThenSize_sameContentAndWidth_returnsStoredSize() {
        let cache = BubbleHeightCache(capacity: 100)
        let content = makeContent(text: "Salut")
        cache.store(messageId: "m1", content: content, width: 200, size: CGSize(width: 180, height: 60))

        XCTAssertEqual(cache.size(messageId: "m1", content: content, width: 200), CGSize(width: 180, height: 60))
    }

    func test_heightCache_differentContent_sameMessageIdAndWidth_returnsNil() {
        // CRITICAL — this is the revert (d6ba7f958) guard: a recycled cell or an
        // edited/translated message must NOT read a stale height. Content equality
        // (BubbleContent ==) is the correctness boundary; a content change misses.
        let cache = BubbleHeightCache(capacity: 100)
        cache.store(messageId: "m1", content: makeContent(text: "Salut"), width: 200, size: CGSize(width: 180, height: 60))

        XCTAssertNil(cache.size(messageId: "m1", content: makeContent(text: "Bonjour tout le monde"), width: 200))
    }

    func test_heightCache_differentWidthBucket_returnsNil() {
        let cache = BubbleHeightCache(capacity: 100)
        let content = makeContent(text: "Salut")
        cache.store(messageId: "m1", content: content, width: 200, size: CGSize(width: 180, height: 60))

        XCTAssertNil(cache.size(messageId: "m1", content: content, width: 260))
    }

    func test_heightCache_widthWithinSameRoundedBucket_returnsStoredSize() {
        // Sub-pixel proposal jitter at the same integer width must still hit.
        let cache = BubbleHeightCache(capacity: 100)
        let content = makeContent(text: "Salut")
        cache.store(messageId: "m1", content: content, width: 200.2, size: CGSize(width: 180, height: 60))

        XCTAssertEqual(cache.size(messageId: "m1", content: content, width: 200.4), CGSize(width: 180, height: 60))
    }

    func test_heightCache_differentMessageId_returnsNil() {
        let cache = BubbleHeightCache(capacity: 100)
        let content = makeContent(text: "Salut")
        cache.store(messageId: "m1", content: content, width: 200, size: CGSize(width: 180, height: 60))

        XCTAssertNil(cache.size(messageId: "m2", content: content, width: 200))
    }

    func test_heightCache_storeSameMessageNewContent_overwrites_oldContentMisses() {
        // An edited message keeps its id but changes content: the new content hits,
        // the old content (now stale) misses — no two competing heights survive.
        let cache = BubbleHeightCache(capacity: 100)
        let original = makeContent(text: "Salut")
        let edited = makeContent(text: "Salut (modifié)")
        cache.store(messageId: "m1", content: original, width: 200, size: CGSize(width: 180, height: 60))
        cache.store(messageId: "m1", content: edited, width: 200, size: CGSize(width: 180, height: 90))

        XCTAssertEqual(cache.size(messageId: "m1", content: edited, width: 200), CGSize(width: 180, height: 90))
        XCTAssertNil(cache.size(messageId: "m1", content: original, width: 200))
    }

    func test_heightCache_removeAll_clearsEntries() {
        let cache = BubbleHeightCache(capacity: 100)
        let content = makeContent(text: "Salut")
        cache.store(messageId: "m1", content: content, width: 200, size: CGSize(width: 180, height: 60))
        cache.removeAll()

        XCTAssertNil(cache.size(messageId: "m1", content: content, width: 200))
    }

    func test_heightCache_overCapacity_doesNotGrowUnbounded() {
        let cache = BubbleHeightCache(capacity: 2)
        cache.store(messageId: "m1", content: makeContent(id: "m1", text: "a"), width: 200, size: CGSize(width: 10, height: 10))
        cache.store(messageId: "m2", content: makeContent(id: "m2", text: "b"), width: 200, size: CGSize(width: 10, height: 10))
        cache.store(messageId: "m3", content: makeContent(id: "m3", text: "c"), width: 200, size: CGSize(width: 10, height: 10))

        XCTAssertLessThanOrEqual(cache.count, 2)
    }

    // MARK: - Call notice

    func test_callSummarySystemMessage_buildsCallNoticeWithTimestamp() {
        let created = Date(timeIntervalSince1970: 1_700_000_000)
        let msg = makeMessage(
            content: "Appel vidéo · 04:32",
            createdAt: created,
            cachedTimeString: "18:41",
            messageSource: .system,
            callSummary: makeCallSummary(initiatorId: "u1", callType: .video, outcome: .completed, durationSeconds: 272)
        )
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        let notice = content.callNotice
        XCTAssertNotNil(notice)
        XCTAssertEqual(notice?.timeString, "18:41")
        XCTAssertEqual(notice?.timestamp, created)
        // Current user initiated → outgoing.
        XCTAssertEqual(notice?.isOutgoing, true)
    }

    func test_callSummarySystemMessage_incomingWhenCurrentUserIsNotInitiator() {
        let msg = makeMessage(
            content: "Appel vidéo entrant",
            messageSource: .system,
            callSummary: makeCallSummary(initiatorId: "peer", callType: .video, outcome: .completed, durationSeconds: 49)
        )
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertEqual(content.callNotice?.isOutgoing, false)
    }

    func test_nonCallSystemMessage_hasNilCallNotice() {
        let msg = makeMessage(content: "Conversation créée", messageSource: .system, callSummary: nil)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertNil(content.callNotice)
        XCTAssertEqual(content.kind, .system)
    }

    private func makeCallSummary(
        initiatorId: String,
        callType: CallSummaryMetadata.MediaType,
        outcome: CallSummaryMetadata.Outcome,
        durationSeconds: Int
    ) -> CallSummaryMetadata {
        CallSummaryMetadata(
            callId: "call1",
            initiatorId: initiatorId,
            callType: callType,
            outcome: outcome,
            durationSeconds: durationSeconds,
            bytesTotal: 9_300_000,
            bytesEstimated: true,
            networkQuality: .good
        )
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
        cachedTimeString: String? = "12:34",
        messageSource: MeeshyMessage.MessageSource = .user,
        callSummary: CallSummaryMetadata? = nil
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
            messageSource: messageSource,
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
            cachedTimeString: cachedTimeString,
            callSummary: callSummary
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

// MARK: - BubbleBodyFooterLayout.bodyHeight (sizeThatFits double-measure removal)

@MainActor
final class BubbleBodyFooterLayoutHeightTests: XCTestCase {

    func test_bodyHeight_whenFooterDoesNotWiden_reusesProbeHeightWithoutRemeasure() {
        // Common case: a multi-word message already wider than its meta row, so
        // the resolved width equals the probed width. The probe height must be
        // reused verbatim and the (expensive) full-subtree re-measure must NOT run.
        let bodyProbe = CGSize(width: 220, height: 64)
        var remeasureCalls = 0

        let height = BubbleBodyFooterLayout.bodyHeight(
            bodyProbe: bodyProbe,
            resolvedWidth: 220
        ) { _ in
            remeasureCalls += 1
            return 999  // sentinel that must never be reported
        }

        XCTAssertEqual(height, 64)
        XCTAssertEqual(remeasureCalls, 0, "no re-measure when the footer floor did not widen the bubble")
    }

    func test_bodyHeight_whenFooterWidensBubble_remeasuresAtResolvedWidth() {
        // Short message whose footer (timestamp + delivery) is wider than the
        // text. The body must be re-measured at the wider resolved width — its
        // height can shrink as the text stops wrapping.
        let bodyProbe = CGSize(width: 40, height: 80)
        var remeasuredWidth: CGFloat?

        let height = BubbleBodyFooterLayout.bodyHeight(
            bodyProbe: bodyProbe,
            resolvedWidth: 96
        ) { width in
            remeasuredWidth = width
            return 40
        }

        XCTAssertEqual(height, 40, "the re-measured height is reported, not the stale probe height")
        XCTAssertEqual(remeasuredWidth, 96, "re-measure happens at the resolved (widened) width")
    }

    // MARK: cacheUsable (off-main layout pass must skip the @MainActor cache)

    func test_cacheUsable_finiteWidthOnMainThread_isTrue() {
        XCTAssertTrue(BubbleBodyFooterLayout.cacheUsable(proposedWidth: 320, isMainThread: true))
    }

    func test_cacheUsable_offMainThread_isFalse() {
        // iOS 26 measures cells on com.apple.SwiftUI.AsyncRenderer; consulting
        // the @MainActor cache there traps (`assumeIsolated`) — 5 device crashes
        // 2026-06-10..12. Off-main passes must measure directly instead.
        XCTAssertFalse(BubbleBodyFooterLayout.cacheUsable(proposedWidth: 320, isMainThread: false))
    }

    func test_cacheUsable_infiniteWidth_isFalse() {
        XCTAssertFalse(BubbleBodyFooterLayout.cacheUsable(proposedWidth: .infinity, isMainThread: true))
    }

    func test_cacheUsable_nanWidth_isFalse() {
        XCTAssertFalse(BubbleBodyFooterLayout.cacheUsable(proposedWidth: .nan, isMainThread: true))
    }
}
