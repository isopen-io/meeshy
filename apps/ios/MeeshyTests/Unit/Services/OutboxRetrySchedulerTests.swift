import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

// MARK: - OutboxRetrySchedulerTests

/// Tests for OutboxRetryScheduler.startObservingNetworkReconnect.
///
/// The method accepts injected publisher + flush closure, making the
/// offline→online reconnect trigger fully testable without real networking.
///
/// Pipeline under test:
///   conditionPublisher
///     .map { $0 != .offline }   // Bool
///     .removeDuplicates()
///     .dropFirst()              // ignore subscription-time initial value
///     .filter { $0 }            // only online transitions
///     .sink { Task @MainActor { await flush() } }
@MainActor
final class OutboxRetrySchedulerTests: XCTestCase {

    // MARK: - offline→online triggers flush

    func test_startObserving_whenOfflineToOnline_callsFlushOnce() async {
        let subject = PassthroughSubject<NetworkCondition, Never>()
        var count = 0
        let exp = expectation(description: "flush called once")

        OutboxRetryScheduler.shared.startObservingNetworkReconnect(
            conditionPublisher: subject.eraseToAnyPublisher(),
            flush: { @MainActor in
                count += 1
                if count == 1 { exp.fulfill() }
            }
        )

        // dropFirst consumes the initial value; offline→online is the real transition.
        subject.send(.wifi)    // dropped (first element)
        subject.send(.offline) // isOnline=false → filter rejects
        subject.send(.wifi)    // isOnline=true → flush

        await fulfillment(of: [exp], timeout: 1.0)
        XCTAssertEqual(count, 1)
    }

    // MARK: - first value is always dropped

    func test_startObserving_whenOnlyOneValueEmitted_doesNotCallFlush() async throws {
        let subject = PassthroughSubject<NetworkCondition, Never>()
        var flushCalled = false

        OutboxRetryScheduler.shared.startObservingNetworkReconnect(
            conditionPublisher: subject.eraseToAnyPublisher(),
            flush: { @MainActor in flushCalled = true }
        )

        subject.send(.wifi) // dropped — no transition observed yet
        // Wait long enough for any spurious async task to run.
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertFalse(flushCalled, "dropFirst() must suppress the initial subscription value")
    }

    // MARK: - staying online does not re-trigger flush

    func test_startObserving_whenAlreadyOnlineAndStaysOnline_doesNotCallFlush() async throws {
        let subject = PassthroughSubject<NetworkCondition, Never>()
        var count = 0

        OutboxRetryScheduler.shared.startObservingNetworkReconnect(
            conditionPublisher: subject.eraseToAnyPublisher(),
            flush: { @MainActor in count += 1 }
        )

        subject.send(.wifi)         // dropped (first)
        subject.send(.goodCellular) // true → removeDuplicates(prev=true) → DUPLICATE, skipped
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(count, 0, "Staying online must not trigger a flush")
    }

    // MARK: - multiple offline→online cycles each trigger one flush

    func test_startObserving_whenMultipleOfflineOnlineCycles_callsFlushPerCycle() async {
        let subject = PassthroughSubject<NetworkCondition, Never>()
        var count = 0
        let exp = expectation(description: "flush called twice")
        exp.expectedFulfillmentCount = 2

        OutboxRetryScheduler.shared.startObservingNetworkReconnect(
            conditionPublisher: subject.eraseToAnyPublisher(),
            flush: { @MainActor in
                count += 1
                exp.fulfill()
            }
        )

        subject.send(.wifi)    // dropped
        subject.send(.offline) // goes offline
        subject.send(.wifi)    // reconnect #1 → flush
        subject.send(.offline) // offline again
        subject.send(.wifi)    // reconnect #2 → flush

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(count, 2)
    }

    // MARK: - calling startObserving again cancels the previous subscription

    func test_startObserving_whenCalledTwice_onlyLatestSubscriptionReceivesEvents() async throws {
        let firstSubject = PassthroughSubject<NetworkCondition, Never>()
        let secondSubject = PassthroughSubject<NetworkCondition, Never>()
        var firstCount = 0
        var secondCount = 0
        let exp = expectation(description: "second flush called")

        // First subscription
        OutboxRetryScheduler.shared.startObservingNetworkReconnect(
            conditionPublisher: firstSubject.eraseToAnyPublisher(),
            flush: { @MainActor in firstCount += 1 }
        )

        // Second call replaces the AnyCancellable, cancelling the first subscription
        OutboxRetryScheduler.shared.startObservingNetworkReconnect(
            conditionPublisher: secondSubject.eraseToAnyPublisher(),
            flush: { @MainActor in
                secondCount += 1
                exp.fulfill()
            }
        )

        // Events on the first subject must NOT reach flush (subscription cancelled)
        firstSubject.send(.wifi)    // dropped
        firstSubject.send(.offline)
        firstSubject.send(.wifi)
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(firstCount, 0, "First subject must be cancelled after second startObserving call")

        // Events on the second subject must reach flush normally
        secondSubject.send(.wifi)    // dropped
        secondSubject.send(.offline)
        secondSubject.send(.wifi)    // triggers flush

        await fulfillment(of: [exp], timeout: 1.0)
        XCTAssertEqual(secondCount, 1)
    }

    // MARK: - schedule(at: nil) does not crash

    func test_schedule_whenDateIsNil_doesNotCrash() {
        OutboxRetryScheduler.shared.schedule(at: nil)
        // No assertion needed — the intent is to verify no crash or precondition failure.
    }

    // MARK: - schedule(at:) with future date can be cancelled with nil

    func test_schedule_cancelExistingTimerWithNil() {
        let futureDate = Date().addingTimeInterval(3600)
        OutboxRetryScheduler.shared.schedule(at: futureDate)
        // Immediately cancel — should not crash
        OutboxRetryScheduler.shared.schedule(at: nil)
    }
}
