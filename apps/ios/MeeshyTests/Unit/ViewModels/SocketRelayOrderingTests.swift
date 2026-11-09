import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

@MainActor
final class SocketRelayOrderingTests: XCTestCase {

    private final class FlushProbe {
        var inFlight = 0
        var maxInFlight = 0
        var started: [Int] = []
        var finished = 0
    }

    func test_reconnectBurst_flushesSequentiallyInArrivalOrder() async {
        let probe = FlushProbe()
        let subject = PassthroughSubject<Bool, Never>()
        let done = expectation(description: "three flushes")
        done.expectedFulfillmentCount = 3
        let scheduler = OutboxRetryScheduler.shared

        scheduler.startObservingSocketReconnect(
            connectedPublisher: subject.eraseToAnyPublisher(),
            flush: { @MainActor in
                probe.inFlight += 1
                probe.maxInFlight = max(probe.maxInFlight, probe.inFlight)
                probe.started.append(probe.started.count)
                try? await Task.sleep(for: .milliseconds(30))
                probe.inFlight -= 1
                probe.finished += 1
                done.fulfill()
            }
        )

        subject.send(false)
        subject.send(true)
        subject.send(false)
        subject.send(true)
        subject.send(false)
        subject.send(true)

        await fulfillment(of: [done], timeout: 3)
        XCTAssertEqual(probe.maxInFlight, 1)
        XCTAssertEqual(probe.started, [0, 1, 2])
    }

    func test_relayThroughLane_keepsEventsInOrderWhenAJobSuspends() async {
        let subject = PassthroughSubject<Int, Never>()
        let seen = Locked<[Int]>([])
        let finished = expectation(description: "all events handled")
        finished.expectedFulfillmentCount = 5
        let subscription = subject.relay(through: OrderedEventLane()) { value in
            if value == 0 { try? await Task.sleep(for: .milliseconds(50)) }
            seen.mutate { $0.append(value) }
            finished.fulfill()
        }

        (0..<5).forEach { subject.send($0) }

        await fulfillment(of: [finished], timeout: 3)
        XCTAssertEqual(seen.read { $0 }, [0, 1, 2, 3, 4])
        subscription.cancel()
    }
}
