import Foundation

/// « En commun » (#19377) : ce que le lecteur partage avec la personne dont il ouvre la fiche, servi par
/// `GET /users/:id/in-common` (#19200). Chaque partie est OUVERTE (son nombre et sa liste) ou VERROUILLÉE
/// (le cercle qui l'ouvrirait, rien d'autre). Une partie absente — les amis derrière
/// `IN_COMMON_FRIENDS_ENABLED` (#19230), une passerelle plus ancienne — vaut `nil` : l'écran s'en passe.
///
/// La forme gravée en cache est celle du fil : le même décodeur relit les deux.
public struct UserInCommon: Codable, Sendable, Equatable, CacheIdentifiable {
    /// La personne dont la fiche est ouverte : la clé du cache.
    public let id: String
    public let communities: InCommonListPart<InCommonCommunity>?
    public let friends: InCommonListPart<InCommonFriend>?
    public let media: InCommonMediaPart?
    /// « Notre histoire » (#19378) : absent tant que la passerelle ne le sert pas.
    public let history: [InCommonHistoryStep]?

    public init(id: String,
                communities: InCommonListPart<InCommonCommunity>? = nil,
                friends: InCommonListPart<InCommonFriend>? = nil,
                media: InCommonMediaPart? = nil,
                history: [InCommonHistoryStep]? = nil) {
        self.id = id
        self.communities = communities
        self.friends = friends
        self.media = media
        self.history = history
    }
}

/// Ce que le cercle commun ouvre d'une partie. `locked` porte le cercle qui l'ouvrirait, jamais un nombre.
public enum InCommonAccess: Sendable, Equatable {
    case open
    case locked(RelationLevel)

    /// Un état inconnu se lit verrouillé : fermé par défaut.
    init(state: String, circle: String?) {
        self = state == "open" ? .open : .locked(RelationLevel(wire: circle))
    }
}

/// Une partie servie en liste (communautés, amis). Verrouillée, elle ne garde ni nombre ni liste, même si le fil
/// en portait : la rangée qui la montre ne peut rien en dire.
public struct InCommonListPart<Item: Codable & Sendable & Equatable>: Codable, Sendable, Equatable {
    public let state: String
    public let circle: String?
    public let total: Int?
    public let items: [Item]?

    public init(access: InCommonAccess, total: Int? = nil, items: [Item]? = nil) {
        switch access {
        case .open:
            self.state = "open"
            self.circle = nil
            self.total = total
            self.items = items
        case .locked(let level):
            self.state = "locked"
            self.circle = level.rawValue
            self.total = nil
            self.items = nil
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let state = (try? container.decode(String.self, forKey: .state)) ?? "locked"
        let isOpen = state == "open"
        self.state = isOpen ? "open" : "locked"
        self.circle = try? container.decodeIfPresent(String.self, forKey: .circle)
        self.total = isOpen ? (try? container.decodeIfPresent(Int.self, forKey: .total)) : nil
        self.items = isOpen ? (try? container.decodeIfPresent(InCommonLossyList<Item>.self, forKey: .items))?.values : nil
    }

    public var access: InCommonAccess { InCommonAccess(state: state, circle: circle) }

    /// Ouverte : la liste servie ; verrouillée : rien.
    public var shownItems: [Item] { access == .open ? (items ?? []) : [] }

    /// Ouverte : le nombre servi, sinon celui de la liste ; verrouillée : `nil`, jamais zéro.
    public var shownTotal: Int? {
        guard access == .open else { return nil }
        return total ?? items?.count ?? 0
    }
}

public struct InCommonCommunity: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let identifier: String?
    public let name: String
    public let avatar: String?
    public let isPrivate: Bool?
    /// Le nombre de membres (#19379) : absent tant que la passerelle ne le sert pas.
    public let memberCount: Int?

    public init(id: String, identifier: String? = nil, name: String, avatar: String? = nil,
                isPrivate: Bool? = nil, memberCount: Int? = nil) {
        self.id = id
        self.identifier = identifier
        self.name = name
        self.avatar = avatar
        self.isPrivate = isPrivate
        self.memberCount = memberCount
    }
}

/// Un ami que nous avons en commun. `circle` est le cercle que LE LECTEUR lui accorde, jamais celui de la cible.
/// Aucune présence : la fiche d'un autre ne dit pas qui, parmi ses amis, est en ligne.
public struct InCommonFriend: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let circle: String?

    public init(id: String, username: String, displayName: String? = nil, avatar: String? = nil,
                circle: RelationLevel? = nil) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.circle = circle?.rawValue
    }

    public var level: RelationLevel? { circle.flatMap(RelationLevel.init(rawValue:)) }

    public var shownName: String {
        guard let displayName, !displayName.trimmingCharacters(in: .whitespaces).isEmpty else { return username }
        return displayName
    }
}

/// Les types de médias partagés, dans l'ordre des filtres de la planche. `link` attend #19228.
public enum InCommonMediaKind: String, Sendable, CaseIterable, Codable {
    case image
    case video
    case audio
    case link
    case file
}

public struct InCommonMedia: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let kind: String
    public let messageId: String?
    public let conversationId: String?
    public let originalName: String?
    public let mimeType: String?
    public let fileSize: Double?
    public let fileUrl: String?
    public let thumbnailUrl: String?
    public let thumbHash: String?
    /// En millisecondes, comme toute durée de pièce jointe.
    public let duration: Double?
    public let width: Double?
    public let height: Double?
    public let uploadedBy: String?
    public let createdAt: String?

    public init(id: String, kind: InCommonMediaKind, messageId: String? = nil, conversationId: String? = nil,
                originalName: String? = nil, mimeType: String? = nil, fileSize: Double? = nil, fileUrl: String? = nil,
                thumbnailUrl: String? = nil, thumbHash: String? = nil, duration: Double? = nil,
                width: Double? = nil, height: Double? = nil, uploadedBy: String? = nil, createdAt: String? = nil) {
        self.id = id
        self.kind = kind.rawValue
        self.messageId = messageId
        self.conversationId = conversationId
        self.originalName = originalName
        self.mimeType = mimeType
        self.fileSize = fileSize
        self.fileUrl = fileUrl
        self.thumbnailUrl = thumbnailUrl
        self.thumbHash = thumbHash
        self.duration = duration
        self.width = width
        self.height = height
        self.uploadedBy = uploadedBy
        self.createdAt = createdAt
    }

    /// `nil` pour un type que ce client ne connaît pas : il ne se montre pas.
    public var mediaKind: InCommonMediaKind? { InCommonMediaKind(rawValue: kind) }

    /// Le rapport largeur / hauteur servi, `nil` s'il manque.
    public var aspect: Double? {
        guard let width, let height, width > 0, height > 0 else { return nil }
        return width / height
    }
}

/// Les médias des conversations partagées, comptés par type et paginés.
public struct InCommonMediaPart: Codable, Sendable, Equatable {
    public let state: String
    public let circle: String?
    public let counts: [String: Int]?
    public let countsCapped: Bool?
    public let items: [InCommonMedia]?
    public let pagination: InCommonMediaPage?

    public init(access: InCommonAccess, counts: [InCommonMediaKind: Int] = [:], countsCapped: Bool = false,
                items: [InCommonMedia] = [], pagination: InCommonMediaPage? = nil) {
        switch access {
        case .open:
            self.state = "open"
            self.circle = nil
            self.counts = Dictionary(uniqueKeysWithValues: counts.map { ($0.key.rawValue, $0.value) })
            self.countsCapped = countsCapped
            self.items = items
            self.pagination = pagination
        case .locked(let level):
            self.state = "locked"
            self.circle = level.rawValue
            self.counts = nil
            self.countsCapped = nil
            self.items = nil
            self.pagination = nil
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let state = (try? container.decode(String.self, forKey: .state)) ?? "locked"
        let isOpen = state == "open"
        self.state = isOpen ? "open" : "locked"
        self.circle = try? container.decodeIfPresent(String.self, forKey: .circle)
        self.counts = isOpen ? (try? container.decodeIfPresent([String: Int].self, forKey: .counts)) : nil
        self.countsCapped = isOpen ? (try? container.decodeIfPresent(Bool.self, forKey: .countsCapped)) : nil
        self.items = isOpen ? (try? container.decodeIfPresent(InCommonLossyList<InCommonMedia>.self, forKey: .items))?.values : nil
        self.pagination = isOpen ? (try? container.decodeIfPresent(InCommonMediaPage.self, forKey: .pagination)) : nil
    }

    public var access: InCommonAccess { InCommonAccess(state: state, circle: circle) }

    /// Le nombre servi pour chaque type CONNU ; un type absent du fil n'y figure pas.
    public var countsByKind: [InCommonMediaKind: Int] {
        guard access == .open else { return [:] }
        return (counts ?? [:]).reduce(into: [:]) { result, entry in
            if let kind = InCommonMediaKind(rawValue: entry.key) { result[kind] = entry.value }
        }
    }

    /// Le total des types connus ; verrouillée : `nil`, jamais zéro.
    public var shownTotal: Int? {
        guard access == .open else { return nil }
        return countsByKind.values.reduce(0, +)
    }

    public var shownItems: [InCommonMedia] {
        guard access == .open else { return [] }
        return (items ?? []).filter { $0.mediaKind != nil }
    }
}

public struct InCommonMediaPage: Codable, Sendable, Equatable {
    public let limit: Int?
    public let hasMore: Bool?
    public let nextCursor: String?

    public init(limit: Int? = nil, hasMore: Bool? = nil, nextCursor: String? = nil) {
        self.limit = limit
        self.hasMore = hasMore
        self.nextCursor = nextCursor
    }
}

/// Un jalon de « Notre histoire » (#19378) : premier message, passage à un cercle, 1 000 messages.
public enum InCommonHistoryKind: String, Sendable, CaseIterable {
    case firstMessage
    case acquaintance
    case friend
    case close
    case blood
    case messages1000
}

public struct InCommonHistoryStep: Codable, Sendable, Equatable {
    public let kind: String
    public let at: String

    public init(kind: InCommonHistoryKind, at: Date) {
        self.kind = kind.rawValue
        self.at = WireDate.string(from: at)
    }

    /// `nil` pour un jalon inconnu : il ne se montre pas.
    public var historyKind: InCommonHistoryKind? { InCommonHistoryKind(rawValue: kind) }

    public var date: Date? { WireDate.date(from: at) }
}

/// Une liste dont un élément illisible est écarté sans emporter les autres.
struct InCommonLossyList<Element: Decodable>: Decodable {
    let values: [Element]

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var kept: [Element] = []
        while !container.isAtEnd {
            if let value = try? container.decode(Element.self) {
                kept.append(value)
            } else {
                _ = try? container.decode(Discarded.self)
            }
        }
        values = kept
    }

    /// Consomme un élément quel qu'il soit, pour que la lecture avance.
    private struct Discarded: Decodable {
        init(from decoder: Decoder) throws {}
    }
}
