import Foundation

/// Le RÔLE DE PLATEFORME d'un utilisateur (`User.role`) — miroir de
/// `GlobalUserRole` et de `GLOBAL_ROLE_HIERARCHY`
/// (`packages/shared/types/role-types.ts`), que `PlatformRoleTests` relit
/// niveau pour niveau. BIGBOSS > ADMIN > MODERATOR > AUDIT > ANALYST > USER >
/// AGENT.
///
/// Deux LECTURES, comme la loi des actions (#11205) qui en fait foi :
/// - `init?(raw:)` compare EXACTEMENT : c'est ainsi que la passerelle décide qui
///   MODÈRE (`PRIVILEGED_GLOBAL_ROLES`), donc un « moderator » en minuscules ne
///   modère pas ;
/// - `init?(caseFolding:)` plie la casse : c'est ainsi que `isGlobalAdmin` et
///   `globalRoleLevel` décident qui ADMINISTRE et à quel niveau.
///
/// FERMÉ PAR DÉFAUT : un rôle inconnu n'est aucun cas (`nil`) et vaut
/// `minimumLevel`, sous le plus bas des rôles connus. AUDIT et ANALYST lisent ;
/// ils n'ont aucun privilège d'ACTION — pour la loi des actions, ils valent USER.
public enum PlatformRole: String, CaseIterable, Sendable, Comparable {
    case bigboss = "BIGBOSS"
    case admin = "ADMIN"
    case moderator = "MODERATOR"
    case audit = "AUDIT"
    case analyst = "ANALYST"
    case user = "USER"
    case agent = "AGENT"

    /// Le niveau d'un rôle illisible : sous `agent`, le plus bas des rôles connus.
    public static let minimumLevel = 0

    /// Lecture EXACTE, en majuscules comme `User.role`.
    public init?(raw: String?) {
        guard let raw, let role = PlatformRole(rawValue: raw) else { return nil }
        self = role
    }

    /// Lecture sans casse, celle de `isGlobalAdmin` et de `globalRoleLevel`.
    public init?(caseFolding raw: String?) {
        self.init(raw: raw?.uppercased())
    }

    public var level: Int {
        switch self {
        case .bigboss: return 100
        case .admin: return 80
        case .moderator: return 60
        case .audit: return 40
        case .analyst: return 30
        case .user: return 10
        case .agent: return 5
        }
    }

    /// `globalRoleLevel` : la casse pliée, un rôle inconnu au niveau minimal.
    public static func level(ofRaw raw: String?) -> Int {
        PlatformRole(caseFolding: raw)?.level ?? minimumLevel
    }

    /// Modère le contenu : modifier le message d'autrui, retirer, écrire là où
    /// le rang manque (`PRIVILEGED_GLOBAL_ROLES` de la passerelle).
    public var moderatesContent: Bool {
        self == .moderator || administers
    }

    /// Administre la plateforme : vaut le créateur dans une conversation dont il
    /// est membre, ouvre la console (`isGlobalAdmin`).
    public var administers: Bool {
        self == .admin || self == .bigboss
    }

    public static func < (lhs: PlatformRole, rhs: PlatformRole) -> Bool {
        lhs.level < rhs.level
    }
}
