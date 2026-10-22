import XCTest
@testable import MeeshySDK

private final class BeatScript: Sendable {
    private let remaining: Locked<Int>
    private let cancelledSleeps = Locked<Int>(0)
    private let onCancelled: @Sendable () -> Void

    init(ticks: Int, onCancelled: @escaping @Sendable () -> Void = {}) {
        remaining = Locked(ticks)
        self.onCancelled = onCancelled
    }

    var cancelledCount: Int { cancelledSleeps.read { $0 } }

    func sleep(_ duration: Duration) async -> Bool {
        let scripted = remaining.mutate { (ticks: inout Int) -> Bool in
            guard ticks > 0 else { return false }
            ticks -= 1
            return true
        }
        if scripted { return true }
        let completed = await cancellableSleep(for: .seconds(3_600))
        if !completed {
            cancelledSleeps.mutate { $0 += 1 }
            onCancelled()
        }
        return completed
    }
}

final class SocketHeartbeatTests: XCTestCase {

    func test_start_emitsClientTimeFromInjectedClock_onMainThread() async {
        let script = BeatScript(ticks: 2)
        let fixed = Date(timeIntervalSince1970: 1_700_000_000)
        let heartbeat = SocketHeartbeat(interval: .seconds(30), sleep: { await script.sleep($0) }, now: { fixed })
        let beats = Locked<[Int64]>([])
        let onMain = Locked<[Bool]>([])
        let twoBeats = expectation(description: "deux battements")
        twoBeats.expectedFulfillmentCount = 2

        heartbeat.start { clientTimeMs in
            beats.mutate { $0.append(clientTimeMs) }
            onMain.mutate { $0.append(Thread.isMainThread) }
            twoBeats.fulfill()
        }
        await fulfillment(of: [twoBeats], timeout: 2)
        heartbeat.stop()

        XCTAssertEqual(beats.read { $0 }, [1_700_000_000_000, 1_700_000_000_000])
        XCTAssertEqual(onMain.read { $0 }, [true, true])
    }

    func test_stop_endsTheLoop() async {
        let cancelled = expectation(description: "le sommeil observe l'annulation")
        let script = BeatScript(ticks: 0, onCancelled: { cancelled.fulfill() })
        let heartbeat = SocketHeartbeat(sleep: { await script.sleep($0) })
        let beats = Locked<Int>(0)

        heartbeat.start { _ in beats.mutate { $0 += 1 } }
        heartbeat.stop()
        await fulfillment(of: [cancelled], timeout: 2)

        XCTAssertEqual(beats.read { $0 }, 0)
    }

    func test_startTwice_keepsASingleLoop() async {
        let firstLoopCancelled = expectation(description: "la première boucle est annulée")
        let script = BeatScript(ticks: 0, onCancelled: { firstLoopCancelled.fulfill() })
        firstLoopCancelled.assertForOverFulfill = false
        let heartbeat = SocketHeartbeat(sleep: { await script.sleep($0) })

        heartbeat.start { _ in }
        heartbeat.start { _ in }
        await fulfillment(of: [firstLoopCancelled], timeout: 2)
        heartbeat.stop()

        XCTAssertGreaterThanOrEqual(script.cancelledCount, 1)
    }

    func test_deinit_cancelsTheLoop() async {
        let cancelled = expectation(description: "le sommeil observe l'annulation")
        let script = BeatScript(ticks: 0, onCancelled: { cancelled.fulfill() })
        do {
            let heartbeat = SocketHeartbeat(sleep: { await script.sleep($0) })
            heartbeat.start { _ in }
        }
        await fulfillment(of: [cancelled], timeout: 2)
    }
}

final class SocketHeartbeatAckTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    func test_latencyHint_isDoubledIntoARoundTrip() {
        let payload: [String: Any] = ["serverTime": "2023-11-14T22:13:20.000Z", "latencyHintMs": 12.0 as Double]
        XCTAssertEqual(SocketHeartbeatAck.rtt(from: [payload], now: now), 24)
    }

    func test_withoutHint_serverTimeGivesTheWallClockGapInMilliseconds() {
        let payload: [String: Any] = ["serverTime": "2023-11-14T22:13:19.000Z"]
        let rtt = SocketHeartbeatAck.rtt(from: [payload], now: now)
        XCTAssertEqual(try XCTUnwrap(rtt), 1_000, accuracy: 0.5)
    }

    func test_missingOrUnreadableServerTime_yieldsNil() {
        XCTAssertNil(SocketHeartbeatAck.rtt(from: [["latencyHintMs": 12.0 as Double]], now: now))
        XCTAssertNil(SocketHeartbeatAck.rtt(from: [["serverTime": "pas une date"]], now: now))
        XCTAssertNil(SocketHeartbeatAck.rtt(from: [], now: now))
    }
}
