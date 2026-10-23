import XCTest
import Foundation
import MeeshySDK
@testable import MeeshyUI

/// **La politique média d'un instant (#9880)** — loi PURE : la chaleur,
/// l'économie d'énergie et le tier de l'appareil donnent les réglages de TOUS
/// les lecteurs, et le même seuil de chaleur gouverne la politique, la fenêtre
/// des réels et le tier.
final class MediaPolicyTests: XCTestCase {

    private func policy(
        _ thermal: ProcessInfo.ThermalState = .nominal,
        lowPower: Bool = false,
        tier: DeviceMediaTier = .high
    ) -> MediaPolicy {
        MediaPolicy(thermalState: thermal, lowPower: lowPower, tier: tier)
    }

    // MARK: - Nominal

    func test_nominal_keepsTheHistoricalSettings() {
        let nominal = policy()
        XCTAssertFalse(nominal.isConstrained)
        XCTAssertEqual(nominal.forwardBufferDuration(for: .watched), 2.0, accuracy: 0.0001)
        XCTAssertEqual(nominal.forwardBufferDuration(for: .prerolled), 1.0, accuracy: 0.0001)
        XCTAssertEqual(nominal.timeObserverInterval, 0.2, accuracy: 0.0001)
        XCTAssertTrue(nominal.prefetchesVideo)
        XCTAssertTrue(nominal.autoplaysNeighbors)
        XCTAssertTrue(nominal.animatesDecoration)
        XCTAssertEqual(nominal.preparedPlayers, 3)
    }

    // MARK: - Chaleur

    func test_serious_shrinksBuffers_slowsTheObserver_andStopsNeighbourAutoplay() {
        let hot = policy(.serious, tier: .low)
        XCTAssertTrue(hot.isConstrained)
        XCTAssertEqual(hot.forwardBufferDuration(for: .watched), 1.0, accuracy: 0.0001)
        XCTAssertEqual(hot.forwardBufferDuration(for: .prerolled), 0.5, accuracy: 0.0001)
        XCTAssertEqual(hot.timeObserverInterval, 0.5, accuracy: 0.0001)
        XCTAssertTrue(hot.prefetchesVideo, "le plancher N±2 tient au stade sérieux")
        XCTAssertFalse(hot.autoplaysNeighbors)
        XCTAssertFalse(hot.animatesDecoration)
        XCTAssertEqual(hot.preparedPlayers, 1)
    }

    func test_critical_alsoSuspendsVideoPrefetch() {
        XCTAssertFalse(policy(.critical, tier: .low).prefetchesVideo)
    }

    func test_fair_isNotAConstraint() {
        XCTAssertFalse(policy(.fair).isConstrained)
        XCTAssertTrue(policy(.fair).autoplaysNeighbors)
    }

    // MARK: - Économie d'énergie

    func test_lowPower_tunesLikeASeriousHeat_withoutSuspendingPrefetch() {
        let saving = policy(.nominal, lowPower: true, tier: .mid)
        XCTAssertTrue(saving.isConstrained)
        XCTAssertEqual(saving.forwardBufferDuration(for: .watched), 1.0, accuracy: 0.0001)
        XCTAssertEqual(saving.forwardBufferDuration(for: .prerolled), 0.5, accuracy: 0.0001)
        XCTAssertEqual(saving.timeObserverInterval, 0.5, accuracy: 0.0001)
        XCTAssertTrue(saving.prefetchesVideo)
        XCTAssertFalse(saving.autoplaysNeighbors, "l'économie d'énergie coupe l'autoplay voisin")
        XCTAssertFalse(saving.animatesDecoration)
        XCTAssertEqual(saving.preparedPlayers, 2)
    }

    func test_lowPower_reducesTheReelWindowToItsFloor() {
        let saving = policy(.nominal, lowPower: true, tier: .mid)
        let window = ReelPreloadWindow.window(for: saving.reelWindowContext(
            visits: Array(repeating: .init(dwellMs: 500, direction: .forward), count: 6),
            network: .init(),
            deviceMemoryGb: 6
        ))
        XCTAssertEqual(window.ahead, ReelPreloadWindow.minRadius)
    }

    func test_reelWindowContext_carriesTheSameSignalsAsThePolicy() {
        let hot = policy(.serious, lowPower: true, tier: .low)
        let context = hot.reelWindowContext(visits: [], network: .init(), deviceMemoryGb: 4)
        XCTAssertEqual(context.thermalState, .serious)
        XCTAssertTrue(context.lowPower)
        XCTAssertEqual(context.tier, .low)
        XCTAssertEqual(context.deviceMemoryGb, 4)
    }

    // MARK: - Un seul seuil de chaleur

    /// La politique, la fenêtre des réels et le tier tranchent au MÊME état :
    /// deux lois qui divergeaient (`.critical` contre `.serious`) ne le peuvent
    /// plus, elles lisent le même prédicat.
    func test_policy_reelWindow_andTier_agreeOnTheHeatThreshold() {
        let swiping = Array(repeating: ReelPreloadWindow.Visit(dwellMs: 500, direction: .forward), count: 6)
        for state in [ProcessInfo.ThermalState.nominal, .fair, .serious, .critical] {
            let constrained = policy(state).isConstrained
            let window = ReelPreloadWindow.window(for: .init(
                visits: swiping, network: .init(), thermalState: state, tier: .high))
            let tier = DeviceMediaTier.classify(.init(
                memoryGB: 6, cores: 6, maxFps: 60, hwAV1: false, hwHEVC: true,
                lowPower: false, thermal: DeviceMediaInputs.Thermal(state)))
            XCTAssertEqual(window.ahead == ReelPreloadWindow.minRadius, constrained, "fenêtre à \(state.rawValue)")
            XCTAssertEqual(tier == .low, constrained, "tier à \(state.rawValue)")
            XCTAssertEqual(DeviceMediaInputs.Thermal(state).isUnderPressure, constrained)
        }
    }

    func test_onlyTheCriticalStage_stopsVideoPrefetch_everywhere() {
        for state in [ProcessInfo.ThermalState.nominal, .fair, .serious, .critical] {
            XCTAssertEqual(MediaThermalPolicy.shouldPrefetchVideo(thermalState: state),
                           !DeviceMediaInputs.Thermal(state).stopsVideoPrefetch)
            XCTAssertEqual(policy(state).prefetchesVideo, state != .critical)
        }
    }

    // MARK: - Le tier règle le nombre de lecteurs préparés

    func test_preparedPlayers_followThePoolCapacityOfTheTier() {
        for tier in DeviceMediaTier.allCases {
            XCTAssertEqual(policy(tier: tier).preparedPlayers, PlayerPoolCapacity.players(for: tier))
        }
    }
}
