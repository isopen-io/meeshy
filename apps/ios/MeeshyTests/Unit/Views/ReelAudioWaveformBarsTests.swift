import XCTest
import SwiftUI
@testable import Meeshy

/// #9702 — la waveform d'un réel audio animait `phase` en `repeatForever`, mais
/// les hauteurs étaient CALCULÉES dans le corps : SwiftUI n'interpolait que la
/// hauteur de départ et celle d'arrivée, et `|sin(x + π)| == |sin(x)|` — les
/// barres ne bougeaient pas. La forme déclare désormais `phase` animable.
@MainActor
final class ReelAudioWaveformBarsTests: XCTestCase {

    func test_inactive_barsRestOnTheirBaseHeight() {
        for i in 0..<ReelAudioWaveformBars.barCount {
            XCTAssertEqual(ReelAudioWaveformBars.barHeight(index: i, phase: 1, isActive: false),
                           ReelAudioWaveformBars.baseHeight)
        }
    }

    func test_active_heightFollowsTheSineOfPhaseAndIndex() {
        let expected = ReelAudioWaveformBars.baseHeight + ReelAudioWaveformBars.amplitude * abs(sin(1.5))
        XCTAssertEqual(ReelAudioWaveformBars.barHeight(index: 3, phase: 0, isActive: true),
                       expected, accuracy: 0.0001)
    }

    func test_phaseIsAnimatable() {
        var bars = ReelAudioWaveformBars(phase: 0, isActive: true)
        bars.animatableData = 1.2
        XCTAssertEqual(bars.phase, 1.2, accuracy: 0.0001)
    }

    func test_midwayPhase_movesTheBars_soTheLoopIsVisible() {
        let start = ReelAudioWaveformBars.barHeight(index: 0, phase: 0, isActive: true)
        let midway = ReelAudioWaveformBars.barHeight(index: 0, phase: .pi / 2, isActive: true)
        XCTAssertGreaterThan(midway - start, 40)
    }

    func test_loopIsSeamless_heightsAtZeroAndPiMatch() {
        for i in 0..<ReelAudioWaveformBars.barCount {
            XCTAssertEqual(ReelAudioWaveformBars.barHeight(index: i, phase: 0, isActive: true),
                           ReelAudioWaveformBars.barHeight(index: i, phase: .pi, isActive: true),
                           accuracy: 0.0001)
        }
    }

    func test_path_drawsOneBarPerSlot_centeredInTheRect() {
        let rect = CGRect(x: 0, y: 0, width: 300, height: 120)
        let bounds = ReelAudioWaveformBars(phase: 0, isActive: false).path(in: rect).boundingRect
        let count = CGFloat(ReelAudioWaveformBars.barCount)
        let width = count * ReelAudioWaveformBars.barWidth + (count - 1) * ReelAudioWaveformBars.barSpacing
        XCTAssertEqual(bounds.width, width, accuracy: 0.01)
        XCTAssertEqual(bounds.midX, rect.midX, accuracy: 0.01)
        XCTAssertEqual(bounds.height, ReelAudioWaveformBars.baseHeight, accuracy: 0.01)
    }
}
