import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("AudioPlayerView.resolveDisplaySegments")
struct AudioPlayerDisplaySegmentsTests {

    private func makeTranscription(text: String, segments: [MessageTranscriptionSegment], durationMs: Int) -> MessageTranscription {
        MessageTranscription(attachmentId: "att_1", text: text, language: "fr",
                             confidence: 0.9, durationMs: durationMs, segments: segments)
    }

    private func makeTranslatedAudio(lang: String, transcription: String, segments: [MessageTranscriptionSegment]) -> MessageTranslatedAudio {
        MessageTranslatedAudio(id: "ta_1", attachmentId: "att_1", targetLanguage: lang,
                               url: "https://x/a.mp3", transcription: transcription,
                               durationMs: 1800, format: "mp3", cloned: false,
                               quality: 0.8, ttsModel: "chatterbox", segments: segments)
    }

    @Test("original branch: empty segments + non-empty text -> one synthesized segment")
    func test_resolveDisplaySegments_originalEmptySegments_synthesizesOne() {
        let stubSegments = [
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0),
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0),
        ]
        let transcription = makeTranscription(text: "bonjour le monde", segments: stubSegments, durationMs: 1600)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "orig", transcription: transcription, translatedAudios: [])
        #expect(result.count == 1)
        #expect(result.first?.text == "bonjour le monde")
        #expect(result.first?.endTime == 1.6)
    }

    @Test("translated branch: empty segments + non-empty translated.transcription -> one synthesized segment")
    func test_resolveDisplaySegments_translatedEmptySegments_synthesizesOne() {
        let stubSegments = [MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0)]
        let translated = makeTranslatedAudio(lang: "en", transcription: "hello world", segments: stubSegments)
        let transcription = makeTranscription(text: "bonjour le monde",
            segments: [MessageTranscriptionSegment(text: "bonjour le monde", startTime: 0, endTime: 1.6)],
            durationMs: 1600)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "en", transcription: transcription, translatedAudios: [translated])
        #expect(result.count == 1)
        #expect(result.first?.text == "hello world")
    }

    @Test("translated branch: non-empty segments are used directly")
    func test_resolveDisplaySegments_translatedRealSegments_usesThem() {
        let realSegments = [
            MessageTranscriptionSegment(text: "hello", startTime: 0, endTime: 0.8),
            MessageTranscriptionSegment(text: "world", startTime: 0.8, endTime: 1.8),
        ]
        let translated = makeTranslatedAudio(lang: "en", transcription: "hello world", segments: realSegments)
        let transcription = makeTranscription(text: "bonjour",
            segments: [MessageTranscriptionSegment(text: "bonjour", startTime: 0, endTime: 1)],
            durationMs: 1000)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "en", transcription: transcription, translatedAudios: [translated])
        #expect(result.map(\.text) == ["hello", "world"])
    }

    @Test("original branch: non-empty segments are used directly")
    func test_resolveDisplaySegments_originalRealSegments_usesThem() {
        let realSegments = [MessageTranscriptionSegment(text: "bonjour", startTime: 0, endTime: 1)]
        let transcription = makeTranscription(text: "bonjour", segments: realSegments, durationMs: 1000)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "orig", transcription: transcription, translatedAudios: [])
        #expect(result.map(\.text) == ["bonjour"])
    }

    @Test("no transcription, orig selected -> empty")
    func test_resolveDisplaySegments_noTranscription_returnsEmpty() {
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "orig", transcription: nil, translatedAudios: [])
        #expect(result.isEmpty)
    }
}
