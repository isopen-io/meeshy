import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TranscriptionDisplaySegmentTests: XCTestCase {

    // MARK: - buildFrom(segments:)

    func test_buildFrom_allEmptySegments_returnsEmpty() {
        let segments = [
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0),
            MessageTranscriptionSegment(text: "   ", startTime: 0, endTime: 0),
            MessageTranscriptionSegment(text: "\n", startTime: 0, endTime: 0),
        ]
        let result = TranscriptionDisplaySegment.buildFrom(segments: segments)
        XCTAssertTrue(result.isEmpty)
    }

    func test_buildFrom_mixedSegments_keepsOnlyNonEmpty() {
        let segments = [
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 100),
            MessageTranscriptionSegment(text: "bonjour", startTime: 100, endTime: 900),
            MessageTranscriptionSegment(text: "  ", startTime: 900, endTime: 1000),
            MessageTranscriptionSegment(text: "monde", startTime: 1000, endTime: 1800),
        ]
        let result = TranscriptionDisplaySegment.buildFrom(segments: segments)
        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result.map { $0.text }, ["bonjour", "monde"])
    }

    func test_buildFrom_allNonEmpty_keepsAll() {
        let segments = [
            MessageTranscriptionSegment(text: "a", startTime: 0, endTime: 1),
            MessageTranscriptionSegment(text: "b", startTime: 1, endTime: 2),
        ]
        let result = TranscriptionDisplaySegment.buildFrom(segments: segments)
        XCTAssertEqual(result.count, 2)
    }
}
