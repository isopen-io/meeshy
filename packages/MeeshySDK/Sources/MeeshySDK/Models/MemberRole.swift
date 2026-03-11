import Foundation

/// Roles d'un membre dans une conversation ou communaute.
/// Aligne avec `MemberRole` dans `packages/shared/types/role-types.ts`.
public enum MemberRole: String, Codable, CaseIterable, Sendable, Comparable {
    case creator
    case admin
    case moderator
    case member

    /// Niveau hierarchique (plus eleve = plus de privileges)
    public var level: Int {
        switch self {
        case .creator: return 40
        case .admin: return 30
        case .moderator: return 20
        case .member: return 10
        }
    }

    public var displayName: String {
        switch self {
        case .creator: return "Creator"
        case .admin: return "Admin"
        case .moderator: return "Moderator"
        case .member: return "Member"
        }
    }

    public var icon: String {
        switch self {
        case .creator: return "crown.fill"
        case .admin: return "shield.checkered"
        case .moderator: return "shield.lefthalf.filled"
        case .member: return "person.fill"
        }
    }

    /// Verifie si ce role a au moins le niveau requis
    public func hasMinimumRole(_ required: MemberRole) -> Bool {
        level >= required.level
    }

    /// Comparable conformance basee sur la hierarchie
    public static func < (lhs: MemberRole, rhs: MemberRole) -> Bool {
        lhs.level < rhs.level
    }
}
