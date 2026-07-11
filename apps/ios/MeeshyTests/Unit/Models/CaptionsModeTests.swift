import XCTest
@testable import Meeshy

@MainActor
final class CaptionsModeTests: XCTestCase {

    // MARK: - next (the cycle)

    func test_next_off_returnsTranslated() {
        XCTAssertEqual(CaptionsMode.off.next, .translated)
    }

    func test_next_translated_returnsOriginal() {
        XCTAssertEqual(CaptionsMode.translated.next, .original)
    }

    func test_next_original_returnsOff() {
        XCTAssertEqual(CaptionsMode.original.next, .off)
    }

    func test_next_fullCycle_returnsToStart() {
        var mode = CaptionsMode.off
        mode = mode.next
        mode = mode.next
        mode = mode.next
        XCTAssertEqual(mode, .off)
    }

    // MARK: - init(isTranscribing:showOriginalText:)

    func test_init_notTranscribing_ignoresShowOriginalText_returnsOff() {
        XCTAssertEqual(CaptionsMode(isTranscribing: false, showOriginalText: false), .off)
    }

    func test_init_notTranscribing_evenWithShowOriginalTextTrue_returnsOff() {
        // The isTranscribing guard takes priority — a stale showOriginalText=true left
        // over from a previous session must never surface .original while captions are off.
        XCTAssertEqual(CaptionsMode(isTranscribing: false, showOriginalText: true), .off)
    }

    func test_init_transcribing_showOriginalTextFalse_returnsTranslated() {
        XCTAssertEqual(CaptionsMode(isTranscribing: true, showOriginalText: false), .translated)
    }

    func test_init_transcribing_showOriginalTextTrue_returnsOriginal() {
        XCTAssertEqual(CaptionsMode(isTranscribing: true, showOriginalText: true), .original)
    }
}
