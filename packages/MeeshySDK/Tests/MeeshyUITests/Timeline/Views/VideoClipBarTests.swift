import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class VideoClipBarTests: XCTestCase {

    private func makeSUT(
        isSelected: Bool = false,
        fadeIn: Float = 0,
        fadeOut: Float = 0,
        isLocked: Bool = false
    ) -> VideoClipBar {
        VideoClipBar(
            clipId: "clip-1",
            title: "intro.mp4",
            startTime: 1.0,
            duration: 4.0,
            fadeIn: fadeIn,
            fadeOut: fadeOut,
            isSelected: isSelected,
            isLocked: isLocked,
            isDark: false,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            frames: [],
            onTap: {},
            onDoubleTap: {},
            onLongPress: {},
            onTrimStartDelta: { _ in },
            onTrimEndDelta: { _ in },
            onMoveDelta: { _ in }
        )
    }

    func test_init_doesNotCrash() {
        _ = makeSUT().body
    }

    func test_accessibilityLabel_videoFormat() {
        let sut = makeSUT()
        XCTAssertTrue(sut.accessibilityComposed.contains("intro.mp4"))
    }

    func test_widthMatchesDuration_atZoom1x() {
        // duration = 4 → 4 * 50 = 200 pt
        let sut = makeSUT()
        XCTAssertEqual(sut.geometry.width(for: 4), 200, accuracy: 0.001)
    }
}
