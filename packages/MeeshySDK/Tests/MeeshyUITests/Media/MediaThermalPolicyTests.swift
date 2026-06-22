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

    // MARK: - preferredPeakBitRate (bits/s; heat-first — always capped, never 0)

    func test_preferredPeakBitRate_visibleAndCool_capsForHeat() {
        // Heat-first: the watched reel is bounded to a phone-adequate 1.5 Mbps
        // rather than uncapped (0), so a high-bitrate HLS rendition can't spike decode.
        XCTAssertEqual(MediaThermalPolicy.preferredPeakBitRate(isVisible: true, thermalState: .nominal), 1_500_000, accuracy: 0.0001)
    }

    func test_preferredPeakBitRate_offscreenAndCool_capsLower() {
        // Offscreen preroll may never be watched → cheaper than the active player.
        XCTAssertEqual(MediaThermalPolicy.preferredPeakBitRate(isVisible: false, thermalState: .nominal), 1_000_000, accuracy: 0.0001)
    }

    func test_preferredPeakBitRate_serious_capsEvenWhenVisible() {
        XCTAssertEqual(MediaThermalPolicy.preferredPeakBitRate(isVisible: true, thermalState: .serious), 900_000, accuracy: 0.0001)
    }

    func test_preferredPeakBitRate_critical_capsHardest() {
        XCTAssertEqual(MediaThermalPolicy.preferredPeakBitRate(isVisible: true, thermalState: .critical), 600_000, accuracy: 0.0001)
        XCTAssertEqual(MediaThermalPolicy.preferredPeakBitRate(isVisible: false, thermalState: .critical), 600_000, accuracy: 0.0001)
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
