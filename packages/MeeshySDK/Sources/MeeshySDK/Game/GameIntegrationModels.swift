import Foundation

// MARK: - Les lectures d'intégration du Jeu Meeshy (#9481, #9489)
//
// MIROIR de `packages/shared/types/game-v2.ts` (`gameSettingsResponseSchema`,
// `gameStandingSchema`, `gameShownTreasurySchema`, `userGameProfileResponseSchema`).
//
// Deux lectures, toutes deux en GET :
//  - `GET /me/game/privacy` — l'ÉTAT des réglages du jeu, servi par le serveur : les clients
//    ne gardent plus la dernière réponse du `PUT`, ils relisent ;
//  - `GET /users/:userId/game` — ce qu'un lecteur apprend du jeu d'un AUTRE membre : jamais un
//    compte exact (le niveau et son palier, les étoiles, la FORME de la Flamme, le rang et sa
//    division, le PALIER du trésor). Un refus (réglage, blocage, « Jeu masqué », compte inconnu)
//    rend EXACTEMENT `visible: false` et deux blocs nuls — la même réponse pour un compte qui
//    n'existe pas, que le client ne distingue donc pas.
//
// Chaque bloc se lit SEUL : un palier ou une forme de Flamme ajoutés par le serveur avant la mise
// à jour de l'app font tomber CE bloc, jamais la réponse entière.

/// `GET /me/game/privacy` : les deux interrupteurs et les quatre visibilités.
public struct GameSettingsResponse: Codable, Sendable, Equatable {
    public let gameHidden: Bool
    public let friendsLeagueOptOut: Bool
    public let visibility: GameVisibility

    public init(gameHidden: Bool, friendsLeagueOptOut: Bool, visibility: GameVisibility) {
        self.gameHidden = gameHidden
        self.friendsLeagueOptOut = friendsLeagueOptOut
        self.visibility = visibility
    }
}

/// Ce que le jeu d'un autre montre de son niveau et de son rang (réglage `rank`).
public struct GameStanding: Codable, Sendable, Equatable {
    public let level: Int
    public let tier: LevelTierKey
    /// Les étoiles de Prestige, de 0 à 5.
    public let prestige: Int
    /// La FORME de la Flamme, jamais ses jours. `nil` : pas de Flamme allumée, ou une forme que ce client ne connaît pas.
    public let flame: FlameFormKey?
    public let rank: GloryRank
    /// `nil` pour Mythe.
    public let division: GloryDivision?

    public init(level: Int, tier: LevelTierKey, prestige: Int, flame: FlameFormKey?, rank: GloryRank, division: GloryDivision?) {
        self.level = level
        self.tier = tier
        self.prestige = prestige
        self.flame = flame
        self.rank = rank
        self.division = division
    }

    private enum CodingKeys: String, CodingKey {
        case level, tier, prestige, flame, rank, division
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        level = try container.decode(Int.self, forKey: .level)
        tier = try container.decode(LevelTierKey.self, forKey: .tier)
        let stars = try container.decode(Int.self, forKey: .prestige)
        prestige = min(max(stars, 0), GameLevels.maxPrestige)
        flame = (try? container.decodeIfPresent(FlameFormKey.self, forKey: .flame)) ?? nil
        rank = try container.decode(GloryRank.self, forKey: .rank)
        division = (try? container.decodeIfPresent(GloryDivision.self, forKey: .division)) ?? nil
    }
}

/// Ce que le jeu d'un autre montre de son trésor (réglage `treasury`) : un PALIER, jamais les Meeshes.
public struct GameShownTreasury: Codable, Sendable, Equatable {
    public let tier: TreasuryTierKey?

    public init(tier: TreasuryTierKey?) {
        self.tier = tier
    }

    private enum CodingKeys: String, CodingKey {
        case tier
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tier = (try? container.decodeIfPresent(TreasuryTierKey.self, forKey: .tier)) ?? nil
    }
}

/// `GET /users/:userId/game`.
public struct UserGameProfileResponse: Codable, Sendable, Equatable {
    public let visible: Bool
    public let standing: GameStanding?
    public let treasury: GameShownTreasury?

    /// La réponse d'un refus — et de tout compte inconnu.
    public static let hidden = UserGameProfileResponse(visible: false, standing: nil, treasury: nil)

    public init(visible: Bool, standing: GameStanding?, treasury: GameShownTreasury?) {
        self.visible = visible
        self.standing = standing
        self.treasury = treasury
    }

    private enum CodingKeys: String, CodingKey {
        case visible, standing, treasury
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        visible = try container.decode(Bool.self, forKey: .visible)
        standing = (try? container.decodeIfPresent(GameStanding.self, forKey: .standing)) ?? nil
        treasury = (try? container.decodeIfPresent(GameShownTreasury.self, forKey: .treasury)) ?? nil
    }

    /// `true` quand il y a quelque chose à MONTRER : un refus, ou deux blocs que ce client ne lit pas, ne dessine rien.
    public var hasSomethingToShow: Bool {
        visible && (standing != nil || treasury?.tier != nil)
    }
}
