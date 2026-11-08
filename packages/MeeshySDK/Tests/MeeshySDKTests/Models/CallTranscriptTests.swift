import Testing
import Foundation
@testable import MeeshySDK

struct CallTranscriptTests {

    private func makeSegment(speakerId: String = "user-1", isLocal: Bool = true) -> CallTranscriptSegment {
        CallTranscriptSegment(
            speakerId: speakerId,
            speakerName: "Alice",
            isLocal: isLocal,
            text: "Bonjour",
            translatedText: "Hello",
            translatedLanguage: "en",
            capturedAt: Date(timeIntervalSince1970: 1_000)
        )
    }

    @Test func id_equalsCallId() {
        let transcript = CallTranscript(
            callId: "call-1", conversationId: "conv-1",
            callStartedAt: Date(timeIntervalSince1970: 0), segments: [makeSegment()]
        )
        #expect(transcript.id == "call-1")
    }

    @Test func codable_roundTrips() throws {
        let original = CallTranscript(
            callId: "call-1", conversationId: "conv-1",
            callStartedAt: Date(timeIntervalSince1970: 0),
            segments: [makeSegment(speakerId: "user-1", isLocal: true), makeSegment(speakerId: "user-2", isLocal: false)]
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallTranscript.self, from: data)
        #expect(decoded == original)
    }

    @Test func codable_roundTrips_withCaptures() throws {
        let original = CallTranscript(
            callId: "call-1", conversationId: "conv-1",
            callStartedAt: Date(timeIntervalSince1970: 0),
            segments: [makeSegment()],
            captures: [CallTranscriptCapture(id: "cap-1", userId: "user-2", displayName: "Awa", kind: .recording, capturedAt: Date(timeIntervalSince1970: 5))]
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallTranscript.self, from: data)
        #expect(decoded == original)
    }

    @Test func decodes_aTranscriptKeptBeforeCaptures_withNoCapture() throws {
        let legacy = #"{"callId":"call-1","conversationId":"conv-1","callStartedAt":0,"segments":[]}"#
        let decoded = try JSONDecoder().decode(CallTranscript.self, from: Data(legacy.utf8))
        #expect(decoded.captures.isEmpty)
    }

    @Test func captureKind_wireValues_areTheGatewayOnes() {
        #expect(CallTranscriptCaptureKind.allCases.map(\.rawValue) == ["screenshot", "recording", "call-recording-started", "call-recording-stopped"])
        #expect(CallTranscriptCaptureKind.screenshot.namesCapturer)
        #expect(!CallTranscriptCaptureKind.callRecordingStopped.namesCapturer)
    }

    @Test func segment_codable_roundTrips_withNilTranslation() throws {
        let original = CallTranscriptSegment(
            speakerId: "user-1", speakerName: "Alice", isLocal: true,
            text: "Bonjour", translatedText: nil, translatedLanguage: nil,
            capturedAt: Date(timeIntervalSince1970: 0)
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallTranscriptSegment.self, from: data)
        #expect(decoded == original)
    }
}
