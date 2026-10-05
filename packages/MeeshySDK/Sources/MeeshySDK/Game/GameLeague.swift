import Foundation

// MARK: - Les ligues hebdomadaires et la ligue Amis (#9384, #9385)
//
// MIROIR de `packages/shared/utils/game/league.ts`. Huit ligues, du Quartz au
// Prisme ; la semaine s'identifie par son LUNDI local et ferme le dimanche à
// 20 h, heure locale. On classe les points GAGNÉS dans la semaine, jamais le
// score en poche. Les groupes sont de 30, d'activité comparable, répartis par
// une fonction DÉTERMINISTE : le serveur et un client qui reçoivent les mêmes
// entrées rendent les mêmes groupes.
//
// ## Ce que la loi se refuse
//
//  - aucune horloge, aucun fuseau, aucun aléa implicite ;
//  - AUCUNE heure d'activité ne sort du classement : un ex æquo se tranche par
//    un hachage de la semaine, jamais par « qui a atteint le total en premier » ;
//  - aucun texte en toutes lettres : des clés stables, que les clients habillent.
//
// Sur divergence avec le TypeScript, c'est le TypeScript qui a raison :
// `game.vectors.json` le rejoue (`GameLawVectorTests`).

public enum LeagueKey: String, CaseIterable, Codable, Sendable, Hashable {
    case quartz
    case ambre
    case jade
    case saphir
    case rubis
    case amethyste
    case diamant
    case prisme

    /// De 0 (Quartz) à 7 (Prisme).
    public var index: Int {
        Self.allCases.firstIndex(of: self) ?? 0
    }

    /// La ligue au-dessus, `nil` au Prisme.
    public var next: LeagueKey? {
        let cases = Self.allCases
        return cases.indices.contains(index + 1) ? cases[index + 1] : nil
    }

    /// La ligue en dessous, `nil` au Quartz.
    public var previous: LeagueKey? {
        let cases = Self.allCases
        return index > 0 ? cases[index - 1] : nil
    }
}

public enum LeagueZone: String, Codable, Sendable, Hashable {
    case promotion
    case safe
    case relegation
}

public enum LeagueCup: String, CaseIterable, Codable, Sendable, Hashable {
    case gold
    case silver
    case bronze
}

/// Un instant LOCAL : le jour et la minute depuis minuit.
public struct LeagueMoment: Sendable, Equatable {
    public let dayKey: String
    public let minuteOfDay: Int

    public init(dayKey: String, minuteOfDay: Int) {
        self.dayKey = dayKey
        self.minuteOfDay = minuteOfDay
    }
}

public struct LeagueGain: Sendable, Equatable {
    public let moment: LeagueMoment
    public let points: Int

    public init(moment: LeagueMoment, points: Int) {
        self.moment = moment
        self.points = points
    }
}

/// Qui peut jouer la ligue PUBLIQUE. Le niveau record d'abord, puis la majorité
/// vérifiée (fail-closed), puis le consentement.
public enum LeagueAccess: String, Codable, Sendable, Hashable {
    case locked
    case minor
    case consentRequired = "consent-required"
    case open
}

public enum LeaguePseudonymCheck: Sendable, Equatable {
    case ok
    case refused(Reason)

    public enum Reason: String, Sendable, Hashable {
        case shape
        case reserved
        case identity
    }
}

/// Ce qu'un lecteur apprend d'un joueur de la ligue : jamais une présence.
public struct LeagueMemberVisibility: Sendable, Equatable {
    public let pseudonym: Bool
    public let realIdentity: Bool
    public let presence = false

    public init(pseudonym: Bool, realIdentity: Bool) {
        self.pseudonym = pseudonym
        self.realIdentity = realIdentity
    }
}

public struct LeagueEntrant: Sendable, Equatable {
    public let userId: String
    /// Une mesure d'activité comparable (points gagnés sur les semaines récentes).
    public let activity: Int

    public init(userId: String, activity: Int) {
        self.userId = userId
        self.activity = activity
    }
}

public struct LeagueGroup: Sendable, Equatable {
    public let groupId: String
    public let league: LeagueKey
    public let weekKey: String
    public let memberIds: [String]

    public init(groupId: String, league: LeagueKey, weekKey: String, memberIds: [String]) {
        self.groupId = groupId
        self.league = league
        self.weekKey = weekKey
        self.memberIds = memberIds
    }
}

public struct LeagueMemberPoints: Sendable, Equatable {
    public let userId: String
    public let weekPoints: Int

    public init(userId: String, weekPoints: Int) {
        self.userId = userId
        self.weekPoints = weekPoints
    }
}

public struct LeagueStanding: Sendable, Equatable {
    public let userId: String
    public let weekPoints: Int
    /// À partir de 1.
    public let rank: Int
    public let zone: LeagueZone
    public let cup: LeagueCup?

    public init(userId: String, weekPoints: Int, rank: Int, zone: LeagueZone, cup: LeagueCup?) {
        self.userId = userId
        self.weekPoints = weekPoints
        self.rank = rank
        self.zone = zone
        self.cup = cup
    }
}

public struct LeagueOutcome: Sendable, Equatable {
    public let nextLeague: LeagueKey
    public let promoted: Bool
    public let relegated: Bool
    /// +30 à la montée, +100 de plus pour une coupe ; rien n'en retire à la descente.
    public let glory: Int

    public init(nextLeague: LeagueKey, promoted: Bool, relegated: Bool, glory: Int) {
        self.nextLeague = nextLeague
        self.promoted = promoted
        self.relegated = relegated
        self.glory = glory
    }
}

public struct SettledLeagueMember: Sendable, Equatable {
    public let standing: LeagueStanding
    public let outcome: LeagueOutcome

    public init(standing: LeagueStanding, outcome: LeagueOutcome) {
        self.standing = standing
        self.outcome = outcome
    }
}

public struct FriendsLeagueEntry: Sendable, Equatable {
    public let userId: String
    public let weekPoints: Int
    public let rank: Int
    public let isMe: Bool

    public init(userId: String, weekPoints: Int, rank: Int, isMe: Bool) {
        self.userId = userId
        self.weekPoints = weekPoints
        self.rank = rank
        self.isMe = isMe
    }
}

/// L'ordre des chaînes tel que JavaScript le calcule : par unités UTF-16. Un
/// tri qui départage deux identifiants doit rendre le MÊME ordre sur toutes les
/// plateformes — l'ordre natif de `String` (valeurs scalaires normalisées) peut
/// en différer sur des identifiants hors ASCII.
enum GameOrdering {
    static func compare(_ lhs: String, _ rhs: String) -> Int {
        var left = lhs.utf16.makeIterator()
        var right = rhs.utf16.makeIterator()
        while true {
            switch (left.next(), right.next()) {
            case (nil, nil): return 0
            case (nil, _): return -1
            case (_, nil): return 1
            case let (l?, r?):
                if l != r { return l < r ? -1 : 1 }
            }
        }
    }

    /// Un tri STABLE par comparateur à trois valeurs : à égalité, l'ordre d'entrée.
    static func stableSorted<T>(_ items: [T], by compare: (T, T) -> Int) -> [T] {
        items.enumerated()
            .sorted { lhs, rhs in
                let order = compare(lhs.element, rhs.element)
                return order != 0 ? order < 0 : lhs.offset < rhs.offset
            }
            .map(\.element)
    }
}

public enum GameLeague {
    /// Les ligues s'ouvrent au niveau 10 (palier Lueur), lu sur le niveau RECORD.
    public static let minLevel = 10
    public static let groupSize = 30
    public static let promotedCount = 7
    public static let relegatedCount = 5
    public static let cupCount = 3
    /// Dimanche, le lundi valant 0.
    public static let closeWeekday = 6
    /// 20 h 00, en minutes depuis minuit local.
    public static let closeMinute = 20 * 60
    /// 4 h locales : l'heure où le classement se fige pour les AUTRES membres.
    public static let snapshotMinute = 4 * 60

    private static func add(_ days: Int, to dayKey: String) -> String {
        GameDay.add(days, to: dayKey) ?? dayKey
    }

    // MARK: La semaine

    /// 0 pour le lundi, 6 pour le dimanche.
    public static func weekdayIndex(of dayKey: String) -> Int {
        let day = GameDay.number(of: dayKey) ?? 0
        return ((day + 3) % 7 + 7) % 7
    }

    /// La clé de la semaine : le lundi local qui la commence.
    public static func weekKey(of dayKey: String) -> String {
        add(-weekdayIndex(of: dayKey), to: dayKey)
    }

    /// Le dimanche 20 h local de la semaine.
    public static func weekClose(of weekKey: String) -> LeagueMoment {
        LeagueMoment(dayKey: add(closeWeekday, to: weekKey), minuteOfDay: closeMinute)
    }

    /// La semaine à laquelle un moment appartient : passé la fermeture, c'est la suivante.
    public static func weekOfMoment(_ moment: LeagueMoment) -> String {
        let week = weekKey(of: moment.dayKey)
        let closed = weekdayIndex(of: moment.dayKey) == closeWeekday && moment.minuteOfDay >= closeMinute
        return closed ? add(7, to: week) : week
    }

    /// `true` quand le moment est à la fermeture de la semaine ou après.
    public static func isWeekClosed(weekKey: String, at moment: LeagueMoment) -> Bool {
        weekOfMoment(moment) > weekKey
    }

    /// Les points de la semaine : la somme des points GAGNÉS dont le moment tombe
    /// dans la semaine. Un débit (la frappe) n'est pas un gain : il ne retire rien.
    public static func weekPoints(weekKey: String, gains: [LeagueGain]) -> Int {
        gains
            .filter { weekOfMoment($0.moment) == weekKey }
            .reduce(0) { $0 + max(0, $1.points) }
    }

    // MARK: L'accès

    public static func access(levelRecord: Int, adultVerified: Bool, consented: Bool) -> LeagueAccess {
        guard levelRecord >= minLevel else { return .locked }
        guard adultVerified else { return .minor }
        return consented ? .open : .consentRequired
    }

    // MARK: Le pseudonyme

    public static let pseudonymMin = 3
    public static let pseudonymMax = 20

    private static func isLetter(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: true
        default: false
        }
    }

    private static func isNumber(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.properties.generalCategory {
        case .decimalNumber, .letterNumber, .otherNumber: true
        default: false
        }
    }

    private static func hasSuffixIgnoringCase(_ value: String, _ suffix: String) -> Bool {
        value.lowercased().hasSuffix(suffix)
    }

    /// 3 à 20 caractères, lettres de toute langue, chiffres, point, tiret et tiret
    /// bas ; il ne commence pas par un signe, n'est pas un nombre et ne ressemble
    /// pas à une adresse.
    public static func isValidPseudonym(_ value: String) -> Bool {
        let scalars = Array(value.unicodeScalars)
        guard (pseudonymMin...pseudonymMax).contains(scalars.count),
              let first = scalars.first, isLetter(first) || isNumber(first) else { return false }
        let allowedTail: Set<Unicode.Scalar> = [".", "_", "-"]
        guard scalars.dropFirst().allSatisfy({ isLetter($0) || isNumber($0) || allowedTail.contains($0) }) else {
            return false
        }
        guard !scalars.allSatisfy(isNumber) else { return false }
        if value.lowercased().hasPrefix("www.") { return false }
        return !["com", "net", "org", "me", "fr", "io", "app"].contains { hasSuffixIgnoringCase(value, "." + $0) }
    }

    private static let base36Cap: UInt = 36 * 36 * 36 * 36

    /// Le pseudonyme de départ : un colibri et quatre signes tirés d'un NOMBRE
    /// ALÉATOIRE que la passerelle tire au CSPRNG, STOCKE et renouvelle à chaque
    /// saison. Il ne se calcule JAMAIS depuis l'identifiant du compte.
    public static func pseudonym(fromDraw draw: Int) -> String {
        let digits = String(draw.magnitude % base36Cap, radix: 36)
        return "Colibri-" + String(repeating: "0", count: max(0, 4 - digits.count)) + digits
    }

    /// Ce que la ligue publique montre d'un joueur : son pseudonyme gardé, jamais son nom.
    public static func displayName(pseudonym: String?) -> String? {
        guard let pseudonym, isValidPseudonym(pseudonym) else { return nil }
        return pseudonym
    }

    /// Les noms qu'un pseudonyme de ligue ne prend jamais — ceux de la maison et des rôles.
    public static let reservedPseudonyms = ["meeshy", "mee", "meo", "admin", "administrator", "moderator", "support"]

    private static let reservedContainedMin = 6
    private static let identityMin = 3
    private static let identityContainedMin = 4

    /// Casse, accents et séparateurs (`.` `_` `-`) tombent.
    private static func fold(_ value: String) -> String {
        let decomposed = value.decomposedStringWithCompatibilityMapping
        var kept = String.UnicodeScalarView()
        for scalar in decomposed.unicodeScalars {
            switch scalar.properties.generalCategory {
            case .nonspacingMark, .spacingMark, .enclosingMark: continue
            default: kept.append(scalar)
            }
        }
        return String(kept).lowercased().filter { $0 != "." && $0 != "_" && $0 != "-" }
    }

    /// Le filtre d'un pseudonyme CHOISI : la forme, les noms réservés, l'identité
    /// de la personne (`forbidden` porte son nom d'utilisateur, son prénom, son nom).
    public static func checkPseudonym(_ value: String, forbidden: [String]) -> LeaguePseudonymCheck {
        guard isValidPseudonym(value) else { return .refused(.shape) }
        let folded = fold(value)
        let reserved = reservedPseudonyms.contains { name in
            folded == name || (name.count >= reservedContainedMin && folded.contains(name))
        }
        if reserved { return .refused(.reserved) }
        let identity = forbidden
            .map(fold)
            .filter { $0.count >= identityMin }
            .contains { name in folded == name || (name.count >= identityContainedMin && folded.contains(name)) }
        return identity ? .refused(.identity) : .ok
    }

    // MARK: L'instantané

    /// Le jour de l'instantané que les autres membres voient. Un total qui monte à
    /// 14 h 03 dit que la personne était active à 14 h 03 : le classement servi aux
    /// autres est figé une fois par jour. Avant 4 h, c'est l'instantané de la veille.
    public static func snapshotDay(at moment: LeagueMoment) -> String {
        moment.minuteOfDay >= snapshotMinute ? moment.dayKey : add(-1, to: moment.dayKey)
    }

    public static func visibility(board: Board, viewerIsMember: Bool) -> LeagueMemberVisibility {
        guard viewerIsMember else { return LeagueMemberVisibility(pseudonym: false, realIdentity: false) }
        return board == .publicBoard
            ? LeagueMemberVisibility(pseudonym: true, realIdentity: false)
            : LeagueMemberVisibility(pseudonym: false, realIdentity: true)
    }

    public enum Board: String, Sendable, Hashable {
        case publicBoard = "public"
        case friends
    }

    // MARK: La répartition

    private static func tieHash(_ seed: String, _ userId: String) -> Int64 {
        Int64(GameSeed.fnv1a("\(seed)|\(userId)"))
    }

    private static func byDescendingThenHash<T>(_ userId: @escaping (T) -> String, _ measure: @escaping (T) -> Int,
                                                seed: String) -> (T, T) -> Int {
        { lhs, rhs in
            let delta = measure(rhs) - measure(lhs)
            if delta != 0 { return delta < 0 ? -1 : 1 }
            let hash = tieHash(seed, userId(lhs)) - tieHash(seed, userId(rhs))
            if hash != 0 { return hash < 0 ? -1 : 1 }
            return GameOrdering.compare(userId(lhs), userId(rhs))
        }
    }

    /// La répartition des inscrits d'une ligue en groupes de 30 au plus, d'activité
    /// comparable : par activité décroissante (ex æquo : hachage de la semaine),
    /// puis des tranches CONTINUES de tailles égales à un près — 31 inscrits font
    /// 16 et 15, jamais 30 et 1.
    public static func partition(weekKey: String, league: LeagueKey, entrants: [LeagueEntrant]) -> [LeagueGroup] {
        let seed = "\(weekKey)|\(league.rawValue)"
        var order: [String] = []
        var latest: [String: LeagueEntrant] = [:]
        for entrant in entrants {
            if latest[entrant.userId] == nil { order.append(entrant.userId) }
            latest[entrant.userId] = entrant
        }
        let unique = order.compactMap { latest[$0] }
        let ranked = GameOrdering.stableSorted(unique, by: byDescendingThenHash({ $0.userId }, { $0.activity }, seed: seed))
        guard !ranked.isEmpty else { return [] }

        let groupCount = (ranked.count + groupSize - 1) / groupSize
        let base = ranked.count / groupCount
        let extra = ranked.count % groupCount

        return (0..<groupCount).map { index in
            let start = index * base + min(index, extra)
            let size = base + (index < extra ? 1 : 0)
            return LeagueGroup(
                groupId: "\(weekKey):\(league.rawValue):\(index + 1)",
                league: league,
                weekKey: weekKey,
                memberIds: ranked[start..<(start + size)].map(\.userId)
            )
        }
    }

    // MARK: Le classement

    /// Le classement d'un groupe. La zone de montée est de 7 (la moitié du groupe au
    /// plus), celle de descente de 5 (idem). Qui n'a gagné aucun point ne monte pas
    /// et ne reçoit pas de coupe.
    public static func standings(groupId: String, league: LeagueKey, members: [LeagueMemberPoints]) -> [LeagueStanding] {
        let ranked = GameOrdering.stableSorted(members, by: byDescendingThenHash({ $0.userId }, { $0.weekPoints }, seed: groupId))
        let half = ranked.count / 2
        let promoted = league.next == nil ? 0 : min(promotedCount, half)
        let relegated = league.previous == nil ? 0 : min(relegatedCount, half)

        return ranked.enumerated().map { index, member in
            let points = max(0, member.weekPoints)
            let earned = points > 0
            let zone: LeagueZone
            if index < promoted && earned {
                zone = .promotion
            } else if index >= ranked.count - relegated {
                zone = .relegation
            } else {
                zone = .safe
            }
            let cup: LeagueCup? = earned && index < cupCount ? LeagueCup.allCases[index] : nil
            return LeagueStanding(userId: member.userId, weekPoints: points, rank: index + 1, zone: zone, cup: cup)
        }
    }

    /// Les points qui manquent pour entrer dans la zone de montée : `0` quand on y
    /// est, `nil` au sommet, en cas d'erreur de joueur, ou quand il n'y a pas de zone.
    public static func pointsToPromotion(league: LeagueKey, standings: [LeagueStanding], userId: String) -> Int? {
        guard league.next != nil, let mine = standings.first(where: { $0.userId == userId }) else { return nil }
        if mine.zone == .promotion { return 0 }
        let lastPromoted = standings.last(where: { $0.zone == .promotion })
        let bar = lastPromoted.map { $0.weekPoints + 1 } ?? 1
        return max(0, bar - mine.weekPoints)
    }

    /// Le règlement d'un groupe à la fermeture : où chacun joue la semaine suivante, et sa Gloire.
    public static func settle(groupId: String, league: LeagueKey, members: [LeagueMemberPoints]) -> [SettledLeagueMember] {
        standings(groupId: groupId, league: league, members: members).map { standing in
            let promoted = standing.zone == .promotion
            let relegated = standing.zone == .relegation
            let destination: LeagueKey? = promoted ? league.next : (relegated ? league.previous : nil)
            let glory = (promoted ? GameGlory.points.leagueUp : 0) + (standing.cup == nil ? 0 : GameGlory.points.leagueCup)
            return SettledLeagueMember(
                standing: standing,
                outcome: LeagueOutcome(nextLeague: destination ?? league, promoted: promoted, relegated: relegated, glory: glory)
            )
        }
    }

    // MARK: La ligue Amis

    /// Le MÊME classement, restreint au joueur et à ses amis ACCEPTÉS. Les points
    /// d'une personne hors de cette liste n'y entrent jamais. Ni montée ni descente.
    public static func friendsRanking(weekKey: String, viewerId: String, friendIds: [String],
                                      weekPoints: [String: Int]) -> [FriendsLeagueEntry] {
        var seen = Set<String>()
        let ids = ([viewerId] + friendIds).filter { seen.insert($0).inserted }
        let entries = ids.map { LeagueMemberPoints(userId: $0, weekPoints: max(0, weekPoints[$0] ?? 0)) }
        let ranked = GameOrdering.stableSorted(entries, by: byDescendingThenHash({ $0.userId }, { $0.weekPoints }, seed: "\(weekKey)|friends"))
        return ranked.enumerated().map { index, entry in
            FriendsLeagueEntry(userId: entry.userId, weekPoints: entry.weekPoints, rank: index + 1, isMe: entry.userId == viewerId)
        }
    }
}
