import Foundation

/// Le partage sans contact (#19205, #19484) : deux téléphones se rapprochent, chacun donne ce qu'il a choisi. La
/// passerelle émet un JETON bref, à usage unique, qui n'encode que les offres ; l'autre l'accepte et reçoit ce qui
/// était donné. Le numéro n'est jamais une offre : aucune charge de ce canal n'en porte.
///
/// Contrat : `packages/shared/types/contact-exchange.ts`.
public enum ContactExchangeOffer: String, Codable, Sendable, CaseIterable, Hashable {
    case vitrine
    case friendRequest

    /// Les offres dédoublonnées, dans l'ordre du contrat ; une valeur inconnue (version future) est ignorée.
    public static func ordered(_ raw: [String]) -> [ContactExchangeOffer] {
        allCases.filter { raw.contains($0.rawValue) }
    }

    public static func ordered(_ offers: [ContactExchangeOffer]) -> [ContactExchangeOffer] {
        allCases.filter { offers.contains($0) }
    }
}

/// `ce1.<aléa 22>.<offres 1-3>.<échéance 10 chiffres>.<signature 22>` — le motif du contrat
/// (`CONTACT_EXCHANGE_TOKEN_PATTERN`). Un jeton qui ne le suit pas n'entre jamais dans un chemin d'URL.
public enum ContactExchangeToken {
    public static func isWellFormed(_ token: String) -> Bool {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 5, parts[0] == "ce1" else { return false }
        return isBase64URL(parts[1], length: 22)
            && ["1", "2", "3"].contains(parts[2])
            && parts[3].count == 10 && parts[3].allSatisfy { $0.isASCII && $0.isNumber }
            && isBase64URL(parts[4], length: 22)
    }

    private static func isBase64URL(_ part: String, length: Int) -> Bool {
        part.count == length && part.unicodeScalars.allSatisfy { scalar in
            scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || scalar == "_" || scalar == "-")
        }
    }
}

/// Ce que l'émetteur montre à l'autre : le jeton, son échéance, les offres retenues.
public struct ContactExchangeIssued: Decodable, Sendable, Equatable {
    public let token: String
    public let expiresAt: String
    public let offers: [ContactExchangeOffer]

    public init(token: String, expiresAt: String, offers: [ContactExchangeOffer]) {
        self.token = token
        self.expiresAt = expiresAt
        self.offers = offers
    }

    private enum CodingKeys: String, CodingKey { case token, expiresAt, offers }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        token = try c.decode(String.self, forKey: .token)
        expiresAt = try c.decodeIfPresent(String.self, forKey: .expiresAt) ?? ""
        offers = ContactExchangeOffer.ordered(try c.decodeIfPresent([String].self, forKey: .offers) ?? [])
    }
}

/// L'identité que le SERVEUR rend pour l'émetteur — la seule que le reçu affiche.
public struct ContactExchangePerson: Decodable, Sendable, Equatable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?

    public init(id: String, username: String, displayName: String?, avatar: String?) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
    }

    public var shownName: String { displayName.flatMap { $0.isEmpty ? nil : $0 } ?? username }
}

public enum ContactExchangeFriendRequestOutcome: String, Decodable, Sendable, Equatable {
    case sent
    case notSent = "not-sent"
}

/// Ce que l'autre m'a donné. De sa vitrine, l'écran ne lit que la bio : la fiche s'ouvre ensuite par son adresse.
public struct ContactExchangeAccepted: Decodable, Sendable, Equatable {
    public let issuer: ContactExchangePerson
    public let offers: [ContactExchangeOffer]
    public let bio: String?
    public let friendRequest: ContactExchangeFriendRequestOutcome?

    public init(issuer: ContactExchangePerson, offers: [ContactExchangeOffer], bio: String?,
                friendRequest: ContactExchangeFriendRequestOutcome?) {
        self.issuer = issuer
        self.offers = offers
        self.bio = bio
        self.friendRequest = friendRequest
    }

    private enum CodingKeys: String, CodingKey { case issuer, offers, profile, friendRequest }
    private struct Showcase: Decodable { let bio: String? }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        issuer = try c.decode(ContactExchangePerson.self, forKey: .issuer)
        offers = ContactExchangeOffer.ordered(try c.decodeIfPresent([String].self, forKey: .offers) ?? [])
        bio = (try? c.decodeIfPresent(Showcase.self, forKey: .profile))?.bio.flatMap { $0.isEmpty ? nil : $0 }
        friendRequest = try? c.decodeIfPresent(ContactExchangeFriendRequestOutcome.self, forKey: .friendRequest)
    }
}

public enum ContactExchangeError: Error, Equatable, Sendable {
    /// Rien n'est choisi : rien ne part.
    case nothingChosen
    /// Le refus générique — drapeau éteint, jeton expiré, rejoué, contrefait, bloqué : jamais lequel.
    case unavailable
}
