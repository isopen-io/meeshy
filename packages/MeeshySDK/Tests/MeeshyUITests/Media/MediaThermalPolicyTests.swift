import XCTest
import Foundation
@testable import MeeshyUI

/// Pure rule-engine: maps `ProcessInfo.ThermalState` to media-playback tuning
/// (cadence, buffer, bitrate, prefetch). Not @MainActor — the policy is pure.
final class MediaThermalPolicyTests: XCTestCase {

    // MARK: - timeObserverInterval (periodic time-observer cadence, seconds)

    func test_timeObserverInterval_nominal_isResponsive() {
        XCTAssertEqual(MediaThermalPolicy.timeObserverInterval(thermalState: .nominal), 0.2, accuracy: 0.0001)
    }

    func test_timeObserverInterval_fair_isResponsive() {
        XCTAssertEqual(MediaThermalPolicy.timeObserverInterval(thermalState: .fair), 0.2, accuracy: 0.0001)
    }

    func test_timeObserverInterval_serious_slowsDown() {
        XCTAssertEqual(MediaThermalPolicy.timeObserverInterval(thermalState: .serious), 0.5, accuracy: 0.0001)
    }

    func test_timeObserverInterval_critical_slowsDown() {
        XCTAssertEqual(MediaThermalPolicy.timeObserverInterval(thermalState: .critical), 0.5, accuracy: 0.0001)
    }

    // MARK: - forwardBufferDuration (seconds decoded ahead per prerolled item)

    func test_forwardBufferDuration_nominal_isOneSecond() {
        XCTAssertEqual(MediaThermalPolicy.forwardBufferDuration(thermalState: .nominal), 1.0, accuracy: 0.0001)
    }

    func test_forwardBufferDuration_serious_shrinks() {
        XCTAssertEqual(MediaThermalPolicy.forwardBufferDuration(thermalState: .serious), 0.5, accuracy: 0.0001)
    }

    func test_forwardBufferDuration_critical_shrinks() {
        XCTAssertEqual(MediaThermalPolicy.forwardBufferDuration(thermalState: .critical), 0.5, accuracy: 0.0001)
    }

    // MARK: - watchedForwardBufferDuration (seconds ahead for the item on screen)

    func test_watchedForwardBufferDuration_nominal_keepsTwoSeconds() {
        XCTAssertEqual(MediaThermalPolicy.watchedForwardBufferDuration(thermalState: .nominal), 2.0, accuracy: 0.0001)
        XCTAssertEqual(MediaThermalPolicy.watchedForwardBufferDuration(thermalState: .fair), 2.0, accuracy: 0.0001)
    }

    func test_watchedForwardBufferDuration_underPressure_halves() {
        XCTAssertEqual(MediaThermalPolicy.watchedForwardBufferDuration(thermalState: .serious), 1.0, accuracy: 0.0001)
        XCTAssertEqual(MediaThermalPolicy.watchedForwardBufferDuration(thermalState: .critical), 1.0, accuracy: 0.0001)
    }

    // MARK: - shouldPrefetchVideo (whether to preroll upcoming reels)

    func test_shouldPrefetchVideo_nominal_isTrue() {
        XCTAssertTrue(MediaThermalPolicy.shouldPrefetchVideo(thermalState: .nominal))
    }

    func test_shouldPrefetchVideo_serious_isTrue() {
        XCTAssertTrue(MediaThermalPolicy.shouldPrefetchVideo(thermalState: .serious))
    }

    func test_shouldPrefetchVideo_critical_isFalse() {
        XCTAssertFalse(MediaThermalPolicy.shouldPrefetchVideo(thermalState: .critical))
    }
}
