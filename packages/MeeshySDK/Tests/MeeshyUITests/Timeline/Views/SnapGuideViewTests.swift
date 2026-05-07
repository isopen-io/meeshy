import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class SnapGuideViewTests: XCTestCase {

    func test_init_doesNotCrash() {
        let view = SnapGuideView(x: 100, height: 200, label: "PLAYHEAD 4.250s",
                                 isVisible: true, reducedMotion: false)
        _ = view.body
    }

    func test_snapColor_isMagenta() {
        XCTAssertEqual(SnapGuideView.snapColorHex, "EC4899",
                       "Snap color is documented as magenta exception in spec annex I")
    }
}
