import XCTest
import UIKit
import CoreMedia
@testable import MeeshyUI

@MainActor
final class StoryCanvasSnapshotTests: XCTestCase {

    func test_snapshot_complexSlide_iPhone16Pro_t0s() throws {
        // Renderer + canvas land in Phase 2; baseline image comparison waits on
        // pointfreeco/swift-snapshot-testing wiring scheduled for Phase 3.
        try XCTSkipIf(true, "Snapshot infrastructure deferred to Phase 3")
        let view = StoryCanvasUIView(slide: StoryFixtures.complexSlide(), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.setMode(.play, time: .zero)
        _ = view.snapshot()
    }

    func test_snapshot_complexSlide_iPadProM2_t0s() throws {
        try XCTSkipIf(true, "Snapshot infrastructure deferred to Phase 3")
        let view = StoryCanvasUIView(slide: StoryFixtures.complexSlide(), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 820, height: 1456)
        view.setMode(.play, time: .zero)
        _ = view.snapshot()
    }
}

extension StoryCanvasUIView {
    func snapshot() -> UIImage {
        UIGraphicsImageRenderer(size: bounds.size).image { _ in
            drawHierarchy(in: bounds, afterScreenUpdates: true)
        }
    }
}
