import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

@MainActor
final class BackgroundTaskManagerTests: XCTestCase {

    // BackgroundTaskManager is tightly coupled to BGTaskScheduler.
    // We test the task identifiers, shared instance, and static properties.

    // MARK: - Task Identifiers

    func test_conversationSyncTaskId_isCorrectFormat() {
        XCTAssertEqual(
            BackgroundTaskManager.conversationSyncTaskId,
            "me.meeshy.app.conversation-sync"
        )
    }

    func test_messagePrefetchTaskId_isCorrectFormat() {
        XCTAssertEqual(
            BackgroundTaskManager.messagePrefetchTaskId,
            "me.meeshy.app.message-prefetch"
        )
    }

    func test_taskIds_areDifferent() {
        XCTAssertNotEqual(
            BackgroundTaskManager.conversationSyncTaskId,
            BackgroundTaskManager.messagePrefetchTaskId
        )
    }

    // MARK: - Shared Instance

    func test_shared_returnsSameInstance() {
        let a = BackgroundTaskManager.shared
        let b = BackgroundTaskManager.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - Task ID Format

    func test_taskIds_useBundleIdPrefix() {
        XCTAssertTrue(BackgroundTaskManager.conversationSyncTaskId.hasPrefix("me.meeshy.app."))
        XCTAssertTrue(BackgroundTaskManager.messagePrefetchTaskId.hasPrefix("me.meeshy.app."))
    }

    func test_taskIds_useHyphenatedNames() {
        XCTAssertTrue(BackgroundTaskManager.conversationSyncTaskId.contains("conversation-sync"))
        XCTAssertTrue(BackgroundTaskManager.messagePrefetchTaskId.contains("message-prefetch"))
    }

    // MARK: - T10 — outbox flush on network reconnect (OutboxRetryScheduler)

    /// An offline→online transition must wake the outbox flusher, otherwise a
    /// mutation enqueued offline (which leaves no backoff timer armed) sits
    /// `pending` until an incidental lifecycle event.
    func test_observeNetworkReconnect_flushesOnOfflineToOnline() {
        let subject = CurrentValueSubject<NetworkCondition, Never>(.offline)
        let flushed = expectation(description: "flush fired on reconnect")
        var flushCount = 0
        OutboxRetryScheduler.shared.startObservingNetworkReconnect(
            conditionPublisher: subject.eraseToAnyPublisher(),
            flush: { flushCount += 1; flushed.fulfill() }
        )

        subject.send(.wifi) // offline → online

        wait(for: [flushed], timeout: 1.0)
        XCTAssertEqual(flushCount, 1)
    }

    /// Transitions that stay online (wifi↔cellular) are not reconnects and
    /// must NOT wake the flusher — only a genuine offline→online edge does.
    func test_observeNetworkReconnect_ignoresOnlineToOnlineTransitions() {
        let subject = CurrentValueSubject<NetworkCondition, Never>(.wifi)
        var flushCount = 0
        OutboxRetryScheduler.shared.startObservingNetworkReconnect(
            conditionPublisher: subject.eraseToAnyPublisher(),
            flush: { flushCount += 1 }
        )

        subject.send(.goodCellular) // online → online
        subject.send(.wifi)         // online → online

        let settle = expectation(description: "let any erroneous flush run")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { settle.fulfill() }
        wait(for: [settle], timeout: 1.0)
        XCTAssertEqual(flushCount, 0, "online→online transitions must not wake the outbox")
    }
}
