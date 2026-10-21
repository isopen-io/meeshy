import XCTest
import QuartzCore
@testable import MeeshyUI

/// #9874 - le display link du moteur a une plage : la tete de lecture n'a
/// jamais besoin de plus de 60 Hz (l'observateur AVPlayer tire a 1/60 s), un
/// ecran ProMotion ne doit pas la payer a 120 Hz.
@MainActor
final class StoryTimelineDriveClockTests: XCTestCase {

    func test_frameRateRange_isBoundedTo60() {
        let range = TimelineDriveClock.frameRateRange

        XCTAssertEqual(range.maximum, 60)
        XCTAssertEqual(range.preferred, 60)
        XCTAssertGreaterThanOrEqual(range.minimum, 24)
        XCTAssertLessThanOrEqual(range.minimum, range.maximum)
    }

    func test_makeLink_carriesTheRange() {
        let link = TimelineDriveClock.makeLink { _ in }
        defer { link.invalidate() }

        XCTAssertEqual(link.preferredFrameRateRange.maximum, TimelineDriveClock.frameRateRange.maximum)
        XCTAssertEqual(link.preferredFrameRateRange.preferred, TimelineDriveClock.frameRateRange.preferred)
    }
}
