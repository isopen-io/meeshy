import XCTest
@testable import MeeshySDK

/// #11558 — une valeur que le premier écran attend (le conteneur du groupe
/// d'app) se résout sur une file à part dès le lancement ; le fil principal la
/// RAMASSE, et ne la calcule lui-même que si personne ne l'a lancée.
final class PrefetchedValueTests: XCTestCase {

    private let queue = DispatchQueue(label: "PrefetchedValueTests")

    func test_started_computesOffTheCallingThread_andIsServedWithoutRecomputing() {
        let calls = Locked<[Bool]>([])
        let sut = PrefetchedValue<Int> {
            let onMain = Thread.isMainThread
            calls.mutate { $0.append(onMain) }
            return 42
        }

        sut.start(on: queue)

        XCTAssertEqual(sut.value(), 42)
        XCTAssertEqual(sut.value(), 42)
        XCTAssertEqual(calls.read { $0 }, [false])
    }

    func test_notStarted_computesOnDemand_once() {
        let count = Locked(0)
        let sut = PrefetchedValue<String?> {
            count.mutate { $0 += 1 }
            return nil
        }

        XCTAssertNil(sut.value())
        XCTAssertNil(sut.value())
        XCTAssertEqual(count.read { $0 }, 1, "un nil résolu reste résolu")
    }

    func test_value_whileInFlight_waitsForTheResolution() {
        let gate = DispatchSemaphore(value: 0)
        let count = Locked(0)
        let sut = PrefetchedValue<Int>(waitLimit: .seconds(5)) {
            count.mutate { $0 += 1 }
            gate.wait()
            return 7
        }
        sut.start(on: queue)
        DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(100)) { gate.signal() }

        XCTAssertEqual(sut.value(), 7)
        XCTAssertEqual(count.read { $0 }, 1)
    }

    func test_value_afterTheWaitLimit_computesItselfRatherThanBlockingForever() {
        let gate = DispatchSemaphore(value: 0)
        let sut = PrefetchedValue<Int>(waitLimit: .milliseconds(20)) {
            if !Thread.isMainThread { gate.wait() }
            return 9
        }
        sut.start(on: queue)

        XCTAssertEqual(sut.value(), 9)
        gate.signal()
    }
}
