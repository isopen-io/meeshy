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
        /// La lecture ouverte par le rang (#9688) — `nil` devant un serveur antérieur. Les champs voisins
        /// gardent l'ANCIENNE loi sur le fil (niveau borné à 100, dix paliers) pour les clients publiés.
        public let ladder: Ladder?
        /// LES ÉTINCELLES (#10846) — `nil` devant un serveur antérieur. `score` lit la POCHE (#10892).
        /// La poche : ce que la frappe dépense, et la base du niveau — la frappe le fait baisser.
        public let sparks: Int?
        /// Accumulées depuis le dernier prestige — indicatif (#10892), jamais la base du niveau.
        public let sparksCycle: Int?
        /// Accumulées à vie — indicatif.
        public let sparksLifetime: Int?
        /// Le niveau max à vie, sans la borne de 100 — survit au prestige.
        public let levelMaxLifetime: Int?
        /// La dette d'étincelles : déduite des prochains gains, elle bloque la frappe.
        public let sparksDebt: Int?

        public init(level: Int, tier: LevelTierKey, score: Int, floorScore: Int, nextThreshold: Int?,
                    pointsToNext: Int, progress: Double, record: Int, prestige: Int, canPrestige: Bool,
                    ladder: Ladder? = nil, sparks: Int? = nil, sparksCycle: Int? = nil,
                    sparksLifetime: Int? = nil, levelMaxLifetime: Int? = nil, sparksDebt: Int? = nil) {
            self.sparksDebt = sparksDebt
            self.sparks = sparks
            self.sparksCycle = sparksCycle
            self.sparksLifetime = sparksLifetime
            self.levelMaxLifetime = levelMaxLifetime
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
            self.ladder = ladder
        }

        /// Le niveau ouvert par le rang : la vérité que le serveur à jour sert à côté des champs d'hier.
        public struct Ladder: Codable, Sendable, Equatable {
            public let level: Int
            public let tier: LevelTierKey
            public let floorScore: Int
            public let nextThreshold: Int?
            public let pointsToNext: Int
            public let progress: Double
            public let record: Int
            /// Le plafond que le rang ouvre : 499, 1000, ou `nil` (sans limite, à partir d'Oracle).
            public let cap: Int?
            /// Le niveau est au plafond : il monte dès que le rang l'ouvre.
            public let isMax: Bool
            /// Les points sont là, une étape manque : le niveau attend au palier précédent (#9706).
            public let held: Bool
            /// La prochaine étape au-dessus du niveau, faite ou à faire — `nil` au-delà de 100 ou devant un
            /// serveur d'avant les étapes (#9706).
            public let step: GameLevelStep?
            /// Les compteurs que jugent les étapes, pour que l'optimiste rejoue la loi (#9706).
            public let steps: GameLevelStepCounts?
            /// Le niveau max à vie (#10846) : il survit au prestige. `nil` devant un serveur antérieur.
            public let levelMaxLifetime: Int?
            /// Le record de chaque cycle CLOS par un Prestige, le plus ancien d'abord (#10911) : combien de fois un
            /// niveau a été atteint, tous cycles confondus. `nil` devant un serveur antérieur.
            public let pastCycleRecords: [Int]?

            public init(level: Int, tier: LevelTierKey, floorScore: Int, nextThreshold: Int?, pointsToNext: Int,
                        progress: Double, record: Int, cap: Int?, isMax: Bool, held: Bool = false,
                        step: GameLevelStep? = nil, steps: GameLevelStepCounts? = nil, levelMaxLifetime: Int? = nil,
                        pastCycleRecords: [Int]? = nil) {
                self.levelMaxLifetime = levelMaxLifetime
                self.pastCycleRecords = pastCycleRecords
                self.level = level
                self.tier = tier
                self.floorScore = floorScore
                self.nextThreshold = nextThreshold
                self.pointsToNext = pointsToNext
                self.progress = progress
                self.record = record
                self.cap = cap
                self.isMax = isMax
                self.held = held
                self.step = step
                self.steps = steps
            }

            private enum CodingKeys: String, CodingKey {
                case level, tier, floorScore, nextThreshold, pointsToNext, progress, record, cap, isMax, held, step, steps
                case levelMaxLifetime, pastCycleRecords
            }

            /// Les trois champs des étapes (#9706) sont OPTIONNELS et tolérés : illisibles (une sorte d'étape
            /// ajoutée avant la mise à jour de l'app), ils se taisent sans faire tomber le bloc du jeu.
            public init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                level = try container.decode(Int.self, forKey: .level)
                tier = try container.decode(LevelTierKey.self, forKey: .tier)
                floorScore = try container.decode(Int.self, forKey: .floorScore)
                nextThreshold = try container.decodeIfPresent(Int.self, forKey: .nextThreshold)
                pointsToNext = try container.decode(Int.self, forKey: .pointsToNext)
                progress = try container.decode(Double.self, forKey: .progress)
                record = try container.decode(Int.self, forKey: .record)
                cap = try container.decodeIfPresent(Int.self, forKey: .cap)
                isMax = try container.decode(Bool.self, forKey: .isMax)
                held = ((try? container.decodeIfPresent(Bool.self, forKey: .held)) ?? nil) ?? false
                step = (try? container.decodeIfPresent(GameLevelStep.self, forKey: .step)) ?? nil
                steps = (try? container.decodeIfPresent(GameLevelStepCounts.self, forKey: .steps)) ?? nil
                levelMaxLifetime = GameSparks.count(container, .levelMaxLifetime)
                // Toléré : illisible, il se tait — la loi relit alors chaque cycle clos au niveau du Prestige.
                pastCycleRecords = (try? container.decodeIfPresent([Int].self, forKey: .pastCycleRecords)) ?? nil
            }
        }

        private enum CodingKeys: String, CodingKey {
            case level, tier, score, floorScore, nextThreshold, pointsToNext, progress, record, prestige, canPrestige, ladder
            case sparks, sparksCycle, sparksLifetime, levelMaxLifetime, sparksDebt
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            level = try c.decode(Int.self, forKey: .level)
            tier = try c.decode(LevelTierKey.self, forKey: .tier)
            score = try c.decode(Int.self, forKey: .score)
            floorScore = try c.decode(Int.self, forKey: .floorScore)
            nextThreshold = try c.decodeIfPresent(Int.self, forKey: .nextThreshold)
            pointsToNext = try c.decode(Int.self, forKey: .pointsToNext)
            progress = try c.decode(Double.self, forKey: .progress)
            record = try c.decode(Int.self, forKey: .record)
            prestige = try c.decode(Int.self, forKey: .prestige)
            canPrestige = try c.decode(Bool.self, forKey: .canPrestige)
            ladder = try c.decodeIfPresent(Ladder.self, forKey: .ladder)
            sparks = GameSparks.count(c, .sparks)
            sparksCycle = GameSparks.count(c, .sparksCycle)
            sparksLifetime = GameSparks.count(c, .sparksLifetime)
            levelMaxLifetime = GameSparks.count(c, .levelMaxLifetime)
            sparksDebt = GameSparks.count(c, .sparksDebt)
        }

        /// Le niveau max à vie à MONTRER : servi, sinon relu sur le record — jamais sous le niveau montré.
        public var shownLevelMaxLifetime: Int {
            max(levelMaxLifetime ?? ladder?.levelMaxLifetime ?? shown.record, shown.level)
        }

        /// Les trois nombres des étincelles, avec le repli d'un serveur antérieur (la poche se lit sur `score`).
        public var sparkFacts: GameSparks.Facts {
            GameSparks.facts(pocket: sparks ?? score, cycle: sparksCycle ?? score, lifetime: sparksLifetime)
        }

        /// Ce que l'écran montre : la lecture ouverte par le rang, ou les champs d'hier devant un serveur antérieur.
        public var shown: Ladder {
            ladder ?? Ladder(level: level, tier: tier, floorScore: floorScore, nextThreshold: nextThreshold,
                             pointsToNext: pointsToNext, progress: progress, record: record, cap: nil,
                             isMax: nextThreshold == nil)
        }
    }

    public struct Glory: Codable, Sendable, Equatable {
        public let glory: Int
        public let rank: GloryRank
        /// Projection héritée (1–3), `nil` pour Mythe — la seule que lisent les clients publiés.
        public let division: GloryDivision?
        /// V (5) à I (1), `nil` pour Mythe ou devant un ancien serveur (#9636).
        public let division5: GloryDivision5?
        public let next: GloryStep?
        public let gloryMissing: Int?
        public let progress: Double
        /// La place du Mythe et son émission, quand le serveur les sert (#9636).
        public let mythic: MythicSeatRef?

        public init(glory: Int, rank: GloryRank, division: GloryDivision?, division5: GloryDivision5? = nil,
                    next: GloryStep?, gloryMissing: Int?, progress: Double, mythic: MythicSeatRef? = nil) {
            self.glory = glory
            self.rank = rank
            self.division = division
            self.division5 = division5
            self.next = next
            self.gloryMissing = gloryMissing
            self.progress = progress
            self.mythic = mythic
        }

        private enum CodingKeys: String, CodingKey {
            case glory, rank, division, division5, next, gloryMissing, progress, mythic
        }

        /// Les deux champs neufs (#9636) sont OPTIONNELS et tolérés : illisibles, ils se taisent
        /// (division héritée, pas de place) sans faire tomber le bloc du jeu.
        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            glory = try container.decode(Int.self, forKey: .glory)
            rank = try container.decode(GloryRank.self, forKey: .rank)
            division = try container.decodeIfPresent(GloryDivision.self, forKey: .division)
            division5 = (try? container.decodeIfPresent(GloryDivision5.self, forKey: .division5)) ?? nil
            next = try container.decodeIfPresent(GloryStep.self, forKey: .next)
            gloryMissing = try container.decodeIfPresent(Int.self, forKey: .gloryMissing)
            progress = try container.decode(Double.self, forKey: .progress)
            mythic = ((try? container.decodeIfPresent(MythicSeatRef.self, forKey: .mythic)) ?? nil).flatMap { $0.isValid ? $0 : nil }
        }

        /// La division à montrer : `division5` servie, sinon la division héritée relue (ancien serveur).
        public var shownDivision: GloryDivision5? {
            division5 ?? division.map(GloryDivision5.init(legacy:))
        }

        /// La place du Mythe, seulement quand le rang servi EST le Mythe et la place lisible.
        public var mythicSeat: MythicSeatRef? {
            rank == .mythe ? mythic.flatMap { $0.isValid ? $0 : nil } : nil
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
        /// La mission personnelle du jour (#9539), servie à côté des trois ; `nil` d'un ancien serveur ou si illisible.
        public let personal: PersonalMission?

        public init(dayKey: String, prismDay: Bool, unlocked: Bool, items: [Mission], rerollAvailable: Bool,
                    personal: PersonalMission? = nil) {
            self.dayKey = dayKey
            self.prismDay = prismDay
            self.unlocked = unlocked
            self.items = items
            self.rerollAvailable = rerollAvailable
            self.personal = personal
        }

        private enum CodingKeys: String, CodingKey {
            case dayKey, prismDay, unlocked, items, rerollAvailable, personal
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            dayKey = try container.decode(String.self, forKey: .dayKey)
            prismDay = try container.decode(Bool.self, forKey: .prismDay)
            unlocked = try container.decode(Bool.self, forKey: .unlocked)
            items = try container.decode([Mission].self, forKey: .items)
            rerollAvailable = try container.decode(Bool.self, forKey: .rerollAvailable)
            personal = (try? container.decodeIfPresent(PersonalMission.self, forKey: .personal)) ?? nil
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
        /// Le contenu CERTAIN du jour (#10011) — points, Gloire, primes possibles en points — dit avant
        /// l'ouverture. `nil` devant un serveur antérieur, avant le tirage des missions, ou s'il est illisible (il
        /// tombe seul).
        public let today: ChestContent?

        public init(status: Status, odds: ChestOdds, reward: DailyChest?, today: ChestContent? = nil) {
            self.status = status
            self.odds = odds
            self.reward = reward
            self.today = today
        }

        private enum CodingKeys: String, CodingKey {
            case status, odds, reward, today
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            status = try container.decode(Status.self, forKey: .status)
            odds = try container.decode(ChestOdds.self, forKey: .odds)
            reward = try container.decodeIfPresent(DailyChest.self, forKey: .reward)
            today = (try? container.decodeIfPresent(ChestContent.self, forKey: .today)) ?? nil
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
    /// Les fragments d'étoile collectés (#10011), toutes sources confondues — `nil` devant un serveur antérieur
    /// ou s'il est illisible (il tombe seul). Le serveur seul le tient.
    public let starFragments: StarFragmentsTotal?
    /// Les sept extensions de la vague 2 (ligue, duo, saison, trophées, Atlas, Prestige,
    /// visibilité) — chacune lue SEULE, `nil` quand le serveur ne la sert pas (#9384 à #9392).
    public let wave2: GameWave2

    public var league: GameLeagueBlock? { wave2.league }
    public var duo: GameDuoBlock? { wave2.duo }
    public var season: GameSeasonBlock? { wave2.season }
    /// La saison à venir tant qu'aucune n'est ouverte (#10014).
    public var seasonUpcoming: GameUpcomingSeasonBlock? { wave2.seasonUpcoming }
    public var trophies: GameTrophiesBlock? { wave2.trophies }
    public var atlas: GameAtlasBlock? { wave2.atlas }
    public var prestige: GamePrestigeBlock? { wave2.prestige }
    public var visibility: GameVisibility? { wave2.visibility }

    public init(level: Level, glory: Glory, treasury: TreasuryStanding, mint: GameMintPreview,
                missions: Missions, chest: Chest, flame: Flame, boosts: Boosts, guideSeen: [String],
                starFragments: StarFragmentsTotal? = nil, wave2: GameWave2 = .empty) {
        self.level = level
        self.glory = glory
        self.treasury = treasury
        self.mint = mint
        self.missions = missions
        self.chest = chest
        self.flame = flame
        self.boosts = boosts
        self.guideSeen = guideSeen
        self.starFragments = starFragments
        self.wave2 = wave2
    }

    private enum CodingKeys: String, CodingKey {
        case level, glory, treasury, mint, missions, chest, flame, boosts, guideSeen, starFragments
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
        starFragments = (try? container.decodeIfPresent(StarFragmentsTotal.self, forKey: .starFragments)) ?? nil
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
        try container.encodeIfPresent(starFragments, forKey: .starFragments)
        try wave2.encode(into: encoder)
    }

    /// Le bloc, ou `nil` s'il est absent ou partiel — jamais à moitié lu.
    public static func parse(_ data: Data) -> GameBlock? {
        try? JSONDecoder().decode(GameBlock.self, from: data)
    }
}
