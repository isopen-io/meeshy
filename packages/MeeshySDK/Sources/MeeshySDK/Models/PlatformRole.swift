import Foundation

/// Le RÔLE DE PLATEFORME d'un utilisateur (`User.role`) — miroir de
/// `GlobalUserRole` et de `GLOBAL_ROLE_HIERARCHY`
/// (`packages/shared/types/role-types.ts`), que `PlatformRoleTests` relit
/// niveau pour niveau. BIGBOSS > ADMIN > MODERATOR > AUDIT > ANALYST > USER >
/// AGENT.
///
/// Deux LECTURES, comme la loi des actions (#11205) qui en fait foi :
/// - `init?(raw:)` compare EXACTEMENT : c'est ainsi que la passerelle décide qui
///   est PRIVILÉGIÉ (`PRIVILEGED_PLATFORM_ROLES`, `packages/shared/utils/
///   platform-privilege.ts`), donc un « moderator » en minuscules ne modère pas ;
/// - `init?(caseFolding:)` plie la casse : c'est ainsi que `isGlobalAdmin` et
///   `globalRoleLevel` décident qui ADMINISTRE et à quel niveau.
///
/// FERMÉ PAR DÉFAUT : un rôle inconnu n'est aucun cas (`nil`) et vaut
/// `minimumLevel`, sous le plus bas des rôles connus. AUDIT et ANALYST lisent ;
/// ils n'ont aucun privilège d'ACTION — pour la loi des actions, ils valent USER.
///
/// `privileged` est le miroir de la table partagée (#11217, décision porteur du
/// 2026-10-24 : MODERATOR est privilégié partout, comme ADMIN et BIGBOSS) ;
/// `administers` ne garde que la console (`isGlobalAdmin`).
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

    /// Les rôles de plateforme PRIVILÉGIÉS — `PRIVILEGED_PLATFORM_ROLES`, la table
    /// que lisent toutes les admissions de la passerelle.
    public static let privileged: Set<PlatformRole> = [.moderator, .admin, .bigboss]

    /// Privilégié : modifie et retire le message d'autrui, écrit là où le rang
    /// manque, et vaut le créateur dans une conversation dont il est membre.
    public var isPrivileged: Bool {
        Self.privileged.contains(self)
    }

    /// Modère le contenu — la lecture de `isPrivileged` par la loi des messages.
    public var moderatesContent: Bool {
        isPrivileged
    }

    /// Administre la plateforme : ouvre la console (`isGlobalAdmin`).
    public var administers: Bool {
        self == .admin || self == .bigboss
    }

    public static func < (lhs: PlatformRole, rhs: PlatformRole) -> Bool {
        lhs.level < rhs.level
    }
}
