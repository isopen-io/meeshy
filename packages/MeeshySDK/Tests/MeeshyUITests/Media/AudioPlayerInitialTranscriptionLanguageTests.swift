import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// Prisme Linguistique — the transcription strip's STARTING language must
/// resolve to the caller-provided preference the same way
/// `preferredTranslation` resolves text, instead of always defaulting to
/// "orig". The SDK stays agnostic of the resolution rule (systemLanguage >
/// regional > custom > deviceLocale) — it only seeds `selectedAudioLanguage`
/// from whatever code the app hands it via `initialTranscriptionLanguage`.
@Suite("AudioPlayerView.resolveInitialTranscriptionLanguage")
struct AudioPlayerInitialTranscriptionLanguageTests {

    @Test("nil input defaults to the original transcription")
    func test_nilInput_defaultsToOriginal() {
        #expect(AudioPlayerView.resolveInitialTranscriptionLanguage(nil) == "orig")
    }

    @Test("a resolved language code is used verbatim")
    func test_resolvedCode_isUsedVerbatim() {
        #expect(AudioPlayerView.resolveInitialTranscriptionLanguage("es") == "es")
        #expect(AudioPlayerView.resolveInitialTranscriptionLanguage("pt-BR") == "pt-BR")
    }

    @Test("init seeds selectedAudioLanguage from initialTranscriptionLanguage")
    @MainActor
    func test_init_seedsSelectedAudioLanguage_fromResolvedLanguage() {
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
    }

    @Test("init defaults selectedAudioLanguage to orig when initialTranscriptionLanguage is nil")
    @MainActor
    func test_init_defaultsSelectedAudioLanguage_toOrig() {
        let attachment = MeeshyMessageAttachment(
            id: "att_2", fileName: "b.m4a", mimeType: "audio/m4a",
            fileUrl: "https://x/b.m4a", duration: 1600
        )
        let view = AudioPlayerView(attachment: attachment, context: .messageBubble)
        #expect(view.selectedAudioLanguage == "orig")
    }
}
