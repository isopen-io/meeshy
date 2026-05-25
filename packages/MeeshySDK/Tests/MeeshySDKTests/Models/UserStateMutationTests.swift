import XCTest
@testable import MeeshySDK

final class UserStateMutationTests: XCTestCase {

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private func roundtrip(_ mutation: UserStateMutation, file: StaticString = #file, line: UInt = #line) throws {
        let data = try encoder.encode(mutation)
        let decoded = try decoder.decode(UserStateMutation.self, from: data)
        XCTAssertEqual(decoded, mutation, file: file, line: line)
    }

    // MARK: - Codable round-trip per case

    func test_codable_roundtrip_setPinned() throws {
        try roundtrip(.setPinned(true))
        try roundtrip(.setPinned(false))
    }

    func test_codable_roundtrip_setMuted() throws {
        try roundtrip(.setMuted(true))
    }

    func test_codable_roundtrip_setMentionsOnly() throws {
        try roundtrip(.setMentionsOnly(true))
    }

    func test_codable_roundtrip_setArchived() throws {
        try roundtrip(.setArchived(false))
    }

    func test_codable_roundtrip_setCustomName_nilAndValue() throws {
        try roundtrip(.setCustomName(nil))
        try roundtrip(.setCustomName("hello"))
    }

    func test_codable_roundtrip_setReaction_nilAndValue() throws {
        try roundtrip(.setReaction(nil))
        try roundtrip(.setReaction("🔥"))
    }

    func test_codable_roundtrip_setSection() throws {
        try roundtrip(.setSection(categoryId: nil))
        try roundtrip(.setSection(categoryId: "cat-1"))
    }

    func test_codable_roundtrip_setOrderInCategory() throws {
        try roundtrip(.setOrderInCategory(nil))
        try roundtrip(.setOrderInCategory(0))
        try roundtrip(.setOrderInCategory(99))
    }

    func test_codable_roundtrip_tags() throws {
        try roundtrip(.setTags([]))
        try roundtrip(.setTags(["a", "b"]))
        try roundtrip(.addTag("urgent"))
        try roundtrip(.removeTag("urgent"))
    }

    func test_codable_roundtrip_setClearHistoryBefore() throws {
        try roundtrip(.setClearHistoryBefore(nil))
        try roundtrip(.setClearHistoryBefore(Date(timeIntervalSince1970: 1_700_000_000)))
    }

    func test_codable_roundtrip_readState() throws {
        try roundtrip(.markAsRead)
        try roundtrip(.markAsUnread)
    }

    func test_codable_roundtrip_lifecycle() throws {
        try roundtrip(.deleteForUser)
        try roundtrip(.leave)
    }

    func test_codable_roundtrip_setLocked() throws {
        try roundtrip(.setLocked(true))
    }

    // MARK: - Tolerant decoding

    func test_decoding_unknownTypeThrows_soOutboxCanDropIt() {
        // The outbox is expected to catch this error, drop the row, and log.
        // Failure here = the app would crash on launch when loading an
        // outbox row persisted by a newer build with a new mutation case.
        let json = """
        {"type": "futureCase", "value": 42}
        """.data(using: .utf8)!

        XCTAssertThrowsError(try decoder.decode(UserStateMutation.self, from: json)) { error in
            guard case DecodingError.dataCorrupted(let ctx) = error else {
                XCTFail("Expected DecodingError.dataCorrupted, got \(error)")
                return
            }
            XCTAssertTrue(ctx.debugDescription.contains("futureCase"))
        }
    }

    // MARK: - Coalescing keys

    func test_coalescingKey_singleFieldMutationsShareKey() {
        XCTAssertEqual(UserStateMutation.setPinned(true).coalescingKey,
                       UserStateMutation.setPinned(false).coalescingKey)
        XCTAssertEqual(UserStateMutation.setMuted(true).coalescingKey,
                       UserStateMutation.setMuted(false).coalescingKey)
    }

    func test_coalescingKey_allTagMutationsShareKey() {
        XCTAssertEqual(UserStateMutation.setTags(["a"]).coalescingKey, "tags")
        XCTAssertEqual(UserStateMutation.addTag("x").coalescingKey, "tags")
        XCTAssertEqual(UserStateMutation.removeTag("x").coalescingKey, "tags")
    }

    func test_coalescingKey_readMutationsShareKey() {
        XCTAssertEqual(UserStateMutation.markAsRead.coalescingKey,
                       UserStateMutation.markAsUnread.coalescingKey)
    }

    func test_coalescingKey_deleteForUserAndLeave_neverCoalesce() {
        let a = UserStateMutation.deleteForUser.coalescingKey
        let b = UserStateMutation.deleteForUser.coalescingKey
        XCTAssertNotEqual(a, b, "Each .deleteForUser must get a unique key so outbox preserves both")

        let c = UserStateMutation.leave.coalescingKey
        let d = UserStateMutation.leave.coalescingKey
        XCTAssertNotEqual(c, d)
    }

    // MARK: - Local-only flag

    func test_isLocalOnly_onlyTrueForSetLocked() {
        XCTAssertTrue(UserStateMutation.setLocked(true).isLocalOnly)
        XCTAssertFalse(UserStateMutation.setPinned(true).isLocalOnly)
        XCTAssertFalse(UserStateMutation.markAsRead.isLocalOnly)
        XCTAssertFalse(UserStateMutation.deleteForUser.isLocalOnly)
    }
}
