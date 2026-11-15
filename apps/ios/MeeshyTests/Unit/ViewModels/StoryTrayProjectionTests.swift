import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

final class StoryTrayProjectionTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func item(id: String, isViewed: Bool = false, expiresIn: TimeInterval = 3_600) -> StoryItem {
        StoryItem(
            id: id,
            content: "story",
            media: [],
            storyEffects: nil,
            createdAt: now.addingTimeInterval(-60),
            expiresAt: now.addingTimeInterval(expiresIn),
            isViewed: isViewed,
            updatedAt: nil
        )
    }

    private func group(_ userId: String, isViewed: Bool = false, expiresIn: TimeInterval = 3_600) -> StoryGroup {
        StoryGroup(
            id: userId,
            username: userId,
            avatarColor: "FF2E63",
            stories: [item(id: "\(userId)-story", isViewed: isViewed, expiresIn: expiresIn)]
        )
    }

    func test_visibleGroups_excludesOwnerAndFullyExpired() {
        let sut = StoryTrayProjection(
            groups: [group("me"), group("a"), group("dead", expiresIn: -10), group("b")],
            ownerId: "me",
            at: now
        )

        XCTAssertEqual(sut.visibleGroups(for: "me", at: now).map(\.id), ["a", "b"])
    }

    func test_visibleGroups_preservesTrayOrder() {
        let sut = StoryTrayProjection(groups: [group("c"), group("a"), group("b")], ownerId: "me", at: now)

        XCTAssertEqual(sut.visibleGroups(for: "me", at: now).map(\.id), ["c", "a", "b"])
    }

    func test_visibleGroups_afterFreshnessWindow_refiltersExpiredGroup() {
        let sut = StoryTrayProjection(
            groups: [group("a", expiresIn: 30), group("b")],
            ownerId: "me",
            at: now
        )

        XCTAssertEqual(sut.visibleGroups(for: "me", at: now.addingTimeInterval(10)).map(\.id), ["a", "b"])
        XCTAssertEqual(sut.visibleGroups(for: "me", at: now.addingTimeInterval(61)).map(\.id), ["b"])
    }

    func test_visibleGroups_forDifferentUser_isRecomputedNotCached() {
        let sut = StoryTrayProjection(groups: [group("me"), group("a")], ownerId: "me", at: now)

        XCTAssertEqual(sut.visibleGroups(for: "a", at: now).map(\.id), ["me"])
        XCTAssertEqual(sut.visibleGroups(for: "me", at: now).map(\.id), ["a"])
    }

    func test_ringState_unreadReadNone_matchesLegacySemantics() {
        let sut = StoryTrayProjection(
            groups: [group("unread"), group("read", isViewed: true), group("dead", expiresIn: -10)],
            ownerId: "me",
            at: now
        )

        XCTAssertEqual(sut.ringState(forUserId: "unread", at: now), .unread)
        XCTAssertEqual(sut.ringState(forUserId: "read", at: now), .read)
        XCTAssertEqual(sut.ringState(forUserId: "dead", at: now), StoryRingState.none)
        XCTAssertEqual(sut.ringState(forUserId: "absent", at: now), StoryRingState.none)
    }

    func test_ringState_groupExpiringAfterComputation_becomesNone() {
        let sut = StoryTrayProjection(groups: [group("a", expiresIn: 30)], ownerId: "me", at: now)

        XCTAssertEqual(sut.ringState(forUserId: "a", at: now), .unread)
        XCTAssertEqual(sut.ringState(forUserId: "a", at: now.addingTimeInterval(31)), StoryRingState.none)
    }

    func test_index_forUserId_matchesArrayPosition() {
        let sut = StoryTrayProjection(groups: [group("x"), group("y"), group("z")], ownerId: "me", at: now)

        XCTAssertEqual(sut.index(forUserId: "z"), 2)
        XCTAssertEqual(sut.index(forUserId: "x"), 0)
        XCTAssertNil(sut.index(forUserId: "absent"))
    }

    func test_ownGroup_isReturnedEvenWhenFullyExpired() {
        let sut = StoryTrayProjection(groups: [group("me", expiresIn: -10), group("a")], ownerId: "me", at: now)

        XCTAssertEqual(sut.ownGroup(for: "me")?.id, "me")
        XCTAssertNil(sut.ownGroup(for: "absent"))
    }
}
