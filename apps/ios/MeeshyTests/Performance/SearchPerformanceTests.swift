// apps/ios/MeeshyTests/Performance/SearchPerformanceTests.swift
//
// FTS5 search latency benchmarks.
// Proves that MessageSearchService (Phase 2) returns results from a
// 100k-message corpus in under 50 ms.
//
// Seeding 100k rows takes ~10-15 s on the iOS Simulator. These tests are
// gated behind RUN_PERF_BENCHMARKS=1 to keep the regular CI suite fast.
// Run via:  scripts/ios-perf-benchmark.sh

import XCTest
import GRDB
@testable import MeeshySDK

final class SearchPerformanceTests: XCTestCase {

    // MARK: - Setup

    override func setUpWithError() throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["RUN_PERF_BENCHMARKS"] != "1",
            "Perf benchmarks skipped — set RUN_PERF_BENCHMARKS=1 to run"
        )
    }

    // MARK: - 100k corpus

    /// Verifies that FTS5 prefix-match search over 100k messages completes in
    /// under 50 ms (p95 target from the Instant App Foundation plan).
    func test_search_in100kMessages_under50ms() async throws {
        let pool = try makeDatabase(messageCount: 100_000)
        DatabaseMaintenance.applyTuning(on: pool)
        let service = MessageSearchService(reader: pool)

        // Warm-up: let SQLite build any pending FTS5 indexes
        _ = try await service.search(query: "message", limit: 50, conversationId: nil)

        let start = Date()
        let results = try await service.search(query: "message", limit: 50, conversationId: nil)
        let elapsedMs = Date().timeIntervalSince(start) * 1000

        XCTAssertGreaterThan(results.count, 0,
            "FTS5 search should return results for 'message' in a 100k corpus")
        XCTAssertLessThan(elapsedMs, 50,
            "FTS5 search across 100k messages must complete under 50 ms. Actual: \(String(format: "%.1f", elapsedMs)) ms")
    }

    /// Verifies per-conversation scoped search is also under 50 ms.
    func test_search_scopedToConversation_under50ms() async throws {
        let pool = try makeDatabase(messageCount: 100_000)
        DatabaseMaintenance.applyTuning(on: pool)
        let service = MessageSearchService(reader: pool)

        _ = try await service.search(query: "body", limit: 50, conversationId: "c0")

        let start = Date()
        let results = try await service.search(query: "body", limit: 50, conversationId: "c0")
        let elapsedMs = Date().timeIntervalSince(start) * 1000

        XCTAssertGreaterThan(results.count, 0)
        XCTAssertLessThan(elapsedMs, 50,
            "Scoped FTS5 search must complete under 50 ms. Actual: \(String(format: "%.1f", elapsedMs)) ms")
    }

    /// XCTMetric-based repeated measurement for statistical confidence.
    func test_searchLatency_xctMetric() async throws {
        let pool = try makeDatabase(messageCount: 100_000)
        DatabaseMaintenance.applyTuning(on: pool)
        let service = MessageSearchService(reader: pool)

        _ = try await service.search(query: "content", limit: 50, conversationId: nil)

        let options = XCTMeasureOptions()
        options.iterationCount = 5

        measureAsync(options: options) {
            let results = try await service.search(query: "content", limit: 50, conversationId: nil)
            XCTAssertGreaterThan(results.count, 0)
        }
    }

    // MARK: - Helpers

    private func makeDatabase(messageCount: Int) throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)

        try db.write { db in
            for i in 0..<messageCount {
                let record = SearchPerfMessageRecordFactory.make(
                    localId: "m\(i)",
                    conversationId: "c\(i % 10)",
                    content: "message body \(i) content"
                )
                try record.insert(db)
            }
        }
        return db
    }
}

// MARK: - Factory

private enum SearchPerfMessageRecordFactory {
    static func make(
        localId: String = "temp_\(UUID().uuidString)",
        conversationId: String = "c0",
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
