import XCTest
@testable import MeeshySDK

/// Point 51: TranscriptionReadyEvent and TranslationEvent additional edge case tests
final class TranscriptionTranslationEventTests: XCTestCase {

    private let decoder = JSONDecoder()

    // MARK: - TranscriptionReadyEvent: minimal (no segments, no optional fields)

    func test_transcriptionReadyEvent_minimalTranscription() throws {
        let json = """
        {
            "messageId": "msg1",
            "attachmentId": "att1",
            "conversationId": "conv1",
            "transcription": {
                "text": "Bonjour",
                "language": "fr"
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(TranscriptionReadyEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg1")
        XCTAssertEqual(event.attachmentId, "att1")
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertNil(event.processingTimeMs)
        XCTAssertEqual(event.transcription.text, "Bonjour")
        XCTAssertEqual(event.transcription.language, "fr")
        XCTAssertNil(event.transcription.id)
        XCTAssertNil(event.transcription.confidence)
        XCTAssertNil(event.transcription.durationMs)
        XCTAssertNil(event.transcription.segments)
        XCTAssertNil(event.transcription.speakerCount)
    }

    func test_transcriptionReadyEvent_emptySegmentsArray() throws {
        let json = """
        {
            "messageId": "msg2",
            "attachmentId": "att2",
            "conversationId": "conv2",
            "transcription": {
                "text": "Hello",
                "language": "en",
                "segments": []
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(TranscriptionReadyEvent.self, from: json)
        XCTAssertEqual(event.transcription.segments?.count, 0)
    }

    func test_transcriptionReadyEvent_multiSpeaker() throws {
        let json = """
        {
            "messageId": "msg3",
            "attachmentId": "att3",
            "conversationId": "conv3",
            "transcription": {
                "id": "tr3",
                "text": "Speaker A says hello. Speaker B says bye.",
                "language": "en",
                "confidence": 0.88,
                "durationMs": 5000,
                "speakerCount": 2,
                "segments": [
                    {"text": "Speaker A says hello.", "startTime": 0.0, "endTime": 2.5, "speakerId": "spk_a"},
                    {"text": "Speaker B says bye.", "startTime": 2.6, "endTime": 5.0, "speakerId": "spk_b", "voiceSimilarityScore": 0.75}
                ]
            },
            "processingTimeMs": 800
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(TranscriptionReadyEvent.self, from: json)
        XCTAssertEqual(event.transcription.speakerCount, 2)
        XCTAssertEqual(event.transcription.segments?.count, 2)
        XCTAssertEqual(event.transcription.segments?[0].speakerId, "spk_a")
        XCTAssertNil(event.transcription.segments?[0].voiceSimilarityScore)
        XCTAssertEqual(event.transcription.segments?[1].speakerId, "spk_b")
        XCTAssertEqual(event.transcription.segments?[1].voiceSimilarityScore, 0.75)
        XCTAssertEqual(event.processingTimeMs, 800)
    }

    func test_transcriptionSegment_bothStartMsAndStartTime_prefersMs() throws {
        let json = """
        {
            "text": "Test",
            "startMs": 2000,
            "endMs": 4000
        }
        """.data(using: .utf8)!

        let segment = try decoder.decode(TranscriptionSegment.self, from: json)
        XCTAssertEqual(segment.startTime ?? 0, 2.0, accuracy: 0.001)
        XCTAssertEqual(segment.endTime ?? 0, 4.0, accuracy: 0.001)
    }

    func test_transcriptionSegment_noTimeFields() throws {
        let json = """
        {"text": "Orphan segment"}
        """.data(using: .utf8)!

        let segment = try decoder.decode(TranscriptionSegment.self, from: json)
        XCTAssertEqual(segment.text, "Orphan segment")
        XCTAssertNil(segment.startTime)
        XCTAssertNil(segment.endTime)
        XCTAssertNil(segment.speakerId)
        XCTAssertNil(segment.voiceSimilarityScore)
    }

    // MARK: - TranslationEvent edge cases

    func test_translationEvent_emptyTranslationsArray() throws {
        let json = """
        {"messageId": "msg1", "translations": []}
        """.data(using: .utf8)!

        let event = try decoder.decode(TranslationEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg1")
        XCTAssertTrue(event.translations.isEmpty)
    }

    func test_translationEvent_singleTranslation() throws {
        let json = """
        {
            "messageId": "msg2",
            "translations": [
                {
                    "id": "t1",
                    "messageId": "msg2",
                    "sourceLanguage": "fr",
                    "targetLanguage": "en",
                    "translatedContent": "Hello world",
                    "translationModel": "nllb-200",
                    "confidenceScore": 0.99
                }
            ]
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(TranslationEvent.self, from: json)
        XCTAssertEqual(event.translations.count, 1)
        XCTAssertEqual(event.translations[0].sourceLanguage, "fr")
        XCTAssertEqual(event.translations[0].targetLanguage, "en")
        XCTAssertEqual(event.translations[0].confidenceScore, 0.99)
    }

    func test_translationData_withNilConfidenceScore() throws {
        let json = """
        {
            "id": "t1",
            "messageId": "msg1",
            "sourceLanguage": "en",
            "targetLanguage": "ar",
            "translatedContent": "test content",
            "translationModel": "nllb-200",
            "confidenceScore": null
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(TranslationData.self, from: json)
        XCTAssertNil(data.confidenceScore)
        XCTAssertEqual(data.targetLanguage, "ar")
    }

    func test_translationEvent_multipleLanguages() throws {
        let json = """
        {
            "messageId": "msg5",
            "translations": [
                {"id": "t1", "messageId": "msg5", "sourceLanguage": "en", "targetLanguage": "fr", "translatedContent": "Bonjour", "translationModel": "nllb-200", "confidenceScore": 0.95},
                {"id": "t2", "messageId": "msg5", "sourceLanguage": "en", "targetLanguage": "es", "translatedContent": "Hola", "translationModel": "nllb-200", "confidenceScore": 0.93},
                {"id": "t3", "messageId": "msg5", "sourceLanguage": "en", "targetLanguage": "de", "translatedContent": "Hallo", "translationModel": "nllb-200", "confidenceScore": 0.91}
            ]
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(TranslationEvent.self, from: json)
        XCTAssertEqual(event.translations.count, 3)
        let languages = event.translations.map(\.targetLanguage)
        XCTAssertEqual(languages, ["fr", "es", "de"])
    }

    // MARK: - TranscriptionData standalone

    func test_transcriptionData_fullDecode() throws {
        let json = """
        {
            "id": "td1",
            "text": "Full transcription text",
            "language": "ja",
            "confidence": 0.72,
            "durationMs": 10000,
            "speakerCount": 3,
            "segments": [
                {"text": "Part 1", "startTime": 0, "endTime": 3.5}
            ]
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(TranscriptionData.self, from: json)
        XCTAssertEqual(data.id, "td1")
        XCTAssertEqual(data.language, "ja")
        XCTAssertEqual(data.confidence, 0.72)
        XCTAssertEqual(data.durationMs, 10000)
        XCTAssertEqual(data.speakerCount, 3)
        XCTAssertEqual(data.segments?.count, 1)
    }
}
