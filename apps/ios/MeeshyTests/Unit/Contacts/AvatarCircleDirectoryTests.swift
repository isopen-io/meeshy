import XCTest
import Combine
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Les cercles servis, remis aux avatars (#20178) : ce que le serveur dit de chaque lien, jamais un niveau inventé, et
/// jamais une pastille sur moi-même.
@MainActor
final class AvatarCircleDirectoryTests: XCTestCase {

    private func link(_ userId: String, _ level: RelationLevel) -> RelationLink {
        RelationLink(userId: userId, effectiveLevel: level, grantedByMe: level)
    }

    func test_levels_mapEachServedLinkToItsEffectiveLevel() {
        let levels = AvatarCircleDirectory.levels(from: [link("a", .friend), link("b", .blood)], viewerId: "me")
        XCTAssertEqual(levels.level(for: "a"), .friend)
        XCTAssertEqual(levels.level(for: "b"), .blood)
        XCTAssertNil(levels.level(for: "c"))
    }

    func test_levels_neverMarkTheViewer() {
        let levels = AvatarCircleDirectory.levels(from: [link("me", .blood)], viewerId: "me")
        XCTAssertNil(levels.level(for: "me"))
    }

    func test_levels_publicLinkCarriesNoBadge() {
        let levels = AvatarCircleDirectory.levels(from: [link("a", .public)], viewerId: "me")
        XCTAssertNil(levels.level(for: "a"))
    }

    func test_raised_updatesOnlyThatPerson() {
        let sut = AvatarCircleDirectory(levelEvents: Empty().eraseToAnyPublisher())
        sut.apply(links: [link("a", .acquaintance), link("b", .friend)], viewerId: "me")
        sut.receive(RelationLevelRaisedEvent(userId: "a", level: .close, at: nil), viewerId: "me")
        XCTAssertEqual(sut.levels.level(for: "a"), .close)
        XCTAssertEqual(sut.levels.level(for: "b"), .friend)
    }

    func test_reset_forgetsEveryCircle() {
        let sut = AvatarCircleDirectory(levelEvents: Empty().eraseToAnyPublisher())
        sut.apply(links: [link("a", .friend)], viewerId: "me")
        sut.reset()
        XCTAssertEqual(sut.levels, .none)
    }
}
