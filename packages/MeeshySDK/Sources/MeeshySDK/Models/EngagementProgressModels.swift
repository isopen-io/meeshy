import Foundation

// MARK: - La charge de GET /me/engagement

/// La charge de `GET /me/engagement` (#5670,
/// `services/gateway/src/routes/me/engagement.ts`) — la forme EXACTE que la
/// passerelle rend, miroir de `EngagementProgressPayload`
/// (`packages/shared/types/engagement.ts`). Compteurs par axe, paliers déjà
/// gravés (les quatre natures mélangées — c'est la mémoire d'anti-rejeu de
/// #5530), série et score de l'utilisateur AUTHENTIFIÉ. Lecture seule.
///
/// `axisKey` et `milestoneKey` restent des CHAÎNES : un axe ajouté au serveur
/// avant la mise à jour de l'app ne doit jamais faire échouer le décodage —
/// `EngagementProgressResolver` ignore ce qu'il ne connaît pas (fail-safe à
/// l'AFFICHAGE). `milestoneType`, lui, est une énumération FERMÉE : une nature
/// de palier inconnue refuse la charge ENTIÈRE (fail-closed à la FORME), comme
/// `isEngagementProgressPayload` côté TS — mieux vaut un écran qui dit
/// « illisible » qu'un niveau peint depuis une charge à moitié comprise.
///
/// `CacheIdentifiable` : UN instantané par compte (`id = "current"`), dans un
/// store que `CacheCoordinator.reset()` purge à la déconnexion — même forme
/// que `UserStats`.
public struct APIEngagementProgress: Codable, Sendable, Equatable, CacheIdentifiable {
    public struct Counter: Codable, Sendable, Equatable {
        public let axisKey: String
        public let count: Int
        /// Points crédités par cet axe, élan compris (#5749). Optionnel : une
        /// passerelle antérieure ne le sert pas, et rien n'en dépend à l'écran.
        public let points: Int?

        public init(axisKey: String, count: Int, points: Int? = nil) {
            self.axisKey = axisKey
            self.count = count
            self.points = points
        }
    }

    public struct Milestone: Codable, Sendable, Equatable {
        public let milestoneType: EngagementMilestoneType
        public let milestoneKey: String
        /// ISO 8601, tel que la route le sérialise (`reachedAt.toISOString()`).
        /// Gardé en chaîne — c'est la forme du contrat et celle du cache ; la
        /// vue en tire une `Date` par `EngagementProgressResolver.reachedDate`.
        public let reachedAt: String

        public init(milestoneType: EngagementMilestoneType, milestoneKey: String, reachedAt: String) {
            self.milestoneType = milestoneType
            self.milestoneKey = milestoneKey
            self.reachedAt = reachedAt
        }
    }

    public struct Streak: Codable, Sendable, Equatable {
        public let currentStreakDays: Int
        public let longestStreakDays: Int

        public init(currentStreakDays: Int, longestStreakDays: Int) {
            self.currentStreakDays = currentStreakDays
            self.longestStreakDays = longestStreakDays
        }
    }

    public struct Level: Codable, Sendable, Equatable {
        /// La poche (#10846) — ce que la frappe dépense. Nom historique, toujours servi.
        public let engagementScore: Int
        /// LES ÉTINCELLES (#10846) — optionnelles : un serveur antérieur ne les sert pas. Des entiers JSON
        /// saturés à 2^53 − 1, décodés en `Int` (64 bits sur tout appareil iOS).
        public let sparks: Int?
        /// Accumulées depuis le dernier prestige — la base du niveau.
        public let sparksCycle: Int?
        /// Accumulées à vie : ne baissent ni à la frappe ni au prestige.
        public let sparksLifetime: Int?
        /// Le niveau max à vie, qui survit au prestige.
        public let levelMaxLifetime: Int?
        /// La dette d'étincelles : déduite des prochains gains, elle bloque la frappe.
        public let sparksDebt: Int?

        public init(engagementScore: Int, sparks: Int? = nil, sparksCycle: Int? = nil,
                    sparksLifetime: Int? = nil, levelMaxLifetime: Int? = nil, sparksDebt: Int? = nil) {
            self.sparksDebt = sparksDebt
            self.engagementScore = engagementScore
            self.sparks = sparks
            self.sparksCycle = sparksCycle
            self.sparksLifetime = sparksLifetime
            self.levelMaxLifetime = levelMaxLifetime
        }

        private enum CodingKeys: String, CodingKey {
            case engagementScore, sparks, sparksCycle, sparksLifetime, levelMaxLifetime, sparksDebt
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            engagementScore = try c.decode(Int.self, forKey: .engagementScore)
            sparks = GameSparks.count(c, .sparks)
            sparksCycle = GameSparks.count(c, .sparksCycle)
            sparksLifetime = GameSparks.count(c, .sparksLifetime)
            levelMaxLifetime = GameSparks.count(c, .levelMaxLifetime)
            sparksDebt = GameSparks.count(c, .sparksDebt)
        }

        /// La poche : `sparks` servi, sinon `engagementScore` (même nombre, nom d'hier).
        public var pocket: Int { sparks ?? engagementScore }
    }

    /// L'ÉLAN COURANT (#5749) — OPTIONNEL, comme `Meesh`.
    ///
    /// Ce que le PROCHAIN geste créditera, pas ce que le dernier a crédité : un
    /// multiplicateur sert à décider quoi faire ensuite.
    public struct Elan: Codable, Sendable, Equatable {
        public let factor: Double
        public let activeFamilyCount: Int
        public let hasStanding: Bool
        /// La fenêtre glissante en jours, SERVIE — aucun client ne la code en dur.
        public let windowDays: Int
        /// La LISTE derrière le cardinal (#5897, #5927), lue sur la même fenêtre.
        /// Optionnelle : une passerelle antérieure ne la sert pas.
        public let activeFamilies: [String]?

        public init(
            factor: Double,
            activeFamilyCount: Int,
            hasStanding: Bool,
            windowDays: Int,
            activeFamilies: [String]? = nil
        ) {
            self.factor = factor
            self.activeFamilyCount = activeFamilyCount
            self.hasStanding = hasStanding
            self.windowDays = windowDays
            self.activeFamilies = activeFamilies
        }
    }

    /// LES MEESHES (#5743) — OPTIONNEL, délibérément.
    ///
    /// Une passerelle antérieure à ce lot ne sert pas ce bloc, et l'écran doit
    /// alors ne RIEN montrer : ni solde, ni bouton. Décodé en `nil` plutôt que
    /// remplacé par des zéros — un solde de zéro affiché à quelqu'un qui en a
    /// deux serait pire qu'une absence.
    public struct Meesh: Codable, Sendable, Equatable {
        public let balance: Int
        /// Frappées à vie — monotone, c'est elle que le rang interroge (#5744).
        public let mintedLifetime: Int
        /// Points repris à des axes débitables — jamais les conversations.
        public let debitablePoints: Int
        /// Le plancher inaliénable : compté dans le niveau, jamais dépensable.
        public let floorPoints: Int
        public let missingPoints: Int
        /// Le prix, SERVI par la passerelle — aucun client ne le code en dur.
        public let mintCost: Int
        /// Le prix de rang de la pièce, avant le facteur du niveau actuel (#10847) — `nil` devant un serveur antérieur.
        public let baseMintCost: Int?
        /// Le facteur du niveau actuel appliqué, de 0,5 à 1 (#10847).
        public let costFactor: Double?
        /// La dette d'étincelles qui bloque la frappe — `nil` ou `0` : aucune (contrat en cours côté passerelle).
        public let sparksDebt: Int?
        /// Ce qui bloque la frappe hors prix et rang : `.debt` tant qu'une dette existe.
        public let blockedBy: GameSparks.MintBlock?
        /// ISO 8601 des BORNES du registre de frappe (#5839) — la première et
        /// la dernière, `nil` quand il n'y en a eu aucune.
        ///
        /// Optionnelles au sens du DÉCODAGE, pas du produit : une passerelle
        /// antérieure au lot ne sert pas ces clés, et leur absence doit rester
        /// décodable. Gardées en chaîne comme `Milestone.reachedAt` — c'est la
        /// forme du contrat ET celle du cache ; la `Date` se dérive à la
        /// présentation.
        public let firstMintedAt: String?
        public let lastMintedAt: String?

        public init(
            balance: Int,
            mintedLifetime: Int,
            debitablePoints: Int,
            floorPoints: Int,
            missingPoints: Int,
            mintCost: Int,
            firstMintedAt: String? = nil,
            lastMintedAt: String? = nil,
            baseMintCost: Int? = nil,
            costFactor: Double? = nil,
            sparksDebt: Int? = nil,
            blockedBy: GameSparks.MintBlock? = nil
        ) {
            self.blockedBy = blockedBy
            self.baseMintCost = baseMintCost
            self.costFactor = costFactor
            self.sparksDebt = sparksDebt
            self.balance = balance
            self.mintedLifetime = mintedLifetime
            self.debitablePoints = debitablePoints
            self.floorPoints = floorPoints
            self.missingPoints = missingPoints
            self.mintCost = mintCost
            self.firstMintedAt = firstMintedAt
            self.lastMintedAt = lastMintedAt
        }
    }

    public var id: String { "current" }
    public let counters: [Counter]
    public let milestones: [Milestone]
    public let streak: Streak
    public let level: Level
    public let meesh: Meesh?
    public let elan: Elan?
    /// La carte d'atteignabilité des succès (#5759) — `familyId -> plus grande
    /// valeur que le produit peut rendre vraie`. Absente ⇒ les paliers d'AMPLEUR
    /// sont masqués, ceux de VOLUME restent visibles.
    public let achievementReach: [String: Int]?

    /// Le JEU (#9378) — OPTIONNEL, et lu en `try?` : une passerelle antérieure ne
    /// le sert pas, et un bloc que ce client ne comprend pas (une clé de palier
    /// ajoutée avant la mise à jour de l'app) ne doit pas emporter la charge de
    /// progression ENTIÈRE. `nil` ⇒ aucun élément du jeu n'est montré, jamais un
    /// niveau peint depuis un bloc à moitié lu.
    public let game: GameBlock?
    /// Le marqueur d'ORDRE de l'état du jeu (#10900) — millisecondes serveur, croissant pour un même compte : toute
    /// écriture du jeu terminée avant lui est reflétée dans cette charge. `nil` devant une passerelle antérieure.
    public let gameRevision: Int?

    public init(
        counters: [Counter],
        milestones: [Milestone],
        streak: Streak,
        level: Level,
        meesh: Meesh? = nil,
        elan: Elan? = nil,
        achievementReach: [String: Int]? = nil,
        game: GameBlock? = nil,
        gameRevision: Int? = nil
    ) {
        self.counters = counters
        self.milestones = milestones
        self.streak = streak
        self.level = level
        self.meesh = meesh
        self.elan = elan
        self.achievementReach = achievementReach
        self.game = game
        self.gameRevision = gameRevision
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        counters = try container.decode([Counter].self, forKey: .counters)
        milestones = try container.decode([Milestone].self, forKey: .milestones)
        streak = try container.decode(Streak.self, forKey: .streak)
        level = try container.decode(Level.self, forKey: .level)
        meesh = try container.decodeIfPresent(Meesh.self, forKey: .meesh)
        elan = try container.decodeIfPresent(Elan.self, forKey: .elan)
        achievementReach = try container.decodeIfPresent([String: Int].self, forKey: .achievementReach)
        game = (try? container.decodeIfPresent(GameBlock.self, forKey: .game)) ?? nil
        gameRevision = (try? container.decodeIfPresent(Int.self, forKey: .gameRevision)) ?? nil
    }

    /// Aucune activité — la charge qu'un compte neuf reçoit.
    public static let empty = APIEngagementProgress(
        counters: [],
        milestones: [],
        streak: Streak(currentStreakDays: 0, longestStreakDays: 0),
        level: Level(engagementScore: 0)
    )

    private enum CodingKeys: String, CodingKey {
        case counters, milestones, streak, level, meesh, elan, achievementReach, game, gameRevision
    }
}
