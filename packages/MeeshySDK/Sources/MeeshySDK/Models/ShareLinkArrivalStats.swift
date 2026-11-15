import Foundation

/// `GET /links/:linkId/stats` (#7797) — ce qu'un lien a fait venir.
///
/// Décodage DÉFENSIF : chaque compteur absent vaut zéro, chaque liste absente
/// est vide. La route arrive en parallèle côté passerelle (#7794) ; une
/// réponse partielle doit se lire, pas faire tomber la fiche.
public struct ShareLinkArrivalStats: Codable, Sendable, Equatable {
    public let visits: Int
    public let arrivals: Int
    public let anonymousArrivals: Int
    public let arrivalsByLanguage: [LanguageCount]
    public let arrivalsByCountry: [CountryCount]
    public let recentArrivals: [Arrival]

    public struct LanguageCount: Codable, Sendable, Equatable {
        public let language: String
        public let count: Int

        public init(language: String, count: Int) {
            self.language = language
            self.count = count
        }
    }

    public struct CountryCount: Codable, Sendable, Equatable {
        public let country: String
        public let count: Int

        public init(country: String, count: Int) {
            self.country = country
            self.count = count
        }
    }

    public struct Arrival: Codable, Sendable, Equatable, Identifiable {
        public let participantId: String
        public let displayName: String
        public let avatar: String?
        public let isAnonymous: Bool
        /// ISO 3166-1 alpha-2, dérivé de l'IP à l'arrivée sans la stocker.
        public let country: String?
        public let language: String?
        public let joinedAt: Date

        public var id: String { participantId }

        public init(
            participantId: String,
            displayName: String,
            avatar: String? = nil,
            isAnonymous: Bool,
            country: String? = nil,
            language: String? = nil,
            joinedAt: Date
        ) {
            self.participantId = participantId
            self.displayName = displayName
            self.avatar = avatar
            self.isAnonymous = isAnonymous
            self.country = country
            self.language = language
            self.joinedAt = joinedAt
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            participantId = try c.decode(String.self, forKey: .participantId)
            displayName = try c.decodeIfPresent(String.self, forKey: .displayName) ?? ""
            avatar = try c.decodeIfPresent(String.self, forKey: .avatar)
            isAnonymous = try c.decodeIfPresent(Bool.self, forKey: .isAnonymous) ?? false
            country = try c.decodeIfPresent(String.self, forKey: .country)
            language = try c.decodeIfPresent(String.self, forKey: .language)
            joinedAt = try c.decode(Date.self, forKey: .joinedAt)
        }
    }

    public init(
        visits: Int,
        arrivals: Int,
        anonymousArrivals: Int,
        arrivalsByLanguage: [LanguageCount] = [],
        arrivalsByCountry: [CountryCount] = [],
        recentArrivals: [Arrival] = []
    ) {
        self.visits = visits
        self.arrivals = arrivals
        self.anonymousArrivals = anonymousArrivals
        self.arrivalsByLanguage = arrivalsByLanguage
        self.arrivalsByCountry = arrivalsByCountry
        self.recentArrivals = recentArrivals
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        visits = try c.decodeIfPresent(Int.self, forKey: .visits) ?? 0
        arrivals = try c.decodeIfPresent(Int.self, forKey: .arrivals) ?? 0
        anonymousArrivals = try c.decodeIfPresent(Int.self, forKey: .anonymousArrivals) ?? 0
        arrivalsByLanguage = try c.decodeIfPresent([LanguageCount].self, forKey: .arrivalsByLanguage) ?? []
        arrivalsByCountry = try c.decodeIfPresent([CountryCount].self, forKey: .arrivalsByCountry) ?? []
        recentArrivals = try c.decodeIfPresent([Arrival].self, forKey: .recentArrivals) ?? []
    }

    /// Les langues des arrivants, en parts du total.
    public var languageShares: [LanguageShare] {
        LanguageShare.weighted(arrivalsByLanguage.map { ($0.language, $0.count) })
    }
}
