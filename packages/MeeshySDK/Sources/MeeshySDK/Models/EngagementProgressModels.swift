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
        public let engagementScore: Int

        public init(engagementScore: Int) {
            self.engagementScore = engagementScore
        }
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

        public init(factor: Double, activeFamilyCount: Int, hasStanding: Bool, windowDays: Int) {
            self.factor = factor
            self.activeFamilyCount = activeFamilyCount
            self.hasStanding = hasStanding
            self.windowDays = windowDays
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

        public init(
            balance: Int,
            mintedLifetime: Int,
            debitablePoints: Int,
            floorPoints: Int,
            missingPoints: Int,
            mintCost: Int
        ) {
            self.balance = balance
            self.mintedLifetime = mintedLifetime
            self.debitablePoints = debitablePoints
            self.floorPoints = floorPoints
            self.missingPoints = missingPoints
            self.mintCost = mintCost
        }
    }

    public var id: String { "current" }
    public let counters: [Counter]
    public let milestones: [Milestone]
    public let streak: Streak
    public let level: Level
    public let meesh: Meesh?
    public let elan: Elan?

    public init(
        counters: [Counter],
        milestones: [Milestone],
        streak: Streak,
        level: Level,
        meesh: Meesh? = nil,
        elan: Elan? = nil
    ) {
        self.counters = counters
        self.milestones = milestones
        self.streak = streak
        self.level = level
        self.meesh = meesh
        self.elan = elan
    }

    /// Aucune activité — la charge qu'un compte neuf reçoit.
    public static let empty = APIEngagementProgress(
        counters: [],
        milestones: [],
        streak: Streak(currentStreakDays: 0, longestStreakDays: 0),
        level: Level(engagementScore: 0)
    )

    private enum CodingKeys: String, CodingKey {
        case counters, milestones, streak, level, meesh, elan
    }
}
