import XCTest
import QuartzCore
@testable import MeeshyUI

/// Issue #11285 — la fabrique applique la plage qu'on lui remet, et les
/// plages nommées portent la cadence décidée (horloge 30/60, geste 60/120).
@MainActor
final class WeakDisplayLinkTargetTests: XCTestCase {

    func test_makeLink_withGestureRange_appliesItToTheLink() {
        let link = WeakDisplayLinkTarget.makeLink(frameRateRange: .gesture) { _ in }
        defer { link.invalidate() }
        XCTAssertEqual(link.preferredFrameRateRange.minimum, 60)
        XCTAssertEqual(link.preferredFrameRateRange.maximum, 120)
        XCTAssertEqual(link.preferredFrameRateRange.preferred, 120)
    }

    func test_makeLink_withClockRange_appliesItToTheLink() {
        let link = WeakDisplayLinkTarget.makeLink(frameRateRange: .clock) { _ in }
        defer { link.invalidate() }
        XCTAssertEqual(link.preferredFrameRateRange.minimum, 30)
        XCTAssertEqual(link.preferredFrameRateRange.maximum, 60)
        XCTAssertEqual(link.preferredFrameRateRange.preferred, 60)
    }

    func test_pinnedRange_withFps_pinsMinimumMaximumAndPreferredToFps() {
        let range = CAFrameRateRange.pinned(fps: 24)
        XCTAssertEqual(range.minimum, 24)
        XCTAssertEqual(range.maximum, 24)
        XCTAssertEqual(range.preferred, 24)
    }
}
