import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// #11040, décision porteur j (2026-10-20) — chaque lecteur de contenu rend
/// la main : la pause depuis la fenêtre PiP ou l'écran verrouillé libère la
/// session comme une pause dans l'app, une story mise en pause aussi, et un
/// lecteur externe qui sonne encore empêche toute libération.
@MainActor
final class ContentPlayersHandBackSessionTests: XCTestCase {

    private final class FakeExternalPlayer: AudiblyPlayingPlayer {
        nonisolated deinit {}
        var isPlayingAudibly = false
        func stop() { isPlayingAudibly = false }
    }

    func test_aPauseFromThePipWindow_handsTheSessionBack() async {
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        var releases = 0
        manager.releaseSessionAfterPause = { releases += 1 }
        addTeardownBlock { @MainActor in
            manager.releaseSessionAfterPause = { MediaSessionCoordinator.shared.releaseAfterUserPause() }
            manager.wantsPlayback = false
            manager.interruptionLedger = InterruptionResumeLedger()
        }
        manager.wantsPlayback = true

        manager.noteObservedRate(0)
        for _ in 0..<60 where releases == 0 { try? await Task.sleep(for: .milliseconds(20)) }

        XCTAssertEqual(releases, 1)
        XCTAssertFalse(manager.wantsPlayback)
    }

    func test_anExternalPlayerThatStillSounds_holdsTheSession() {
        let player = FakeExternalPlayer()
        let withoutThisPlayer = RecordingPlaybackDucker.shared.meeshyStillPlays
        PlaybackCoordinator.shared.registerExternal(player)
        addTeardownBlock { @MainActor in PlaybackCoordinator.shared.unregisterExternal(player) }

        player.isPlayingAudibly = true
        XCTAssertTrue(RecordingPlaybackDucker.shared.meeshyStillPlays)

        player.isPlayingAudibly = false
        XCTAssertEqual(RecordingPlaybackDucker.shared.meeshyStillPlays, withoutThisPlayer, "un lecteur externe redevenu muet ne retient plus la session")
    }

    /// Une story qui sonnait rend la session au bout de ≈ 3 s de pause, et sa
    /// reprise la réactive (ce qui annule une libération pas encore partie).
    func test_aPausedStory_handsTheSessionBack_andItsResumeTakesItAgain() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/ReaderAudioMixer.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        let pause = try XCTUnwrap(code.range(of: "public func pause() {"))
        XCTAssertTrue(String(code[pause.upperBound...].prefix(400)).contains("MediaSessionCoordinator.shared.releaseAfterUserPause()"))
        let play = try XCTUnwrap(code.range(of: "if startedSlideKey == slideKey {"))
        XCTAssertTrue(String(code[play.upperBound...].prefix(600)).contains("MediaSessionCoordinator.shared.activateContentPlayback(.audible)"))
    }
}
