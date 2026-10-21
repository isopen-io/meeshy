#if os(iOS)
import Testing
@testable import MeeshySDK

/// #11040 — une interruption met Meeshy en pause, et il reprend à la fin ce
/// qui jouait, et seulement cela.
struct InterruptionResumeLedgerTests {

    private func interruptedWhilePlaying() -> InterruptionResumeLedger {
        var ledger = InterruptionResumeLedger()
        _ = ledger.handle(.interruptionBegan(isPlaying: true))
        return ledger
    }

    @Test func anInterruptionWhilePlaying_pauses() {
        var ledger = InterruptionResumeLedger()

        #expect(ledger.handle(.interruptionBegan(isPlaying: true)) == .pause)
        #expect(ledger.holdsInterruptedPlayback)
    }

    @Test func anInterruptionWhilePaused_doesNothing() {
        var ledger = InterruptionResumeLedger()

        #expect(ledger.handle(.interruptionBegan(isPlaying: false)) == .none)
        #expect(ledger.handle(.interruptionEnded(shouldResume: true)) == .none)
    }

    @Test func theEndOfTheInterruptionWithShouldResume_resumesWhatWasPlaying() {
        var ledger = interruptedWhilePlaying()

        #expect(ledger.handle(.interruptionEnded(shouldResume: true)) == .resume)
        #expect(!ledger.holdsInterruptedPlayback)
    }

    @Test func theEndWithoutShouldResume_resumesNothing() {
        var ledger = interruptedWhilePlaying()

        #expect(ledger.handle(.interruptionEnded(shouldResume: false)) == .none)
        #expect(ledger.handle(.interruptionEnded(shouldResume: true)) == .none)
    }

    @Test func aUserPauseDuringTheInterruption_wins() {
        var ledger = interruptedWhilePlaying()

        _ = ledger.handle(.userPaused)

        #expect(ledger.handle(.interruptionEnded(shouldResume: true)) == .none)
    }

    @Test func aUserRelaunchDuringTheInterruption_leavesNothingToResume() {
        var ledger = interruptedWhilePlaying()

        _ = ledger.handle(.userStartedPlayback)

        #expect(ledger.handle(.interruptionEnded(shouldResume: true)) == .none)
    }

    @Test func aReleasedContent_isNotResumed() {
        var ledger = interruptedWhilePlaying()

        _ = ledger.handle(.contentReleased)

        #expect(ledger.handle(.interruptionEnded(shouldResume: true)) == .none)
    }

    @Test func anUnpluggedHeadset_pausesAndDisarmsTheResume() {
        var ledger = interruptedWhilePlaying()

        #expect(ledger.handle(.outputLost) == .pause)
        #expect(ledger.handle(.interruptionEnded(shouldResume: true)) == .none)
    }

    @Test func aMeeshyCallThatHangsUp_resumesLikeASystemInterruption() throws {
        var ledger = interruptedWhilePlaying()
        let signal = try #require(InterruptionResumeLedger.signal(for: .callEndedShouldResume, isPlaying: false))

        #expect(ledger.handle(signal) == .resume)
    }

    @Test func returningToTheAppOnceTheOtherSoundStopped_resumes() {
        var ledger = interruptedWhilePlaying()

        #expect(ledger.handle(.returnedToForeground(otherAudioPlaying: false, contentStillOnScreen: true)) == .resume)
    }

    @Test func returningToTheAppWhileTheOtherSoundStillPlays_waits() {
        var ledger = interruptedWhilePlaying()

        #expect(ledger.handle(.returnedToForeground(otherAudioPlaying: true, contentStillOnScreen: true)) == .none)
        #expect(ledger.handle(.interruptionEnded(shouldResume: true)) == .resume)
    }

    @Test func returningToTheAppAfterTheContentLeftTheScreen_resumesNothing() {
        var ledger = interruptedWhilePlaying()

        #expect(ledger.handle(.returnedToForeground(otherAudioPlaying: false, contentStillOnScreen: false)) == .none)
        #expect(!ledger.holdsInterruptedPlayback)
    }

    @Test func returningToTheAppWithoutAnyInterruption_resumesNothing() {
        var ledger = InterruptionResumeLedger()

        #expect(ledger.handle(.returnedToForeground(otherAudioPlaying: false, contentStillOnScreen: true)) == .none)
    }

    @Test func coordinatorEvents_translateIntoSignals() {
        #expect(InterruptionResumeLedger.signal(for: .interruptionBegan, isPlaying: true) == .interruptionBegan(isPlaying: true))
        #expect(InterruptionResumeLedger.signal(for: .interruptionEndedShouldResume, isPlaying: false)
                == .interruptionEnded(shouldResume: true))
        #expect(InterruptionResumeLedger.signal(for: .interruptionEndedShouldNotResume, isPlaying: false)
                == .interruptionEnded(shouldResume: false))
        #expect(InterruptionResumeLedger.signal(for: .routeChangedOldDeviceUnavailable, isPlaying: true) == .outputLost)
        #expect(InterruptionResumeLedger.signal(for: .routeChangedOther, isPlaying: true) == nil)
    }
}
#endif
