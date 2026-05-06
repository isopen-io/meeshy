import XCTest
import Combine
@testable import Meeshy

@MainActor
final class ConversationViewLifecycleTests: XCTestCase {

    // Asserts the harness's invalidate contract (used as a behavioural seam in tests).
    func test_invalidate_afterMakeTimer_setsIsActiveFalse() async {
        let cancellable = TypingDotTimerHarness.shared.makeTimer()
        XCTAssertTrue(TypingDotTimerHarness.shared.isActive)

        TypingDotTimerHarness.shared.invalidate(cancellable)

        XCTAssertFalse(TypingDotTimerHarness.shared.isActive)
    }

    // Asserts the cancellation pattern used by ConversationView itself:
    // Publishers.Timer (no autoconnect) + connect() + cancel() must stop emissions.
    func test_publishersTimer_stopsEmitting_afterConnectionCancelled() async throws {
        let publisher = Timer.publish(every: 0.05, on: .main, in: .common)
        var receivedCount = 0
        let sink = publisher.sink { _ in receivedCount += 1 }
        let connection = publisher.connect()

        try await Task.sleep(for: .milliseconds(200))
        let countWhileRunning = receivedCount
        XCTAssertGreaterThan(countWhileRunning, 0,
            "Timer must emit while connection is active")

        connection.cancel()
        try await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(receivedCount, countWhileRunning,
            "Timer must stop emitting after connection.cancel()")

        sink.cancel()
    }
}
