import XCTest
@testable import MeeshyUI

final class MeeshyVideoPlayerControlSetTests: XCTestCase {

    func test_inlineDefault_includesSpeed() {
        XCTAssertTrue(MeeshyVideoPlayer.ControlSet.inlineDefault.contains(.speed))
    }

    func test_inlineDefault_includesExpand() {
        XCTAssertTrue(MeeshyVideoPlayer.ControlSet.inlineDefault.contains(.expand))
    }

    func test_fullscreenDefault_includesNewFullscreenControls() {
        let fs = MeeshyVideoPlayer.ControlSet.fullscreenDefault
        XCTAssertTrue(fs.contains(.mute))
        XCTAssertTrue(fs.contains(.airplay))
        XCTAssertTrue(fs.contains(.pip))
        XCTAssertTrue(fs.contains(.loop))
    }

    func test_fullscreenDefault_preservesExistingControls() {
        let fs = MeeshyVideoPlayer.ControlSet.fullscreenDefault
        XCTAssertTrue(fs.contains(.playPause))
        XCTAssertTrue(fs.contains(.scrubber))
        XCTAssertTrue(fs.contains(.duration))
        XCTAssertTrue(fs.contains(.save))
        XCTAssertTrue(fs.contains(.share))
        XCTAssertTrue(fs.contains(.close))
        XCTAssertTrue(fs.contains(.speed))
        XCTAssertTrue(fs.contains(.author))
    }

    func test_newControlSet_rawValues_areDistinct() {
        let values: Set<Int> = [
            MeeshyVideoPlayer.ControlSet.airplay.rawValue,
            MeeshyVideoPlayer.ControlSet.pip.rawValue,
            MeeshyVideoPlayer.ControlSet.loop.rawValue
        ]
        XCTAssertEqual(values.count, 3, "Each new control must have a distinct bit")
    }
}
