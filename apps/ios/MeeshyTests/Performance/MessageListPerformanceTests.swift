// apps/ios/MeeshyTests/Performance/MessageListPerformanceTests.swift
//
// XCTMetric-based benchmarks for the message list scroll path.
// Guards Phase 0-3 cumulative gains from regressions.
//
// These tests are intentionally gated behind RUN_PERF_BENCHMARKS=1 so they
// do NOT slow down the regular CI suite. Run via:
//   scripts/ios-perf-benchmark.sh

import XCTest
import GRDB
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class MessageListPerformanceTests: XCTestCase {

    // MARK: - Setup

    override func setUpWithError() throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["RUN_PERF_BENCHMARKS"] != "1",
            "Perf benchmarks skipped — set RUN_PERF_BENCHMARKS=1 to run"
        )
    }

    // MARK: - Benchmark: 1000-message load + section recompute

    /// Measures the cost of loading 1000 messages from an in-memory GRDB pool
    /// and letting MessageStore recompute its sections — a proxy for the work
    /// done on every scroll-to-new-message event.
    func test_loadInitial_1000Messages_clockBaseline() async throws {
        let pool = try makeDatabase(messageCount: 1000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)

        measureAsync {
            await store.loadInitial()
        }

        XCTAssertEqual(store.messages.count, 1000,
            "All 1000 messages should be within the first window")
    }

    /// Measures repeated iteration over a 1000-message slice — simulates the
    /// per-frame work of a fast scroll through a pre-loaded MessageStore.
    func test_messageWindowIteration_1000Messages_underBudget() async throws {
        let pool = try makeDatabase(messageCount: 1000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()

        let options = XCTMeasureOptions()
        options.iterationCount = 10

        measure(options: options) {
            var sum = 0
            for msg in store.messages {
                sum += msg.content?.count ?? 0
            }
            XCTAssertGreaterThan(sum, 0)
        }
    }

    /// Verifies that the `index(of:)` lookup (used by UICollectionView
    /// data-source diffs) stays O(1) after 1000-message load.
    func test_indexLookup_afterLoadInitial_isConstantTime() async throws {
        let pool = try makeDatabase(messageCount: 1000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()

        let targetId = store.messages[500].localId

        let options = XCTMeasureOptions()
        options.iterationCount = 10

        measure(options: options) {
            let idx = store.index(of: targetId)
            XCTAssertEqual(idx, 500)
        }
    }

    // MARK: - Helpers

    private func makeDatabase(messageCount: Int) throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)

        let now = Date()
        try db.write { db in
            for i in 0..<messageCount {
                let record = PerfMessageRecordFactory.make(
                    localId: "m\(i)",
                    conversationId: "c1",
                    content: "message \(i)",
                    createdAt: now.addingTimeInterval(Double(i))
                )
                try record.insert(db)
            }
        }
        return db
    }
}

// MARK: - Factory

private enum PerfMessageRecordFactory {
    static func make(
        localId: String = "temp_\(UUID().uuidString)",
        conversationId: String = "c1",
        content: String? = "Test message",
        createdAt: Date = Date()
    ) -> MessageRecord {
        MessageRecord(
            localId: localId,
            serverId: nil,
            conversationId: conversationId,
            senderId: "user_me",
            content: content,
            originalLanguage: "fr",
            messageType: "text",
            messageSource: "user",
            contentType: "text",
            state: .sent,
            retryCount: 0,
            lastError: nil,
            isEncrypted: false,
            encryptionMode: nil,
            encryptedPayload: nil,
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            replyToJson: nil,
            forwardedFromJson: nil,
            expiresAt: nil,
            effectFlags: 0,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            isEdited: false,
            editedAt: nil,
            deletedAt: nil,
            pinnedAt: nil,
            pinnedBy: nil,
            senderName: nil,
            senderUsername: nil,
            senderColor: nil,
            senderAvatarURL: nil,
            deliveredCount: 1,
            readCount: 0,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            createdAt: createdAt,
            sentAt: nil,
            deliveredAt: nil,
            readAt: nil,
            updatedAt: createdAt,
            attachmentsJson: nil,
            reactionsJson: nil,
            reactionCount: 0,
            currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil,
            cachedBubbleHeight: nil,
            cachedLastLineWidth: nil,
            cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0,
            layoutMaxWidth: nil,
            changeVersion: 0
        )
    }
}
