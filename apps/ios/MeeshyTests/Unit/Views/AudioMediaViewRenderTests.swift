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

    /// Stabilité : deux instances avec exactement la même reply doivent rester égales.
    func test_audioMediaView_equatable_stableWhenReplyUnchanged() {
        let ref = ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        let a = AudioMediaView.makeForTest(replyReference: ref)
        let b = AudioMediaView.makeForTest(replyReference: ref)

        XCTAssertTrue(a == b,
            "AudioMediaView Equatable doit rester égal pour la même reply (zero-rerender)")
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
        translatedAudios: [MessageTranslatedAudio] = []
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
            replyIsStory: replyIsStory
        )
    }
}
