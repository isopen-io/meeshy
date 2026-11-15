import Foundation

/// QUI PEUT LANCER UN APPEL — miroir de `canStartCall`
/// (`packages/shared/utils/call-permission.ts`, #10207, directive porteur du
/// 2026-10-11), la loi que la passerelle applique au démarrage d'un appel.
///
/// - un invité (sans compte Meeshy) ne lance jamais d'appel ;
/// - une conversation `global` n'a pas d'appel, pour personne ;
/// - une conversation `public` : le créateur, le rang `creator`/`admin` de la
///   conversation, ou un administrateur plateforme (ADMIN, BIGBOSS) — un
///   modérateur, de conversation comme de plateforme, n'en lance pas ;
/// - `direct` et `group` : tout membre, comme avant ;
/// - tout autre type (`broadcast`, inconnu) : personne — un type qu'on ne
///   connaît pas échoue fermé.
///
/// Rejoindre un appel déjà en cours n'est pas gouverné ici. Les rôles arrivent
/// en CHAÎNES, dans la casse que le serveur a servie : la loi les compare sans
/// tenir compte de la casse, comme son jumeau TypeScript.
public enum CallPermission {

    public struct Context: Equatable, Sendable {
        public let conversationType: String
        public let viewerIsCreator: Bool
        public let viewerConversationRole: String?
        public let viewerPlatformRole: String?
        public let viewerIsGuest: Bool

        public init(
            conversationType: String,
            viewerIsCreator: Bool,
            viewerConversationRole: String?,
            viewerPlatformRole: String? = nil,
            viewerIsGuest: Bool = false
        ) {
            self.conversationType = conversationType
            self.viewerIsCreator = viewerIsCreator
            self.viewerConversationRole = viewerConversationRole
            self.viewerPlatformRole = viewerPlatformRole
            self.viewerIsGuest = viewerIsGuest
        }
    }

    private static let openCallTypes: Set<String> = ["direct", "group"]
    private static let publicCallConversationRoles: Set<String> = ["creator", "admin"]
    private static let publicCallPlatformRoles: Set<String> = ["ADMIN", "BIGBOSS"]

    public static func canStartCall(_ context: Context) -> Bool {
        if context.viewerIsGuest { return false }
        let type = context.conversationType.lowercased()
        if type == "global" { return false }
        if type == "public" { return holdsPublicCallRight(context) }
        return openCallTypes.contains(type)
    }

    private static func holdsPublicCallRight(_ context: Context) -> Bool {
        if context.viewerIsCreator { return true }
        if publicCallConversationRoles.contains((context.viewerConversationRole ?? "").lowercased()) { return true }
        return publicCallPlatformRoles.contains((context.viewerPlatformRole ?? "").uppercased())
    }
}
