import Foundation

// Mon profil synchronisé entre mes appareils (#18924) sur la socket de messages : `profile:updated`, dans la room
// `user:<moi>` seulement, après chaque écriture qui change ma langue, mon nom, ma photo ou ma bannière
// (`packages/shared/types/own-profile-sync.ts`).

/// L'INSTANTANÉ des neuf champs de mon profil tels que la ligne les porte après l'écriture — pas un delta : un
/// événement perdu est réparé par le suivant. `nil` veut dire EFFACÉ (la langue secondaire retirée, le nom affiché
/// qui retombe sur « Prénom Nom », la photo ôtée). Une clé qu'un serveur plus récent ajoute est ignorée.
public struct OwnProfileSnapshot: Decodable, Sendable, Equatable {
    public let systemLanguage: String
    public let regionalLanguage: String?
    public let customDestinationLanguage: String?
    public let displayName: String?
    public let firstName: String
    public let lastName: String
    public let username: String
    public let avatar: String?
    public let banner: String?

    public init(
        systemLanguage: String, regionalLanguage: String?, customDestinationLanguage: String?,
        displayName: String?, firstName: String, lastName: String, username: String,
        avatar: String?, banner: String?
    ) {
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
        self.customDestinationLanguage = customDestinationLanguage
        self.displayName = displayName
        self.firstName = firstName
        self.lastName = lastName
        self.username = username
        self.avatar = avatar
        self.banner = banner
    }
}

/// `profile:updated` — `updatedAt` est le `User.updatedAt` de l'écriture (ISO 8601), le même instant que sert
/// `GET /me` : deux instantanés reçus dans le désordre s'arbitrent par lui (`OwnProfileSync.isStale`).
public struct ProfileUpdatedEvent: Decodable, Sendable, Equatable {
    public let userId: String
    public let updatedAt: String
    public let profile: OwnProfileSnapshot

    public init(userId: String, updatedAt: String, profile: OwnProfileSnapshot) {
        self.userId = userId
        self.updatedAt = updatedAt
        self.profile = profile
    }
}

extension MessageSocketRoutes {

    /// Le compte connecté se repeint quel que soit l'écran ouvert, sans relecture réseau.
    static func ownProfile(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.profileUpdated, ProfileUpdatedEvent.self) { _, event in
                OwnProfileSync.apply(event, to: AuthManager.shared)
            },
        ]
    }
}
