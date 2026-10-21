#if os(iOS) && DEBUG
import Testing
import Foundation
@testable import MeeshySDK

/// #9879 — la libération et la requête de session d'un canvas passent par UNE
/// file ordonnée du coordinateur, et la désactivation attend une grace : un
/// balayage N → N+1 ne fait plus `setActive(false)` puis `setActive(true)`
/// (la musique des autres apps baissait puis remontait).
@Suite(.serialized)
struct MediaSessionOrderedHandoverTests {

    private struct Rig {
        let coordinator: MediaSessionCoordinator
        let probe: MediaSessionCoordinatorTestProbe
        let clock: ManualDelayedScheduler
    }

    private func rig() -> Rig {
        let clock = ManualDelayedScheduler()
        let coordinator = MediaSessionCoordinator.makeForTesting(scheduleAfter: clock.scheduler)
        let probe = MediaSessionCoordinatorTestProbe()
        coordinator.testProbe = probe
        return Rig(coordinator: coordinator, probe: probe, clock: clock)
    }

    @Test func swipe_releaseOfTheLeavingSlide_thenRequestOfTheNext_neverDeactivates() async {
        let rig = rig()
        rig.coordinator.requestPlaybackInOrder()
        rig.coordinator.releasePlaybackInOrder()
        rig.coordinator.requestPlaybackInOrder()
        await rig.coordinator.settled()
        rig.clock.advance()
        await rig.coordinator.settled()

        #expect(!rig.probe.calls.contains(.deactivate))
        #expect(await rig.coordinator.holdCountForTesting == 1)
    }

    @Test func swipe_requestOfTheNextSlide_thenReleaseOfTheLeavingOne_neverDeactivates() async {
        let rig = rig()
        rig.coordinator.requestPlaybackInOrder()
        rig.coordinator.requestPlaybackInOrder()
        rig.coordinator.releasePlaybackInOrder()
        await rig.coordinator.settled()
        rig.clock.advance()
        await rig.coordinator.settled()

        #expect(!rig.probe.calls.contains(.deactivate))
        #expect(await rig.coordinator.holdCountForTesting == 1)
    }

    @Test func aLastRelease_handsTheSessionBack_onlyOnceTheGraceHasPassed() async {
        let rig = rig()
        rig.coordinator.requestPlaybackInOrder()
        rig.coordinator.releasePlaybackInOrder()
        await rig.coordinator.settled()
        #expect(!rig.probe.calls.contains(.deactivate))
        #expect(rig.clock.delays == [ContentSessionReleaseLaw.swipeHandoverGrace])

        rig.clock.advance()
        await rig.coordinator.settled()

        #expect(rig.probe.calls == [.activate, .deactivate])
    }

    @Test func aRequestAndItsRelease_enqueuedInABurst_runInOrderAndBalance() async {
        let rig = rig()
        rig.coordinator.requestPlaybackInOrder()
        rig.coordinator.releasePlaybackInOrder()
        await rig.coordinator.settled()

        #expect(await rig.coordinator.holdCountForTesting == 0)
    }
}
#endif
