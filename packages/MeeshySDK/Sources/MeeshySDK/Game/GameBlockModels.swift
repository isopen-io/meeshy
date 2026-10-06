import Foundation

// MARK: - Le bloc `game` de GET /me/engagement (#9378)
//
// MIROIR de `packages/shared/types/game.ts` (`gameBlockSchema`). Le bloc
// s'AJOUTE à côté des champs actuels de la charge : un ancien serveur ne le sert
// pas (`APIEngagementProgress.game == nil`), un ancien client l'ignore.
//
// **Jamais à moitié lu.** `parse(_:)` rend `nil` pour un bloc absent OU partiel,
// et `APIEngagementProgress` décode `game` en `try?` : un bloc que ce client ne
// comprend pas (une clé de palier ajoutée avant la mise à jour de l'app) ne
// doit ni emporter la charge de progression ni peindre un niveau à moitié lu.
// Les chaînes OUVERTES (`templateKey`, `signal`, clés de guide) restent libres ;
// les clés FERMÉES (palier, rang, forme de Flamme) sont des énumérations.

public struct GameBlock: Codable, Sendable, Equatable {

    public struct Level: Codable, Sendable, Equatable {
        public let level: Int
        public let tier: LevelTierKey
        public let score: Int
        public let floorScore: Int
        public let nextThreshold: Int?
        public let pointsToNext: Int
        public let progress: Double
        /// Le plus haut niveau atteint — il règle le Vent arrière.
        public let record: Int
        public let prestige: Int
        public let canPrestige: Bool

        public init(level: Int, tier: LevelTierKey, score: Int, floorScore: Int, nextThreshold: Int?,
                    pointsToNext: Int, progress: Double, record: Int, prestige: Int, canPrestige: Bool) {
            self.level = level
            self.tier = tier
            self.score = score
            self.floorScore = floorScore
            self.nextThreshold = nextThreshold
            self.pointsToNext = pointsToNext
            self.progress = progress
            self.record = record
            self.prestige = prestige
            self.canPrestige = canPrestige
        }
    }

    public struct Glory: Codable, Sendable, Equatable {
        public let glory: Int
        public let rank: GloryRank
        /// `nil` pour Mythe.
        public let division: GloryDivision?
        public let next: GloryStep?
        public let gloryMissing: Int?
        public let progress: Double

        public init(glory: Int, rank: GloryRank, division: GloryDivision?, next: GloryStep?,
                    gloryMissing: Int?, progress: Double) {
            self.glory = glory
            self.rank = rank
            self.division = division
            self.next = next
            self.gloryMissing = gloryMissing
            self.progress = progress
        }
    }

    public struct Mission: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let templateKey: String
        public let difficulty: MissionDifficulty
        public let signal: MissionSignal
        public let prism: Bool
        public let target: Int
        public let progress: Int
        public let reward: Int
        public let glory: Int
        /// ISO 8601, `nil` tant que la mission n'est pas finie.
        public let completedAt: String?

        public var isCompleted: Bool { completedAt != nil }

        public init(id: String, templateKey: String, difficulty: MissionDifficulty, signal: MissionSignal,
                    prism: Bool, target: Int, progress: Int, reward: Int, glory: Int, completedAt: String?) {
            self.id = id
            self.templateKey = templateKey
            self.difficulty = difficulty
            self.signal = signal
            self.prism = prism
            self.target = target
            self.progress = progress
            self.reward = reward
            self.glory = glory
            self.completedAt = completedAt
        }
    }

    public struct Missions: Codable, Sendable, Equatable {
        public let dayKey: String
        public let prismDay: Bool
        /// Niveau 5 atteint.
        public let unlocked: Bool
        public let items: [Mission]
        public let rerollAvailable: Bool

        public init(dayKey: String, prismDay: Bool, unlocked: Bool, items: [Mission], rerollAvailable: Bool) {
            self.dayKey = dayKey
            self.prismDay = prismDay
            self.unlocked = unlocked
            self.items = items
            self.rerollAvailable = rerollAvailable
        }
    }

    public struct Chest: Codable, Sendable, Equatable {
        public enum Status: String, Codable, Sendable, Hashable {
            case locked
            case ready
            case claimed
        }

        public let status: Status
        /// Contenu et probabilités, affichés AVANT l'ouverture.
        public let odds: ChestOdds
        /// Révélé une fois ouvert ; `nil` avant.
        public let reward: DailyChest?

        public init(status: Status, odds: ChestOdds, reward: DailyChest?) {
            self.status = status
            self.odds = odds
            self.reward = reward
        }
    }

    public struct Flame: Codable, Sendable, Equatable {
        public let days: Int
        public let form: FlameFormKey?
        public let bonusPercent: Int
        public let freezes: Int
        public let maxFreezes: Int
        public let freezePrice: Int
        public let relightPrice: Int
        public let status: FlameStatus
        public let canRelight: Bool

        public init(days: Int, form: FlameFormKey?, bonusPercent: Int, freezes: Int, maxFreezes: Int,
                    freezePrice: Int, relightPrice: Int, status: FlameStatus, canRelight: Bool) {
            self.days = days
            self.form = form
            self.bonusPercent = bonusPercent
            self.freezes = freezes
            self.maxFreezes = maxFreezes
            self.freezePrice = freezePrice
            self.relightPrice = relightPrice
            self.status = status
            self.canRelight = canRelight
        }
    }

    public struct Boosts: Codable, Sendable, Equatable {
        public struct PrismHour: Codable, Sendable, Equatable {
            public let startMinute: Int
            public let endMinute: Int
            public let multiplier: Double

            public init(startMinute: Int, endMinute: Int, multiplier: Double) {
                self.startMinute = startMinute
                self.endMinute = endMinute
                self.multiplier = multiplier
            }

            public var window: PrismHourWindow {
                PrismHourWindow(startMinute: startMinute, endMinute: endMinute)
            }
        }

        /// `1` ou `1,25`.
        public let tailwind: Double
        public let prismHour: PrismHour?

        public init(tailwind: Double, prismHour: PrismHour?) {
            self.tailwind = tailwind
            self.prismHour = prismHour
        }
    }

    public let level: Level
    public let glory: Glory
    public let treasury: TreasuryStanding
    public let mint: GameMintPreview
    public let missions: Missions
    public let chest: Chest
    public let flame: Flame
    public let boosts: Boosts
    /// Clés de guide déjà vues (moments et étapes d'intégration).
    public let guideSeen: [String]
    /// Les sept extensions de la vague 2 (ligue, duo, saison, trophées, Atlas, Prestige,
    /// visibilité) — chacune lue SEULE, `nil` quand le serveur ne la sert pas (#9384 à #9392).
    public let wave2: GameWave2

    public var league: GameLeagueBlock? { wave2.league }
    public var duo: GameDuoBlock? { wave2.duo }
    public var season: GameSeasonBlock? { wave2.season }
    public var trophies: GameTrophiesBlock? { wave2.trophies }
    public var atlas: GameAtlasBlock? { wave2.atlas }
    public var prestige: GamePrestigeBlock? { wave2.prestige }
    public var visibility: GameVisibility? { wave2.visibility }

    public init(level: Level, glory: Glory, treasury: TreasuryStanding, mint: GameMintPreview,
                missions: Missions, chest: Chest, flame: Flame, boosts: Boosts, guideSeen: [String],
                wave2: GameWave2 = .empty) {
        self.level = level
        self.glory = glory
        self.treasury = treasury
        self.mint = mint
        self.missions = missions
        self.chest = chest
        self.flame = flame
        self.boosts = boosts
        self.guideSeen = guideSeen
        self.wave2 = wave2
    }

    private enum CodingKeys: String, CodingKey {
        case level, glory, treasury, mint, missions, chest, flame, boosts, guideSeen
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        level = try container.decode(Level.self, forKey: .level)
        glory = try container.decode(Glory.self, forKey: .glory)
        treasury = try container.decode(TreasuryStanding.self, forKey: .treasury)
        mint = try container.decode(GameMintPreview.self, forKey: .mint)
        missions = try container.decode(Missions.self, forKey: .missions)
        chest = try container.decode(Chest.self, forKey: .chest)
        flame = try container.decode(Flame.self, forKey: .flame)
        boosts = try container.decode(Boosts.self, forKey: .boosts)
        guideSeen = try container.decode([String].self, forKey: .guideSeen)
        wave2 = GameWave2(from: decoder)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(level, forKey: .level)
        try container.encode(glory, forKey: .glory)
        try container.encode(treasury, forKey: .treasury)
        try container.encode(mint, forKey: .mint)
        try container.encode(missions, forKey: .missions)
        try container.encode(chest, forKey: .chest)
        try container.encode(flame, forKey: .flame)
        try container.encode(boosts, forKey: .boosts)
        try container.encode(guideSeen, forKey: .guideSeen)
        try wave2.encode(into: encoder)
    }

    /// Le bloc, ou `nil` s'il est absent ou partiel — jamais à moitié lu.
    public static func parse(_ data: Data) -> GameBlock? {
        try? JSONDecoder().decode(GameBlock.self, from: data)
    }
}
