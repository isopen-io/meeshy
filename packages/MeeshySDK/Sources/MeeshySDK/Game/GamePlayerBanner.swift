import Foundation

// MARK: - La bannière du joueur (#9494, conception XIII.1)
//
// MIROIR de `playerBannerModel` (`apps/web/src/lib/view/player-banner.ts`) : ce que le bandeau du haut montre
// quand ni un appel ni un audio ne l'occupe. Ordre FIXE, de gauche à droite : anneau de niveau, jauge vers le
// niveau suivant, Meeshes, blason du rang, gemme de ligue et place, Flamme.
//
// SEULEMENT CE QUI EXISTE : un élément sans donnée vaut `nil` et ne se dessine pas — jamais un zéro, un tiret ou
// une case vide. Un nouveau joueur n'a que son anneau et sa jauge ; le trésor paraît à la première Meesh gardée, le
// rang à la première Gloire, la ligue au consentement (avec un groupe), la Flamme quand elle brûle.
//
// Le modèle ne calcule RIEN : il LIT le bloc `game` servi (le cache d'abord) et ne fait que choisir ce qui se
// montre. Aucune règle du jeu n'est réécrite ici.

public struct GamePlayerBanner: Equatable, Sendable {

    public struct Rank: Equatable, Sendable {
        public let rank: GloryRank
        /// `nil` pour Mythe.
        public let division: GloryDivision?

        public init(rank: GloryRank, division: GloryDivision?) {
            self.rank = rank
            self.division = division
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
    /// `nil` au sommet (niveau 100) : plus rien ne manque.
    public let nextLevel: Int?
    public let pointsToNext: Int?
    public let meeshes: Int?
    public let rank: Rank?
    public let league: League?
    public let flame: Flame?

    public init(level: Int, tier: LevelTierKey, progress: Double, prestige: Int = 0, score: Int, nextLevel: Int?, pointsToNext: Int?,
                meeshes: Int? = nil, rank: Rank? = nil, league: League? = nil, flame: Flame? = nil) {
        self.level = level
        self.tier = tier
        self.progress = Self.bounded(progress)
        self.prestige = prestige
        self.score = score
        self.nextLevel = nextLevel
        self.pointsToNext = pointsToNext
        self.meeshes = meeshes
        self.rank = rank
        self.league = league
        self.flame = flame
    }

    /// Les états où la Flamme brûle encore : allumée, menacée, couverte par un gel.
    private static let burning: Set<FlameStatus> = [.lit, .atRisk, .covered]

    public init(game: GameBlock) {
        let level = game.level
        let atTop = level.nextThreshold == nil
        self.level = level.level
        self.tier = level.tier
        self.progress = atTop ? 1 : Self.bounded(level.progress)
        self.prestige = level.prestige
        self.score = level.score
        self.nextLevel = atTop ? nil : level.level + 1
        self.pointsToNext = atTop ? nil : level.pointsToNext
        self.meeshes = game.treasury.held > 0 ? game.treasury.held : nil
        self.rank = game.glory.glory > 0 ? Rank(rank: game.glory.rank, division: game.glory.division) : nil
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

    /// Un `NaN` ou une valeur hors de [0, 1] ne casse jamais la jauge.
    private static func bounded(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(max(value, 0), 1)
    }

    /// Le pourcentage entier, arrondi vers le bas — « 78 % vers le 35 » ne promet jamais plus que la jauge.
    public var percent: Int { Int((progress * 100).rounded(.down)) }
}
