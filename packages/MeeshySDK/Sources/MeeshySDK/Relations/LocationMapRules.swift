import Foundation

// LES RÈGLES DE LA CARTE DES POSITIONS PARTAGÉES (#18872, planches Carte-Personne, Carte-Proches, Carte-Partage).
// Des fonctions pures sur ce que la passerelle a servi : aucune ne rend une position plus fine, aucune ne garde rien.
// L'écran (app) les projette ; ce fichier dit seulement combien de temps il reste, à quelle distance, dans quel ordre.

public enum LocationMapRules {
    /// Un pas de marche moyen : 80 m par minute (4,8 km/h).
    public static let walkingMetersPerMinute: Double = 80
    /// Au-delà, « à pied » n'a plus de sens : la carte ne dit que la distance.
    public static let walkingCeilingMeters: Double = 15_000
    /// Une position mise à jour depuis moins que cela se dit « en direct ».
    public static let liveFreshnessSeconds: TimeInterval = 120

    /// La distance au sol entre deux points, en mètres (haversine).
    public static func distanceMeters(fromLatitude: Double, fromLongitude: Double,
                                      toLatitude: Double, toLongitude: Double) -> Double {
        let radians = Double.pi / 180
        let dLat = (toLatitude - fromLatitude) * radians
        let dLon = (toLongitude - fromLongitude) * radians
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(fromLatitude * radians) * cos(toLatitude * radians) * sin(dLon / 2) * sin(dLon / 2)
        return 6_371_000 * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    /// Les minutes à pied, arrondies, jamais sous une minute ; `nil` au-delà du plafond ou sur une distance illisible.
    public static func walkingMinutes(meters: Double) -> Int? {
        guard meters.isFinite, meters >= 0, meters <= walkingCeilingMeters else { return nil }
        return max(1, Int((meters / walkingMetersPerMinute).rounded()))
    }

    /// Le rayon dans lequel le destinataire me verra, à la précision choisie : le flou SERVI par la passerelle
    /// (`SHARED_LOCATION_BLUR_RADIUS_METERS`), le plancher de l'exact sinon.
    public static func visibleRadiusMeters(for precision: SharedLocationPrecision) -> Double {
        switch precision {
        case .exact: return SharedLocationContract.exactMinRadiusMeters
        case .neighborhood: return 1_200
        case .city: return 12_000
        }
    }
}

/// Le temps qui reste à un partage reçu, et sur quelle durée il a été ouvert (1 h ou 8 h : les deux seules servies).
public struct SharedLocationWindow: Equatable, Sendable {
    public let remaining: TimeInterval
    public let total: TimeInterval

    public init(deadline: Date, now: Date) {
        let remaining = max(0, min(SharedLocationContract.maxLifetime, deadline.timeIntervalSince(now)))
        let durations = SharedLocationShareDuration.allCases.map(\.interval).sorted()
        self.remaining = remaining
        self.total = durations.first { remaining <= $0 } ?? SharedLocationContract.maxLifetime
    }

    /// La part qui reste, de 1 (vient de commencer) à 0 (échu).
    public var fraction: Double {
        total > 0 ? remaining / total : 0
    }

    public var isOver: Bool {
        remaining <= 0
    }

    /// Les minutes restantes, arrondies au-dessus : « encore 1 min » tant qu'une seconde reste.
    public var remainingMinutes: Int {
        Int((remaining / 60).rounded(.up))
    }
}

/// La fraîcheur d'une position reçue : « en direct » sous deux minutes, sinon depuis combien de minutes.
public enum SharedLocationFreshness: Equatable, Sendable {
    case live(secondsAgo: Int)
    case stale(minutesAgo: Int)

    public init(updatedAt: Date, now: Date) {
        let elapsed = max(0, now.timeIntervalSince(updatedAt))
        self = elapsed < LocationMapRules.liveFreshnessSeconds
            ? .live(secondsAgo: Int(elapsed))
            : .stale(minutesAgo: Int(elapsed / 60))
    }
}

/// Les puces de la carte de mes proches : tous, ou un seul cercle (Ami, Proche, Sang).
public enum NearbyCircleFilter: String, CaseIterable, Sendable {
    case all, friend, close, blood

    public var level: RelationLevel? {
        switch self {
        case .all: return nil
        case .friend: return .friend
        case .close: return .close
        case .blood: return .blood
        }
    }

    /// Un cercle non servi n'entre que dans « Tous » : on ne range personne dans un cercle qu'on ne connaît pas.
    public func admits(_ circle: RelationLevel?) -> Bool {
        guard let level else { return true }
        return circle == level
    }
}

/// Une personne de la carte, telle que les règles la rangent : son cercle servi et sa distance à moi (si je la connais).
public struct NearbyPlacement: Identifiable, Equatable, Sendable {
    public let id: String
    public let circle: RelationLevel?
    public let distanceMeters: Double?

    public init(id: String, circle: RelationLevel?, distanceMeters: Double?) {
        self.id = id
        self.circle = circle
        self.distanceMeters = distanceMeters.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
    }
}

public enum NearbyRules {
    /// « Du plus près » : par distance croissante, les distances inconnues à la fin, l'identifiant départageant.
    public static func arranged(_ people: [NearbyPlacement], filter: NearbyCircleFilter) -> [NearbyPlacement] {
        people
            .filter { filter.admits($0.circle) }
            .sorted { lhs, rhs in
                switch (lhs.distanceMeters, rhs.distanceMeters) {
                case let (l?, r?) where l != r: return l < r
                case (.some, nil): return true
                case (nil, .some): return false
                default: return lhs.id < rhs.id
                }
            }
    }

    /// Le compte de chaque puce, « Tous » compris.
    public static func counts(_ people: [NearbyPlacement]) -> [NearbyCircleFilter: Int] {
        Dictionary(uniqueKeysWithValues: NearbyCircleFilter.allCases.map { filter in
            (filter, people.filter { filter.admits($0.circle) }.count)
        })
    }
}

/// Les partages qui viennent de s'arrêter, « pas sur la carte » : qui, et depuis quand. Tenu en mémoire seulement ; une
/// personne qui repartage en sort, et l'oubli vient après la plus longue durée d'un partage.
public struct SharedLocationEndings: Equatable, Sendable {
    public private(set) var endedAt: [String: Date]
    public private(set) var circles: [String: RelationLevel]

    public init(endedAt: [String: Date] = [:], circles: [String: RelationLevel] = [:]) {
        self.endedAt = endedAt
        self.circles = circles
    }

    /// Ce qui était servi et ne l'est plus finit à `now` ; ce qui revient sort ; ce qui a vieilli s'oublie.
    public func advancing(from previous: [String: SharedLocationEntry], to current: [String: SharedLocationEntry],
                          now: Date) -> SharedLocationEndings {
        let gone = previous.keys.filter { current[$0] == nil }
        var ended = endedAt.filter { current[$0.key] == nil && now.timeIntervalSince($0.value) < SharedLocationContract.maxLifetime }
        var kept = circles.filter { ended[$0.key] != nil }
        gone.forEach { id in
            ended[id] = now
            if let circle = previous[id]?.circle { kept[id] = circle }
        }
        return SharedLocationEndings(endedAt: ended, circles: kept.filter { ended[$0.key] != nil })
    }

    /// Du plus récent au plus ancien.
    public var ordered: [(id: String, endedAt: Date)] {
        endedAt.map { (id: $0.key, endedAt: $0.value) }.sorted { ($1.endedAt, $0.id) < ($0.endedAt, $1.id) }
    }
}
