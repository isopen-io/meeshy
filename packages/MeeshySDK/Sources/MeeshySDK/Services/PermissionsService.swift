import Foundation

/// Ce qu'un compte a le droit de faire — la projection de la matrice unique.
///
/// Neuf drapeaux, le vocabulaire du fil (`canManageGroups` pour les
/// communautés). C'est la SEULE forme qu'un client reçoit : le serveur en
/// portait quatre définitions concurrentes, dont deux divergentes — un ANALYST
/// recevait `canAccessAdmin: true` et voyait s'afficher une console que le
/// serveur lui refusait ensuite (#4152).
public struct MeeshyPermissions: Decodable, Sendable, Equatable {
    public let canAccessAdmin: Bool
    public let canManageUsers: Bool
    public let canManageGroups: Bool
    public let canManageConversations: Bool
    public let canViewAnalytics: Bool
    public let canModerateContent: Bool
    public let canViewAuditLogs: Bool
    public let canManageNotifications: Bool
    public let canManageTranslations: Bool

    public init(
        canAccessAdmin: Bool = false,
        canManageUsers: Bool = false,
        canManageGroups: Bool = false,
        canManageConversations: Bool = false,
        canViewAnalytics: Bool = false,
        canModerateContent: Bool = false,
        canViewAuditLogs: Bool = false,
        canManageNotifications: Bool = false,
        canManageTranslations: Bool = false
    ) {
        self.canAccessAdmin = canAccessAdmin
        self.canManageUsers = canManageUsers
        self.canManageGroups = canManageGroups
        self.canManageConversations = canManageConversations
        self.canViewAnalytics = canViewAnalytics
        self.canModerateContent = canModerateContent
        self.canViewAuditLogs = canViewAuditLogs
        self.canManageNotifications = canManageNotifications
        self.canManageTranslations = canManageTranslations
    }
}

/// Ma position : mon rôle, et ce qu'il m'autorise.
///
/// Le rôle voyage AVEC les permissions : sans lui, un client qui constate un
/// changement ne peut pas dire ce qui a changé.
public struct MyPermissions: Decodable, Sendable, Equatable {
    public let role: String
    public let permissions: MeeshyPermissions

    public init(role: String, permissions: MeeshyPermissions) {
        self.role = role
        self.permissions = permissions
    }
}

public protocol PermissionsServiceProviding: Sendable {
    /// Mes permissions, relues à la source.
    func myPermissions() async throws -> MyPermissions
}

/// `GET /admin/me/permissions` — l'unique adresse où un client lit ses droits.
///
/// ## Pourquoi une route, alors que la connexion les porte
///
/// Parce que la connexion ne les porte qu'À la connexion. Un rôle change entre
/// deux ouvertures — une promotion, une rétrogradation — et le client garde
/// sinon indéfiniment ce qu'il a reçu au premier jour. C'est précisément pour
/// rafraîchir ces valeurs que trois sites du serveur les RECOMPOSAIENT après
/// chaque écriture de profil, chacun à sa façon : l'un d'eux retirait la
/// console d'administration à un MODERATOR qui changeait son avatar.
///
/// En **S2** : lire ses propres permissions n'est pas un geste
/// d'administration, et un compte ordinaire a le droit d'apprendre qu'il n'a
/// aucun droit — c'est même la réponse la plus fréquente.
public final class PermissionsService: PermissionsServiceProviding, @unchecked Sendable {
    public static let shared = PermissionsService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func myPermissions() async throws -> MyPermissions {
        let response: APIResponse<MyPermissions> = try await api.request(
            endpoint: "/admin/me/permissions"
        )
        return response.data
    }
}
