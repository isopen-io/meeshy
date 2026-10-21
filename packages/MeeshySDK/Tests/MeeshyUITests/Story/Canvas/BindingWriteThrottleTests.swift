import XCTest
@testable import MeeshyUI

/// #9874 - pincer ou tourner un calque ecrivait le binding du composer a la
/// cadence tactile (60-120 Hz). L'ecriture est bornee a 30 Hz, et la valeur
/// finale part toujours.
@MainActor
final class BindingWriteThrottleTests: XCTestCase {

    @MainActor
    private final class Harness {
        var now: TimeInterval = 100
        var written: [Int] = []
        var scheduled: [(delay: TimeInterval, run: @MainActor () -> Void)] = []
        lazy var throttle = BindingWriteThrottle<Int>(
            write: { [unowned self] in self.written.append($0) },
            clock: { [unowned self] in self.now },
            schedule: { [unowned self] delay, run in
                self.scheduled.append((delay, run))
                return {}
            }
        )
    }

    func test_decide_firstWrite_isImmediate() {
        XCTAssertEqual(BindingWriteCadence.decide(now: 10, lastWrite: nil), .writeNow)
    }

    func test_decide_afterInterval_isImmediate() {
        let last = 10.0
        let now = last + BindingWriteCadence.minimumInterval
        XCTAssertEqual(BindingWriteCadence.decide(now: now, lastWrite: last), .writeNow)
    }

    func test_decide_insideInterval_defersByTheRemainder() {
        let decision = BindingWriteCadence.decide(now: 10.010, lastWrite: 10)
        guard case .deferred(let delay) = decision else { return XCTFail("attendu : differe") }
        XCTAssertEqual(delay, BindingWriteCadence.minimumInterval - 0.010, accuracy: 0.0001)
    }

    func test_burst_writesFirstThenOnlyTheLastOnTrailingEdge() {
        let h = Harness()
        h.throttle.submit(1)
        h.now += 0.008
        h.throttle.submit(2)
        h.now += 0.008
        h.throttle.submit(3)

        XCTAssertEqual(h.written, [1], "dans la fenetre, rien d'autre ne part")
        XCTAssertEqual(h.scheduled.count, 1, "un seul front de queue arme pour la rafale")

        h.now += 0.02
        h.scheduled[0].run()

        XCTAssertEqual(h.written, [1, 3], "la valeur finale part, pas les intermediaires")
    }

    func test_sixtySubmissionsOverOneSecond_writeAtMost31Times() {
        let h = Harness()
        for index in 0..<120 {
            h.now = 100 + Double(index) / 120
            h.throttle.submit(index)
        }
        h.now += 0.05
        h.scheduled.forEach { $0.run() }

        XCTAssertLessThanOrEqual(h.written.count, 32)
        XCTAssertEqual(h.written.last, 119, "la derniere valeur est exacte")
    }

    func test_flush_writesPendingValueOnce() {
        let h = Harness()
        h.throttle.submit(1)
        h.throttle.submit(2)

        h.throttle.flush()
        h.throttle.flush()

        XCTAssertEqual(h.written, [1, 2])
    }
}
