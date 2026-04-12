import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class NotificationCoordinatorTests: XCTestCase {

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
        let defaults = UserDefaults(suiteName: suite)
        defaults?.removePersistentDomain(forName: suite)
        let writer = MockBadgeWriter()
        let sut = NotificationCoordinator(badgeWriter: writer, appGroupSuiteName: suite)
        let sink = MockWidgetSink()
        sut.widgetSink = sink
        return (sut, writer, sink, suite)
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

    func test_registerConversations_debouncesBadgeWrite() async throws {
        let (sut, writer, sink, suite) = makeSUT()

        sut.registerConversations([makeConversation(id: "a", unread: 4)])

        // Writer is debounced (~150ms) — not called synchronously.
        XCTAssertTrue(writer.writes.isEmpty)

        try await Task.sleep(nanoseconds: 300_000_000)

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

    func test_applyConversationUnread_isIdempotentWhenSameCount() async throws {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 3)])
        try await Task.sleep(nanoseconds: 300_000_000)
        let countAfterFirstSync = writer.writes.count

        sut.applyConversationUnread(conversationId: "c1", unreadCount: 3)
        try await Task.sleep(nanoseconds: 300_000_000)

        // Should not have scheduled a new badge write.
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

    func test_markConversationRead_noOpWhenAlreadyRead() async throws {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 0)])
        try await Task.sleep(nanoseconds: 300_000_000)
        let writesBefore = writer.writes.count

        sut.markConversationRead("c1")
        try await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertEqual(writer.writes.count, writesBefore)
    }

    // MARK: - applyInAppNotificationCounts

    func test_applyInAppNotificationCounts_updatesInAppBellOnly() async throws {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 5)])
        try await Task.sleep(nanoseconds: 300_000_000)
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

    func test_reset_clearsStateAndBadge() async {
        let (sut, writer, sink, suite) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 5)])
        sut.applyInAppNotificationCounts(total: 1, unread: 1)

        sut.reset()

        XCTAssertEqual(sut.conversationUnreadTotal, 0)
        XCTAssertTrue(sut.conversationUnreadCounts.isEmpty)
        XCTAssertEqual(sut.inAppNotificationUnread, 0)
        XCTAssertFalse(sut.isRunning)

        // reset() schedules an async badge-write; give it a beat.
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(writer.writes.last, 0)
        XCTAssertEqual(sink.publishedUnread.last, 0)
        XCTAssertEqual(UserDefaults(suiteName: suite)?.integer(forKey: "unread_count"), 0)
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
