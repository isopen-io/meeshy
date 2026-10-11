import Foundation

// MARK: - Ce qu'un lien du Jeu ouvre : une saison n, une semaine de ligue (#9947, #10018)
//
// Miroir de `packages/shared/types/game-archive.ts` (`GameArchiveModelsTests` compare
// les clés au schéma Zod). Rien de la présence d'autrui : une saison sert son
// CALENDRIER (le même pour tous) et MA progression ; une semaine sert MON résultat
// gravé — ni pseudonyme, ni total, ni rang d'un autre.
//
// Les clés optionnelles s'ENCODENT en `null` (jamais omises) : la copie disque relue
// hors ligne est la réponse du serveur, clé pour clé.

/// Par rapport à MON moment (mon fuseau, la fermeture du dimanche 20 h comprise).
public enum GameArchiveStatus: String, CaseIterable, Codable, Sendable, Hashable {
    case past
    case current
    case upcoming
}

/// Une semaine purgée (`LEAGUE_RETENTION_DAYS` après la fin de sa saison) le dit.
public enum GameArchiveRetention: String, CaseIterable, Codable, Sendable, Hashable {
    case kept
    case purged
}

/// MA progression dans une saison : ce que le palmarès d'une saison passée montre.
public struct GameSeasonProgressArchive: Codable, Sendable, Equatable {
    public let stars: Int
    public let steps: Int
    public let claimedSteps: [Int]
    public let sealOwned: Bool
    /// Le parcours terminé : la coupe de saison et le badge daté.
    public let completed: Bool
    public let settled: Bool

    public init(stars: Int, steps: Int, claimedSteps: [Int], sealOwned: Bool, completed: Bool, settled: Bool) {
        self.stars = stars
        self.steps = steps
        self.claimedSteps = claimedSteps
        self.sealOwned = sealOwned
        self.completed = completed
        self.settled = settled
    }
}

/// Une saison par son numéro (`GET /me/game/seasons/:number`).
public struct GameSeasonArchive: Codable, Sendable, Equatable {
    public let number: Int
    public let status: GameArchiveStatus
    public let themeKey: String
    /// Le lundi d'ouverture (`AAAA-MM-JJ`).
    public let startDay: String
    /// Le dernier dimanche.
    public let endDay: String
    public let weekKeys: [String]
    /// `nil` : je n'y ai pas joué (ou elle n'a pas commencé).
    public let progress: GameSeasonProgressArchive?

    public init(number: Int, status: GameArchiveStatus, themeKey: String, startDay: String, endDay: String,
                weekKeys: [String], progress: GameSeasonProgressArchive?) {
        self.number = number
        self.status = status
        self.themeKey = themeKey
        self.startDay = startDay
        self.endDay = endDay
        self.weekKeys = weekKeys
        self.progress = progress
    }

    private enum CodingKeys: String, CodingKey {
        case number, status, themeKey, startDay, endDay, weekKeys, progress
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(number, forKey: .number)
        try container.encode(status, forKey: .status)
        try container.encode(themeKey, forKey: .themeKey)
        try container.encode(startDay, forKey: .startDay)
        try container.encode(endDay, forKey: .endDay)
        try container.encode(weekKeys, forKey: .weekKeys)
        try container.encode(progress, forKey: .progress)
    }
}

/// MON résultat gravé d'une semaine de ligue.
extension GameSeasonArchive {
    /// L'état de cette copie au moment donné (#10131) : servi, puis avancé par l'horloge locale.
    public func liveStatus(at moment: LeagueMoment = .local()) -> GameArchiveStatus {
        GameSeason.liveTense(served: status, startDay: startDay, endDay: endDay, at: moment)
    }
}

public struct GameLeagueWeekResult: Codable, Sendable, Equatable {
    public let league: LeagueKey
    public let finalRank: Int?
    public let finalPoints: Int?
    public let zone: LeagueZone?
    public let cup: LeagueCup?
    public let settled: Bool

    public init(league: LeagueKey, finalRank: Int?, finalPoints: Int?, zone: LeagueZone?, cup: LeagueCup?, settled: Bool) {
        self.league = league
        self.finalRank = finalRank
        self.finalPoints = finalPoints
        self.zone = zone
        self.cup = cup
        self.settled = settled
    }

    private enum CodingKeys: String, CodingKey {
        case league, finalRank, finalPoints, zone, cup, settled
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(league, forKey: .league)
        try container.encode(finalRank, forKey: .finalRank)
        try container.encode(finalPoints, forKey: .finalPoints)
        try container.encode(zone, forKey: .zone)
        try container.encode(cup, forKey: .cup)
        try container.encode(settled, forKey: .settled)
    }
}

/// Une semaine de ligue par sa clé, le lundi (`GET /me/game/league/weeks/:weekKey`).
public struct GameLeagueWeekArchive: Codable, Sendable, Equatable {
    public let weekKey: String
    public let status: GameArchiveStatus
    /// La saison qui contient la semaine, `nil` hors saison.
    public let season: Int?
    public let retention: GameArchiveRetention
    /// `nil` : pas de place cette semaine-là, ou plus de trace (purge).
    public let result: GameLeagueWeekResult?

    public init(weekKey: String, status: GameArchiveStatus, season: Int?, retention: GameArchiveRetention, result: GameLeagueWeekResult?) {
        self.weekKey = weekKey
        self.status = status
        self.season = season
        self.retention = retention
        self.result = result
    }

    private enum CodingKeys: String, CodingKey {
        case weekKey, status, season, retention, result
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(weekKey, forKey: .weekKey)
        try container.encode(status, forKey: .status)
        try container.encode(season, forKey: .season)
        try container.encode(retention, forKey: .retention)
        try container.encode(result, forKey: .result)
    }
}
