import Foundation
import Testing
@testable import MeeshySDK

/// LE RÔLE DE PLATEFORME (#11209) — miroir de `GLOBAL_ROLE_HIERARCHY`
/// (`packages/shared/types/role-types.ts`) et de la lecture que la loi des
/// actions en fait : comparée EXACTEMENT pour modérer, sans casse pour
/// administrer, inconnue ⇒ niveau minimal. Les témoins portent sur des rangs
/// AUTRES que le premier (leçon 261) : MODERATOR, AUDIT, ANALYST.
struct PlatformRoleTests {

    private func authority(
        platformRole: String? = "USER",
        conversationRole: String? = "member",
        isActiveMember: Bool = true
    ) -> ConversationViewerAuthority {
        ConversationViewerAuthority(
            id: "user-viewer",
            participantId: "part-viewer",
            hasAccount: true,
            isAnonymous: false,
            platformRoleRaw: platformRole,
            conversationRoleRaw: conversationRole,
            isActiveMember: isActiveMember,
            canSendMessages: true,
            isDeclaredMinor: false
        )
    }

    // MARK: - Hiérarchie

    @Test func theLevelsAreThoseOfTheSharedHierarchy() throws {
        let url = ActionPolicyVectorFixtures.repoRoot().appendingPathComponent("packages/shared/types/role-types.ts")
        let source = try String(contentsOf: url, encoding: .utf8)
        let pattern = try NSRegularExpression(pattern: "\\[GlobalUserRole\\.([A-Z]+)\\]:\\s*(\\d+)")
        let matches = pattern.matches(in: source, range: NSRange(source.startIndex..., in: source))
        let shared = Dictionary(uniqueKeysWithValues: matches.compactMap { match -> (String, Int)? in
            guard let name = Range(match.range(at: 1), in: source), let level = Range(match.range(at: 2), in: source) else { return nil }
            return (String(source[name]), Int(source[level]) ?? -1)
        })
        let mirrored = Dictionary(uniqueKeysWithValues: PlatformRole.allCases.map { ($0.rawValue, $0.level) })
        #expect(!shared.isEmpty)
        #expect(mirrored == shared)
    }

    @Test func theOrderIsBigbossAdminModeratorAuditAnalystUser() {
        let ordered: [PlatformRole] = [.bigboss, .admin, .moderator, .audit, .analyst, .user, .agent]
        #expect(ordered == PlatformRole.allCases.sorted(by: >))
        #expect(PlatformRole.moderator > .audit)
        #expect(PlatformRole.analyst > .user)
    }

    // MARK: - Fermé par défaut

    @Test func anUnknownRoleHasTheMinimumLevel() {
        #expect(PlatformRole(raw: "weird") == nil)
        #expect(PlatformRole(raw: nil) == nil)
        #expect(PlatformRole.level(ofRaw: "weird") == PlatformRole.minimumLevel)
        #expect(PlatformRole.level(ofRaw: nil) == PlatformRole.minimumLevel)
        #expect(PlatformRole.allCases.allSatisfy { $0.level > PlatformRole.minimumLevel })
    }

    @Test func aLowercaseRoleDoesNotModerate_butStillAdministersLikeTheGateway() {
        #expect(PlatformRole(raw: "moderator") == nil)
        #expect(!authority(platformRole: "moderator").moderatesPlatform)
        #expect(authority(platformRole: "admin").administersPlatform)
        #expect(PlatformRole.level(ofRaw: "moderator") == PlatformRole.moderator.level)
    }

    // MARK: - Privilèges d'action

    @Test func auditAndAnalystHoldNoActionPrivilege() {
        for role in [PlatformRole.audit, .analyst, .user, .agent] {
            #expect(!role.moderatesContent, "\(role.rawValue)")
            #expect(!role.administers, "\(role.rawValue)")
        }
        #expect(PlatformRole.moderator.moderatesContent)
        #expect(!PlatformRole.moderator.administers)
        #expect(PlatformRole.admin.administers)
        #expect(PlatformRole.bigboss.administers)
    }

    @Test func auditHasNoEditPrivilegeOnSomeoneElsesMessage_aModeratorHasOne() {
        let message = MessageActionPolicy.Message(
            subject: MessageContentKind.Subject(id: "65f000000000000000000001", content: "Bonjour", messageType: "text"),
            senderId: "part-author",
            authorUserId: "user-author",
            createdAt: Date(timeIntervalSince1970: 1_792_494_000)
        )
        let conversation = MessageActionPolicy.Conversation(type: "group")
        let now = Date(timeIntervalSince1970: 1_792_497_600)
        let edit: (String) -> MessageActionPolicy.EditVerdict? = { role in
            MessageActionPolicy.actions(
                for: MessageActionPolicy.Input(message: message, conversation: conversation, viewer: authority(platformRole: role), now: now)
            ).verdicts.edit
        }
        #expect(edit("AUDIT") == nil)
        #expect(edit("ANALYST") == nil)
        #expect(edit("MODERATOR") == MessageActionPolicy.EditVerdict(asModerator: true, windowEndsAt: nil))
    }

    // MARK: - Rôle effectif dans la conversation

    @Test func aPlatformAdminWhoIsAMemberActsAsTheCreator() {
        #expect(authority(platformRole: "ADMIN").effectiveRole == .creator)
        #expect(authority(platformRole: "BIGBOSS", conversationRole: "moderator").effectiveRole == .creator)
        #expect(authority(platformRole: "ADMIN").effectiveRank == MemberRole.creator.level)
    }

    @Test func aPlatformAdminWhoIsNotAMemberHasNoConversationRole() {
        let outsider = authority(platformRole: "BIGBOSS", conversationRole: nil, isActiveMember: false)
        #expect(outsider.effectiveRole == nil)
        #expect(outsider.effectiveRank == 0)
        #expect(outsider.administersPlatform)
    }

    @Test func aPlatformModeratorAuditOrAnalystKeepsTheRoleOfTheirLine() {
        for role in ["MODERATOR", "AUDIT", "ANALYST"] {
            #expect(authority(platformRole: role).effectiveRole == .member, "\(role)")
            #expect(authority(platformRole: role, conversationRole: "admin").effectiveRole == .admin, "\(role)")
        }
    }

    @Test func anUnreadableConversationRoleRanksBelowAMember() {
        #expect(authority(conversationRole: "owner").memberRole == nil)
        #expect(authority(conversationRole: "MODERATOR").memberRole == nil)
        #expect(authority(conversationRole: "owner").memberRank == 0)
        #expect(authority(conversationRole: "moderator", isActiveMember: false).memberRank == 0)
        #expect(authority(conversationRole: "moderator").memberRank == MemberRole.moderator.level)
    }
}
