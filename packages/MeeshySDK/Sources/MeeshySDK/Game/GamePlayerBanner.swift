import Foundation

// MARK: - La bannière du joueur (#9494, conception XIII.1)
//
// MIROIR de `playerBannerModel` (`apps/web/src/lib/view/player-banner.ts`) : ce que le bandeau du haut montre
// quand ni un appel ni un audio ne l'occupe. Ordre FIXE, de gauche à droite : anneau de niveau, jauge vers le
// niveau suivant, Meeshes, blason du rang, gemme de ligue et place, Flamme.
//
// SEULEMENT CE QUI EXISTE : un élément sans donnée vaut `nil` et ne se dessine pas — jamais un zéro, un tiret ou
// une case vide. Un joueur qui n'a rien fait n'a PAS de bandeau ; le détail du niveau paraît au niveau 2, le total
// de points au premier point, le trésor à la première Meesh gardée, le rang à la première Gloire, la ligue au
// consentement (avec un groupe), la Flamme quand elle brûle.
//
// Le modèle ne calcule RIEN : il LIT le bloc `game` servi (le cache d'abord) et ne fait que choisir ce qui se
// montre. Aucune règle du jeu n'est réécrite ici.
//
// « N'AFFICHER QUE CE QUI A DU SENS » (#9536, directive porteur 2026-10-06) : `make(game:)` est LA fonction qui
// décide. Toutes les données à zéro ⇒ `nil` (aucun bandeau) ; sinon chaque morceau se tait tant qu'il n'a rien à dire :
// pas de points ⇒ pas de total (`showsScore`) ; niveau 1 ⇒ ni anneau ni jauge (`showsLevel`) ; pas de Meeshes, de
// Gloire, de ligue ni de Flamme ⇒ rien d'eux (leurs champs valent `nil`).

public struct GamePlayerBanner: Equatable, Sendable {

    public struct Rank: Equatable, Sendable {
        public let rank: GloryRank
        /// V (5) à I (1) — `nil` pour Mythe.
        public let division: GloryDivision5?
        /// La place du Mythe (son numéro se dit : « Mythe n° 42 »).
        public let mythic: MythicSeatRef?

        public init(rank: GloryRank, division: GloryDivision5?, mythic: MythicSeatRef? = nil) {
            self.rank = rank
            self.division = division
            self.mythic = mythic
        }
    }

    public struct League: Equatable, Sendable {
        public let league: LeagueKey
        /// La place dans le groupe de la semaine (1 = en tête).
        public let place: Int

        public init(league: LeagueKey, place: Int) {
            self.league = league
            self.place = place
        }
    }

    public struct Flame: Equatable, Sendable {
        public let form: FlameFormKey
        public let days: Int

        public init(form: FlameFormKey, days: Int) {
            self.form = form
            self.days = days
        }
    }

    public let level: Int
    public let tier: LevelTierKey
    /// La part parcourue vers le niveau suivant, de 0 à 1 ; 1 au sommet.
    public let progress: Double
    public let prestige: Int
    public let score: Int
    /// `nil` au plafond que le rang ouvre (ou, devant un ancien serveur, au niveau 100) : plus rien ne manque.
    public let nextLevel: Int?
    public let pointsToNext: Int?
    /// Le plafond où le niveau s'est arrêté (499 ou 1000) — `nil` quand rien ne bloque (#9688).
    public let levelCap: Int?
    public let meeshes: Int?
    public let rank: Rank?
    public let league: League?
    public let flame: Flame?

    public init(level: Int, tier: LevelTierKey, progress: Double, prestige: Int = 0, score: Int, nextLevel: Int?, pointsToNext: Int?,
                levelCap: Int? = nil, meeshes: Int? = nil, rank: Rank? = nil, league: League? = nil, flame: Flame? = nil) {
        self.level = level
        self.tier = tier
        self.progress = Self.bounded(progress)
        self.prestige = prestige
        self.score = score
        self.nextLevel = nextLevel
        self.pointsToNext = pointsToNext
        self.levelCap = levelCap
        self.meeshes = meeshes
        self.rank = rank
        self.league = league
        self.flame = flame
    }

    /// Les états où la Flamme brûle encore : allumée, menacée, couverte par un gel.
    private static let burning: Set<FlameStatus> = [.lit, .atRisk, .covered]

    public init(game: GameBlock) {
        // Le niveau MONTRÉ : celui que le rang ouvre (#9688), ou les champs d'hier devant un ancien serveur.
        let level = game.level.shown
        let atTop = level.nextThreshold == nil
        self.level = level.level
        self.tier = level.tier
        self.progress = atTop ? 1 : Self.bounded(level.progress)
        self.prestige = game.level.prestige
        self.score = game.level.score
        self.nextLevel = atTop ? nil : level.level + 1
        self.pointsToNext = atTop ? nil : level.pointsToNext
        self.levelCap = level.isMax ? level.cap : nil
        self.meeshes = game.treasury.held > 0 ? game.treasury.held : nil
        self.rank = game.glory.glory > 0 ? Rank(rank: game.glory.rank, division: game.glory.shownDivision, mythic: game.glory.mythicSeat) : nil
        if let league = game.league, league.access == .open, let current = league.current {
            self.league = League(league: current.league, place: current.rank)
        } else {
            self.league = nil
        }
        if let form = game.flame.form, Self.burning.contains(game.flame.status), game.flame.days > 0 {
            self.flame = Flame(form: form, days: game.flame.days)
        } else {
            self.flame = nil
        }
    }

    /// LA décision : le bandeau du joueur, ou `nil` quand rien n'a de sens à dire — un joueur qui n'a encore rien
    /// fait (niveau 1, aucun point, aucune Meesh, aucune Gloire, aucune ligue, aucune Flamme) n'a pas de bandeau.
    public static func make(game: GameBlock) -> GamePlayerBanner? {
        let banner = GamePlayerBanner(game: game)
        return banner.hasAnythingToSay ? banner : nil
    }

    /// Le détail du niveau (anneau, palier, jauge vers le suivant) n'a de sens qu'au-delà du niveau 1 — ou après un
    /// Prestige, qui ramène au niveau 1 en laissant ses étoiles.
    public var showsLevel: Bool { level > 1 || prestige > 0 }

    /// Le total de points n'a de sens qu'une fois le premier point gagné.
    public var showsScore: Bool { score > 0 }

    /// Au moins un morceau a quelque chose à dire.
    public var hasAnythingToSay: Bool {
        showsLevel || showsScore || meeshes != nil || rank != nil || league != nil || flame != nil
    }

    /// Un `NaN` ou une valeur hors de [0, 1] ne casse jamais la jauge.
    private static func bounded(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(max(value, 0), 1)
    }

    /// Le pourcentage entier, arrondi vers le bas — « 78 % vers le 35 » ne promet jamais plus que la jauge.
    public var percent: Int { Int((progress * 100).rounded(.down)) }
}
