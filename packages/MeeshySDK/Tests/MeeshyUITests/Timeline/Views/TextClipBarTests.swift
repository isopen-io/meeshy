import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TextClipBarTests: XCTestCase {

    private func makeSUT(text: String = "Bienvenue") -> TextClipBar {
        TextClipBar(
            clipId: "text-1",
            content: text,
            startTime: 1.0,
            duration: 3.0,
            isSelected: false,
            isLocked: false,
            isDark: false,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            onTap: {},
            onDoubleTap: {},
            onLongPress: {},
            onMoveDelta: { _ in }
        )
    }

    func test_init_doesNotCrash() { _ = makeSUT().body }

    func test_accessibilityLabel_includesContent() {
        XCTAssertTrue(makeSUT().accessibilityComposed.contains("Bienvenue"))
    }

    func test_truncatesPreviewBeyond40Chars() {
        let long = String(repeating: "a", count: 80)
        let preview = TextClipBar.previewSnippet(long, maxLength: 40)
        XCTAssertEqual(preview.count, 40)
    }
}
