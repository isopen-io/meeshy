import Foundation

/// Une arrivée de la liste COMPLÈTE d'un lien (#7813) — `GET
/// /links/:linkId/arrivals`. Elle ne porte que ce que la ligne affiche : nom,
/// badge « sans compte », pays, langue et date. Ni identifiant, ni visage, ni
/// présence : la liste se lit, elle n'ouvre aucun profil.
public struct ShareLinkArrivalEntry: Codable, Sendable, Hashable, Identifiable {
    public let displayName: String
    public let isAnonymous: Bool
    /// ISO 3166-1 alpha-2, majuscules.
    public let country: String?
    public let language: String?
    public let joinedAt: Date

    /// Le serveur ne sert aucun identifiant : l'identité d'une ligne est ce
    /// qu'elle montre. Deux arrivées indiscernables à l'écran n'en font qu'une.
    public var id: String {
        [
            String(joinedAt.timeIntervalSince1970),
            displayName,
            isAnonymous ? "1" : "0",
            country ?? "",
            language ?? "",
        ].joined(separator: "\u{1F}")
    }

    public init(displayName: String, isAnonymous: Bool, country: String?, language: String?, joinedAt: Date) {
        self.displayName = displayName
        self.isAnonymous = isAnonymous
        self.country = country
        self.language = language
        self.joinedAt = joinedAt
    }

    /// Une arrivée récente des statistiques, déjà en main : la liste complète
    /// s'en peint avant que sa première page n'arrive.
    public init(_ arrival: ShareLinkArrivalStats.Arrival) {
        self.init(
            displayName: arrival.displayName,
            isAnonymous: arrival.isAnonymous,
            country: arrival.country,
            language: arrival.language,
            joinedAt: arrival.joinedAt
        )
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        displayName = try c.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        isAnonymous = try c.decodeIfPresent(Bool.self, forKey: .isAnonymous) ?? false
        country = try c.decodeIfPresent(String.self, forKey: .country)
        language = try c.decodeIfPresent(String.self, forKey: .language)
        joinedAt = try c.decode(Date.self, forKey: .joinedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case displayName, isAnonymous, country, language, joinedAt
    }
}

/// Une page d'arrivées et le curseur OPAQUE de la suivante (`nil` = dernière).
///
/// Décodage tolérant PAR LIGNE : une arrivée illisible est sautée, la page
/// reste. Un curseur vide vaut la fin — le renvoyer rechargerait la première
/// page en boucle.
public struct ShareLinkArrivalsPage: Codable, Sendable, Equatable {
    public let arrivals: [ShareLinkArrivalEntry]
    public let nextCursor: String?

    public init(arrivals: [ShareLinkArrivalEntry], nextCursor: String?) {
        self.arrivals = arrivals
        self.nextCursor = nextCursor
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        arrivals = c.decodeLossyArrayIfPresent([ShareLinkArrivalEntry].self, forKey: .arrivals) ?? []
        let cursor = try? c.decodeIfPresent(String.self, forKey: .nextCursor)
        nextCursor = cursor.flatMap { $0.isEmpty ? nil : $0 }
    }

    private enum CodingKeys: String, CodingKey {
        case arrivals, nextCursor
    }
}
