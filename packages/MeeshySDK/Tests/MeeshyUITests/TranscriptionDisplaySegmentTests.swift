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

    // MARK: - Identité des mots affichés (#10574)

    /// Un segment d'affichage reçoit un `UUID()` neuf à chaque construction, et
    /// les lecteurs les reconstruisent à chaque tick de lecture : une boucle
    /// indexée par cet identifiant détruit et refait chaque mot à chaque image
    /// (83 % de processeur mesurés sur iPhone le 2026-10-14, `FlowLayout` en tête).
    func test_transcriptionLoops_keyWordsByPosition_notByRebuiltIdentity() throws {
        let media = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Media")

        for file in ["MediaTranscriptionView.swift", "AudioPlayerView+Transcription.swift"] {
            let source = try String(contentsOf: media.appendingPathComponent(file), encoding: .utf8)
            XCTAssertFalse(source.contains("id: \\.element.id"), "\(file) indexe ses mots par une identité refaite à chaque passe")
            XCTAssertTrue(
                source.contains("ForEach(Array(segments.enumerated()), id: \\.offset)")
                    || source.contains("AsyncRenderRow(id: index, content: segmentSpan(segment, index: index)"),
                file
            )
        }
    }

    func test_rebuiltSegments_neverShareAnIdentity() {
        let source = [MessageTranscriptionSegment(text: "a", startTime: 0, endTime: 1)]

        XCTAssertNotEqual(
            TranscriptionDisplaySegment.buildFrom(segments: source).first?.id,
            TranscriptionDisplaySegment.buildFrom(segments: source).first?.id
        )
    }
}
