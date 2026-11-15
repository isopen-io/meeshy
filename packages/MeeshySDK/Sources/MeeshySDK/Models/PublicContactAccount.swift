import Foundation

/// Relation du LECTEUR au compte associé à une carte de visite (#8101).
/// Miroir de `ContactRelation` (`packages/shared/types/contact-card.ts`).
/// Une valeur inconnue se lit `.none` : un serveur plus récent ne doit pas
/// rendre la carte illisible.
public enum ContactRelation: String, Codable, Sendable, Equatable {
    case current = "self"
    case friend
    case requestSent = "request-sent"
    case requestReceived = "request-received"
    case none

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ContactRelation(rawValue: raw) ?? .none
    }
}

/// Le profil PUBLIC d'un compte Meeshy associé à un numéro ou un e-mail
/// d'une carte de visite. Liste FERMÉE, miroir de `PublicContactAccount`
/// (`packages/shared/types/contact-card.ts`) : ni e-mail, ni téléphone, ni
/// présence, ni l'identifiant qui a matché.
public struct PublicContactAccount: Codable, Sendable, Equatable, Identifiable {
    public let userId: String
    public let displayName: String
    public let username: String
    public let avatarUrl: String?
    public let bannerUrl: String?
    public let bio: String?
    public var relation: ContactRelation

    public var id: String { userId }

    public init(
        userId: String, displayName: String, username: String,
        avatarUrl: String? = nil, bannerUrl: String? = nil, bio: String? = nil,
        relation: ContactRelation = .none
    ) {
        self.userId = userId
        self.displayName = displayName
        self.username = username
        self.avatarUrl = avatarUrl
        self.bannerUrl = bannerUrl
        self.bio = bio
        self.relation = relation
    }
}

/// Corps de `POST /api/v1/contacts/resolve` — chaque liste bornée à
/// `maxIdentifiers`, sans doublon, dans l'ordre de la carte.
public struct ContactResolveRequest: Encodable, Sendable, Hashable {
    public static let maxIdentifiers = 10

    public let phones: [String]
    public let emails: [String]
    public let defaultCountry: String?

    public init(phones: [String], emails: [String], defaultCountry: String? = nil) {
        self.phones = Self.bounded(phones.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) })
        self.emails = Self.bounded(emails.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() })
        self.defaultCountry = defaultCountry
    }

    public init(card: VCard, defaultCountry: String? = nil) {
        self.init(phones: card.phones.map(\.value), emails: card.emails.map(\.value), defaultCountry: defaultCountry)
    }

    public var isEmpty: Bool { phones.isEmpty && emails.isEmpty }

    private static func bounded(_ values: [String]) -> [String] {
        values
            .reduce(into: [String]()) { if !$1.isEmpty && !$0.contains($1) { $0.append($1) } }
            .prefix(maxIdentifiers)
            .map { $0 }
    }
}

public struct ContactResolveResponse: Decodable, Sendable, Equatable {
    public let accounts: [PublicContactAccount]
}
