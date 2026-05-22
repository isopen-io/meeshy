import XCTest
@testable import MeeshySDK

/// Integration tests pinning the contract between `MeeshyConversation`
/// and the new `ConversationUserState`:
///
/// 1. Existing call sites that read/write the legacy inline flags
///    (`isPinned`, `isMuted`, …) still observe and mutate the same
///    underlying value — those properties are now deprecated computed
///    shims, not stored fields.
/// 2. Wire format stays flat: per-user fields appear as top-level keys
///    in the JSON so old `/conversations` responses and old GRDB cache
///    rows decode without change.
/// 3. New per-user fields (lastReadAt, version, deletedForUserAt, etc.)
///    encode/decode losslessly through the custom Codable path.
final class MeeshyConversationUserStateIntegrationTests: XCTestCase {

    // MARK: - Legacy shim parity

    @available(*, deprecated)
    func test_legacyShim_writeReadGoesThroughUserState() {
        var conv = MeeshyConversation(
            identifier: "shim-1",
            unreadCount: 7,
            isPinned: true,
            isMuted: true,
            mentionsOnly: false,
            isArchivedByUser: true,
            customName: "Family",
            reaction: "❤️"
        )

        // Constructor seeded userState from legacy params.
        XCTAssertEqual(conv.userState.unreadCount, 7)
        XCTAssertTrue(conv.userState.isPinned)
        XCTAssertTrue(conv.userState.isMuted)
        XCTAssertTrue(conv.userState.isArchived)
        XCTAssertEqual(conv.userState.customName, "Family")
        XCTAssertEqual(conv.userState.reaction, "❤️")

        // Reading via the shim returns the userState value.
        XCTAssertEqual(conv.unreadCount, 7)
        XCTAssertTrue(conv.isPinned)
        XCTAssertEqual(conv.customName, "Family")

        // Writing via the shim mutates userState (one source of truth).
        conv.isPinned = false
        conv.unreadCount = 0
        conv.customName = nil
        XCTAssertFalse(conv.userState.isPinned)
        XCTAssertEqual(conv.userState.unreadCount, 0)
        XCTAssertNil(conv.userState.customName)
    }

    // MARK: - Wire format backward compatibility

    func test_decode_legacyJSON_populatesUserState() throws {
        // Shape representative of /conversations response before Phase 2.
        // No `version`, no `lastReadAt`, no `userStateTags`.
        let json = """
        {
          "id": "conv-1",
          "identifier": "general",
          "type": "group",
          "memberCount": 5,
          "isActive": true,
          "lastMessageAt": "2026-05-22T12:00:00Z",
          "createdAt": "2026-05-01T00:00:00Z",
          "updatedAt": "2026-05-22T12:00:00Z",
          "isPinned": true,
          "isMuted": false,
          "mentionsOnly": false,
          "isArchivedByUser": false,
          "customName": "Equipe Pro",
          "reaction": "🔥",
          "sectionId": "cat-work",
          "unreadCount": 12,
          "tags": []
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let conv = try decoder.decode(MeeshyConversation.self, from: json)

        XCTAssertTrue(conv.userState.isPinned)
        XCTAssertFalse(conv.userState.isMuted)
        XCTAssertEqual(conv.userState.customName, "Equipe Pro")
        XCTAssertEqual(conv.userState.reaction, "🔥")
        XCTAssertEqual(conv.userState.sectionId, "cat-work")
        XCTAssertEqual(conv.userState.unreadCount, 12)
        // New fields default cleanly when absent from legacy payload.
        XCTAssertEqual(conv.userState.version, 0)
        XCTAssertNil(conv.userState.lastReadAt)
        XCTAssertEqual(conv.userState.pendingMutationCount, 0)
        XCTAssertFalse(conv.userState.isLocked)
    }

    func test_encode_emitsLegacyKeysAtTopLevel() throws {
        let conv = MeeshyConversation(
            id: "conv-2",
            identifier: "demo",
            type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            unreadCount: 3,
            isPinned: true,
            isMuted: true,
            isArchivedByUser: false,
            customName: "Friend",
            reaction: nil
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(conv)
        let str = String(data: data, encoding: .utf8) ?? ""

        // Per-user fields MUST appear at top level (not nested under
        // a `userState` object) — this is the wire-format contract.
        XCTAssertTrue(str.contains("\"isPinned\":true"))
        XCTAssertTrue(str.contains("\"isMuted\":true"))
        XCTAssertTrue(str.contains("\"isArchivedByUser\":false"))
        XCTAssertTrue(str.contains("\"unreadCount\":3"))
        XCTAssertTrue(str.contains("\"customName\":\"Friend\""))
        // Critically: no nested `userState` envelope.
        XCTAssertFalse(str.contains("\"userState\":"))
    }

    // MARK: - Round-trip new fields

    func test_codable_roundtripWithExplicitUserState() throws {
        let state = ConversationUserState(
            unreadCount: 5,
            lastReadAt: Date(timeIntervalSince1970: 1_700_000_000),
            isPinned: true,
            customName: "VIP",
            tags: ["alpha", "beta"],
            sectionId: "sec",
            orderInCategory: 2,
            version: 9,
            lastSyncedAt: Date(timeIntervalSince1970: 1_700_000_500),
            pendingMutationCount: 1
        )
        let conv = MeeshyConversation(
            id: "rt-1",
            identifier: "rt",
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: state
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(conv)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(MeeshyConversation.self, from: data)

        XCTAssertEqual(decoded.userState, state)
    }

    // MARK: - displayName respects userState.customName

    func test_displayName_prefersUserStateCustomName() {
        let state = ConversationUserState(customName: "Mon Surnom")
        let conv = MeeshyConversation(
            identifier: "x",
            title: "Original Title",
            userState: state
        )
        XCTAssertEqual(conv.displayName, "Mon Surnom")
    }

    func test_displayName_fallsBackToTitleThenIdentifier() {
        let convWithTitle = MeeshyConversation(identifier: "id-1", title: "T")
        XCTAssertEqual(convWithTitle.displayName, "T")

        let convNoTitle = MeeshyConversation(identifier: "id-2")
        XCTAssertEqual(convNoTitle.displayName, "id-2")
    }
}
