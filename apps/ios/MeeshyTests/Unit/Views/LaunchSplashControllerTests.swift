import XCTest
import Combine
@testable import Meeshy

/// #6744 — le splash tombe dès que le démarrage est prêt, et RIEN du démarrage
/// ne peut le retenir au-delà de son plafond.
///
/// Mesuré sur appareil avant ce lot : deux arrêts forcés, thread principal au
/// repos. Le splash ne tombait qu'à la dernière ligne d'une chaîne d'attentes,
/// et son « plafond » ne bornait que l'une d'elles.
@MainActor
final class LaunchSplashControllerTests: XCTestCase {

    private final class Sleeper {
        private(set) var requested: [Duration] = []
        func sleep(_ duration: Duration) async throws { requested.append(duration) }
    }

    private final class PhaseRecorder {
        private(set) var phases: [LaunchSplashController.Phase] = []
        func record(_ phase: LaunchSplashController.Phase) { phases.append(phase) }
    }

    private func makeSUT(elapsed: Duration) -> (sut: LaunchSplashController, sleeper: Sleeper) {
        let sleeper = Sleeper()
        let sut = LaunchSplashController(elapsed: { elapsed },
                                         sleep: { try await sleeper.sleep($0) })
        return (sut, sleeper)
    }

    // MARK: - Le plafond ne dépend de rien du démarrage

    func test_holdUntilCeiling_whenTheBootNeverSaysReady_liftsTheSplash() async {
        let (sut, _) = makeSUT(elapsed: .milliseconds(100))

        await sut.holdUntilCeiling()

        XCTAssertEqual(sut.phase, .gone)
    }

    func test_holdUntilCeiling_waitsOnlyWhatRemainsOfTheCeiling() async {
        let (sut, sleeper) = makeSUT(elapsed: .milliseconds(500))

        await sut.holdUntilCeiling()

        XCTAssertEqual(sleeper.requested.first, .milliseconds(1500))
    }

    func test_holdUntilCeiling_namesTheBootStepStillPending() async {
        let (sut, _) = makeSUT(elapsed: .seconds(3))
        sut.reach(.conversationList)

        await sut.holdUntilCeiling()

        XCTAssertEqual(sut.reveal, .ceiling(pendingStep: .conversationList))
    }

    // MARK: - Prêt : le rideau tombe dès que le plancher est passé

    func test_markReady_beforeTheFloor_waitsTheRestOfTheFloor() async {
        let (sut, sleeper) = makeSUT(elapsed: .milliseconds(100))

        await sut.markReady()

        XCTAssertEqual(sleeper.requested.first, .milliseconds(300))
        XCTAssertEqual(sut.reveal, .ready)
        XCTAssertEqual(sut.phase, .gone)
    }

    func test_markReady_afterTheFloor_liftsWithoutWaiting() async {
        let (sut, sleeper) = makeSUT(elapsed: .milliseconds(900))

        await sut.markReady()

        XCTAssertEqual(sleeper.requested, [LaunchSplashTiming.fade])
        XCTAssertEqual(sut.phase, .gone)
    }

    // MARK: - Une seule tombée

    func test_theFirstReasonWins_aLateCeilingChangesNothing() async {
        let (sut, _) = makeSUT(elapsed: .seconds(3))

        await sut.markReady()
        await sut.holdUntilCeiling()

        XCTAssertEqual(sut.reveal, .ready)
    }

    func test_markReady_afterTheCeiling_keepsTheCeilingAsTheReason() async {
        let (sut, _) = makeSUT(elapsed: .seconds(3))
        sut.reach(.session)

        await sut.holdUntilCeiling()
        await sut.markReady()

        XCTAssertEqual(sut.reveal, .ceiling(pendingStep: .session))
    }

    // MARK: - #4363 : on ne quitte l'arbre qu'APRÈS le fondu

    /// Un retrait depuis `.covering` rendrait, pendant le retrait, la dernière
    /// version évaluée — celle qui teste encore les touches. Le splash ne quitte
    /// donc l'arbre que depuis `.fading`, où il n'en teste plus aucune.
    func test_theSplashLeavesTheTree_onlyThroughTheFadingPhase() async {
        let (sut, _) = makeSUT(elapsed: .seconds(1))
        let recorder = PhaseRecorder()
        let subscription = sut.$phase.sink { recorder.record($0) }

        await sut.markReady()
        subscription.cancel()

        XCTAssertEqual(recorder.phases, [.covering, .fading, .gone])
    }
}
