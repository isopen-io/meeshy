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

    /// Prisme étendu 2026-05-26 — 4e axe de résolution (`deviceLocale`), gated
    /// EXACTLY like `regional`/`custom`: only surfaced when a translation (text
    /// or audio) actually exists for it. See CLAUDE.md "Prisme Linguistique".
    func test_buildAvailableFlags_includesDeviceLocale_whenTranslationExists() {
        let flags = BubbleContent.buildAvailableFlags(
            activeLang: "fr",
            originalLang: "fr",
            preferredLang: nil,
            regional: nil,
            custom: nil,
            deviceLocale: "de",
            translations: [
                MessageTranslation(
                    id: "t1",
                    messageId: "m1",
                    sourceLanguage: "fr",
                    targetLanguage: "de",
                    translatedContent: "Hallo",
                    translationModel: "nllb",
                    confidenceScore: nil
                ),
            ],
            translatedAudios: []
        )
        XCTAssertEqual(flags, ["de"])
    }

    /// Same gating as `regional`/`custom`: no translation → no flag, even
    /// though a `deviceLocale` value was supplied.
    func test_buildAvailableFlags_excludesDeviceLocale_whenNoTranslationExists() {
        let flags = BubbleContent.buildAvailableFlags(
            activeLang: "fr",
            originalLang: "fr",
            preferredLang: nil,
            regional: nil,
            custom: nil,
            deviceLocale: "de",
            translations: [],
            translatedAudios: []
        )
        XCTAssertEqual(flags, [])
    }

    /// Deduplication: a `deviceLocale` equal to an already-included code
    /// (here `regional`) must not produce a duplicate flag.
    func test_buildAvailableFlags_deduplicatesDeviceLocale_againstRegional() {
        let flags = BubbleContent.buildAvailableFlags(
            activeLang: "fr",
            originalLang: "fr",
            preferredLang: nil,
            regional: "de",
            custom: nil,
            deviceLocale: "de",
            translations: [
                MessageTranslation(
                    id: "t1",
                    messageId: "m1",
                    sourceLanguage: "fr",
                    targetLanguage: "de",
                    translatedContent: "Hallo",
                    translationModel: "nllb",
                    confidenceScore: nil
                ),
            ],
            translatedAudios: []
        )
        XCTAssertEqual(flags, ["de"])
    }

    /// End-to-end: the `BubbleContent` init plumbs `deviceLocale` all the way
    /// through to `content.translation.availableFlags` — not just the pure
    /// helper.
    func test_init_deviceLocale_surfacesInAvailableFlags() {
        let msg = makeMessage(content: "Bonjour")
        let content = BubbleContent(
            message: msg,
            translations: [
                MessageTranslation(
                    id: "t1",
                    messageId: "m1",
                    sourceLanguage: "fr",
                    targetLanguage: "de",
                    translatedContent: "Hallo",
                    translationModel: "nllb",
                    confidenceScore: nil
                ),
            ],
            preferredTranslation: nil,
            currentUserId: "u1",
            deviceLocale: "de"
        )
        XCTAssertEqual(content.translation?.availableFlags, ["de"])
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

    // MARK: - Call notice presentation (bulle vivante + annulé par-spectateur)

    private let accentHex = "#6366F1"

    private func makeLiveSummary(callType: CallSummaryMetadata.MediaType = .audio) -> CallSummaryMetadata {
        CallSummaryMetadata(
            callId: "call1",
            initiatorId: "peer",
            callType: callType,
            outcome: .completed,
            durationSeconds: 0,
            bytesTotal: nil,
            bytesEstimated: false,
            networkQuality: nil,
            isLive: true
        )
    }

    // Les valeurs attendues sont résolues via la MÊME clé/valeur-par-défaut/bundle
    // que `CallNoticePresentation` (`BubbleCallNoticeView.swift`) — jamais un
    // littéral français en dur. Le simulateur CI tourne en `en-US` : comparer à
    // un littéral français ne teste alors plus le code mais la langue de la
    // machine (cf. `CallsViewModelTests.expected`, même patron). Ici les deux
    // membres de chaque égalité viennent du catalogue : l'assertion prouve que
    // la BONNE clé est choisie pour ces entrées, quelle que soit la langue active.

    func test_liveCallPresentation_showsOngoingTitleAndJoinHint() {
        let presentation = CallNoticePresentation(summary: makeLiveSummary(), isOutgoing: false, accentHex: accentHex)

        XCTAssertEqual(presentation.title, String(localized: "bubble.call.audio.ongoing", defaultValue: "Appel audio en cours", bundle: .main))
        XCTAssertEqual(presentation.liveSubtitle, String(localized: "bubble.call.join.hint", defaultValue: "Toucher pour rejoindre", bundle: .main))
    }

    func test_liveVideoCallPresentation_titleIsVideoOngoing() {
        let presentation = CallNoticePresentation(summary: makeLiveSummary(callType: .video), isOutgoing: true, accentHex: accentHex)

        XCTAssertEqual(presentation.title, String(localized: "bubble.call.video.ongoing", defaultValue: "Appel vidéo en cours", bundle: .main))
    }

    func test_liveCallPresentation_readsKindBeforeOutcome_placeholderNeverRendersTerminal() {
        // Le live porte outcome:'completed' comme placeholder neutre — il ne doit
        // JAMAIS produire le rendu terminal (« Appel audio sortant » et ses
        // traductions). L'intérêt du test est la SÉLECTION de branche (live
        // avant outcome), pas le texte : on compare donc le titre live au titre
        // terminal composé — tous deux résolus depuis le catalogue — plutôt que
        // de chercher un sous-mot français (`contains("sortant")`), qui ne
        // prouverait plus rien dans une autre langue.
        let presentation = CallNoticePresentation(summary: makeLiveSummary(), isOutgoing: true, accentHex: accentHex)
        let terminalOutgoingTitle = String(localized: "bubble.call.audio", defaultValue: "Appel audio", bundle: .main)
            + " " + String(localized: "bubble.call.outgoing.suffix", defaultValue: "sortant", bundle: .main)

        XCTAssertEqual(presentation.title, String(localized: "bubble.call.audio.ongoing", defaultValue: "Appel audio en cours", bundle: .main))
        XCTAssertNotEqual(presentation.title, terminalOutgoingTitle)
    }

    func test_terminalCallPresentation_hasNoLiveSubtitle() {
        let terminal = makeCallSummary(initiatorId: "u1", callType: .audio, outcome: .completed, durationSeconds: 30)
        let presentation = CallNoticePresentation(summary: terminal, isOutgoing: true, accentHex: accentHex)
        let expectedTitle = String(localized: "bubble.call.audio", defaultValue: "Appel audio", bundle: .main)
            + " " + String(localized: "bubble.call.outgoing.suffix", defaultValue: "sortant", bundle: .main)

        XCTAssertNil(presentation.liveSubtitle)
        XCTAssertEqual(presentation.title, expectedTitle)
    }

    func test_cancelledCallPresentation_titleIsPerViewer() {
        let cancelled = CallSummaryMetadata(
            callId: "call1", initiatorId: "u1", callType: .audio, outcome: .missed,
            durationSeconds: 0, bytesTotal: nil, bytesEstimated: false, networkQuality: nil,
            endedByInitiator: true
        )

        let initiatorView = CallNoticePresentation(summary: cancelled, isOutgoing: true, accentHex: accentHex)
        XCTAssertEqual(initiatorView.title, String(localized: "bubble.call.cancelled", defaultValue: "Appel annulé", bundle: .main))

        let calleeView = CallNoticePresentation(summary: cancelled, isOutgoing: false, accentHex: accentHex)
        XCTAssertEqual(calleeView.title, String(localized: "bubble.call.audio.missed", defaultValue: "Appel audio manqué", bundle: .main))
    }

    func test_missedWithoutEndedByInitiator_staysMissedForBothViewers() {
        let missed = makeCallSummary(initiatorId: "u1", callType: .audio, outcome: .missed, durationSeconds: 0)
        let expectedMissedTitle = String(localized: "bubble.call.audio.missed", defaultValue: "Appel audio manqué", bundle: .main)

        XCTAssertEqual(CallNoticePresentation(summary: missed, isOutgoing: true, accentHex: accentHex).title, expectedMissedTitle)
        XCTAssertEqual(CallNoticePresentation(summary: missed, isOutgoing: false, accentHex: accentHex).title, expectedMissedTitle)
    }

    func test_liveCallSummary_stillBuildsACallNotice() {
        // Le routage BubbleContent existant (messageSource system + callSummary
        // non-nil) doit accepter le kind 'call-live' — la bulle riche vivante.
        let msg = makeMessage(
            content: "Appel audio en cours",
            messageSource: .system,
            callSummary: makeLiveSummary()
        )
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertNotNil(content.callNotice)
        XCTAssertEqual(content.callNotice?.summary.isLive, true)
    }

    // MARK: - Helpers

    // MARK: - Avis d'arrivée enrichi (pseudo, nom donné, règles du lien)

    func test_joinNotice_carriesEnrichedIdentityAndLinkRules() {
        var msg = makeMessage(
            content: "ano_Jc_n045 a rejoint la conversation — visiteur sans compte",
            messageSource: .system
        )
        msg.joinNotice = JoinNoticeMetadata(
            participantId: "p1",
            displayName: "ano_Jc_n045",
            isAnonymous: true,
            viaShareLink: true,
            username: "ano_Jc_n045",
            givenName: "Jc Nm",
            linkRules: .init(canSendMessages: true, canSendFiles: false, canSendImages: true)
        )

        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertEqual(content.joinNotice?.username, "ano_Jc_n045")
        XCTAssertEqual(content.joinNotice?.givenName, "Jc Nm")
        XCTAssertEqual(
            content.joinNotice?.linkRules,
            .init(canSendMessages: true, canSendFiles: false, canSendImages: true)
        )
    }

    // MARK: - Loi de présentation de l'avis d'arrivée

    /// Le nom DONNÉ prime, le pseudo `ano_…` descend en @handle — chacun à sa
    /// place. Sans nom donné, le pseudo reste le nom principal et le handle
    /// disparaît : « ano_bob » suivi de « @ano_bob » ne dirait rien de plus.
    func test_joinNoticePresentation_putsGivenNameFirstAndPseudoAsHandle() {
        let notice = BubbleContent.JoinNotice(
            participantId: "participant-1",
            displayName: "ano_Jc_n045",
            isAnonymous: true,
            viaShareLink: true,
            fallbackText: "repli",
            username: "ano_Jc_n045",
            givenName: "Jc Nm",
            linkRules: nil
        )

        let presentation = JoinNoticePresentation(notice: notice)

        XCTAssertEqual(presentation.primaryName, "Jc Nm")
        XCTAssertEqual(presentation.handle, "@ano_Jc_n045")
        XCTAssertTrue(presentation.showsNoAccountBadge)
    }

    func test_joinNoticePresentation_withoutGivenName_showsNoRedundantHandle() {
        let notice = BubbleContent.JoinNotice(
            participantId: "participant-1",
            displayName: "ano_bob",
            isAnonymous: true,
            viaShareLink: true,
            fallbackText: "repli",
            username: "ano_bob",
            givenName: nil,
            linkRules: nil
        )

        let presentation = JoinNoticePresentation(notice: notice)

        XCTAssertEqual(presentation.primaryName, "ano_bob")
        XCTAssertNil(presentation.handle)
    }

    func test_joinNoticePresentation_registeredMember_hasNoBadgeAndNoRules() {
        let notice = BubbleContent.JoinNotice(
            participantId: "participant-1",
            displayName: "Alice Smith",
            isAnonymous: false,
            viaShareLink: false,
            fallbackText: "repli",
            username: nil,
            givenName: nil,
            linkRules: nil
        )

        let presentation = JoinNoticePresentation(notice: notice)

        XCTAssertEqual(presentation.primaryName, "Alice Smith")
        XCTAssertNil(presentation.handle)
        XCTAssertFalse(presentation.showsNoAccountBadge)
        XCTAssertNil(presentation.rules)
    }

    func test_joinNoticePresentation_carriesLinkRules() {
        let rules = JoinNoticeMetadata.LinkRules(canSendMessages: true, canSendFiles: false, canSendImages: true)
        let notice = BubbleContent.JoinNotice(
            participantId: "participant-1",
            displayName: "ano_bob",
            isAnonymous: true,
            viaShareLink: true,
            fallbackText: "repli",
            username: "ano_bob",
            givenName: "Bob",
            linkRules: rules
        )

        XCTAssertEqual(JoinNoticePresentation(notice: notice).rules, rules)
    }

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

    // MARK: - #4020 — quelles bulles acceptent le double tap de réaction

    /// **Le double tap est le geste de la barre de réaction rapide.**
    ///
    /// La règle est écrite comme une fonction PURE de la nature de la bulle,
    /// et non par un `if` dans le corps de la vue : c'est ce qui la rend
    /// mesurable ici, et ce qui empêche la deuxième surface (les cellules
    /// média) d'en écrire une seconde version.
    ///
    /// Une bulle STANDARD l'accepte — c'est le seul cas où il y a quelque
    /// chose à réagir.
    func test_doubleTap_estAccepteParUneBulleStandard() {
        XCTAssertTrue(QuickReactionGesture.acceptsDoubleTap(kind: .standard))
    }

    /// **Les quatre refus, et chacun a sa raison.** Sans eux, le geste
    /// s'attacherait à des bulles où il ouvrirait une barre pour réagir à
    /// RIEN — et le serveur refuserait la réaction, laissant l'utilisateur
    /// devant un geste qui a l'air de marcher.
    func test_doubleTap_estRefuseParToutCeQuiNaRienAReagir() {
        XCTAssertFalse(QuickReactionGesture.acceptsDoubleTap(kind: .deleted),
                       "un message supprimé n'a plus de contenu")
        XCTAssertFalse(QuickReactionGesture.acceptsDoubleTap(kind: .burned),
                       "une vue unique consommée ne se réagit pas après coup")
        XCTAssertFalse(QuickReactionGesture.acceptsDoubleTap(kind: .ephemeralExpired),
                       "un éphémère expiré n'est plus là")
        XCTAssertFalse(QuickReactionGesture.acceptsDoubleTap(kind: .system),
                       "un avis système n'est pas une parole de quelqu'un")
    }

    /// **Le témoin d'EXHAUSTIVITÉ.** Un cinquième `Kind` ajouté demain doit
    /// forcer une décision explicite plutôt que de tomber dans un défaut
    /// silencieux — et ce compte est ce qui fait rougir l'oubli.
    ///
    /// Condition de levée : si `BubbleContent.Kind` gagne un cas, trancher
    /// dans `QuickReactionGesture` puis monter ce compte, jamais l'inverse.
    func test_laRegleCouvreTousLesKinds() {
        let tous: [BubbleContent.Kind] = [.standard, .deleted, .burned, .ephemeralExpired, .system]
        XCTAssertEqual(tous.count, 5,
                       "BubbleContent.Kind a changé — trancher le nouveau cas dans QuickReactionGesture")
        XCTAssertEqual(tous.filter(QuickReactionGesture.acceptsDoubleTap(kind:)).count, 1,
                       "une seule nature de bulle accepte le geste : la standard")
    }

    /// **Les deux gestes de la cellule média ouvrent le MÊME sélecteur, sous la
    /// MÊME garde** (#4020).
    ///
    /// Le double tap rejoint un appui long qui existait déjà. Rien n'oblige
    /// mécaniquement les deux à rester d'accord : ils sont deux modificateurs
    /// posés à douze lignes l'un de l'autre, et le jour où l'un des deux gagne
    /// une condition que l'autre n'a pas, la cellule offrira deux chemins vers
    /// deux comportements — sans qu'aucun test ne rougisse, chaque moitié
    /// restant cohérente avec elle-même.
    ///
    /// Le témoin est BORNÉ au corps de `standardBody` : le fichier contient
    /// d'autres `canReactPerImage` (la définition de la garde, la pastille),
    /// donc un `contains` sur le fichier entier serait vert avant comme après.
    func test_lesDeuxGestesDeLaCelluleMedia_partagentGardeEtActe() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        let texte = try String(contentsOf: url, encoding: .utf8)

        guard let debut = texte.range(of: "private var standardBody: some View {"),
              let fin = texte.range(of: "\n    /// BUG2 A'", range: debut.upperBound..<texte.endIndex) else {
            return XCTFail("`standardBody` est introuvable — le témoin ne mesure plus rien.")
        }
        let corps = String(texte[debut.upperBound..<fin.lowerBound])

        XCTAssertTrue(corps.contains("QuickReactionDoubleTap(isEnabled: canReactPerImage)"),
                      "le double tap doit porter la MÊME garde que l'appui long")
        XCTAssertTrue(corps.contains("AttachmentReactionLongPress(enabled: canReactPerImage)"),
                      "l'appui long est le geste de référence — s'il a bougé, ce témoin doit être repointé")
        XCTAssertEqual(corps.components(separatedBy: "showReactionPicker = true").count - 1, 2,
                       "les deux gestes ouvrent le MÊME sélecteur — ni un troisième, ni deux destinations")
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
