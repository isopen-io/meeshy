import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// Regression guard for the B9 finding: seeding `selectedAudioLanguage` from
/// `initialTranscriptionLanguage` (Prisme default for the transcription
/// STRIP) must never leak into which audio track actually plays. Only an
/// EXPLICIT user language selection (`switchToLanguage`, reached from a
/// language pill tap or the `externalLanguage` binding) may steer playback
/// away from the original — mirroring the doc contract on
/// `initialTranscriptionLanguage` ("it never changes which audio track
/// plays, that stays the original by default") and the CLAUDE.md Prisme rule
/// that playback stays on the original unless the user explicitly explores
/// another language.
@Suite("AudioPlayerView.resolvePlaybackUrl")
struct AudioPlayerViewPlaybackLanguageTests {

    private func makeTranslatedAudio(targetLanguage: String, url: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: "ta_\(targetLanguage)", attachmentId: "att_1", targetLanguage: targetLanguage,
            url: url, transcription: "hola", durationMs: 1200, format: "m4a",
            cloned: false, quality: 0.9, ttsModel: "chatterbox"
        )
    }

    @Test("auto-seeded language (not user-selected) never affects playback, even when a translated audio matches")
    func test_autoSeededLanguage_isUserSelectedFalse_returnsOriginal() {
        let translated = [makeTranslatedAudio(targetLanguage: "es", url: "https://x/es.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "es",
            isUserSelected: false,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/orig.m4a")
    }

    @Test("explicit user selection of a language with a matching translated audio plays the translation")
    func test_userSelectedLanguage_withMatch_returnsTranslatedUrl() {
        let translated = [makeTranslatedAudio(targetLanguage: "es", url: "https://x/es.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "es",
            isUserSelected: true,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/es.m4a")
    }

    @Test("explicit user selection of \"orig\" always returns the original, even with translations available")
    func test_userSelectedOrig_returnsOriginal() {
        let translated = [makeTranslatedAudio(targetLanguage: "es", url: "https://x/es.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "orig",
            isUserSelected: true,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/orig.m4a")
    }

    @Test("explicit user selection with no matching translated audio falls back to the original")
    func test_userSelectedLanguage_withoutMatch_returnsOriginal() {
        let translated = [makeTranslatedAudio(targetLanguage: "pt", url: "https://x/pt.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "es",
            isUserSelected: true,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/orig.m4a")
    }

    @Test("fresh init (auto-seeded selectedAudioLanguage) never marks the language as user-selected")
    @MainActor
    func test_init_neverMarksLanguageAsUserSelected() {
        let attachment = MeeshyMessageAttachment(
            id: "att_1", fileName: "a.m4a", mimeType: "audio/m4a",
            fileUrl: "https://x/a.m4a", duration: 1600
        )
        let view = AudioPlayerView(
            attachment: attachment,
            context: .messageBubble,
            initialTranscriptionLanguage: "es"
        )
        #expect(view.selectedAudioLanguage == "es")
        #expect(view.hasUserSelectedAudioLanguage == false)
    }
}
