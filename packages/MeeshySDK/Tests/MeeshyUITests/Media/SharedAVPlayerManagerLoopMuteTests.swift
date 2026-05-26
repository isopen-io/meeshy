import XCTest
@testable import MeeshyUI

final class SharedAVPlayerManagerLoopMuteTests: XCTestCase {

    func test_isMuted_defaultsFalse() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            m.isMuted = false  // reset
            XCTAssertFalse(m.isMuted)
        }
    }

    func test_isMuted_canBeToggled() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isMuted = true
            XCTAssertTrue(m.isMuted)
            m.isMuted = false
            XCTAssertFalse(m.isMuted)
        }
    }

    func test_shouldLoop_defaultsFalse() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            XCTAssertFalse(m.shouldLoop)
        }
    }

    func test_shouldLoop_canBeToggled() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.shouldLoop = true
            XCTAssertTrue(m.shouldLoop)
            m.shouldLoop = false
            XCTAssertFalse(m.shouldLoop)
        }
    }

    func test_stop_resetsShouldLoop() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.shouldLoop = true
            m.stop()
            XCTAssertFalse(m.shouldLoop)
        }
    }

    func test_stop_preservesIsMuted() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isMuted = true
            m.stop()
            XCTAssertTrue(m.isMuted, "isMuted is a session-global pref, must survive stop")
            m.isMuted = false // teardown
        }
    }
}
