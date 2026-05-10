import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

// Box<T> is declared in StoryReaderContextTests.swift (same target) — no redeclaration needed.

@MainActor
final class StoryCanvasUIViewReaderContextTests: XCTestCase {

    func test_onCompletion_fires_whenCurrentTimeReachesEffectiveDuration() {
        let slide = makeStaticSlide(durationSeconds: 1.0)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)

        let exp = expectation(description: "completion fires once")
        let fireCount = Box(0)
        view.setReaderContext(StoryReaderContext(onCompletion: {
            fireCount.value += 1
            exp.fulfill()
        }))
        view.simulateTickAt(seconds: 1.05)  // > effectiveSlideDuration (1.0)

        wait(for: [exp], timeout: 1.0)
        XCTAssertEqual(fireCount.value, 1)
    }

    func test_onCompletion_doesNotFire_beforeEffectiveDuration() {
        let slide = makeStaticSlide(durationSeconds: 5.0)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)

        let fireCount = Box(0)
        view.setReaderContext(StoryReaderContext(onCompletion: { fireCount.value += 1 }))
        view.simulateTickAt(seconds: 2.0)
        XCTAssertEqual(fireCount.value, 0)
    }

    func test_onCompletion_resets_whenSetModePlayReplays() {
        let slide = makeStaticSlide(durationSeconds: 1.0)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)

        let fireCount = Box(0)
        view.setReaderContext(StoryReaderContext(onCompletion: { fireCount.value += 1 }))
        view.simulateTickAt(seconds: 1.05)   // first play — fires once
        view.setMode(.play, time: .zero)      // replay — resets completionFired
        view.simulateTickAt(seconds: 1.05)   // fires again
        XCTAssertEqual(fireCount.value, 2)
    }

    // MARK: - Helpers

    private func makeStaticSlide(durationSeconds: Double) -> StorySlide {
        StorySlide(
            id: "test-slide",
            effects: StoryEffects(textObjects: [StoryTextObject(id: "t1", text: "X")]),
            duration: durationSeconds
        )
    }
}
