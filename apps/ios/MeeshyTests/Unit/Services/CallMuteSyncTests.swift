import XCTest
@testable import Meeshy

/// #8434 — le micro coupé reste coupé, quel que soit le moment où on le coupe.
///
/// `P2PWebRTCClient.startLocalMedia` crée TOUJOURS une piste audio active. Un
/// micro coupé avant que le média soit prêt (décroché CallKit, bouton touché
/// pendant la connexion) restait donc ouvert dès que la piste naissait — et de
/// même à chaque recréation (repli simulateur, caméra refusée) — pendant que
/// l'interface et les pairs l'annonçaient coupé.
@MainActor
final class CallMuteSyncTests: XCTestCase {

    private final class RecordingMedia: CallLocalMediaProviding {
        nonisolated deinit {}

        private(set) var events: [String] = []
        var trackEnabled: Bool?
        var startError: Error?
        var onStart: (() -> Void)?

        func startLocalMedia(isVideo: Bool) async throws {
            events.append("start(video: \(isVideo))")
            trackEnabled = true
            onStart?()
            if let startError { throw startError }
        }

        func muteAudio(_ muted: Bool) {
            events.append("mute(\(muted))")
            trackEnabled = !muted
        }
    }

    private struct StartFailure: Error {}

    func test_startLocalMedia_mutedBeforeMediaStarts_leavesTrackDisabled() async throws {
        let media = RecordingMedia()

        try await CallMuteSync.startLocalMedia(isVideo: false, on: media, isMuted: { true })

        XCTAssertEqual(media.trackEnabled, false, "La piste née après la coupure doit naître coupée")
        XCTAssertEqual(media.events, ["start(video: false)", "mute(true)"])
    }

    func test_startLocalMedia_notMuted_leavesTrackEnabled() async throws {
        let media = RecordingMedia()

        try await CallMuteSync.startLocalMedia(isVideo: true, on: media, isMuted: { false })

        XCTAssertEqual(media.trackEnabled, true)
    }

    /// L'état est lu APRÈS la création : couper pendant l'attente compte.
    func test_startLocalMedia_mutedWhileMediaStarts_readsStateAfterCreation() async throws {
        let media = RecordingMedia()
        var isMuted = false
        media.onStart = { isMuted = true }

        try await CallMuteSync.startLocalMedia(isVideo: false, on: media, isMuted: { isMuted })

        XCTAssertEqual(media.trackEnabled, false)
    }

    /// Un démarrage qui échoue après avoir créé la piste audio (vidéo refusée
    /// au simulateur, caméra refusée) laisse une piste vivante : elle aussi
    /// doit porter l'état du micro, même si le repli échoue ensuite.
    func test_startLocalMedia_failingAfterTrackCreation_stillAppliesMute() async {
        let media = RecordingMedia()
        media.startError = StartFailure()

        do {
            try await CallMuteSync.startLocalMedia(isVideo: true, on: media, isMuted: { true })
            XCTFail("L'échec de démarrage doit remonter à l'appelant")
        } catch {
            XCTAssertTrue(error is StartFailure)
        }

        XCTAssertEqual(media.trackEnabled, false)
    }

    // MARK: - Les pairs

    func test_mustAnnounceMuteToPeers_mutedOnCurrentCall_returnsTrue() {
        XCTAssertTrue(CallMuteSync.mustAnnounceMuteToPeers(isMuted: true, currentCallId: "c1", callId: "c1"))
    }

    func test_mustAnnounceMuteToPeers_notMuted_returnsFalse() {
        XCTAssertFalse(CallMuteSync.mustAnnounceMuteToPeers(isMuted: false, currentCallId: "c1", callId: "c1"))
    }

    func test_mustAnnounceMuteToPeers_callReplaced_returnsFalse() {
        XCTAssertFalse(CallMuteSync.mustAnnounceMuteToPeers(isMuted: true, currentCallId: "c2", callId: "c1"))
        XCTAssertFalse(CallMuteSync.mustAnnounceMuteToPeers(isMuted: true, currentCallId: nil, callId: "c1"))
    }
}
