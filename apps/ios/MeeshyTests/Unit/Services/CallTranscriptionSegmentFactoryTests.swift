import XCTest
@testable import Meeshy

/// La fabrique des segments du journal de sous-titres (#11522) : le texte reste
/// l'original, la date est celle de la capture.
@MainActor
final class CallTranscriptionSegmentFactoryTests: XCTestCase {

    func test_makeTranscriptionSegment_keepsOriginalText_separateFromTranslation() throws {
        let json = """
        {
            "callId": "call-1",
            "segment": {
                "text": "Bonjour",
                "translatedText": "Hello",
                "speakerId": "user-1",
                "startMs": 0,
                "endMs": 1500,
                "isFinal": true,
                "sourceLanguage": "fr",
                "targetLanguage": "en",
                "confidence": 0.95
            }
        }
        """.data(using: .utf8)!
        let event = try JSONDecoder().decode(CallTranslatedSegmentData.self, from: json)

        let segment = CallTranscriptionSegmentFactory.makeTranscriptionSegment(from: event)

        XCTAssertEqual(segment.text, "Bonjour", "text must stay the ORIGINAL — never overwritten by the translation")
        XCTAssertEqual(segment.translatedText, "Hello")
        XCTAssertEqual(segment.translatedLanguage, "en")
        XCTAssertEqual(segment.speakerId, "user-1")
        XCTAssertEqual(segment.startTime, 0)
        XCTAssertEqual(segment.endTime, 1.5)
        XCTAssertTrue(segment.isFinal)
        XCTAssertEqual(segment.confidence, 0.95, accuracy: 0.001)
        XCTAssertEqual(segment.language, "fr",
                       "language is the TRANSCRIPTION language tag (sourceLanguage) — the translation carries its own in translatedLanguage")
        XCTAssertEqual(segment.capturedAt.timeIntervalSinceNow, 0, accuracy: 2.0,
                        "without a wire capturedAtMs (legacy gateway), capturedAt falls back to receipt time")
    }

    func test_makeTranscriptionSegment_mapsJournalMetadata_idDisplayNameCapturedAt() throws {
        let json = """
        {
            "callId": "call-1",
            "segment": {
                "id": "f81d4fae-7dec-4b57-b93a-2c675ddac001",
                "text": "Bonjour",
                "translatedText": "Hello",
                "speakerId": "user-1",
                "speakerDisplayName": "Alice Doe",
                "startMs": 0,
                "endMs": 1500,
                "isFinal": true,
                "sourceLanguage": "fr",
                "targetLanguage": "en",
                "confidence": 0.95,
                "capturedAtMs": 1765650000000
            }
        }
        """.data(using: .utf8)!
        let event = try JSONDecoder().decode(CallTranslatedSegmentData.self, from: json)

        let segment = CallTranscriptionSegmentFactory.makeTranscriptionSegment(from: event)

        XCTAssertEqual(segment.wireId, "f81d4fae-7dec-4b57-b93a-2c675ddac001",
                       "wireId is the cross-transport merge key — must survive the mapping")
        XCTAssertEqual(segment.speakerDisplayName, "Alice Doe")
        XCTAssertEqual(segment.capturedAt, Date(timeIntervalSince1970: 1_765_650_000),
                       "capturedAt must come from the wire capturedAtMs (capture wall clock), not receipt time")
    }

    func test_makeTranscriptionSegment_fromDataChannelEntry_mapsJournalFields() {
        let entry = DataChannelTranscriptEntry(
            id: "entry-1", callId: "call-1", speakerId: "user-2",
            speakerDisplayName: "Bob", text: "Hola", language: "es",
            capturedAtMs: 1_765_650_000_000, isFinal: true, confidence: 0.9
        )

        let segment = CallTranscriptionSegmentFactory.makeTranscriptionSegment(from: entry)

        XCTAssertEqual(segment.wireId, "entry-1")
        XCTAssertEqual(segment.speakerId, "user-2")
        XCTAssertEqual(segment.speakerDisplayName, "Bob")
        XCTAssertEqual(segment.text, "Hola")
        XCTAssertEqual(segment.language, "es", "the transcription language tag rides the data channel too")
        XCTAssertEqual(segment.capturedAt, Date(timeIntervalSince1970: 1_765_650_000))
        XCTAssertTrue(segment.isFinal)
        XCTAssertNil(segment.translatedText, "the P2P path carries the original only — translation arrives via the server relay and merges by wireId")
    }

    func test_makeTranscriptionSegment_fromDataChannelEntry_emptyDisplayNameBecomesNil() {
        let entry = DataChannelTranscriptEntry(
            id: "entry-2", callId: "call-1", speakerId: "user-2",
            speakerDisplayName: "", text: "Hola", language: "es",
            capturedAtMs: 1_765_650_000_000, isFinal: true, confidence: 0.9
        )

        let segment = CallTranscriptionSegmentFactory.makeTranscriptionSegment(from: entry)

        XCTAssertNil(segment.speakerDisplayName,
                     "an empty declared name must not shadow the receiver's local roster fallback")
    }

    func test_makeTranscriptionSegment_withoutTranslation_translatedFieldsAreNil() throws {
        let json = """
        {
            "callId": "call-1",
            "segment": {
                "text": "Bonjour",
                "speakerId": "user-1",
                "startMs": 0,
                "endMs": 1000,
                "isFinal": true,
                "sourceLanguage": "fr",
                "targetLanguage": "fr",
                "confidence": 0.9
            }
        }
        """.data(using: .utf8)!
        let event = try JSONDecoder().decode(CallTranslatedSegmentData.self, from: json)

        let segment = CallTranscriptionSegmentFactory.makeTranscriptionSegment(from: event)

        XCTAssertEqual(segment.text, "Bonjour")
        XCTAssertNil(segment.translatedText)
        XCTAssertNil(segment.translatedLanguage)
    }
}
