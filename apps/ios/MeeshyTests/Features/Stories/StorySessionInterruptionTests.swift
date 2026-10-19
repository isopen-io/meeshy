import XCTest
import MeeshySDK
@testable import Meeshy

/// #11040, décision porteur g (2026-10-20) — la progression d'une story
/// s'arrête dès que sa lecture est interrompue (appel, autre app, Siri) et
/// repart avec la reprise. Une pause de l'utilisateur pendant l'interruption
/// l'emporte.
final class StorySessionInterruptionTests: XCTestCase {

    private func frozenWhilePlaying() -> StorySessionInterruption {
        var law = StorySessionInterruption()
        _ = law.handle(.interruptionBegan, storyIsPlaying: true)
        return law
    }

    func test_anInterruptionWhileTheStoryPlays_freezesItsClock() {
        var law = StorySessionInterruption()

        XCTAssertEqual(law.handle(.interruptionBegan, storyIsPlaying: true), .freeze)
        XCTAssertTrue(law.isFrozen)
    }

    func test_anInterruptionWhileTheStoryIsAlreadyHeld_changesNothing() {
        var law = StorySessionInterruption()

        XCTAssertEqual(law.handle(.interruptionBegan, storyIsPlaying: false), .none)
        XCTAssertFalse(law.isFrozen)
    }

    func test_theEndWithShouldResume_restartsTheClockWhereItStopped() {
        var law = frozenWhilePlaying()

        XCTAssertEqual(law.handle(.interruptionEndedShouldResume, storyIsPlaying: false), .resume)
        XCTAssertFalse(law.isFrozen)
    }

    func test_theEndWithoutResume_leavesTheStoryStoppedAsAUserPause() {
        var law = frozenWhilePlaying()

        XCTAssertEqual(law.handle(.interruptionEndedShouldNotResume, storyIsPlaying: false), .settleAsPause)
        XCTAssertFalse(law.isFrozen, "la pause de l'utilisateur tient désormais la story")
    }

    func test_aUserPauseDuringTheInterruption_wins() {
        var law = frozenWhilePlaying()

        law.userPaused()

        XCTAssertFalse(law.isFrozen)
        XCTAssertEqual(law.handle(.interruptionEndedShouldResume, storyIsPlaying: false), .none)
    }

    func test_backInMeeshyWithNothingElsePlaying_resumes() {
        var law = frozenWhilePlaying()

        XCTAssertEqual(law.returnedToForeground(otherAudioPlaying: false), .resume)
        XCTAssertFalse(law.isFrozen)
    }

    func test_backInMeeshyWhileAnotherAppStillPlays_staysFrozen() {
        var law = frozenWhilePlaying()

        XCTAssertEqual(law.returnedToForeground(otherAudioPlaying: true), .none)
        XCTAssertTrue(law.isFrozen)
    }

    func test_backInMeeshyWithoutAnyInterruption_changesNothing() {
        var law = StorySessionInterruption()

        XCTAssertEqual(law.returnedToForeground(otherAudioPlaying: false), .none)
    }

    func test_anEndWithoutAPriorFreeze_changesNothing() {
        var law = StorySessionInterruption()

        XCTAssertEqual(law.handle(.interruptionEndedShouldResume, storyIsPlaying: true), .none)
        XCTAssertEqual(law.handle(.interruptionEndedShouldNotResume, storyIsPlaying: true), .none)
        XCTAssertEqual(law.handle(.callEndedShouldResume, storyIsPlaying: true), .none)
    }

    /// Un casque débranché coupe le son du lecteur de story (le canvas s'en
    /// charge) ; il n'est pas une interruption de l'horloge.
    func test_routeChanges_neverTouchTheClock() {
        var law = StorySessionInterruption()

        XCTAssertEqual(law.handle(.routeChangedOldDeviceUnavailable, storyIsPlaying: true), .none)
        XCTAssertEqual(law.handle(.routeChangedOther, storyIsPlaying: true), .none)
        XCTAssertFalse(law.isFrozen)
    }

    /// La loi est BRANCHÉE : le lecteur de stories l'écoute, et une story
    /// figée compte comme interrompue — sa pause gèle la barre ET le canvas.
    func test_theViewerWiresTheLawIntoItsPlaybackHold() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let hold = AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+PlaybackHold.swift"),
            encoding: .utf8))
        XCTAssertTrue(hold.contains("StorySessionInterruption()"))
        XCTAssertTrue(hold.contains("MediaSessionCoordinator.shared.events"))
        XCTAssertTrue(hold.contains("isOtherAudioPlaying"))
    }
}
