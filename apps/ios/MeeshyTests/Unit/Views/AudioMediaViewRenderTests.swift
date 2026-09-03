import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

@MainActor
final class AudioMediaViewRenderTests: XCTestCase {

    func test_audioMediaView_doesNotObserveThemeManager() {
        let sut = AudioMediaView.makeForTest()
        let mirror = Mirror(reflecting: sut)
        let observedObjects = mirror.children.filter { child in
            String(describing: type(of: child.value)).contains("ObservedObject")
        }
        XCTAssertTrue(
            observedObjects.isEmpty,
            "AudioMediaView should not have @ObservedObject — leaf view rule violation"
        )
    }

    /// Equatable doit détecter l'apparition d'une replyReference pour invalider
    /// le cache de bulle (UICollectionView) — sinon la citation n'apparaîtra
    /// pas au passage en mode `audioHostsReply`.
    func test_audioMediaView_equatable_detectsReplyMessageIdChange() {
        let baseline = AudioMediaView.makeForTest()
        let withReply = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        )

        XCTAssertFalse(baseline == withReply,
            "AudioMediaView Equatable doit détecter l'apparition d'une replyReference")
    }

    /// Idem pour un changement de previewText (édition de la cible).
    func test_audioMediaView_equatable_detectsReplyPreviewTextChange() {
        let a = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        )
        let b = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Coucou")
        )

        XCTAssertFalse(a == b,
            "AudioMediaView Equatable doit détecter une édition du previewText de la reply")
    }

    /// L'avatar de l'auteur cité est une donnée de la citation hébergée par le
    /// widget audio (`audioHostsReply`). Ce `==` manuel est le seul filtre
    /// d'invalidation de la cellule : un avatar arrivé après coup (refresh
    /// serveur, hydratation du cache) doit y être vu, sinon la citation reste
    /// figée sur son rendu initial.
    func test_audioMediaView_equatable_detectsQuotedAuthorAvatarChange() {
        let a = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        )
        let b = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut",
                                           authorAvatarUrl: "https://cdn.example/bob.jpg")
        )

        XCTAssertFalse(a == b,
            "AudioMediaView Equatable doit détecter l'arrivée de l'avatar de l'auteur cité")
    }

    /// La PROTECTION du média cité décide si la vignette est rendue et si sa
    /// zone tactile est armée. Elle arrive après coup (bulle optimiste → écho
    /// serveur, blob de cache ancien → refresh) : absente du comparateur, la
    /// vignette d'un média à vue unique restait affichée pour toujours.
    func test_audioMediaView_equatable_detectsQuotedMediaProtectionChange() {
        let a = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut",
                                           attachmentThumbnailUrl: "https://cdn.example/t.jpg")
        )
        let b = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut",
                                           attachmentThumbnailUrl: "https://cdn.example/t.jpg",
                                           attachmentIsProtected: true)
        )

        XCTAssertFalse(a == b,
            "AudioMediaView Equatable doit détecter l'arrivée de la protection du média cité")
    }

    /// Les SEPT faits du média cité (#4945) — flou ThumbHash et ligne
    /// « 1024×768 · 0:42 · 1,2 Mo ». Ils arrivent avec l'écho serveur ; absents
    /// du comparateur, la citation restait figée sur sa version optimiste.
    func test_audioMediaView_equatable_detectsQuotedAttachmentFactsChange() {
        let a = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        )
        let b = AudioMediaView.makeForTest(
            replyReference: ReplyReference(
                messageId: "m-quote-1", authorName: "Bob", previewText: "Salut",
                attachmentFacts: ReplyReference.QuotedAttachmentFacts(
                    thumbHash: "AQIDBA==", width: 1024, height: 768,
                    durationMs: 42_000, fileSize: 1_200_000, pageCount: nil, mimeType: "image/jpeg"
                )
            )
        )

        XCTAssertFalse(a == b,
            "AudioMediaView Equatable doit détecter l'arrivée des faits du média cité")
    }

    /// Stabilité : deux instances avec exactement la même reply doivent rester égales.
    func test_audioMediaView_equatable_stableWhenReplyUnchanged() {
        let ref = ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        let a = AudioMediaView.makeForTest(replyReference: ref)
        let b = AudioMediaView.makeForTest(replyReference: ref)

        XCTAssertTrue(a == b,
            "AudioMediaView Equatable doit rester égal pour la même reply (zero-rerender)")
    }

    // MARK: - Cold-open plein écran audio : conversation/file wiring (F1)
    //
    // `AudioMediaView.fullscreenSource(for:)` builds the `AudioFullscreenSource`
    // handed to `AudioFullscreenView`'s `.fullScreenCover`. Un cold-open (tap
    // direct sur un vocal, sans lecture déjà active) doit porter le nom de
    // CONVERSATION (pas l'auteur) et une file "à suivre" — sinon la carte Now
    // Playing affiche l'auteur seul et l'avance auto vers les vocaux non
    // écoutés suivants ne se déclenche jamais.

    private func makeAudioItemFixture(attachmentId: String = "att-item-1") -> ConversationViewModel.AudioItem {
        let attachment = MessageAttachment(
            id: attachmentId, fileName: "item.m4a", originalName: "item.m4a",
            mimeType: "audio/m4a", fileSize: 100, fileUrl: "https://example.com/\(attachmentId).m4a",
            width: nil, height: nil, duration: 1500
        )
        let message = MeeshyMessage(
            id: "msg-item-1",
            conversationId: "conv-item-1",
            senderId: "user-item-1",
            content: "",
            originalLanguage: "fr",
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0),
            senderName: "Author Name"
        )
        return ConversationViewModel.AudioItem(
            id: attachmentId, attachment: attachment, message: message,
            transcription: nil, translatedAudios: []
        )
    }

    func test_fullscreenSource_wiresConversationNameAndQueueTail() {
        let tailFixture = QueuedAudio(
            attachmentId: "att-tail-1", messageId: "msg-tail-1", conversationId: "conv-item-1",
            fileUrl: "https://example.com/tail.m4a", durationMs: 2000,
            senderName: "Someone", senderAvatarURL: nil, receivedAt: Date(timeIntervalSince1970: 0)
        )
        let sut = AudioMediaView.makeForTest(
            conversationName: "Team Chat",
            audioQueueTailProvider: { _ in [tailFixture] }
        )

        let source = sut.fullscreenSource(for: makeAudioItemFixture())

        XCTAssertEqual(source.nowPlayingContextName, "Team Chat",
            "Cold-open doit porter le nom de conversation, pas l'auteur")
        XCTAssertEqual(source.queueTailProvider?(), [tailFixture],
            "Cold-open doit exposer la file 'à suivre' de la conversation")
    }

    /// Sans wiring (surfaces feed/comment/post/réel qui n'ont pas de
    /// conversation), `fullscreenSource(for:)` doit garder le repli existant
    /// sur le nom de l'auteur — comportement inchangé pour ces surfaces.
    func test_fullscreenSource_noConversationName_fallsBackToAuthorName() {
        let sut = AudioMediaView.makeForTest()

        let source = sut.fullscreenSource(for: makeAudioItemFixture())

        XCTAssertEqual(source.nowPlayingContextName, "Author Name")
        XCTAssertNil(source.queueTailProvider?())
    }

    /// Le pager du plein écran appelle `fullscreenSource(for:)` par item —
    /// chaque page doit résoudre SA PROPRE file via SON PROPRE attachmentId,
    /// pas celui (fixe) de la vue hôte. Un stub `{ _ in ... }` ne peut pas
    /// détecter une régression vers `provider(attachment.id)` (attachment de
    /// la vue, pas de l'item) : ce test capture l'id réellement reçu.
    func test_fullscreenSource_queueTailProvider_capturesPerItemAttachmentId() {
        var capturedIds: [String] = []
        let sut = AudioMediaView.makeForTest(
            conversationName: "Team Chat",
            audioQueueTailProvider: { id in
                capturedIds.append(id)
                return []
            }
        )

        _ = sut.fullscreenSource(for: makeAudioItemFixture(attachmentId: "att-item-A")).queueTailProvider?()
        _ = sut.fullscreenSource(for: makeAudioItemFixture(attachmentId: "att-item-B")).queueTailProvider?()

        XCTAssertEqual(capturedIds, ["att-item-A", "att-item-B"],
            "Chaque page du pager doit resoudre sa propre file via son propre attachmentId, pas celui de la vue hote")
    }

    // MARK: - Prisme: resolvedPreferredTranscriptionLanguage

    private func withCurrentUser<T>(_ user: MeeshyUser?, _ body: () -> T) -> T {
        let previous = AuthManager.shared.currentUser
        AuthManager.shared.currentUser = user
        defer { AuthManager.shared.currentUser = previous }
        return body()
    }

    private func makeTranslatedAudio(lang: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: "ta-\(lang)", attachmentId: "att-test-1", targetLanguage: lang,
            url: "https://example.com/\(lang).mp3", transcription: "hola",
            durationMs: 1200, format: "mp3", cloned: false, quality: 0.9,
            ttsModel: "chatterbox", segments: []
        )
    }

    /// `deviceLocale` is pinned to a nonsense code on every fixture below so
    /// the 4th-priority `Locale.current` fallback in
    /// `ConversationLanguagePreferences` never coincidentally matches a test
    /// translated-audio language on whatever locale the CI/dev machine runs.
    func test_resolvedPreferredTranscriptionLanguage_noTranslatedAudios_isNil() {
        let user = MeeshyUser(id: "u1", username: "u1", displayName: "U1", systemLanguage: "es", deviceLocale: "xx")
        withCurrentUser(user) {
            let sut = AudioMediaView.makeForTest(originalLanguage: "fr", translatedAudios: [])
            XCTAssertNil(sut.resolvedPreferredTranscriptionLanguage,
                         "No translated audio exists — there is nothing to resolve to")
        }
    }

    /// Prisme rule §1: a match on the preferred language resolves to that
    /// language's translated-audio transcript.
    func test_resolvedPreferredTranscriptionLanguage_matchesSystemLanguage() {
        let user = MeeshyUser(id: "u1", username: "u1", displayName: "U1", systemLanguage: "es", deviceLocale: "xx")
        withCurrentUser(user) {
            let sut = AudioMediaView.makeForTest(
                originalLanguage: "fr",
                translatedAudios: [makeTranslatedAudio(lang: "es"), makeTranslatedAudio(lang: "de")]
            )
            XCTAssertEqual(sut.resolvedPreferredTranscriptionLanguage, "es")
        }
    }

    /// Prisme rule §1 (CLAUDE.md): if the preferred language IS the original,
    /// show the original — never a translation. Must return nil, not "fr".
    func test_resolvedPreferredTranscriptionLanguage_preferredMatchesOriginal_returnsNilNotTranslation() {
        let user = MeeshyUser(id: "u1", username: "u1", displayName: "U1", systemLanguage: "fr", deviceLocale: "xx")
        withCurrentUser(user) {
            let sut = AudioMediaView.makeForTest(
                originalLanguage: "fr",
                translatedAudios: [makeTranslatedAudio(lang: "es")]
            )
            XCTAssertNil(sut.resolvedPreferredTranscriptionLanguage,
                         "Original already matches the preferred language — must show original, not auto-switch")
        }
    }

    /// Prisme rule §1: no match anywhere in the preference chain must return
    /// nil (show original) — NEVER fall back to translatedAudios.first.
    func test_resolvedPreferredTranscriptionLanguage_noMatch_returnsNilNotFirst() {
        let user = MeeshyUser(id: "u1", username: "u1", displayName: "U1", systemLanguage: "de", deviceLocale: "xx")
        withCurrentUser(user) {
            let sut = AudioMediaView.makeForTest(
                originalLanguage: "fr",
                translatedAudios: [makeTranslatedAudio(lang: "es"), makeTranslatedAudio(lang: "it")]
            )
            XCTAssertNil(sut.resolvedPreferredTranscriptionLanguage,
                         "No candidate in the preference chain matches — must show original, never translatedAudios.first")
        }
    }
}

extension AudioMediaView {
    static func makeForTest(
        replyReference: ReplyReference? = nil,
        replyIsStory: Bool = false,
        originalLanguage: String = "fr",
        translatedAudios: [MessageTranslatedAudio] = [],
        conversationName: String? = nil,
        audioQueueTailProvider: ((String) -> [QueuedAudio])? = nil
    ) -> AudioMediaView {
        let attachment = MeeshyMessageAttachment(
            id: "att-test-1",
            messageId: "msg-test-1",
            fileName: "test.m4a",
            originalName: "test.m4a",
            mimeType: "audio/m4a",
            fileSize: 1024,
            filePath: "/test/test.m4a",
            fileUrl: "https://example.com/test.m4a",
            uploadedBy: "user-test-1"
        )
        // Dates fixées pour que deux appels successifs produisent des
        // MeeshyMessage Equatable-équivalents (updatedAt par défaut = Date()
        // change à chaque appel).
        let message = MeeshyMessage(
            id: "msg-test-1",
            conversationId: "conv-test-1",
            senderId: "user-test-1",
            content: "",
            originalLanguage: originalLanguage,
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0)
        )
        return AudioMediaView(
            attachment: attachment,
            message: message,
            contactColor: "#6366F1",
            visualAttachments: [],
            isDark: false,
            accentColor: "#6366F1",
            translatedAudios: translatedAudios,
            replyReference: replyReference,
            replyIsStory: replyIsStory,
            conversationName: conversationName,
            audioQueueTailProvider: audioQueueTailProvider
        )
    }
}
