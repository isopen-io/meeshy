import XCTest
@testable import Meeshy

/// #17953 — la sonnerie ne fige plus l'app : l'activation de la session et le
/// démarrage de la boucle sont confiés à un démarreur hors du fil principal.
@MainActor
final class RingbackTonePlayerOffMainTests: XCTestCase {

    func test_startRingtone_handsSessionActivationToStarter_withoutPlayingInline() {
        let starter = RecordingLoopStarter()
        let player = RingbackTonePlayer(starter: starter)
        player.shouldSelfActivateSession = true

        player.startRingtone()

        XCTAssertEqual(starter.requests.count, 1)
        XCTAssertEqual(starter.requests.first?.activatingSession, true)
        XCTAssertEqual(starter.requests.first?.url.lastPathComponent, "Ringtone.caf")
    }

    func test_startRingtone_onCallKitCall_neverActivatesTheSession() {
        let starter = RecordingLoopStarter()
        let player = RingbackTonePlayer(starter: starter)
        player.shouldSelfActivateSession = false

        player.startRingtone()

        XCTAssertEqual(starter.requests.first?.activatingSession, false)
    }

    func test_stopRingtone_beforeTheLoopIsDelivered_stopsTheLateLoop() {
        let starter = RecordingLoopStarter()
        let player = RingbackTonePlayer(starter: starter)
        player.startRingtone()

        player.stopRingtone()
        let late = FakeLoop()
        starter.requests.first?.delivered(late)

        XCTAssertEqual(late.stopCount, 1)
    }

    func test_stopRingtone_afterDelivery_stopsTheLoop() {
        let starter = RecordingLoopStarter()
        let player = RingbackTonePlayer(starter: starter)
        player.startRingtone()
        let loop = FakeLoop()
        starter.requests.first?.delivered(loop)
        XCTAssertEqual(loop.stopCount, 0)

        player.stopRingtone()

        XCTAssertEqual(loop.stopCount, 1)
    }

    func test_stopRingback_whileRingtonePending_leavesTheRingtone() {
        let starter = RecordingLoopStarter()
        let player = RingbackTonePlayer(starter: starter)
        player.startRingtone()

        player.stop()
        let loop = FakeLoop()
        starter.requests.first?.delivered(loop)

        XCTAssertEqual(loop.stopCount, 0)
    }
}

private final class FakeLoop: CallSoundLoop, @unchecked Sendable {
    private(set) var stopCount = 0
    func stop() { stopCount += 1 }
}

private final class RecordingLoopStarter: CallSoundLoopStarting, @unchecked Sendable {
    struct Request {
        let url: URL
        let activatingSession: Bool
        let delivered: @MainActor @Sendable (CallSoundLoop?) -> Void
    }

    private(set) var requests: [Request] = []

    func startLoop(
        url: URL,
        volume: Float,
        activatingSession: Bool,
        delivered: @escaping @MainActor @Sendable (CallSoundLoop?) -> Void
    ) {
        requests.append(Request(url: url, activatingSession: activatingSession, delivered: delivered))
    }
}
