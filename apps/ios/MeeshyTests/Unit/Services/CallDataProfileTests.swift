import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

@MainActor
final class CallDataProfileTests: XCTestCase {

    // MARK: - Resolution

    func test_resolve_unrestrictedHealthyPath_isWifi() {
        let profile = CallDataProfile.resolve(path: .unrestricted, heuristic: .excellent, current: .wifi)
        XCTAssertEqual(profile, .wifi)
    }

    func test_resolve_expensivePath_isCellular() {
        let path = CallNetworkPath(isExpensive: true, isConstrained: false)
        let profile = CallDataProfile.resolve(path: path, heuristic: .good, current: .wifi)
        XCTAssertEqual(profile, .cellular)
    }

    func test_resolve_constrainedPath_isDataSaver_evenOnWifi() {
        let path = CallNetworkPath(isExpensive: false, isConstrained: true)
        let profile = CallDataProfile.resolve(path: path, heuristic: .excellent, current: .wifi)
        XCTAssertEqual(profile, .dataSaver)
    }

    func test_resolve_poorLink_isDegraded_whateverThePath() {
        let profile = CallDataProfile.resolve(path: .unrestricted, heuristic: .poor, current: .wifi)
        XCTAssertEqual(profile, .degraded)
    }

    func test_resolve_fairLinkWhileDegraded_staysDegraded() {
        let profile = CallDataProfile.resolve(path: .unrestricted, heuristic: .fair, current: .degraded)
        XCTAssertEqual(profile, .degraded, "Hysteresis: a fair tick must not thaw the degraded tier")
    }

    func test_resolve_goodLinkWhileDegraded_returnsToThePathProfile() {
        let path = CallNetworkPath(isExpensive: true, isConstrained: false)
        let profile = CallDataProfile.resolve(path: path, heuristic: .good, current: .degraded)
        XCTAssertEqual(profile, .cellular)
    }

    func test_resolve_fairLinkWhileHealthy_keepsThePathProfile() {
        let profile = CallDataProfile.resolve(path: .unrestricted, heuristic: .fair, current: .wifi)
        XCTAssertEqual(profile, .wifi)
    }

    // MARK: - Table

    func test_budgets_shrinkMonotonically_fromWifiToDegraded() {
        let ordered: [CallDataProfile] = [.wifi, .cellular, .dataSaver, .degraded]
        let budgets = ordered.map(\.budget)
        zip(budgets, budgets.dropFirst()).forEach { richer, leaner in
            XCTAssertGreaterThan(richer.video.maxBitrateBps, leaner.video.maxBitrateBps)
            XCTAssertGreaterThanOrEqual(richer.video.maxFramerate, leaner.video.maxFramerate)
            XCTAssertLessThanOrEqual(richer.video.scaleResolutionDownBy, leaner.video.scaleResolutionDownBy)
            XCTAssertGreaterThan(richer.audio.maxAverageBitrateBps, leaner.audio.maxAverageBitrateBps)
        }
    }

    func test_voiceBudget_staysInTheOpusVoiceRange() {
        XCTAssertEqual(CallDataProfile.wifi.budget.audio.maxAverageBitrateBps, 32_000)
        XCTAssertEqual(CallDataProfile.cellular.budget.audio.maxAverageBitrateBps, 24_000)
        XCTAssertLessThan(CallDataProfile.degraded.budget.audio.maxAverageBitrateBps, 24_000)
        XCTAssertGreaterThanOrEqual(
            CallDataProfile.degraded.budget.audio.maxAverageBitrateBps,
            QualityThresholds.audioCodecFloorBitrateBps,
            "The degraded ceiling may not undercut the encoder floor"
        )
    }

    func test_videoBudget_cellularStaysUnderOneMegabit() {
        XCTAssertLessThanOrEqual(CallDataProfile.cellular.budget.video.maxBitrateBps, 600_000)
        XCTAssertLessThanOrEqual(CallDataProfile.dataSaver.budget.video.maxBitrateBps, 250_000)
    }

    func test_videoBudget_leanProfilesKeepTheFrameSharp() {
        XCTAssertEqual(CallDataProfile.wifi.budget.video.degradationPreference, .maintainFramerate)
        XCTAssertEqual(CallDataProfile.cellular.budget.video.degradationPreference, .maintainFramerate)
        XCTAssertEqual(CallDataProfile.dataSaver.budget.video.degradationPreference, .maintainResolution)
        XCTAssertEqual(CallDataProfile.degraded.budget.video.degradationPreference, .maintainResolution)
    }

    // MARK: - Capping

    func test_videoCapping_takesTheLeanerValueOnEveryAxis() {
        let capped = CallDataProfile.cellular.budget.video.capping(
            CallVideoBudget(maxBitrateBps: 2_500_000, maxFramerate: 30, scaleResolutionDownBy: 1.0, degradationPreference: .maintainFramerate)
        )
        XCTAssertEqual(capped.maxBitrateBps, CallDataProfile.cellular.budget.video.maxBitrateBps)
        XCTAssertEqual(capped.maxFramerate, CallDataProfile.cellular.budget.video.maxFramerate)
        XCTAssertEqual(capped.scaleResolutionDownBy, CallDataProfile.cellular.budget.video.scaleResolutionDownBy)
    }

    func test_videoCapping_keepsALeanerTargetUntouched() {
        let floor = CallVideoBudget(maxBitrateBps: 100_000, maxFramerate: 2, scaleResolutionDownBy: 2.0, degradationPreference: .maintainResolution)
        let capped = CallDataProfile.wifi.budget.video.capping(floor)
        XCTAssertEqual(capped, floor, "The survival floor is already under every ceiling")
    }

    func test_videoCapping_neverLiftsMaintainResolution() {
        let target = CallVideoBudget(maxBitrateBps: 100_000, maxFramerate: 2, scaleResolutionDownBy: 2.0, degradationPreference: .maintainResolution)
        let capped = CallDataProfile.wifi.budget.video.capping(target)
        XCTAssertEqual(capped.degradationPreference, .maintainResolution)
    }

    func test_videoCapping_leanProfileImposesItsPreference() {
        let ladder = CallVideoBudget(maxBitrateBps: 800_000, maxFramerate: 20, scaleResolutionDownBy: 1.5, degradationPreference: .maintainFramerate)
        let capped = CallDataProfile.dataSaver.budget.video.capping(ladder)
        XCTAssertEqual(capped.degradationPreference, .maintainResolution)
    }

    func test_audioCapping_takesTheLeanerCeiling() {
        XCTAssertEqual(CallDataProfile.wifi.budget.audio.capping(QualityThresholds.maxBitrate), 32_000)
        XCTAssertEqual(CallDataProfile.wifi.budget.audio.capping(QualityThresholds.minBitrate), QualityThresholds.minBitrate)
    }

    // MARK: - Opus fmtp

    func test_audioFmtp_isMonoVoiceWithDtxAndInbandFec() {
        let params = CallDataProfile.cellular.budget.audio.fmtpParameters
        XCTAssertTrue(params.contains("maxaveragebitrate=24000"))
        XCTAssertTrue(params.contains("stereo=0"))
        XCTAssertTrue(params.contains("sprop-stereo=0"))
        XCTAssertTrue(params.contains("usedtx=1"))
        XCTAssertTrue(params.contains("useinbandfec=1"))
        XCTAssertTrue(params.contains("maxplaybackrate=\(QualityThresholds.opusFmtpMaxPlaybackRate)"))
    }

    // MARK: - Label

    func test_label_isLocalizedForEveryProfile() {
        CallDataProfile.allCases.forEach { profile in
            XCTAssertFalse(profile.label.isEmpty)
        }
    }
}

@MainActor
final class CallNetworkPathMonitorTests: XCTestCase {

    private let cellular = NetworkPathSnapshot(isSatisfied: true, isExpensive: true, usesCellular: true)
    private let lowData = NetworkPathSnapshot(isSatisfied: true, isConstrained: true, usesWiFi: true)

    private final class Received: @unchecked Sendable {
        var paths: [CallNetworkPath] = []
    }

    func test_start_deliversTheKnownPathAtOnce() {
        let source = NetworkPathSource.makeForTesting()
        source.publish(cellular)
        let monitor = CallNetworkPathMonitor(source: source)
        let received = Received()

        monitor.start { received.paths.append($0) }

        XCTAssertEqual(received.paths, [CallNetworkPath(isExpensive: true, isConstrained: false)],
                       "the first offer is built right after configure: the path must be known before it")
    }

    func test_pathChange_afterStart_isDelivered() async {
        let source = NetworkPathSource.makeForTesting()
        let monitor = CallNetworkPathMonitor(source: source)
        let received = Received()
        let delivered = expectation(description: "path change delivered")
        monitor.start { path in
            received.paths.append(path)
            if received.paths.count == 2 { delivered.fulfill() }
        }

        source.publish(lowData)
        await fulfillment(of: [delivered], timeout: 1)

        XCTAssertEqual(received.paths.last, CallNetworkPath(isExpensive: false, isConstrained: true))
    }

    func test_stop_silencesLaterChanges() async {
        let source = NetworkPathSource.makeForTesting()
        let monitor = CallNetworkPathMonitor(source: source)
        let received = Received()
        monitor.start { received.paths.append($0) }

        monitor.stop()
        source.publish(cellular)
        let drained = expectation(description: "main queue drained")
        DispatchQueue.main.async { drained.fulfill() }
        await fulfillment(of: [drained], timeout: 1)

        XCTAssertEqual(received.paths.count, 1)
    }
}
