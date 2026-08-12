import XCTest
@testable import MeeshySDK

final class CallTranscriptStoreTests: XCTestCase {

    private func makeTranscript(callId: String = "call-1", segments: [CallTranscriptSegment] = []) -> CallTranscript {
        CallTranscript(callId: callId, conversationId: "conv-1", callStartedAt: Date(timeIntervalSince1970: 0), segments: segments)
    }

    private func makeSegment(text: String, capturedAt: TimeInterval) -> CallTranscriptSegment {
        CallTranscriptSegment(speakerId: "user-1", speakerName: "Alice", isLocal: true, text: text, translatedText: nil, translatedLanguage: nil, capturedAt: Date(timeIntervalSince1970: capturedAt))
    }

    func test_saveMerging_thenTranscript_roundTrips() async {
        let transcript = makeTranscript(segments: [makeSegment(text: "Bonjour", capturedAt: 1)])
        await CallTranscriptStore.shared.saveMerging(transcript)
        let loaded = await CallTranscriptStore.shared.transcript(for: "call-1")
        XCTAssertEqual(loaded?.segments.map(\.text), ["Bonjour"])
        await CallTranscriptStore.shared.invalidate(for: "call-1")
    }

    func test_transcript_neverSaved_returnsNil() async {
        let loaded = await CallTranscriptStore.shared.transcript(for: "never-saved-call")
        XCTAssertNil(loaded)
    }

    func test_saveMerging_secondCall_mergesRatherThanOverwrites() async {
        let first = makeTranscript(segments: [makeSegment(text: "Part one", capturedAt: 1)])
        await CallTranscriptStore.shared.saveMerging(first)
        let second = makeTranscript(segments: [makeSegment(text: "Part two", capturedAt: 2)])
        await CallTranscriptStore.shared.saveMerging(second)
        let loaded = await CallTranscriptStore.shared.transcript(for: "call-1")
        XCTAssertEqual(loaded?.segments.map(\.text).sorted(), ["Part one", "Part two"])
        await CallTranscriptStore.shared.invalidate(for: "call-1")
    }

    func test_invalidate_clearsSavedEntry() async {
        await CallTranscriptStore.shared.saveMerging(makeTranscript())
        await CallTranscriptStore.shared.invalidate(for: "call-1")
        let loaded = await CallTranscriptStore.shared.transcript(for: "call-1")
        XCTAssertNil(loaded)
    }
}
