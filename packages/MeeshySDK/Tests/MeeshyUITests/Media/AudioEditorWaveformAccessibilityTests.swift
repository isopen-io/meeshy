import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class AudioEditorWaveformAccessibilityTests: XCTestCase {

    private func waveform(progress: Double = 0.5,
                          selection: AudioEditorWaveform.Selection? = nil) -> AudioEditorWaveform {
        AudioEditorWaveform(samples: [], progress: progress, accent: .blue, isDark: false,
                            selection: selection,
                            onScrub: { _ in }, onScrubEnded: {},
                            onSelectionStart: { _ in }, onSelectionEnd: { _ in })
    }

    func test_scrub_increment_from0_50_targets0_51() {
        XCTAssertEqual(waveform(progress: 0.5).scrubAdjustment(.increment), 0.51)
    }

    func test_scrub_atEnd_returnsNil() {
        XCTAssertNil(waveform(progress: 1).scrubAdjustment(.increment))
        XCTAssertNil(waveform(progress: 0).scrubAdjustment(.decrement))
    }

    func test_startHandle_decrement_from0_20_targets0_19() {
        let selection = AudioEditorWaveform.Selection(start: 0.2, end: 0.8, isRemoval: false)
        XCTAssertEqual(waveform(selection: selection).selectionStartAdjustment(.decrement), 0.19)
    }

    func test_endHandle_increment_from0_80_targets0_81() {
        let selection = AudioEditorWaveform.Selection(start: 0.2, end: 0.8, isRemoval: true)
        XCTAssertEqual(waveform(selection: selection).selectionEndAdjustment(.increment), 0.81)
    }

    func test_selectionAdjustments_withoutSelection_areNil() {
        XCTAssertNil(waveform().selectionStartAdjustment(.increment))
        XCTAssertNil(waveform().selectionEndAdjustment(.increment))
    }

    func test_removalLabels_differFromTrimLabels() {
        for edge in [AudioEditorWaveform.HandleEdge.start, .end] {
            let trim = AudioEditorWaveform.handleLabel(edge: edge, isRemoval: false)
            let cut = AudioEditorWaveform.handleLabel(edge: edge, isRemoval: true)
            XCTAssertNotEqual(trim, cut)
            XCTAssertFalse(trim.hasPrefix("audio."))
            XCTAssertFalse(cut.hasPrefix("audio."))
        }
        XCTAssertFalse(AudioEditorWaveform.playheadLabel.hasPrefix("audio.editor"))
    }
}
