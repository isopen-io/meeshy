import XCTest
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
}
