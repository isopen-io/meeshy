import Foundation

// MARK: - Le bloc `game` de la vague 2 (#9384 à #9392)
//
// MIROIR de `packages/shared/types/game-v2.ts`. Le bloc `game` de `GET
// /me/engagement` reçoit SEPT extensions de plus, toutes OPTIONNELLES et toutes
// TOLÉRANTES : un serveur antérieur ne les sert pas, et une extension que ce
// client ne sait pas lire tombe SEULE (`nil`) — elle n'emporte pas le bloc
// entier, que `GameBlock.parse` rendrait sinon `nil`. Chaque extension se décode
// donc en `try?` : une clé de ligue ajoutée avant la mise à jour de l'app ne
// doit jamais effacer le niveau, la Flamme ni le coffre.
//
// **Confidentialité par construction.** La ligue PUBLIQUE ne sert aucun
// identifiant de joueur : un pseudonyme, un rang, le total de la semaine — rien
// d'une heure d'activité. La ligue AMIS, restreinte aux amis acceptés, sert des
// identifiants : ils se connaissent déjà.

public struct GameLeagueBlock: Codable, Sendable, Equatable {
    public struct Closes: Codable, Sendable, Equatable {
        public let dayKey: String
        public let minuteOfDay: Int

        public init(dayKey: String, minuteOfDay: Int) {
            self.dayKey = dayKey
            self.minuteOfDay = minuteOfDay
        }
    }

    public struct Current: Codable, Sendable, Equatable {
        public let league: LeagueKey
        public let groupId: String
        public let groupSize: Int
        public let rank: Int
        public let weekPoints: Int
        public let zone: LeagueZone
        public let cup: LeagueCup?
        /// `0` dans la zone de montée, `nil` au sommet.
        public let pointsToPromotion: Int?

        public init(league: LeagueKey, groupId: String, groupSize: Int, rank: Int, weekPoints: Int,
                    zone: LeagueZone, cup: LeagueCup?, pointsToPromotion: Int?) {
            self.league = league
            self.groupId = groupId
            self.groupSize = groupSize
            self.rank = rank
            self.weekPoints = weekPoints
            self.zone = zone
            self.cup = cup
            self.pointsToPromotion = pointsToPromotion
        }
    }

    public struct Friends: Codable, Sendable, Equatable {
        public let rank: Int
        public let size: Int
        public let weekPoints: Int

        public init(rank: Int, size: Int, weekPoints: Int) {
            self.rank = rank
            self.size = size
            self.weekPoints = weekPoints
        }
    }

    /// Niveau record de 10 atteint.
    public let unlocked: Bool
    public let access: LeagueAccess
    /// Le pseudonyme que les autres voient ; `nil` tant que le joueur n'est pas dans la ligue publique.
    public let pseudonym: String?
    public let weekKey: String
    /// Dimanche 20 h, heure locale.
    public let closes: Closes
    /// `nil` : pas (encore) placé dans un groupe de la ligue publique.
    public let current: Current?
    /// La ligue Amis, toujours disponible.
    public let friends: Friends

    public init(unlocked: Bool, access: LeagueAccess, pseudonym: String?, weekKey: String, closes: Closes,
                current: Current?, friends: Friends) {
        self.unlocked = unlocked
        self.access = access
        self.pseudonym = pseudonym
        self.weekKey = weekKey
        self.closes = closes
        self.current = current
        self.friends = friends
    }
}

/// `none` ajouté aux statuts d'un duo : aucun duo cette semaine.
public enum DuoBlockStatus: String, Codable, Sendable, Hashable {
    case none
    case invited
    case active
    case completed
    case abandoned
    case expired
}

public struct GameDuoBlock: Codable, Sendable, Equatable {
    public struct Partner: Codable, Sendable, Equatable {
        public let userId: String
        public let displayName: String

        public init(userId: String, displayName: String) {
            self.userId = userId
            self.displayName = displayName
        }
    }

    public struct Mission: Codable, Sendable, Equatable {
        public let templateKey: String
        public let signal: String
        public let prism: Bool
        /// Ce que CHACUN doit faire.
        public let partTarget: Int
        public let commonTarget: Int

        public init(templateKey: String, signal: String, prism: Bool, partTarget: Int, commonTarget: Int) {
            self.templateKey = templateKey
            self.signal = signal
            self.prism = prism
            self.partTarget = partTarget
            self.commonTarget = commonTarget
        }
    }

    public struct Progress: Codable, Sendable, Equatable {
        public let mine: Int
        public let partner: Int
        public let common: Int
        public let mineDone: Bool
        public let partnerDone: Bool
        public let bothDone: Bool

        public init(mine: Int, partner: Int, common: Int, mineDone: Bool, partnerDone: Bool, bothDone: Bool) {
            self.mine = mine
            self.partner = partner
            self.common = common
            self.mineDone = mineDone
            self.partnerDone = partnerDone
            self.bothDone = bothDone
        }
    }

    public struct Reward: Codable, Sendable, Equatable {
        public let points: Int
        public let doubled: Bool

        public init(points: Int, doubled: Bool) {
            self.points = points
            self.doubled = doubled
        }
    }

    /// Niveau record de 20 atteint.
    public let unlocked: Bool
    public let status: DuoBlockStatus
    public let duoId: String?
    public let weekKey: String
    public let role: DuoActor?
    public let partner: Partner?
    public let mission: Mission?
    public let progress: Progress?
    /// Ce que MA part vaut au total : doublé quand les deux ont fini.
    public let reward: Reward?

    public init(unlocked: Bool, status: DuoBlockStatus, duoId: String?, weekKey: String, role: DuoActor?,
                partner: Partner?, mission: Mission?, progress: Progress?, reward: Reward?) {
        self.unlocked = unlocked
        self.status = status
        self.duoId = duoId
        self.weekKey = weekKey
        self.role = role
        self.partner = partner
        self.mission = mission
        self.progress = progress
        self.reward = reward
    }
}

public struct GameSeasonBlock: Codable, Sendable, Equatable {
    public struct Reward: Codable, Sendable, Equatable {
        public let kind: SeasonRewardKind
        public let amount: Int

        public init(kind: SeasonRewardKind, amount: Int) {
            self.kind = kind
            self.amount = amount
        }
    }

    public struct NextReward: Codable, Sendable, Equatable {
        public let step: Int
        public let reward: Reward

        public init(step: Int, reward: Reward) {
            self.step = step
            self.reward = reward
        }
    }

    public let number: Int
    /// Ouverte : le catalogue des thèmes est une donnée de produit, il grandit sans casser un client.
    public let themeKey: String
    public let startDay: String
    public let endDay: String
    /// De 1 à 8.
    public let week: Int
    public let stars: Int
    public let steps: Int
    public let stepsTotal: Int
    public let starsToNext: Int
    public let progress: Double
    public let completed: Bool
    /// Les étapes déjà réclamées.
    public let claimedSteps: [Int]
    /// La prochaine récompense gratuite à réclamer, `nil` quand tout est réclamé.
    public let nextReward: NextReward?
    public let sealOwned: Bool
    public let sealPrice: Int

    public init(number: Int, themeKey: String, startDay: String, endDay: String, week: Int, stars: Int,
                steps: Int, stepsTotal: Int, starsToNext: Int, progress: Double, completed: Bool,
                claimedSteps: [Int], nextReward: NextReward?, sealOwned: Bool, sealPrice: Int) {
        self.number = number
        self.themeKey = themeKey
        self.startDay = startDay
        self.endDay = endDay
        self.week = week
        self.stars = stars
        self.steps = steps
        self.stepsTotal = stepsTotal
        self.starsToNext = starsToNext
        self.progress = progress
        self.completed = completed
        self.claimedSteps = claimedSteps
        self.nextReward = nextReward
        self.sealOwned = sealOwned
        self.sealPrice = sealPrice
    }
}

public struct GameTrophyItem: Codable, Sendable, Equatable {
    public let key: String
    /// ISO 8601.
    public let awardedAt: String

    public init(key: String, awardedAt: String) {
        self.key = key
        self.awardedAt = awardedAt
    }
}

public struct GameTrophiesBlock: Codable, Sendable, Equatable {
    public let items: [GameTrophyItem]
    /// La vitrine, dans l'ordre : les clés RANGÉES d'abord, puis le reste du plus précieux au moins précieux.
    public let order: [String]

    public init(items: [GameTrophyItem], order: [String]) {
        self.items = items
        self.order = order
    }
}

public struct GameAtlasBlock: Codable, Sendable, Equatable {
    public struct Stamp: Codable, Sendable, Equatable {
        public let language: String
        public let stampedOn: String

        public init(language: String, stampedOn: String) {
            self.language = language
            self.stampedOn = stampedOn
        }
    }

    public struct Pending: Codable, Sendable, Equatable {
        public let language: String
        public let sent: Bool
        public let received: Bool

        public init(language: String, sent: Bool, received: Bool) {
            self.language = language
            self.sent = sent
            self.received = received
        }
    }

    public let stamped: Int
    public let total: Int
    public let stamps: [Stamp]
    public let pending: [Pending]

    public init(stamped: Int, total: Int, stamps: [Stamp], pending: [Pending]) {
        self.stamped = stamped
        self.total = total
        self.stamps = stamps
        self.pending = pending
    }
}

public struct GamePrestigeBlock: Codable, Sendable, Equatable {
    /// Les étoiles posées, de 0 à 5.
    public let stars: Int
    public let max: Int
    public let canPrestige: Bool
    public let gloryOnPass: Int

    public init(stars: Int, max: Int, canPrestige: Bool, gloryOnPass: Int) {
        self.stars = stars
        self.max = max
        self.canPrestige = canPrestige
        self.gloryOnPass = gloryOnPass
    }
}

public struct GameVisibility: Codable, Sendable, Equatable {
    public let showcase: ShowcaseVisibility
    public let rank: ShowcaseVisibility
    public let treasury: ShowcaseVisibility
    /// Privé par défaut : une langue peut révéler une origine ou une conviction.
    public let atlas: ShowcaseVisibility

    public init(showcase: ShowcaseVisibility, rank: ShowcaseVisibility, treasury: ShowcaseVisibility,
                atlas: ShowcaseVisibility) {
        self.showcase = showcase
        self.rank = rank
        self.treasury = treasury
        self.atlas = atlas
    }
}

/// La rareté MESURÉE d'un succès (#9390) : `holders` titulaires sur `population` comptes. La clé
/// du dictionnaire est celle du succès (`achievement.first_content`). Le client est FAIL-CLOSED :
/// une rareté ne se MONTRE qu'avec assez de titulaires et de comptes (`visibleRarity`).
public struct GameRarityEntry: Codable, Sendable, Equatable {
    public let rarity: GameGlory.AchievementRarity?
    public let holders: Int
    public let population: Int

    public init(rarity: GameGlory.AchievementRarity?, holders: Int, population: Int) {
        self.rarity = rarity
        self.holders = holders
        self.population = population
    }

    /// La rareté qu'on a le DROIT de montrer, `nil` sous 20 titulaires ou 1 000 comptes, ou non mesurée.
    public var visibleRarity: GameGlory.AchievementRarity? {
        guard let rarity, GameRarity.isShareDisplayable(holders: holders, population: population) else { return nil }
        return rarity
    }

    /// La part des comptes, de 0 à 100.
    public var sharePercent: Double {
        Double(holders) / Double(max(1, population)) * 100
    }
}

/// Une entrée illisible tombe SEULE : le dictionnaire des raretés ne casse pas pour une valeur inconnue.
private struct LossyRarityEntry: Decodable {
    let entry: GameRarityEntry?

    init(from decoder: Decoder) throws {
        entry = try? GameRarityEntry(from: decoder)
    }
}

/// Les sept extensions du bloc `game`, groupées : un client sans elles les lit `nil`.
public struct GameWave2: Sendable, Equatable {
    public let league: GameLeagueBlock?
    public let duo: GameDuoBlock?
    public let season: GameSeasonBlock?
    public let trophies: GameTrophiesBlock?
    public let atlas: GameAtlasBlock?
    public let prestige: GamePrestigeBlock?
    public let visibility: GameVisibility?
    /// La rareté mesurée de chaque succès — HORS contrat partagé : lue en tolérant, comme le web.
    public let achievementRarities: [String: GameRarityEntry]?

    public static let empty = GameWave2()

    public init(league: GameLeagueBlock? = nil, duo: GameDuoBlock? = nil, season: GameSeasonBlock? = nil,
                trophies: GameTrophiesBlock? = nil, atlas: GameAtlasBlock? = nil,
                prestige: GamePrestigeBlock? = nil, visibility: GameVisibility? = nil,
                achievementRarities: [String: GameRarityEntry]? = nil) {
        self.league = league
        self.duo = duo
        self.season = season
        self.trophies = trophies
        self.atlas = atlas
        self.prestige = prestige
        self.visibility = visibility
        self.achievementRarities = achievementRarities
    }

    enum CodingKeys: String, CodingKey {
        case league, duo, season, trophies, atlas, prestige, visibility, achievementRarities
    }

    /// Chaque extension se lit seule : l'une illisible tombe, les autres restent.
    init(from decoder: Decoder) {
        guard let container = try? decoder.container(keyedBy: CodingKeys.self) else {
            self.init()
            return
        }
        self.init(
            league: (try? container.decodeIfPresent(GameLeagueBlock.self, forKey: .league)) ?? nil,
            duo: (try? container.decodeIfPresent(GameDuoBlock.self, forKey: .duo)) ?? nil,
            season: (try? container.decodeIfPresent(GameSeasonBlock.self, forKey: .season)) ?? nil,
            trophies: (try? container.decodeIfPresent(GameTrophiesBlock.self, forKey: .trophies)) ?? nil,
            atlas: (try? container.decodeIfPresent(GameAtlasBlock.self, forKey: .atlas)) ?? nil,
            prestige: (try? container.decodeIfPresent(GamePrestigeBlock.self, forKey: .prestige)) ?? nil,
            visibility: (try? container.decodeIfPresent(GameVisibility.self, forKey: .visibility)) ?? nil,
            achievementRarities: Self.rarities(in: container)
        )
    }

    private static func rarities(in container: KeyedDecodingContainer<CodingKeys>) -> [String: GameRarityEntry]? {
        guard let raw = (try? container.decodeIfPresent([String: LossyRarityEntry].self, forKey: .achievementRarities)) ?? nil else {
            return nil
        }
        let readable = raw.compactMapValues(\.entry)
        return readable.isEmpty ? nil : readable
    }

    func encode(into encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(league, forKey: .league)
        try container.encodeIfPresent(duo, forKey: .duo)
        try container.encodeIfPresent(season, forKey: .season)
        try container.encodeIfPresent(trophies, forKey: .trophies)
        try container.encodeIfPresent(atlas, forKey: .atlas)
        try container.encodeIfPresent(prestige, forKey: .prestige)
        try container.encodeIfPresent(visibility, forKey: .visibility)
        try container.encodeIfPresent(achievementRarities, forKey: .achievementRarities)
    }
}

// MARK: - Les écritures de la vague 2
//
// Toutes portent un `requestId` (8 à 64 caractères), généré UNE fois par
// INTENTION : rejouer une écriture rend son résultat, jamais une seconde écriture.
// Les `status` restent des CHAÎNES, comme au premier lot : un statut ajouté par
// le serveur ne doit pas faire échouer le décodage d'une écriture DÉJÀ faite.

public struct LeagueConsentRequest: Encodable, Sendable, Equatable {
    public let requestId: String
    public let consent: Bool
    /// Choisi au consentement, sinon le pseudonyme par défaut s'applique.
    public let pseudonym: String?

    public init(requestId: String, consent: Bool, pseudonym: String? = nil) {
        self.requestId = requestId
        self.consent = consent
        self.pseudonym = pseudonym
    }
}

public struct LeagueConsentResponse: Decodable, Sendable, Equatable {
    public let consent: Bool
    public let pseudonym: String?

    public init(consent: Bool, pseudonym: String?) {
        self.consent = consent
        self.pseudonym = pseudonym
    }
}

public struct LeaguePseudonymRequest: Encodable, Sendable, Equatable {
    public let requestId: String
    public let pseudonym: String

    public init(requestId: String, pseudonym: String) {
        self.requestId = requestId
        self.pseudonym = pseudonym
    }
}

public struct LeaguePseudonymResponse: Decodable, Sendable, Equatable {
    public let pseudonym: String

    public init(pseudonym: String) {
        self.pseudonym = pseudonym
    }
}

/// Un joueur de la ligue PUBLIQUE : aucun identifiant, aucune présence.
public struct LeagueWeekEntry: Codable, Sendable, Equatable {
    public let rank: Int
    public let displayName: String
    public let weekPoints: Int
    public let zone: LeagueZone
    public let cup: LeagueCup?
    public let isMe: Bool

    public init(rank: Int, displayName: String, weekPoints: Int, zone: LeagueZone, cup: LeagueCup?, isMe: Bool) {
        self.rank = rank
        self.displayName = displayName
        self.weekPoints = weekPoints
        self.zone = zone
        self.cup = cup
        self.isMe = isMe
    }
}

public struct LeagueWeekResponse: Codable, Sendable, Equatable {
    public let weekKey: String
    /// Le jour de l'instantané : les AUTRES membres sont servis figés — seule la ligne `isMe` est en direct.
    public let snapshotDay: String
    public let closes: GameLeagueBlock.Closes
    /// `false` : consenti, mais pas encore placé dans un groupe.
    public let placed: Bool
    public let league: LeagueKey?
    public let groupId: String?
    public let entries: [LeagueWeekEntry]

    public init(weekKey: String, snapshotDay: String, closes: GameLeagueBlock.Closes, placed: Bool,
                league: LeagueKey?, groupId: String?, entries: [LeagueWeekEntry]) {
        self.weekKey = weekKey
        self.snapshotDay = snapshotDay
        self.closes = closes
        self.placed = placed
        self.league = league
        self.groupId = groupId
        self.entries = entries
    }
}

public struct LeagueFriendsEntry: Codable, Sendable, Equatable {
    public let rank: Int
    public let userId: String
    public let weekPoints: Int
    public let isMe: Bool

    public init(rank: Int, userId: String, weekPoints: Int, isMe: Bool) {
        self.rank = rank
        self.userId = userId
        self.weekPoints = weekPoints
        self.isMe = isMe
    }
}

public struct LeagueFriendsResponse: Codable, Sendable, Equatable {
    public let weekKey: String
    public let closes: GameLeagueBlock.Closes
    public let entries: [LeagueFriendsEntry]

    public init(weekKey: String, closes: GameLeagueBlock.Closes, entries: [LeagueFriendsEntry]) {
        self.weekKey = weekKey
        self.closes = closes
        self.entries = entries
    }
}

public struct DuoInviteRequest: Encodable, Sendable, Equatable {
    public let requestId: String
    public let friendId: String

    public init(requestId: String, friendId: String) {
        self.requestId = requestId
        self.friendId = friendId
    }
}

public struct DuoInviteResponse: Decodable, Sendable, Equatable {
    /// `invited` | `already-invited`.
    public let status: String
    public let duoId: String
    public let weekKey: String

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, duoId: String, weekKey: String) {
        self.status = status
        self.duoId = duoId
        self.weekKey = weekKey
    }
}

public struct DuoStatusResponse: Decodable, Sendable, Equatable {
    /// `active` | `already-active` pour accepter ; `abandoned` | `already-abandoned` pour quitter.
    public let status: String
    public let duoId: String

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, duoId: String) {
        self.status = status
        self.duoId = duoId
    }
}

public struct SeasonClaimResponse: Decodable, Sendable, Equatable {
    public struct Seal: Decodable, Sendable, Equatable {
        public let cosmeticKey: String

        public init(cosmeticKey: String) {
            self.cosmeticKey = cosmeticKey
        }
    }

    /// `claimed` | `already-claimed`.
    public let status: String
    public let step: Int
    public let reward: GameSeasonBlock.Reward
    /// Le cosmétique de la rangée Sceau, quand elle est possédée et que l'étape en porte un.
    public let seal: Seal?
    /// `true` quand cette étape termine le parcours (coupe, badge daté, +500 de Gloire).
    public let completed: Bool
    public let gloryGained: Int
    /// Le score en poche après le crédit.
    public let score: Int

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, step: Int, reward: GameSeasonBlock.Reward, seal: Seal?, completed: Bool,
                gloryGained: Int, score: Int) {
        self.status = status
        self.step = step
        self.reward = reward
        self.seal = seal
        self.completed = completed
        self.gloryGained = gloryGained
        self.score = score
    }
}

public struct SeasonSealResponse: Decodable, Sendable, Equatable {
    /// `bought` | `already-bought`.
    public let status: String
    public let balance: Int

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, balance: Int) {
        self.status = status
        self.balance = balance
    }
}

public struct ShowcaseOrderRequest: Encodable, Sendable, Equatable {
    public let requestId: String
    /// 200 clés au plus.
    public let order: [String]

    public init(requestId: String, order: [String]) {
        self.requestId = requestId
        self.order = order
    }
}

public struct ShowcaseOrderResponse: Decodable, Sendable, Equatable {
    public let order: [String]

    public init(order: [String]) {
        self.order = order
    }
}

/// Au moins un des quatre réglages.
public struct ShowcaseVisibilityRequest: Encodable, Sendable, Equatable {
    public let requestId: String
    public let showcase: ShowcaseVisibility?
    public let rank: ShowcaseVisibility?
    public let treasury: ShowcaseVisibility?
    public let atlas: ShowcaseVisibility?

    public init(requestId: String, showcase: ShowcaseVisibility? = nil, rank: ShowcaseVisibility? = nil,
                treasury: ShowcaseVisibility? = nil, atlas: ShowcaseVisibility? = nil) {
        self.requestId = requestId
        self.showcase = showcase
        self.rank = rank
        self.treasury = treasury
        self.atlas = atlas
    }
}

public struct ShowcaseVisibilityResponse: Decodable, Sendable, Equatable {
    public let visibility: GameVisibility

    public init(visibility: GameVisibility) {
        self.visibility = visibility
    }
}

/// Un trophée vu par un VISITEUR : sa clé projetée (une coupe de ligue y porte le
/// mois, jamais la semaine) et le mois d'obtention, jamais l'horodatage.
public struct GameVisitorTrophyItem: Codable, Sendable, Equatable {
    public let key: String
    public let awardedMonth: String
    /// Combien de coupes identiques ce mois réunit ; absent pour un trophée unique.
    public let count: Int?

    public init(key: String, awardedMonth: String, count: Int? = nil) {
        self.key = key
        self.awardedMonth = awardedMonth
        self.count = count
    }
}

public struct UserShowcaseResponse: Codable, Sendable, Equatable {
    /// `false` : le réglage du membre ferme la vitrine à ce lecteur — jamais une
    /// erreur, qui dirait qu'elle existe.
    public let visible: Bool
    public let items: [GameVisitorTrophyItem]
    public let order: [String]

    public init(visible: Bool, items: [GameVisitorTrophyItem], order: [String]) {
        self.visible = visible
        self.items = items
        self.order = order
    }
}

/// « Jeu masqué » et l'opposition à la ligue Amis : deux interrupteurs, au moins un.
public struct GamePrivacyRequest: Encodable, Sendable, Equatable {
    public let requestId: String
    public let gameHidden: Bool?
    public let friendsLeagueOptOut: Bool?

    public init(requestId: String, gameHidden: Bool? = nil, friendsLeagueOptOut: Bool? = nil) {
        self.requestId = requestId
        self.gameHidden = gameHidden
        self.friendsLeagueOptOut = friendsLeagueOptOut
    }
}

public struct GamePrivacyResponse: Decodable, Sendable, Equatable {
    public let gameHidden: Bool
    public let friendsLeagueOptOut: Bool

    public init(gameHidden: Bool, friendsLeagueOptOut: Bool) {
        self.gameHidden = gameHidden
        self.friendsLeagueOptOut = friendsLeagueOptOut
    }
}

public struct PrestigeResponse: Decodable, Sendable, Equatable {
    /// `passed` | `already-passed`.
    public let status: String
    public let prestige: Int
    /// Le score en poche et le niveau repartent de zéro et de 1.
    public let score: Int
    public let level: Int
    public let gloryGained: Int
    public let trophyKey: String

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, prestige: Int, score: Int, level: Int, gloryGained: Int, trophyKey: String) {
        self.status = status
        self.prestige = prestige
        self.score = score
        self.level = level
        self.gloryGained = gloryGained
        self.trophyKey = trophyKey
    }
}
