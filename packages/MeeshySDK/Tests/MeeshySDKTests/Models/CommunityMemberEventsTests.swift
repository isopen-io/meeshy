import Foundation
import Testing
@testable import MeeshySDK

/// `community:member-*` (#18767) — décodés depuis la charge RÉELLE de
/// l'émetteur (`services/gateway/src/services/community-member-broadcast.ts`),
/// lus en `CommunityMemberChange`, puis appliqués à ce que l'appareil tient.
struct CommunityMemberEventsTests {

    private static func decode<T: Decodable>(_ type: T.Type, _ payload: [String: Any]) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    private static let joinedPayload: [String: Any] = [
        "communityId": "c1", "userId": "u-new", "role": "member", "via": "invited",
        "memberCount": 13, "at": "2026-11-17T10:00:00.000Z",
    ]

    private static func held(id: String = "c1", memberCount: Int = 12) -> MeeshyCommunity {
        MeeshyCommunity(
            id: id, identifier: "mshy_\(id)", name: "Alpha", isPrivate: true, createdBy: "u-creator",
            createdAt: Date(timeIntervalSince1970: 1_700_000_000), updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            memberCount: memberCount, conversationCount: 4, emoji: "🏗️", onlineMemberCount: 2
        )
    }

    private static func row(id: String = "c1", role: String? = "member") -> APICommunity {
        APICommunity(
            id: id, identifier: "mshy_\(id)", name: "Alpha", description: nil, avatar: nil, banner: nil,
            isPrivate: true, createdBy: "u-creator", createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: nil, creator: nil, members: nil, _count: nil,
            memberCount: 12, conversationCount: 4, currentUserRole: role, onlineMemberCount: 2
        )
    }

    private static func change(userId: String = "u-new", memberCount: Int = 13, role: MemberRole? = .member) -> CommunityMemberChange {
        CommunityMemberChange(communityId: "c1", userId: userId, memberCount: memberCount, role: role)!
    }

    // MARK: Décodage, clé par clé

    @Test func decodesEveryKeyOfMemberJoined() throws {
        let event = try Self.decode(CommunityMemberJoinedEvent.self, Self.joinedPayload)

        #expect(event == CommunityMemberJoinedEvent(
            communityId: "c1", userId: "u-new", role: "member", via: "invited", memberCount: 13, at: "2026-11-17T10:00:00.000Z"
        ))
        #expect(CommunityMemberChange(event) == Self.change())
    }

    @Test func decodesEveryKeyOfMemberLeft_andLosesTheRole() throws {
        let event = try Self.decode(CommunityMemberLeftEvent.self, [
            "communityId": "c1", "userId": "u-gone", "reason": "removed", "memberCount": 11, "at": "2026-11-17T10:00:00.000Z",
        ])

        #expect(event.reason == "removed")
        #expect(event.at == "2026-11-17T10:00:00.000Z")
        let change = try #require(CommunityMemberChange(event))
        #expect(change.userId == "u-gone")
        #expect(change.memberCount == 11)
        #expect(change.role == nil, "sortie ⇒ plus de rôle")
    }

    @Test func decodesEveryKeyOfMemberRoleUpdated() throws {
        let event = try Self.decode(CommunityMemberRoleUpdatedEvent.self, [
            "communityId": "c1", "userId": "u-mod", "role": "moderator", "memberCount": 12, "at": "2026-11-17T10:00:00.000Z",
        ])

        #expect(CommunityMemberChange(event)?.role == .moderator)
    }

    @Test func unreadablePayloadsAreDiscarded() {
        #expect(CommunityMemberChange(CommunityMemberRoleUpdatedEvent(communityId: "c1", userId: "u", role: "owner", memberCount: 2, at: "")) == nil)
        #expect(CommunityMemberChange(CommunityMemberRoleUpdatedEvent(communityId: "c1", userId: "u", role: "creator", memberCount: 2, at: "")) == nil)
        #expect(CommunityMemberChange(CommunityMemberLeftEvent(communityId: "c1", userId: "u", reason: "left", memberCount: -1, at: "")) == nil)
        #expect(CommunityMemberChange(CommunityMemberLeftEvent(communityId: "", userId: "u", reason: "left", memberCount: 1, at: "")) == nil)
        #expect(CommunityMemberChange(CommunityMemberLeftEvent(communityId: "c1", userId: "", reason: "left", memberCount: 1, at: "")) == nil)
    }

    @Test func anUnknownReaderIsNeverConcerned() {
        #expect(!Self.change(userId: "u-new").concerns(readerId: ""))
        #expect(Self.change(userId: "u-new").concerns(readerId: "u-new"))
    }

    // MARK: Application

    @Test func screenModelCopiesTheCountAndKeepsEverythingElse() throws {
        let updated = try #require(Self.held().applying(Self.change(memberCount: 13)))

        #expect(updated.memberCount == 13)
        #expect(updated.name == "Alpha")
        #expect(updated.conversationCount == 4)
        #expect(updated.emoji == "🏗️")
        #expect(updated.onlineMemberCount == 2, "« N en ligne » ne voyage pas avec l'effectif")
    }

    @Test func anotherCommunityOrAnUnchangedCountIsNotTouched() {
        #expect(Self.held(id: "c2").applying(Self.change()) == nil)
        #expect(Self.held(memberCount: 13).applying(Self.change(memberCount: 13)) == nil)
    }

    @Test func persistedRowFollowsTheReaderRoleOnly() throws {
        let promoted = try #require(Self.row().applying(Self.change(userId: "u-me", memberCount: 12, role: .admin), readerId: "u-me"))
        #expect(promoted.currentUserRole == "admin")

        let left = try #require(Self.row().applying(Self.change(userId: "u-me", memberCount: 11, role: nil), readerId: "u-me"))
        #expect(left.currentUserRole == nil, "le lecteur sorti n'a plus de rôle")
        #expect(left.memberCount == 11)

        let third = try #require(Self.row().applying(Self.change(userId: "u-other", memberCount: 13, role: .admin), readerId: "u-me"))
        #expect(third.currentUserRole == "member", "un tiers promu ne déplace pas le rôle du lecteur")
        #expect(third.memberCount == 13)
        #expect(third.conversationCount == 4)
        #expect(third.onlineMemberCount == 2)
    }

    @Test func persistedRowOfAnotherCommunityOrUnchangedIsNotTouched() {
        #expect(Self.row(id: "c2").applying(Self.change(), readerId: "u-me") == nil)
        #expect(Self.row().applying(Self.change(userId: "u-other", memberCount: 12), readerId: "u-me") == nil)
    }
}
