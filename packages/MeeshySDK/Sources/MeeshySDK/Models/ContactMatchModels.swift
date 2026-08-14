import Foundation

// MARK: - Contact Match (carnet d'adresses → utilisateurs Meeshy)

/// Un contact du carnet d'adresses, réduit aux identifiants utiles au matching.
public struct ContactMatchEntry: Codable, Sendable, Equatable {
    public let displayName: String?
    public let phoneNumbers: [String]
    public let emails: [String]
    /// Pseudos portés par la fiche vCard (nickname, profils sociaux). Troisième
    /// identifiant de rapprochement, après le numéro et l'email.
    public let usernames: [String]

    public init(
        displayName: String? = nil,
        phoneNumbers: [String] = [],
        emails: [String] = [],
        usernames: [String] = []
    ) {
        self.displayName = displayName
        self.phoneNumbers = phoneNumbers
        self.emails = emails
        self.usernames = usernames
    }
}

public struct ContactMatchRequest: Encodable, Sendable {
    public let contacts: [ContactMatchEntry]
    public let defaultCountry: String?

    public init(contacts: [ContactMatchEntry], defaultCountry: String? = nil) {
        self.contacts = contacts
        self.defaultCountry = defaultCountry
    }
}

/// Profil public renvoyé pour un contact retrouvé sur la plateforme.
/// `Encodable` autant que `Decodable` : le profil rapproché est mis en cache
/// avec l'entrée de répertoire qui le porte (`DirectoryContact`), pour que le
/// répertoire s'affiche instantanément au retour sur l'écran.
public struct MatchedContactUser: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let username: String
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?

    public init(
        id: String,
        username: String,
        firstName: String? = nil,
        lastName: String? = nil,
        displayName: String? = nil,
        avatar: String? = nil,
        isOnline: Bool? = nil,
        lastActiveAt: Date? = nil
    ) {
        self.id = id
        self.username = username
        self.firstName = firstName
        self.lastName = lastName
        self.displayName = displayName
        self.avatar = avatar
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
    }
}

public struct ContactMatch: Decodable, Sendable, Identifiable, Equatable {
    public let user: MatchedContactUser
    public let matchedBy: String
    public let contactDisplayName: String?

    public var id: String { user.id }

    public init(user: MatchedContactUser, matchedBy: String, contactDisplayName: String? = nil) {
        self.user = user
        self.matchedBy = matchedBy
        self.contactDisplayName = contactDisplayName
    }
}

public struct ContactMatchResponse: Decodable, Sendable {
    public let matches: [ContactMatch]
    public let totalContacts: Int
    public let matchedCount: Int
}
