import XCTest
@testable import MeeshySDK

final class ConversationUserStateTests: XCTestCase {

    // MARK: - Defaults

    func test_defaults_areZeroOrFalseOrNil() {
        let s = ConversationUserState()
        XCTAssertEqual(s.unreadCount, 0)
        XCTAssertNil(s.lastReadAt)
        XCTAssertNil(s.lastDeliveredAt)
        XCTAssertFalse(s.isPinned)
        XCTAssertFalse(s.isMuted)
        XCTAssertFalse(s.mentionsOnly)
        XCTAssertFalse(s.isArchived)
        XCTAssertNil(s.deletedForUserAt)
        XCTAssertNil(s.clearHistoryBefore)
        XCTAssertNil(s.customName)
        XCTAssertNil(s.reaction)
        XCTAssertEqual(s.tags, [])
        XCTAssertNil(s.sectionId)
        XCTAssertNil(s.orderInCategory)
        XCTAssertFalse(s.isLocked)
        XCTAssertFalse(s.hasDraft)
        XCTAssertNil(s.draftPreview)
        XCTAssertEqual(s.version, 0)
        XCTAssertNil(s.lastSyncedAt)
        XCTAssertEqual(s.pendingMutationCount, 0)
    }

    func test_staticDefaults_matchesInit() {
        XCTAssertEqual(ConversationUserState.defaults, ConversationUserState())
    }

    // MARK: - Computed convenience

    func test_hasUnreadIndicator_trueWhenUnreadCountPositive() {
        XCTAssertFalse(ConversationUserState(unreadCount: 0).hasUnreadIndicator)
        XCTAssertTrue(ConversationUserState(unreadCount: 1).hasUnreadIndicator)
    }

    func test_hasPendingSync_trueWhenOutboxHasEntries() {
        XCTAssertFalse(ConversationUserState(pendingMutationCount: 0).hasPendingSync)
        XCTAssertTrue(ConversationUserState(pendingMutationCount: 3).hasPendingSync)
    }

    func test_isVisible_falseWhenArchivedOrDeleted() {
        XCTAssertTrue(ConversationUserState().isVisible)
        XCTAssertFalse(ConversationUserState(isArchived: true).isVisible)
        XCTAssertFalse(ConversationUserState(deletedForUserAt: Date()).isVisible)
    }

    // MARK: - Codable round-trip

    func test_codable_roundtripPreservesEveryField() throws {
        let original = ConversationUserState(
            unreadCount: 17,
            lastReadAt: Date(timeIntervalSince1970: 1_700_000_000),
            lastDeliveredAt: Date(timeIntervalSince1970: 1_700_000_500),
            isPinned: true,
            isMuted: true,
            mentionsOnly: true,
            isArchived: true,
            deletedForUserAt: Date(timeIntervalSince1970: 1_700_001_000),
            clearHistoryBefore: Date(timeIntervalSince1970: 1_700_002_000),
            customName: "Pro chat",
            reaction: "🔥",
            tags: ["work", "urgent"],
            sectionId: "cat-1",
            orderInCategory: 3,
            isLocked: true,
            hasDraft: true,
            draftPreview: "Hello there",
            version: 42,
            lastSyncedAt: Date(timeIntervalSince1970: 1_700_003_000),
            pendingMutationCount: 2
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(ConversationUserState.self, from: data)

        XCTAssertEqual(decoded, original)
    }

    func test_codable_acceptsLegacyJSONWithMissingNewFields() throws {
        // Simulate a payload from an older snapshot before isLocked / version
        // / hasDraft / lastSyncedAt etc. existed.
        let json = """
        {
          "unreadCount": 5,
          "isPinned": true,
          "isMuted": false,
          "mentionsOnly": false,
          "isArchived": false,
          "tags": ["foo"]
        }
        """
        let data = json.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(ConversationUserState.self, from: data)

        XCTAssertEqual(decoded.unreadCount, 5)
        XCTAssertTrue(decoded.isPinned)
        XCTAssertEqual(decoded.tags, ["foo"])
        // New fields default cleanly without throwing.
        XCTAssertEqual(decoded.version, 0)
        XCTAssertEqual(decoded.pendingMutationCount, 0)
        XCTAssertFalse(decoded.isLocked)
        XCTAssertFalse(decoded.hasDraft)
        XCTAssertNil(decoded.lastSyncedAt)
    }

    // MARK: - Hashable / Equatable

    func test_equatable_identicalValuesAreEqual() {
        let a = ConversationUserState(unreadCount: 1, isPinned: true, tags: ["x"], version: 3)
        let b = ConversationUserState(unreadCount: 1, isPinned: true, tags: ["x"], version: 3)
        XCTAssertEqual(a, b)
        XCTAssertEqual(a.hashValue, b.hashValue)
    }

    func test_equatable_versionChangeBreaksEquality() {
        let a = ConversationUserState(version: 1)
        let b = ConversationUserState(version: 2)
        XCTAssertNotEqual(a, b)
    }
}
