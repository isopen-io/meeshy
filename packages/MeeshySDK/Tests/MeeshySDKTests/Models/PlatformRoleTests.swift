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

    /// Les entrées de la table `name` de `role-types.ts`, lues dans SON seul bloc
    /// (de `export const name` au premier `};`) : une autre table aux mêmes clés
    /// ne s'y mêle pas, et une clé répétée se compte au lieu d'arrêter le processus.
    private func sharedTable(_ name: String, entry: String) throws -> (entries: Int, table: [String: Int]) {
        let url = ActionPolicyVectorFixtures.repoRoot().appendingPathComponent("packages/shared/types/role-types.ts")
        let source = try String(contentsOf: url, encoding: .utf8)
        guard let start = source.range(of: "export const \(name):"),
              let end = source.range(of: "};", range: start.upperBound..<source.endIndex) else { return (0, [:]) }
        let block = String(source[start.upperBound..<end.lowerBound])
        let pattern = try NSRegularExpression(pattern: entry)
        let pairs = pattern.matches(in: block, range: NSRange(block.startIndex..., in: block)).compactMap { match -> (String, Int)? in
            guard let key = Range(match.range(at: 1), in: block), let level = Range(match.range(at: 2), in: block) else { return nil }
            return (String(block[key]), Int(block[level]) ?? -1)
        }
        return (pairs.count, Dictionary(pairs, uniquingKeysWith: { first, _ in first }))
    }

    @Test func theLevelsAreThoseOfTheSharedHierarchy() throws {
        let shared = try sharedTable("GLOBAL_ROLE_HIERARCHY", entry: "\\[GlobalUserRole\\.([A-Z]+)\\]:\\s*(\\d+)")
        let mirrored = Dictionary(uniqueKeysWithValues: PlatformRole.allCases.map { ($0.rawValue, $0.level) })
        #expect(!shared.table.isEmpty)
        #expect(shared.entries == shared.table.count)
        #expect(mirrored == shared.table)
    }

    /// `WRITE_PERMISSION_HIERARCHY` : le rang requis pour écrire se lit sur
    /// `MemberRole`, `everyone` valant 0 — aucune table de rôles en chaînes ne
    /// le recopie côté Swift.
    @Test func theWriteRanksAreThoseOfTheSharedWriteHierarchy() throws {
        let shared = try sharedTable("WRITE_PERMISSION_HIERARCHY", entry: "'([a-z]+)':\\s*(\\d+)")
        #expect(!shared.table.isEmpty)
        #expect(shared.entries == shared.table.count)
        for (role, level) in shared.table {
            #expect(MessageActionPolicy.requiredWriteRank(of: role) == level, "\(role)")
        }
        let mirrored = Set(["everyone"] + MemberRole.allCases.map(\.rawValue))
        #expect(mirrored == Set(shared.table.keys))
    }

    @Test func anUnknownWriteRoleRequiresTheCreator() {
        #expect(MessageActionPolicy.requiredWriteRank(of: "vip") == MemberRole.creator.level)
        #expect(MessageActionPolicy.requiredWriteRank(of: "Member") == MemberRole.creator.level)
        #expect(MessageActionPolicy.requiredWriteRank(of: "") == MemberRole.creator.level)
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
