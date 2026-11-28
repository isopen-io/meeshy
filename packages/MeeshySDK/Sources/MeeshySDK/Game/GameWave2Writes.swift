import Foundation

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
    /// `true` quand cette étape termine le parcours (coupe, badge daté, `GameGlory.points.season` de Gloire).
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
    /// La constellation du membre (#10053) — ses seules étoiles, figées au mois ; absente d'un refus ou d'un ancien
    /// serveur.
    public let constellation: ShowcaseConstellation?

    public init(visible: Bool, items: [GameVisitorTrophyItem], order: [String], constellation: ShowcaseConstellation? = nil) {
        self.visible = visible
        self.items = items
        self.order = order
        self.constellation = constellation
    }

    private enum CodingKeys: String, CodingKey { case visible, items, order, constellation }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        visible = try container.decode(Bool.self, forKey: .visible)
        items = try container.decode([GameVisitorTrophyItem].self, forKey: .items)
        order = try container.decode([String].self, forKey: .order)
        // Un champ neuf malformé ne fait pas tomber la vitrine : il se tait.
        constellation = (try? container.decodeIfPresent(ShowcaseConstellation.self, forKey: .constellation)) ?? nil
    }
}

/// Les étoiles allumées d'un autre membre (#10053).
public struct ShowcaseConstellation: Codable, Sendable, Equatable {
    public let stars: Int

    public init(stars: Int) {
        self.stars = stars
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
