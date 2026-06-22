import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class AudioTranslationMergeTests: XCTestCase {

    func test_mergeAudioTranslations_addsNewLanguage() {
        let existing: [MessageTranslatedAudio] = []
        let incoming = [
            AttachmentTranslationResult(id: "ta_1", targetLanguage: "en",
                translatedText: "hello", audioUrl: "https://x/en.mp3",
                durationMs: 1800, voiceCloned: false)
        ]
        let merged = MessageDetailSheet.mergeAudioTranslations(
            existing: existing, incoming: incoming, attachmentId: "att_1"
        )
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged.first?.targetLanguage, "en")
        XCTAssertEqual(merged.first?.url, "https://x/en.mp3")
    }

    func test_mergeAudioTranslations_replacesSameLanguage() {
        let existing = [
            MessageTranslatedAudio(id: "old", attachmentId: "att_1", targetLanguage: "en",
                url: "https://x/old.mp3", transcription: "old", durationMs: 1000,
                format: "mp3", cloned: false, quality: 0.5, ttsModel: "chatterbox")
        ]
        let incoming = [
            AttachmentTranslationResult(id: "ta_new", targetLanguage: "en",
                translatedText: "hello", audioUrl: "https://x/new.mp3",
                durationMs: 1800, voiceCloned: false)
        ]
        let merged = MessageDetailSheet.mergeAudioTranslations(
            existing: existing, incoming: incoming, attachmentId: "att_1"
        )
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged.first?.url, "https://x/new.mp3")
    }
}
