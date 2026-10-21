#if os(iOS)
import Testing
import AVFoundation
@testable import MeeshySDK

/// #11039 — un son Meeshy met la musique des autres apps en PAUSE, et une
/// vidéo muette n'y touche pas.
struct ContentPlaybackSessionLawTests {

    @Test func anAudibleContent_activatesANonMixablePlaybackSession() {
        let directive = ContentPlaybackSessionLaw.directive(for: .audible, audibleContentHoldsSession: false)

        #expect(directive == .activatePlayback)
        #expect(!ContentPlaybackSessionLaw.audibleOptions.contains(.mixWithOthers))
        #expect(!ContentPlaybackSessionLaw.audibleOptions.contains(.duckOthers))
    }

    @Test func anAudibleContent_activatesEvenWhenAnotherMeeshySoundHoldsTheSession() {
        #expect(ContentPlaybackSessionLaw.directive(for: .audible, audibleContentHoldsSession: true) == .activatePlayback)
    }

    @Test func aMutedVideo_leavesTheOtherAppsMusicAlone() {
        #expect(ContentPlaybackSessionLaw.directive(for: .muted, audibleContentHoldsSession: false)
                == .configureAmbientWithoutActivating)
    }

    @Test func aMutedVideo_doesNotDowngradeAMeeshySoundAlreadyPlaying() {
        #expect(ContentPlaybackSessionLaw.directive(for: .muted, audibleContentHoldsSession: true) == .leaveSessionAlone)
    }

    @Test func aUserPause_releasesTheSessionAfterAboutThreeSeconds() {
        #expect(ContentPlaybackSessionLaw.userPauseReleaseDelay == 3)
    }

    @Test func theDefaultPlaybackRequest_followsTheLaw() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Media/MediaSessionCoordinator.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        let start = try #require(code.range(of: "public func request("))
        let signature = String(code[start.upperBound...].prefix(200))
        #expect(signature.contains("ContentPlaybackSessionLaw.audibleOptions"))
        #expect(!signature.contains(".duckOthers"))
    }
}
#endif
