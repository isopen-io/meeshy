import XCTest
import UIKit
@testable import MeeshyUI

/// **#11284 — le préchargement s'arrête quand l'app n'est plus au premier plan,
/// et reprend au retour.**
///
/// Avant ce lot, la fenêtre de préchargement des réels (`ReelPagerPreloader`)
/// et des stories (`StoryNeighborPrefetchQueue`) continuait de télécharger et de
/// préparer des lecteurs app en arrière-plan, sous le centre de contrôle ou le
/// sélecteur d'apps : rien ne lisait le cycle de vie de l'app.
///
/// Les témoins passent par l'API publique du portier : la loi, puis
/// `runWhileActive` piloté par `setActive` — l'entrée que les notifications
/// `UIApplication` appellent.
@MainActor
final class PreloadActivityGateTests: XCTestCase {

    // MARK: - La loi

    func test_law_onlyDidBecomeActive_letsThePreloadRun() {
        XCTAssertTrue(PreloadActivityLaw.isActive(after: .didBecomeActive))
        XCTAssertFalse(PreloadActivityLaw.isActive(after: .willResignActive),
                       "centre de contrôle, sélecteur d'apps, appel entrant : l'écran est couvert")
        XCTAssertFalse(PreloadActivityLaw.isActive(after: .didEnterBackground))
        XCTAssertFalse(PreloadActivityLaw.isActive(after: .willEnterForeground),
                       "revenir n'est pas être revenu : on attend didBecomeActive")
    }

    func test_law_readsTheApplicationState() {
        XCTAssertTrue(PreloadActivityLaw.isActive(UIApplication.State.active))
        XCTAssertFalse(PreloadActivityLaw.isActive(UIApplication.State.inactive))
        XCTAssertFalse(PreloadActivityLaw.isActive(UIApplication.State.background))
    }

    // MARK: - Le portier

    func test_runWhileActive_runsThePassOnce_whenTheAppIsActive() async {
        let gate = PreloadActivityGate(isActive: true)
        let probe = PassProbe()

        await gate.runWhileActive { probe.starts += 1 }

        XCTAssertEqual(probe.starts, 1)
    }

    func test_aPassAskedWhileInactive_waitsForTheReturn() async {
        let gate = PreloadActivityGate(isActive: false)
        let probe = PassProbe()

        let caller = Task { await gate.runWhileActive { probe.starts += 1 } }
        await Self.settle()
        XCTAssertEqual(probe.starts, 0, "rien ne se précharge tant que l'app n'est pas active")

        gate.setActive(true)
        await caller.value

        XCTAssertEqual(probe.starts, 1)
    }

    func test_leavingTheForeground_cancelsTheRunningPass_andTheReturnRelaunchesIt() async {
        let gate = PreloadActivityGate(isActive: true)
        let probe = PassProbe()

        let caller = Task { await gate.runWhileActive { await probe.longOnFirstRun() } }
        await Self.settle(until: { probe.starts == 1 })

        gate.setActive(false)
        await Self.settle(until: { probe.cancellations == 1 })
        XCTAssertEqual(probe.cancellations, 1, "la passe en vol s'arrête quand l'app passe en arrière-plan")
        XCTAssertEqual(probe.starts, 1, "et rien ne repart tant que l'app n'est pas revenue")

        gate.setActive(true)
        await caller.value

        XCTAssertEqual(probe.starts, 2, "au retour, le plan repart depuis le début")
    }

    func test_theCallerCancellation_cancelsThePass_andEndsTheRun() async {
        let gate = PreloadActivityGate(isActive: true)
        let probe = PassProbe()

        let caller = Task { await gate.runWhileActive { await probe.longOnFirstRun() } }
        await Self.settle(until: { probe.starts == 1 })
        caller.cancel()
        await caller.value

        XCTAssertEqual(probe.cancellations, 1, "un balayage qui annule la fenêtre annule sa passe")
        XCTAssertEqual(probe.starts, 1)
    }

    func test_aCallerCancelledWhileWaiting_neverRunsItsPass() async {
        let gate = PreloadActivityGate(isActive: false)
        let probe = PassProbe()

        let caller = Task { await gate.runWhileActive { probe.starts += 1 } }
        await Self.settle()
        caller.cancel()
        await caller.value
        gate.setActive(true)
        await Self.settle()

        XCTAssertEqual(probe.starts, 0, "une fenêtre quittée pendant l'arrière-plan ne se rejoue pas au retour")
    }

    // MARK: - Fixtures

    @MainActor
    private final class PassProbe {
        var starts = 0
        var cancellations = 0

        nonisolated deinit {}

        /// La première passe dure (téléchargement en vol) ; la suivante finit.
        func longOnFirstRun() async {
            starts += 1
            guard starts == 1 else { return }
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            if Task.isCancelled { cancellations += 1 }
        }
    }

    private static func settle(until done: @MainActor () -> Bool = { false }) async {
        for _ in 0..<500 where !done() {
            await Task.yield()
        }
    }
}
