import XCTest
@testable import MeeshySDK

@MainActor
final class RecorderCallGuardTests: XCTestCase {

    private final class SpyRecorder: CallInterruptibleRecorder {
        nonisolated deinit {}
        var stops = 0
        func stopForCall() { stops += 1 }
    }

    func test_stopAllForCall_stopsEveryRegisteredRecorder() {
        let guardian = RecorderCallGuard()
        let a = SpyRecorder(), b = SpyRecorder()
        guardian.register(a)
        guardian.register(b)

        guardian.stopAllForCall()

        XCTAssertEqual(a.stops, 1)
        XCTAssertEqual(b.stops, 1)
    }

    func test_registry_holdsRecordersWeakly() {
        let guardian = RecorderCallGuard()
        do {
            let gone = SpyRecorder()
            guardian.register(gone)
        }
        XCTAssertEqual(guardian.registeredCount, 0)
    }

    func test_unregistered_recorderIsNotStopped() {
        let guardian = RecorderCallGuard()
        let a = SpyRecorder()
        guardian.register(a)
        guardian.unregister(a)
        guardian.stopAllForCall()
        XCTAssertEqual(a.stops, 0)
    }
}
