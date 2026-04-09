import XCTest
@testable import MeeshySDK

final class UserDisplayNameCacheTests: XCTestCase {

    private func makeSUT() -> UserDisplayNameCache {
        let cache = UserDisplayNameCache.shared
        cache.clear()
        return cache
    }

    // MARK: - track + displayName round-trip

    func test_track_displayName_roundTrip() {
        let sut = makeSUT()
        sut.track(username: "alice", displayName: "Alice Wonderland")
        XCTAssertEqual(sut.displayName(for: "alice"), "Alice Wonderland")
    }

    func test_track_caseInsensitiveLookup() {
        let sut = makeSUT()
        sut.track(username: "Alice", displayName: "Alice W.")
        XCTAssertEqual(sut.displayName(for: "alice"), "Alice W.")
        XCTAssertEqual(sut.displayName(for: "ALICE"), "Alice W.")
    }

    func test_displayName_unknownUsername_returnsNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.displayName(for: "nobody"))
    }

    // MARK: - subscript

    func test_subscript_sameAsDisplayName() {
        let sut = makeSUT()
        sut.track(username: "bob", displayName: "Bob Builder")
        XCTAssertEqual(sut["bob"], "Bob Builder")
        XCTAssertEqual(sut["bob"], sut.displayName(for: "bob"))
    }

    func test_subscript_unknownUsername_returnsNil() {
        let sut = makeSUT()
        XCTAssertNil(sut["unknown"])
    }

    // MARK: - allMappings

    func test_allMappings_returnsTrackedEntries() {
        let sut = makeSUT()
        sut.track(username: "user1", displayName: "User One")
        sut.track(username: "user2", displayName: "User Two")
        let mappings = sut.allMappings()
        XCTAssertEqual(mappings.count, 2)
        XCTAssertEqual(mappings["user1"], "User One")
        XCTAssertEqual(mappings["user2"], "User Two")
    }

    func test_allMappings_emptyAfterClear() {
        let sut = makeSUT()
        sut.track(username: "x", displayName: "X Y")
        sut.clear()
        XCTAssertTrue(sut.allMappings().isEmpty)
    }

    // MARK: - track edge cases

    func test_track_emptyUsername_doesNotStore() {
        let sut = makeSUT()
        sut.track(username: "", displayName: "Some Name")
        XCTAssertTrue(sut.allMappings().isEmpty)
    }

    func test_track_emptyDisplayName_doesNotStore() {
        let sut = makeSUT()
        sut.track(username: "alice", displayName: "")
        XCTAssertNil(sut.displayName(for: "alice"))
    }

    func test_track_displayNameEqualsUsername_doesNotStore() {
        let sut = makeSUT()
        sut.track(username: "alice", displayName: "alice")
        XCTAssertNil(sut.displayName(for: "alice"))
    }

    func test_track_overwritesPrevious() {
        let sut = makeSUT()
        sut.track(username: "alice", displayName: "Alice V1")
        sut.track(username: "alice", displayName: "Alice V2")
        XCTAssertEqual(sut.displayName(for: "alice"), "Alice V2")
    }

    // MARK: - trackFromMentionSuggestion

    func test_trackFromMentionSuggestion_extractsDisplayName() {
        let sut = makeSUT()
        let suggestion = MentionSuggestion(
            id: "s1",
            username: "charlie",
            displayName: "Charlie Brown",
            avatar: nil,
            badge: nil,
            inConversation: nil,
            isFriend: nil
        )
        sut.trackFromMentionSuggestion(suggestion)
        XCTAssertEqual(sut.displayName(for: "charlie"), "Charlie Brown")
    }

    func test_trackFromMentionSuggestion_nilDisplayName_doesNotStore() {
        let sut = makeSUT()
        let suggestion = MentionSuggestion(
            id: "s2",
            username: "dave",
            displayName: nil,
            avatar: nil,
            badge: nil,
            inConversation: nil,
            isFriend: nil
        )
        sut.trackFromMentionSuggestion(suggestion)
        XCTAssertNil(sut.displayName(for: "dave"))
    }

    // MARK: - clear

    func test_clear_removesAllEntries() {
        let sut = makeSUT()
        sut.track(username: "a", displayName: "AA")
        sut.track(username: "b", displayName: "BB")
        sut.clear()
        XCTAssertNil(sut.displayName(for: "a"))
        XCTAssertNil(sut.displayName(for: "b"))
        XCTAssertTrue(sut.allMappings().isEmpty)
    }
}
