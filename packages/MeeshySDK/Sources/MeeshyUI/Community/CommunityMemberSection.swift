import Foundation
import MeeshySDK

public nonisolated struct CommunityMemberSection: Identifiable, Sendable {
    public let role: MemberRole
    public let members: [APICommunityMember]

    public var id: MemberRole { role }

    public nonisolated static func sections(from members: [APICommunityMember]) -> [CommunityMemberSection] {
        Dictionary(grouping: members) { $0.communityRole }
            .map { CommunityMemberSection(role: $0.key, members: $0.value) }
            .sorted { $0.role.level > $1.role.level }
    }
}

public extension MemberRole {
    nonisolated func sectionTitle(in bundle: Bundle) -> String {
        switch self {
        case .creator:
            return String(localized: "community.members.section.creator", defaultValue: "Creators", bundle: bundle)
        case .admin:
            return String(localized: "community.members.section.admin", defaultValue: "Admins", bundle: bundle)
        case .moderator:
            return String(localized: "community.members.section.moderator", defaultValue: "Moderators", bundle: bundle)
        case .member:
            return String(localized: "community.members.section.member", defaultValue: "Members", bundle: bundle)
        }
    }
}
