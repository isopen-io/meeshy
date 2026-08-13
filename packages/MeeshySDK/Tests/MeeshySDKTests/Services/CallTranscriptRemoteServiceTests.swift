import XCTest
@testable import MeeshySDK

/// CallTranscriptRemoteService — replay du journal de transcription persisté
/// côté gateway (décision produit 2026-08-13 : le transcript survit à la
/// suppression de l'app et de ses caches locaux). Atome réseau typé : GET
/// `/calls/:callId/transcript`, décodage du DTO — la cascade locale/distante
/// est app-side.
final class CallTranscriptRemoteServiceTests: XCTestCase {

    private func makeTranscript(segments: [APICallTranscriptSegment] = []) -> APICallTranscript {
        APICallTranscript(
            callId: "call-1",
            conversationId: "conv-1",
            callStartedAt: Date(timeIntervalSince1970: 1_765_650_000),
            segments: segments
        )
    }

    func test_transcript_requestsTheTranscriptEndpoint() async throws {
        let mock = MockAPIClient()
        mock.stub("/calls/call-1/transcript", result: APIResponse(
            success: true, data: makeTranscript(), error: nil
        ))
        let service = CallTranscriptRemoteService(api: mock)

        _ = try await service.transcript(callId: "call-1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/calls/call-1/transcript")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_transcript_returnsDecodedSegments() async throws {
        let mock = MockAPIClient()
        let segment = APICallTranscriptSegment(
            id: "seg-1",
            speakerId: "user-2",
            speakerDisplayName: "Alice Doe",
            text: "Bonjour le monde.",
            language: "fr",
            confidence: 0.95,
            capturedAtMs: 1_765_650_000_000,
            translations: [APICallTranscriptTranslation(targetLanguage: "en", translatedText: "Hello world.")]
        )
        mock.stub("/calls/call-1/transcript", result: APIResponse(
            success: true, data: makeTranscript(segments: [segment]), error: nil
        ))
        let service = CallTranscriptRemoteService(api: mock)

        let transcript = try await service.transcript(callId: "call-1")

        XCTAssertEqual(transcript.segments.count, 1)
        XCTAssertEqual(transcript.segments.first?.text, "Bonjour le monde.")
        XCTAssertEqual(transcript.segments.first?.language, "fr", "the transcription language tag survives the round trip")
        XCTAssertEqual(transcript.segments.first?.translations.first?.targetLanguage, "en")
    }

    func test_transcriptDTO_decodesFromGatewayJSON() throws {
        let json = """
        {
            "callId": "507f1f77bcf86cd799439011",
            "conversationId": "507f1f77bcf86cd799439099",
            "callStartedAt": "2026-08-13T14:20:00.000Z",
            "segments": [
                {
                    "id": "f81d4fae-7dec-4b57-b93a-2c675ddac001",
                    "speakerId": "user-2",
                    "speakerDisplayName": "Alice Doe",
                    "text": "Bonjour",
                    "language": "fr",
                    "confidence": 0.9,
                    "capturedAtMs": 1765650000000,
                    "translations": [
                        {"targetLanguage": "en", "translatedText": "Hello"}
                    ]
                },
                {
                    "id": "row-legacy",
                    "speakerId": "user-3",
                    "speakerDisplayName": null,
                    "text": "Salut",
                    "language": "fr",
                    "confidence": null,
                    "capturedAtMs": 1765650001000,
                    "translations": []
                }
            ]
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { d in
            let value = try d.singleValueContainer().decode(String.self)
            guard let date = formatter.date(from: value) else {
                throw DecodingError.dataCorrupted(.init(codingPath: d.codingPath, debugDescription: "bad date"))
            }
            return date
        }

        let transcript = try decoder.decode(APICallTranscript.self, from: json)
        XCTAssertEqual(transcript.segments.count, 2)
        XCTAssertNil(transcript.segments[1].speakerDisplayName)
        XCTAssertNil(transcript.segments[1].confidence)
        XCTAssertTrue(transcript.segments[1].translations.isEmpty)
    }
}
