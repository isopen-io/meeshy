import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class ClipInspectorTests: XCTestCase {

    private func makeClip(
        id: String = "clip-1",
        start: Float = 0.5,
        duration: Float = 5.0,
        volume: Float = 0.85,
        fadeIn: Float = 0.4,
        fadeOut: Float = 0.0,
        loop: Bool = false,
        background: Bool = true
    ) -> ClipInspector.ClipSnapshot {
        ClipInspector.ClipSnapshot(
            id: id,
            displayName: "intro.mp4",
            kind: .video,
            startTime: start,
            duration: duration,
            volume: volume,
            fadeInDuration: fadeIn,
            fadeOutDuration: fadeOut,
            isLooping: loop,
            isBackground: background
        )
    }

    func test_init_quickPresentation_doesNotCrash() {
        let view = ClipInspector(
            presentation: .sheet,
            clip: makeClip(),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        _ = view.body
    }

    func test_init_popoverPresentation_doesNotCrash() {
        let view = ClipInspector(
            presentation: .popover,
            clip: makeClip(),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        _ = view.body
    }

    func test_formattedStart_usesFractionalSeconds() {
        let formatted = ClipInspector.formatTime(seconds: 0.5)
        XCTAssertEqual(formatted, "0:00.500")
    }

    func test_formattedDuration_above60s_includesMinutes() {
        XCTAssertEqual(ClipInspector.formatTime(seconds: 65.25), "1:05.250")
    }

    func test_volumeChanged_invokesCallback() {
        var captured: Float?
        let inspector = ClipInspector(
            presentation: .sheet,
            clip: makeClip(volume: 0.5),
            onVolumeChanged: { captured = $0 },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        inspector.simulateVolumeCommit(value: 0.72)
        XCTAssertEqual(captured ?? -1, 0.72, accuracy: 0.001)
    }

    func test_fadeBounds_areClampedTo0to3() {
        XCTAssertEqual(ClipInspector.fadeRange.lowerBound, 0)
        XCTAssertEqual(ClipInspector.fadeRange.upperBound, 3)
    }
}
