import Foundation

// MARK: - Contact Match (carnet d'adresses → utilisateurs Meeshy)

/// Un contact du carnet d'adresses, réduit aux identifiants utiles au matching.
public struct ContactMatchEntry: Codable, Sendable, Equatable {
    public let displayName: String?
    public let phoneNumbers: [String]
    public let emails: [String]

    public init(displayName: String? = nil, phoneNumbers: [String] = [], emails: [String] = []) {
        self.displayName = displayName
        self.phoneNumbers = phoneNumbers
        self.emails = emails
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
public struct MatchedContactUser: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let username: String
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
}

public struct ContactMatch: Decodable, Sendable, Identifiable, Equatable {
    public let user: MatchedContactUser
    public let matchedBy: String
    public let contactDisplayName: String?

    public var id: String { user.id }
}

public struct ContactMatchResponse: Decodable, Sendable {
    public let matches: [ContactMatch]
    public let totalContacts: Int
    public let matchedCount: Int
}
