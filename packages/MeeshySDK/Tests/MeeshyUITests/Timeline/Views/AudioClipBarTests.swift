import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class AudioClipBarTests: XCTestCase {

    private func makeSUT(samples: [Float] = [0.1, 0.6, 0.3, 0.9], muted: Bool = false) -> AudioClipBar {
        AudioClipBar(
            clipId: "audio-1",
            title: "music_bg",
            startTime: 0,
            duration: 4,
            volume: 0.85,
            isMuted: muted,
            isSelected: false,
            isLocked: false,
            isDark: false,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            waveformSamples: samples,
            onTap: {},
            onDoubleTap: {},
            onLongPress: {},
            onMoveDelta: { _ in }
        )
    }

    func test_init_doesNotCrash() { _ = makeSUT().body }

    func test_accessibilityLabel_audioFormat() {
        XCTAssertTrue(makeSUT().accessibilityComposed.contains("music_bg"))
    }

    func test_mutedFlag_includedInValue() {
        XCTAssertTrue(makeSUT(muted: true).accessibilityValueDescription.lowercased().contains("muet"))
    }
}
