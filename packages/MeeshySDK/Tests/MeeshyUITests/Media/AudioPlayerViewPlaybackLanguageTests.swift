import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// Regression guard for the Prisme audio-follow decision (2026-08-09) : la
/// piste audio suit désormais la langue Prisme résolue automatiquement, dès
/// l'ouverture — exactement comme le bandeau de transcription et comme le
/// texte des messages. Ceci renverse la politique antérieure ("B9 fix") qui
/// gardait les deux volontairement indépendants. Un choix EXPLICITE de
/// l'utilisateur (`switchToLanguage`, tap sur un pill ou binding
/// `externalLanguage`) reste toujours prioritaire et reste modifiable —
/// ce n'est plus la SEULE façon de faire jouer une traduction.
@Suite("AudioPlayerView.resolvePlaybackUrl")
struct AudioPlayerViewPlaybackLanguageTests {

    private func makeTranslatedAudio(targetLanguage: String, url: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: "ta_\(targetLanguage)", attachmentId: "att_1", targetLanguage: targetLanguage,
            url: url, transcription: "hola", durationMs: 1200, format: "m4a",
            cloned: false, quality: 0.9, ttsModel: "chatterbox"
        )
    }

    // `resolvePlaybackUrl` elle-même ne change pas de comportement : seul son
    // paramètre est renommé (`isUserSelected` -> `hasExplicitLanguage`). Ces
    // 4 tests gardent leurs assertions d'origine.

    @Test("hasExplicitLanguage=false never affects playback, even when a translated audio matches")
    func test_notExplicit_returnsOriginal() {
        let translated = [makeTranslatedAudio(targetLanguage: "es", url: "https://x/es.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "es",
            hasExplicitLanguage: false,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/orig.m4a")
    }

    @Test("hasExplicitLanguage=true with a matching translated audio plays the translation")
    func test_explicit_withMatch_returnsTranslatedUrl() {
        let translated = [makeTranslatedAudio(targetLanguage: "es", url: "https://x/es.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "es",
            hasExplicitLanguage: true,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/es.m4a")
    }

    @Test("hasExplicitLanguage=true with \"orig\" always returns the original, even with translations available")
    func test_explicitOrig_returnsOriginal() {
        let translated = [makeTranslatedAudio(targetLanguage: "es", url: "https://x/es.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "orig",
            hasExplicitLanguage: true,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/orig.m4a")
    }

    @Test("hasExplicitLanguage=true with no matching translated audio falls back to the original")
    func test_explicit_withoutMatch_returnsOriginal() {
        let translated = [makeTranslatedAudio(targetLanguage: "pt", url: "https://x/pt.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "es",
            hasExplicitLanguage: true,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/orig.m4a")
    }

    // Ce test-ci a un VRAI changement de comportement : c'est l'`init` qui
    // change, pas `resolvePlaybackUrl`.

    @Test("init marks the language as explicit when Prisme resolves a real translation")
    @MainActor
    func test_init_marksLanguageAsExplicitWhenPrismeResolvesATranslation() {
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
        #expect(view.hasExplicitAudioLanguage == true)
    }

    @Test("init leaves the language non-explicit when there is no Prisme translation to seed")
    @MainActor
    func test_init_leavesLanguageNonExplicitWithoutATranslation() {
        let attachment = MeeshyMessageAttachment(
            id: "att_1", fileName: "a.m4a", mimeType: "audio/m4a",
            fileUrl: "https://x/a.m4a", duration: 1600
        )
        let view = AudioPlayerView(
            attachment: attachment,
            context: .messageBubble,
            initialTranscriptionLanguage: nil
        )
        #expect(view.selectedAudioLanguage == "orig")
        #expect(view.hasExplicitAudioLanguage == false)
    }
}
