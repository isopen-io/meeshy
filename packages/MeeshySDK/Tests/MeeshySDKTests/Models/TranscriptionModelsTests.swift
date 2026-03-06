import XCTest
@testable import MeeshySDK

final class TranscriptionModelsTests: XCTestCase {

    // MARK: - MessageTranscriptionSegment

    func testSegmentInitWithAllFields() {
        let segment = MessageTranscriptionSegment(
            text: "Hello world",
            startTime: 0.5,
            endTime: 2.3,
            speakerId: "speaker1"
        )

        XCTAssertEqual(segment.text, "Hello world")
        XCTAssertEqual(segment.startTime, 0.5)
        XCTAssertEqual(segment.endTime, 2.3)
        XCTAssertEqual(segment.speakerId, "speaker1")
        XCTAssertFalse(segment.id.uuidString.isEmpty)
    }

    func testSegmentInitWithDefaults() {
        let segment = MessageTranscriptionSegment(text: "Bonjour")

        XCTAssertEqual(segment.text, "Bonjour")
        XCTAssertNil(segment.startTime)
        XCTAssertNil(segment.endTime)
        XCTAssertNil(segment.speakerId)
    }

    func testSegmentHasUniqueIds() {
        let segment1 = MessageTranscriptionSegment(text: "A")
        let segment2 = MessageTranscriptionSegment(text: "B")

        XCTAssertNotEqual(segment1.id, segment2.id)
    }

    // MARK: - MessageTranscription

    func testTranscriptionInitWithAllFields() {
        let segments = [
            MessageTranscriptionSegment(text: "Hello", startTime: 0.0, endTime: 1.0),
            MessageTranscriptionSegment(text: "World", startTime: 1.0, endTime: 2.0),
        ]

        let transcription = MessageTranscription(
            attachmentId: "att1",
            text: "Hello World",
            language: "en",
            confidence: 0.95,
            durationMs: 2000,
            segments: segments,
            speakerCount: 1
        )

        XCTAssertEqual(transcription.attachmentId, "att1")
        XCTAssertEqual(transcription.text, "Hello World")
        XCTAssertEqual(transcription.language, "en")
        XCTAssertEqual(transcription.confidence, 0.95)
        XCTAssertEqual(transcription.durationMs, 2000)
        XCTAssertEqual(transcription.segments.count, 2)
        XCTAssertEqual(transcription.speakerCount, 1)
    }

    func testTranscriptionInitWithNilOptionals() {
        let transcription = MessageTranscription(
            attachmentId: "att2",
            text: "Salut",
            language: "fr"
        )

        XCTAssertEqual(transcription.attachmentId, "att2")
        XCTAssertEqual(transcription.text, "Salut")
        XCTAssertEqual(transcription.language, "fr")
        XCTAssertNil(transcription.confidence)
        XCTAssertNil(transcription.durationMs)
        XCTAssertTrue(transcription.segments.isEmpty)
        XCTAssertNil(transcription.speakerCount)
    }

    // MARK: - MessageTranslatedAudio

    func testTranslatedAudioInitWithRequiredFields() {
        let audio = MessageTranslatedAudio(
            id: "audio1",
            attachmentId: "att1",
            targetLanguage: "fr",
            url: "https://audio.test/fr.mp3",
            transcription: "Bonjour le monde",
            durationMs: 3000,
            format: "mp3",
            cloned: false,
            quality: 0.85,
            ttsModel: "chatterbox"
        )

        XCTAssertEqual(audio.id, "audio1")
        XCTAssertEqual(audio.attachmentId, "att1")
        XCTAssertEqual(audio.targetLanguage, "fr")
        XCTAssertEqual(audio.url, "https://audio.test/fr.mp3")
        XCTAssertEqual(audio.transcription, "Bonjour le monde")
        XCTAssertEqual(audio.durationMs, 3000)
        XCTAssertEqual(audio.format, "mp3")
        XCTAssertFalse(audio.cloned)
        XCTAssertEqual(audio.quality, 0.85)
        XCTAssertEqual(audio.ttsModel, "chatterbox")
        XCTAssertTrue(audio.segments.isEmpty)
    }

    func testTranslatedAudioWithSegments() {
        let segments = [
            MessageTranscriptionSegment(text: "Bonjour", startTime: 0.0, endTime: 0.8),
        ]

        let audio = MessageTranslatedAudio(
            id: "audio2",
            attachmentId: "att2",
            targetLanguage: "fr",
            url: "https://audio.test/fr2.mp3",
            transcription: "Bonjour",
            durationMs: 800,
            format: "mp3",
            cloned: true,
            quality: 0.92,
            ttsModel: "chatterbox",
            segments: segments
        )

        XCTAssertTrue(audio.cloned)
        XCTAssertEqual(audio.segments.count, 1)
        XCTAssertEqual(audio.segments.first?.text, "Bonjour")
    }
}
