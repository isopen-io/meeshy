import Foundation

// MARK: - Les trophées et la vitrine (#9387)
//
// MIROIR de `packages/shared/utils/game/trophies.ts` — un objet reçu à un moment
// précis. Quatre types : la coupe de ligue (or, argent, bronze), la coupe de
// saison, le trophée de Prestige (numéroté de 1 à 5), le trophée de Flamme (100
// puis 365 jours de série). Ni un trophée ni un succès ne rapporte de points.
//
// Chaque trophée a une CLÉ STABLE, lisible et sans espace — c'est elle que la
// base grave et que la vitrine ordonne. La clé d'une coupe de ligue porte la
// semaine, la ligue et le métal ; un VISITEUR, lui, ne lit jamais cette semaine
// (conformité D-3) : sa clé porte le MOIS d'obtention.
//
// Un trophée d'un type que ce client ne connaît pas n'est JAMAIS retiré de la
// vitrine : il reste, en dernier, le temps d'une mise à jour.

public enum TrophyKind: String, CaseIterable, Sendable, Hashable {
    case leagueCup = "league-cup"
    case seasonCup = "season-cup"
    case prestige
    case flame
}

/// Une coupe de ligue se date par sa SEMAINE (la clé que le membre lit) ou par
/// son MOIS d'obtention (la seule qu'un visiteur reçoive).
public enum LeagueCupPeriod: Sendable, Equatable {
    case week(String)
    case month(String)

    public var key: String {
        switch self {
        case .week(let value), .month(let value): value
        }
    }
}

public enum TrophySpec: Sendable, Equatable {
    case leagueCup(period: LeagueCupPeriod, league: LeagueKey, cup: LeagueCup)
    case seasonCup(season: Int)
    case prestige(number: Int)
    case flame(days: Int)

    public var kind: TrophyKind {
        switch self {
        case .leagueCup: .leagueCup
        case .seasonCup: .seasonCup
        case .prestige: .prestige
        case .flame: .flame
        }
    }
}

public enum ShowcaseVisibility: String, CaseIterable, Codable, Sendable, Hashable {
    case everyone
    case friends
    case me
}

public enum ShowcaseViewer: String, Sendable, Hashable {
    case `self`
    case friend
    case other
    case admin
}

public struct TrophyRecord: Sendable, Equatable {
    public let key: String
    /// ISO 8601.
    public let awardedAt: String

    public init(key: String, awardedAt: String) {
        self.key = key
        self.awardedAt = awardedAt
    }
}

public struct VisitorTrophyItem: Sendable, Equatable {
    public let key: String
    public let awardedMonth: String
    /// Absent pour un trophée unique.
    public let count: Int?

    public init(key: String, awardedMonth: String, count: Int? = nil) {
        self.key = key
        self.awardedMonth = awardedMonth
        self.count = count
    }
}

public struct VisitorShowcase: Sendable, Equatable {
    public let items: [VisitorTrophyItem]
    public let order: [String]

    public init(items: [VisitorTrophyItem], order: [String]) {
        self.items = items
        self.order = order
    }
}

public enum GameTrophies {
    public static let flameDays = [100, 365]
    public static let showcaseOrderMax = 200
    public static let defaultVisibility = ShowcaseVisibility.friends
    /// L'Atlas est PRIVÉ par défaut, quel que soit le réglage de la vitrine.
    public static let atlasDefaultVisibility = ShowcaseVisibility.me

    // MARK: Les clés

    private static func isMonthKey(_ value: String) -> Bool {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0].count == 4, parts[1].count == 2,
              value.utf8.allSatisfy({ $0 == 45 || (48...57).contains($0) }),
              let month = Int(parts[1]) else { return false }
        return (1...12).contains(month)
    }

    public static func key(of spec: TrophySpec) -> String {
        switch spec {
        case .leagueCup(let period, let league, let cup):
            "trophy.league-cup.\(period.key).\(league.rawValue).\(cup.rawValue)"
        case .seasonCup(let season): "trophy.season-cup.\(season)"
        case .prestige(let number): "trophy.prestige.\(number)"
        case .flame(let days): "trophy.flame.\(days)"
        }
    }

    private static func positiveInt(_ value: String) -> Int? {
        guard let first = value.utf8.first, (49...57).contains(first),
              value.utf8.allSatisfy({ (48...57).contains($0) }) else { return nil }
        return Int(value)
    }

    /// Le trophée d'une clé, `nil` pour tout ce qui n'est pas une clé du catalogue.
    public static func parse(_ key: String) -> TrophySpec? {
        let parts = key.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.first == "trophy", parts.count >= 2 else { return nil }
        let kind = parts[1]
        if kind == "league-cup", parts.count == 5 {
            guard let league = LeagueKey(rawValue: parts[3]), let cup = LeagueCup(rawValue: parts[4]) else { return nil }
            if GameDay.isDayKey(parts[2]) { return .leagueCup(period: .week(parts[2]), league: league, cup: cup) }
            return isMonthKey(parts[2]) ? .leagueCup(period: .month(parts[2]), league: league, cup: cup) : nil
        }
        guard parts.count == 3, let number = positiveInt(parts[2]) else { return nil }
        switch kind {
        case "season-cup": return .seasonCup(season: number)
        case "prestige": return number <= GameLevels.maxPrestige ? .prestige(number: number) : nil
        case "flame": return flameDays.contains(number) ? .flame(days: number) : nil
        default: return nil
        }
    }

    /// Les trophées de Flamme gagnés au franchissement du record de série.
    public static func flameTrophiesEarned(previousLongest: Int, longest: Int) -> [Int] {
        flameDays.filter { previousLongest < $0 && longest >= $0 }
    }

    // MARK: La vitrine

    /// La valeur d'un trophée pour l'ordre par défaut : le plus précieux d'abord.
    private static func defaultWeight(_ spec: TrophySpec?) -> Int {
        guard let spec else { return 0 }
        switch spec {
        case .prestige(let number): return 1000 + number
        case .seasonCup: return 800
        case .flame(let days): return days == 365 ? 700 : 600
        case .leagueCup(_, _, let cup):
            switch cup {
            case .gold: return 500
            case .silver: return 400
            case .bronze: return 300
            }
        }
    }

    /// L'ordre reçu d'un client, assaini : seulement des trophées POSSÉDÉS, uniques, bornés.
    public static func sanitizeShowcaseOrder(order: [String], ownedKeys: [String]) -> [String] {
        let owned = Set(ownedKeys)
        var seen = Set<String>()
        return Array(order.filter { seen.insert($0).inserted && owned.contains($0) }.prefix(showcaseOrderMax))
    }

    /// La vitrine, dans l'ordre : d'abord ce que le joueur a rangé, puis le reste du
    /// plus précieux au moins précieux (le plus récent d'abord à valeur égale, la clé
    /// en dernier recours).
    public static func orderShowcase(owned: [TrophyRecord], order: [String]) -> [String] {
        let chosen = sanitizeShowcaseOrder(order: order, ownedKeys: owned.map(\.key))
        let placed = Set(chosen)
        let rest = GameOrdering.stableSorted(owned.filter { !placed.contains($0.key) }) { lhs, rhs in
            let weight = defaultWeight(parse(rhs.key)) - defaultWeight(parse(lhs.key))
            if weight != 0 { return weight < 0 ? -1 : 1 }
            if lhs.awardedAt != rhs.awardedAt { return -GameOrdering.compare(lhs.awardedAt, rhs.awardedAt) }
            return GameOrdering.compare(lhs.key, rhs.key)
        }
        var seen = Set<String>()
        return chosen + rest.map(\.key).filter { seen.insert($0).inserted }
    }

    /// Qui voit la vitrine. Une valeur inconnue ne s'ouvre qu'au propriétaire et à l'administration.
    public static func canView(visibility: String, viewer: ShowcaseViewer) -> Bool {
        if viewer == .self || viewer == .admin { return true }
        if visibility == ShowcaseVisibility.everyone.rawValue { return true }
        return visibility == ShowcaseVisibility.friends.rawValue && viewer == .friend
    }

    public static func canView(visibility: ShowcaseVisibility, viewer: ShowcaseViewer) -> Bool {
        canView(visibility: visibility.rawValue, viewer: viewer)
    }

    /// Le réglage de discrétion qui PLAFONNE la vitrine : un profil caché de la
    /// recherche ne la montre qu'aux amis, « Jeu masqué » la ramène à « moi seul ».
    /// Une valeur inconnue vaut « moi seul ».
    public static func capVisibility(_ visibility: String, hideProfileFromSearch: Bool, gameHidden: Bool) -> ShowcaseVisibility {
        if gameHidden { return .me }
        guard let known = ShowcaseVisibility(rawValue: visibility) else { return .me }
        return hideProfileFromSearch && known == .everyone ? .friends : known
    }

    public static func capVisibility(_ visibility: ShowcaseVisibility, hideProfileFromSearch: Bool, gameHidden: Bool) -> ShowcaseVisibility {
        capVisibility(visibility.rawValue, hideProfileFromSearch: hideProfileFromSearch, gameHidden: gameHidden)
    }

    // MARK: Ce qu'un visiteur reçoit

    /// Le MOIS d'une date : une date précise, croisée avec une Flamme de 365 jours,
    /// donne le rythme d'usage. `nil` pour une date illisible.
    public static func visitorAwardedMonth(_ awardedAt: String) -> String? {
        let bytes = Array(awardedAt.utf8)
        guard bytes.count >= 10 else { return nil }
        let digit: (Int) -> Bool = { (48...57).contains(bytes[$0]) }
        guard [0, 1, 2, 3, 5, 6, 8, 9].allSatisfy(digit), bytes[4] == 45, bytes[7] == 45 else { return nil }
        return String(decoding: bytes[0..<7], as: UTF8.self)
    }

    /// La clé d'un trophée telle qu'un VISITEUR la reçoit : une coupe de ligue y
    /// porte le MOIS d'obtention à la place de sa semaine. `nil` pour une clé que la
    /// loi ne sait pas lire, ou un mois illisible.
    public static func visitorKey(key: String, awardedMonth: String) -> String? {
        guard let spec = parse(key), isMonthKey(awardedMonth) else { return nil }
        if case .leagueCup(_, let league, let cup) = spec {
            return Self.key(of: .leagueCup(period: .month(awardedMonth), league: league, cup: cup))
        }
        return Self.key(of: spec)
    }

    /// La vitrine telle qu'un VISITEUR la reçoit : des clés projetées, le mois
    /// d'obtention, et rien de plus fin. Deux coupes identiques du même mois se
    /// réunissent en UNE ligne qui porte `count`.
    public static func visitorShowcase(owned: [TrophyRecord], order: [String]) -> VisitorShowcase {
        struct Projected {
            let source: String
            let key: String
            let awardedMonth: String
        }
        let projected: [Projected] = owned.compactMap { trophy in
            guard let month = visitorAwardedMonth(trophy.awardedAt),
                  let key = visitorKey(key: trophy.key, awardedMonth: month) else { return nil }
            return Projected(source: trophy.key, key: key, awardedMonth: month)
        }
        var keyOf: [String: String] = [:]
        for item in projected { keyOf[item.source] = item.key }
        let ordered = orderShowcase(
            owned: projected.map { TrophyRecord(key: $0.key, awardedAt: $0.awardedMonth) },
            order: order.compactMap { keyOf[$0] }
        )
        var counts: [String: Int] = [:]
        var monthOf: [String: String] = [:]
        for item in projected {
            counts[item.key, default: 0] += 1
            monthOf[item.key] = item.awardedMonth
        }
        let items: [VisitorTrophyItem] = ordered.compactMap { key in
            guard let month = monthOf[key] else { return nil }
            let count = counts[key] ?? 1
            return VisitorTrophyItem(key: key, awardedMonth: month, count: count > 1 ? count : nil)
        }
        return VisitorShowcase(items: items, order: ordered)
    }
}
