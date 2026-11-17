import Combine
import XCTest
import GRDB
@testable import MeeshySDK

/// `community:updated` (#18439) réécrit la ligne PERSISTÉE : le prochain
/// démarrage à froid ne ressert pas l'ancien nom.
final class CacheCoordinatorCommunityUpdatesTests: XCTestCase {

    private func makeSUT() throws -> (CacheCoordinator, MockMessageSocket) {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        return (CacheCoordinator(messageSocket: socket, socialSocket: MockSocialSocket(), db: db), socket)
    }

    private func row(id: String, name: String) -> APICommunity {
        APICommunity(
            id: id, identifier: "mshy_\(id)", name: name, description: nil, avatar: nil, banner: nil,
            isPrivate: false, createdBy: "u-creator", createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000), creator: nil, members: nil, _count: nil,
            memberCount: 3, conversationCount: 1, currentUserRole: "member"
        )
    }

    private func event(communityId: String, name: String) -> CommunityUpdatedEvent {
        CommunityUpdatedEvent(
            communityId: communityId, identifier: "mshy_\(communityId)", name: name, description: nil,
            avatar: nil, banner: nil, isPrivate: true, memberCount: 4, updatedAt: "2026-11-15T10:00:00.000Z"
        )
    }

    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        return await condition()
    }

    func test_communityUpdated_rewritesTheCachedRowAndOnlyIt() async throws {
        let (cache, socket) = try makeSUT()
        await cache.start()
        try await cache.communities.save([row(id: "c1", name: "Ancien"), row(id: "c2", name: "Voisine")], for: "list")

        socket.communityUpdated.send(event(communityId: "c1", name: "Nouveau"))

        let rewritten = await waitUntil {
            await cache.communities.load(for: "list").snapshot()?.first(where: { $0.id == "c1" })?.name == "Nouveau"
        }
        XCTAssertTrue(rewritten, "la ligne persistée prend le nouveau nom")
        let rows = await cache.communities.load(for: "list").snapshot() ?? []
        XCTAssertEqual(rows.first(where: { $0.id == "c1" })?.isPrivate, true)
        XCTAssertEqual(rows.first(where: { $0.id == "c1" })?.currentUserRole, "member", "le rôle du lecteur ne voyage pas")
        XCTAssertEqual(rows.first(where: { $0.id == "c2" })?.name, "Voisine")
    }

    func test_communityUpdated_unknownCommunity_leavesTheCacheIntact() async throws {
        let (cache, _) = try makeSUT()
        try await cache.communities.save([row(id: "c1", name: "Ancien")], for: "list")

        await cache.applyCommunityUpdate(event(communityId: "ghost", name: "Fantôme"))

        let names = await cache.communities.load(for: "list").snapshot()?.map(\.name)
        XCTAssertEqual(names, ["Ancien"])
    }
}

/// `community:member-*` (#18767) réécrivent l'effectif PERSISTÉ, et le rôle du
/// lecteur quand le geste le concerne.
final class CacheCoordinatorCommunityMemberChangesTests: XCTestCase {

    private func makeSUT() throws -> (CacheCoordinator, MockMessageSocket) {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        return (CacheCoordinator(messageSocket: socket, socialSocket: MockSocialSocket(), db: db), socket)
    }

    private func row(id: String) -> APICommunity {
        APICommunity(
            id: id, identifier: "mshy_\(id)", name: id, description: nil, avatar: nil, banner: nil,
            isPrivate: false, createdBy: "u-creator", createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000), creator: nil, members: nil, _count: nil,
            memberCount: 3, conversationCount: 1, currentUserRole: "member"
        )
    }

    func test_memberJoined_rewritesTheCachedCountAndOnlyIt() async throws {
        let (cache, socket) = try makeSUT()
        await cache.start()
        try await cache.communities.save([row(id: "c1"), row(id: "c2")], for: "list")

        socket.communityMemberChanged.send(CommunityMemberChange(communityId: "c1", userId: "u-third", memberCount: 4, role: .member)!)

        let deadline = Date().addingTimeInterval(2)
        var rows: [APICommunity] = []
        while Date() < deadline {
            rows = await cache.communities.load(for: "list").snapshot() ?? []
            if rows.first(where: { $0.id == "c1" })?.memberCount == 4 { break }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        XCTAssertEqual(rows.first(where: { $0.id == "c1" })?.memberCount, 4)
        XCTAssertEqual(rows.first(where: { $0.id == "c1" })?.currentUserRole, "member", "un tiers ne déplace pas le rôle du lecteur")
        XCTAssertEqual(rows.first(where: { $0.id == "c2" })?.memberCount, 3)
    }

    func test_unknownCommunity_leavesTheCacheIntact() async throws {
        let (cache, _) = try makeSUT()
        try await cache.communities.save([row(id: "c1")], for: "list")

        await cache.applyCommunityMemberChange(CommunityMemberChange(communityId: "ghost", userId: "u", memberCount: 9, role: nil)!)

        let counts = await cache.communities.load(for: "list").snapshot()?.map(\.memberCount)
        XCTAssertEqual(counts, [3])
    }
}
