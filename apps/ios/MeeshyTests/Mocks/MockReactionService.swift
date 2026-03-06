import Foundation
import MeeshySDK
import XCTest

@MainActor
final class MockReactionService: ReactionServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var addResult: Result<Void, Error> = .success(())
    var removeResult: Result<Void, Error> = .success(())
    var fetchDetailsResult: Result<ReactionSyncResponse, Error> = .success(
        JSONStub.decode("""
        {"messageId":"000000000000000000000001","reactions":[],"totalCount":0,"userReactions":[]}
        """)
    )

    // MARK: - Call Tracking

    var addCallCount = 0
    var lastAddMessageId: String?
    var lastAddEmoji: String?

    var removeCallCount = 0
    var lastRemoveMessageId: String?
    var lastRemoveEmoji: String?

    var fetchDetailsCallCount = 0
    var lastFetchDetailsMessageId: String?

    // MARK: - Protocol Conformance

    nonisolated func add(messageId: String, emoji: String) async throws {
        await MainActor.run {
            addCallCount += 1
            lastAddMessageId = messageId
            lastAddEmoji = emoji
        }
        try await MainActor.run { try addResult.get() }
    }

    nonisolated func remove(messageId: String, emoji: String) async throws {
        await MainActor.run {
            removeCallCount += 1
            lastRemoveMessageId = messageId
            lastRemoveEmoji = emoji
        }
        try await MainActor.run { try removeResult.get() }
    }

    nonisolated func fetchDetails(messageId: String) async throws -> ReactionSyncResponse {
        await MainActor.run {
            fetchDetailsCallCount += 1
            lastFetchDetailsMessageId = messageId
        }
        return try await MainActor.run { try fetchDetailsResult.get() }
    }

    // MARK: - Reset

    func reset() {
        addCallCount = 0
        lastAddMessageId = nil
        lastAddEmoji = nil
        removeCallCount = 0
        lastRemoveMessageId = nil
        lastRemoveEmoji = nil
        fetchDetailsCallCount = 0
        lastFetchDetailsMessageId = nil
    }
}
