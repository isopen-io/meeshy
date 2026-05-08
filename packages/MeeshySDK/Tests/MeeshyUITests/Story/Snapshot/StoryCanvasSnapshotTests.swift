import XCTest
import UIKit
import CoreMedia
@testable import MeeshyUI

@MainActor
final class StoryCanvasSnapshotTests: XCTestCase {

    func test_snapshot_complexSlide_iPhone16Pro_t0s() {
        let view = StoryCanvasUIView(slide: StoryFixtures.complexSlide(), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.setMode(.play, time: .zero)

        let image = view.snapshot()
        // Compare against baseline (will record on first run)
        assertSnapshot(image, named: "complexSlide_iPhone16Pro_t0s")
    }

    func test_snapshot_complexSlide_iPadProM2_t0s() {
        let view = StoryCanvasUIView(slide: StoryFixtures.complexSlide(), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 820, height: 1456)
        view.setMode(.play, time: .zero)

        let image = view.snapshot()
        assertSnapshot(image, named: "complexSlide_iPadProM2_t0s")
    }

    // Stub helpers — will be implemented in P2
    private func assertSnapshot(_ image: UIImage, named: String) {
        // Placeholder until snapshot lib chosen
        XCTFail("Snapshot infrastructure not yet implemented (P2)")
    }
}

extension StoryCanvasUIView {
    func snapshot() -> UIImage {
        UIGraphicsImageRenderer(size: bounds.size).image { _ in
            drawHierarchy(in: bounds, afterScreenUpdates: true)
        }
    }
}
