import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class NotificationCoordinatorTests: XCTestCase {

    // Track app-group suite names so we can tear them down after each test.
    private var createdSuiteNames: [String] = []

    override func tearDown() {
        for suite in createdSuiteNames {
            UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
        }
        createdSuiteNames.removeAll()
        super.tearDown()
    }

    // MARK: - Test doubles

    final class MockBadgeWriter: NotificationBadgeWriting, @unchecked Sendable {
        private let lock = NSLock()
        private var _writes: [Int] = []
        var writes: [Int] {
            lock.lock(); defer { lock.unlock() }
            return _writes
        }
        func setBadgeCount(_ count: Int) async {
            lock.lock(); _writes.append(count); lock.unlock()
        }
    }

    @MainActor
    final class MockWidgetSink: NotificationWidgetSink {
        var publishedConversations: [[MeeshyConversation]] = []
        var publishedFavorites: [[MeeshyConversation]] = []
        var publishedUnread: [Int] = []
        var reloadCount = 0

        func publishConversations(_ conversations: [MeeshyConversation]) {
            publishedConversations.append(conversations)
        }
        func publishFavoriteContacts(_ conversations: [MeeshyConversation]) {
            publishedFavorites.append(conversations)
        }
        func publishUnreadCount(_ count: Int) {
            publishedUnread.append(count)
        }
        func reloadTimelines() {
            reloadCount += 1
        }
    }

    // MARK: - Factory

    private func makeSUT() -> (NotificationCoordinator, MockBadgeWriter, MockWidgetSink, String) {
        let suite = "group.test.meeshy.coordinator.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        let defaults = UserDefaults(suiteName: suite)
        defaults?.removePersistentDomain(forName: suite)
        let writer = MockBadgeWriter()
        let sut = NotificationCoordinator(badgeWriter: writer, appGroupSuiteName: suite)
        let sink = MockWidgetSink()
        sut.widgetSink = sink
        return (sut, writer, sink, suite)
    }

    /// Wait until `condition()` returns true or the timeout expires. Unlike
    /// `Task.sleep`, this polls the Combine-driven debounce machinery on the
    /// main run loop, which is the iOS test-guide's preferred pattern.
    private func waitFor(
        _ description: String,
        timeout: TimeInterval = 1.0,
        condition: @escaping () -> Bool
    ) {
        let expectation = expectation(description: description)
        let start = Date()
        let timer = Timer.scheduledTimer(withTimeInterval: 0.02, repeats: true) { timer in
            if condition() {
                expectation.fulfill()
                timer.invalidate()
            } else if Date().timeIntervalSince(start) > timeout {
                timer.invalidate()
            }
        }
        wait(for: [expectation], timeout: timeout + 0.1)
        timer.invalidate()
    }

    private func makeConversation(
        id: String,
        unread: Int = 0,
        pinned: Bool = false,
        type: MeeshyConversation.ConversationType = .direct
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: id,
            type: type,
            title: "Conv \(id)",
            unreadCount: unread,
            isPinned: pinned
        )
    }

    // MARK: - registerConversations

    func test_registerConversations_aggregatesUnreadTotal() async {
        let (sut, _, _, _) = makeSUT()

        sut.registerConversations([
            makeConversation(id: "c1", unread: 3),
            makeConversation(id: "c2", unread: 5),
            makeConversation(id: "c3", unread: 0)
        ])

        XCTAssertEqual(sut.conversationUnreadTotal, 8)
        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 3)
        XCTAssertEqual(sut.conversationUnreadCounts["c2"], 5)
        XCTAssertEqual(sut.conversationUnreadCounts["c3"], 0)
        XCTAssertEqual(sut.badgeTotal, 8)
    }

    func test_registerConversations_pushesToWidgetSink() async {
        let (sut, _, sink, _) = makeSUT()

        sut.registerConversations([makeConversation(id: "a", unread: 2, pinned: true)])

        XCTAssertEqual(sink.publishedConversations.count, 1)
        XCTAssertEqual(sink.publishedConversations.first?.first?.id, "a")
        XCTAssertEqual(sink.publishedFavorites.count, 1)
    }

    func test_registerConversations_debouncesBadgeWrite() {
        let (sut, writer, sink, suite) = makeSUT()

        sut.registerConversations([makeConversation(id: "a", unread: 4)])

        // Writer is debounced (~150ms) — not called synchronously.
        XCTAssertTrue(writer.writes.isEmpty)

        waitFor("badge written") { writer.writes.contains(4) }

        XCTAssertEqual(writer.writes.last, 4)
        XCTAssertEqual(sink.publishedUnread.last, 4)
        XCTAssertEqual(UserDefaults(suiteName: suite)?.integer(forKey: "unread_count"), 4)
        XCTAssertGreaterThanOrEqual(sink.reloadCount, 1)
    }

    // MARK: - applyConversationUnread

    func test_applyConversationUnread_updatesSingleEntry() async {
        let (sut, _, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 2)])

        sut.applyConversationUnread(conversationId: "c1", unreadCount: 7)

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 7)
        XCTAssertEqual(sut.conversationUnreadTotal, 7)
    }

    func test_applyConversationUnread_addsNewConversation() async {
        let (sut, _, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 2)])

        sut.applyConversationUnread(conversationId: "c2", unreadCount: 4)

        XCTAssertEqual(sut.conversationUnreadTotal, 6)
    }

    func test_applyConversationUnread_clampsNegativeCounts() async {
        let (sut, _, _, _) = makeSUT()

        sut.applyConversationUnread(conversationId: "c1", unreadCount: -3)

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 0)
        XCTAssertEqual(sut.conversationUnreadTotal, 0)
    }

    func test_applyConversationUnread_isIdempotentWhenSameCount() {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 3)])
        waitFor("first sync") { writer.writes.contains(3) }
        let countAfterFirstSync = writer.writes.count

        sut.applyConversationUnread(conversationId: "c1", unreadCount: 3)
        // Give the debounce time to fire if it was going to — it shouldn't.
        let notScheduled = expectation(description: "no new write")
        notScheduled.isInverted = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if writer.writes.count > countAfterFirstSync { notScheduled.fulfill() }
        }
        wait(for: [notScheduled], timeout: 0.4)

        XCTAssertEqual(writer.writes.count, countAfterFirstSync)
    }

    // MARK: - markConversationRead

    func test_markConversationRead_zeroesThatConversation() async {
        let (sut, _, _, _) = makeSUT()
        sut.registerConversations([
            makeConversation(id: "c1", unread: 4),
            makeConversation(id: "c2", unread: 2)
        ])

        sut.markConversationRead("c1")

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 0)
        XCTAssertEqual(sut.conversationUnreadTotal, 2)
    }

    func test_markConversationRead_noOpWhenAlreadyRead() {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 0)])
        waitFor("initial sync") { !writer.writes.isEmpty || writer.writes.contains(0) }
        let writesBefore = writer.writes.count

        sut.markConversationRead("c1")
        let notScheduled = expectation(description: "no new write")
        notScheduled.isInverted = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if writer.writes.count > writesBefore { notScheduled.fulfill() }
        }
        wait(for: [notScheduled], timeout: 0.4)

        XCTAssertEqual(writer.writes.count, writesBefore)
    }

    // MARK: - applyInAppNotificationCounts

    func test_applyInAppNotificationCounts_updatesInAppBellOnly() {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 5)])
        waitFor("initial sync") { writer.writes.contains(5) }
        let writesBefore = writer.writes.count

        sut.applyInAppNotificationCounts(total: 12, unread: 7)

        XCTAssertEqual(sut.inAppNotificationUnread, 7)
        // Must NOT change the badge: messages remain the source of truth.
        XCTAssertEqual(writer.writes.count, writesBefore)
        XCTAssertEqual(sut.conversationUnreadTotal, 5)
    }

    func test_applyInAppNotificationCounts_clampsNegatives() async {
        let (sut, _, _, _) = makeSUT()

        sut.applyInAppNotificationCounts(total: 0, unread: -2)

        XCTAssertEqual(sut.inAppNotificationUnread, 0)
    }

    // MARK: - syncNow

    func test_syncNow_writesBadgeAndWidget() async {
        let (sut, writer, sink, suite) = makeSUT()
        sut.registerConversations([makeConversation(id: "a", unread: 3)])

        await sut.syncNow()

        XCTAssertEqual(writer.writes.last, 3)
        XCTAssertEqual(sink.publishedUnread.last, 3)
        XCTAssertEqual(UserDefaults(suiteName: suite)?.integer(forKey: "unread_count"), 3)
    }

    // MARK: - reset

    func test_reset_clearsStateAndBadge() {
        let (sut, writer, sink, suite) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 5)])
        sut.applyInAppNotificationCounts(total: 1, unread: 1)

        sut.reset()

        XCTAssertEqual(sut.conversationUnreadTotal, 0)
        XCTAssertTrue(sut.conversationUnreadCounts.isEmpty)
        XCTAssertEqual(sut.inAppNotificationUnread, 0)
        XCTAssertFalse(sut.isRunning)

        waitFor("reset badge write") { writer.writes.last == 0 }

        XCTAssertEqual(writer.writes.last, 0)
        XCTAssertEqual(sink.publishedUnread.last, 0)
        XCTAssertEqual(UserDefaults(suiteName: suite)?.integer(forKey: "unread_count"), 0)
    }

    // MARK: - increment/decrement

    func test_incrementInAppNotificationUnread_incrementsBy1() {
        let (sut, _, _, _) = makeSUT()
        sut.setInAppNotificationUnread(4)

        sut.incrementInAppNotificationUnread()

        XCTAssertEqual(sut.inAppNotificationUnread, 5)
    }

    func test_decrementInAppNotificationUnread_clampsAtZero() {
        let (sut, _, _, _) = makeSUT()
        sut.setInAppNotificationUnread(0)

        sut.decrementInAppNotificationUnread()

        XCTAssertEqual(sut.inAppNotificationUnread, 0)
    }

    // MARK: - start idempotency

    func test_start_isIdempotent() {
        let (sut, _, _, _) = makeSUT()

        sut.start()
        let runningAfterFirst = sut.isRunning
        sut.start()

        XCTAssertTrue(runningAfterFirst)
        XCTAssertTrue(sut.isRunning)
    }
}
