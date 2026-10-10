import Foundation

/// LES CONCEPTS DE « PROGRESSION », DANS L'ORDRE — le MIROIR de `progressionConcepts()` (#9564).
///
/// La première page ne porte plus que des cartes : une par concept, avec sa valeur. La fiche de chaque concept
/// et le tableau de bord parcourent la MÊME liste. Elle est écrite une fois dans le partagé
/// (`packages/shared/utils/progression-layout.ts`, `PROGRESSION_CONCEPTS`) et une fois ici : deux clients qui la
/// composeraient chacun de leur côté finiraient par ranger « Ligue » à deux places différentes.
///
/// L'ordre des `case` EST l'ordre de l'écran (`allCases`).
public enum ProgressionConcept: String, Sendable, CaseIterable, Identifiable, Hashable {
    case level
    case points
    case meesh
    case glory
    case flame
    case missions
    case league
    case season
    case prestige
    case elans
    case badges
    case defis
    case succes
    case showcase
    case atlas

    public var id: String { rawValue }
}

/// Ce que la liste LIT : la PRÉSENCE des morceaux servis, jamais leur contenu — décider qu'une ligne existe ne
/// demande aucune valeur (miroir de `ProgressionConceptSource`).
public struct ProgressionConceptSource: Sendable, Equatable {
    /// Le solde `meesh` est servi.
    public let meesh: Bool
    /// La carte d'atteignabilité a au moins une section.
    public let defis: Bool
    /// Le bloc `game` est servi.
    public let game: Bool
    public let league: Bool
    public let season: Bool
    public let prestige: Bool
    public let trophies: Bool
    public let atlas: Bool

    /// Une extension ne se lit pas sans le bloc `game` qui la porte.
    public init(meesh: Bool = false, defis: Bool = false, game: Bool = false, league: Bool = false,
                season: Bool = false, prestige: Bool = false, trophies: Bool = false, atlas: Bool = false) {
        self.meesh = meesh
        self.defis = defis
        self.game = game
        self.league = game && league
        self.season = game && season
        self.prestige = game && prestige
        self.trophies = game && trophies
        self.atlas = game && atlas
    }

    /// La source lue dans ce que le client a décodé.
    ///
    /// **La saison** : le partagé la dit servie « même `null` » (aucune saison ne court). Le décodage Swift
    /// confond « absente » et « nulle » (`GameWave2.season` est un optionnel) : une saison nulle est donc lue
    /// comme SERVIE dès qu'une autre extension de la vague 2 l'est — la même lecture que les portes d'avant.
    public init(progress: EngagementProgress, game: GameBlock?) {
        let wave2Served = game.map {
            $0.league != nil || $0.duo != nil || $0.trophies != nil || $0.atlas != nil
                || $0.prestige != nil || $0.visibility != nil
        } ?? false
        self.init(
            meesh: progress.meesh != nil,
            defis: !progress.achievementSections.isEmpty,
            game: game != nil,
            league: game?.league != nil,
            season: game?.season != nil || wave2Served,
            prestige: game?.prestige != nil,
            trophies: game?.trophies != nil,
            atlas: game?.atlas != nil
        )
    }
}

public enum ProgressionConcepts {

    /// Les concepts SERVIS, dans l'ordre déclaré.
    ///
    /// | concept | présent si |
    /// |---|---|
    /// | `level`, `flame`, `elans`, `badges`, `succes` | toujours (la progression d'avant les sert) |
    /// | `meesh` | le solde est servi, ou le bloc `game` |
    /// | `defis` | la carte d'atteignabilité a au moins une section |
    /// | `points`, `glory`, `missions` | le bloc `game` est servi |
    /// | `league`, `prestige`, `showcase`, `atlas` | leur extension du bloc `game` est servie |
    /// | `season` | son extension est servie, même nulle (aucune saison ne court) |
    ///
    /// Une ligne absente vaut mieux qu'une ligne qui dit « 0 / 0 » : devant un ancien serveur, l'écran se
    /// raccourcit, il ne ment pas.
    public static func served(_ source: ProgressionConceptSource) -> [ProgressionConcept] {
        ProgressionConcept.allCases.filter { isServed($0, source) }
    }

    public static func served(for progress: EngagementProgress, game: GameBlock?) -> [ProgressionConcept] {
        served(ProgressionConceptSource(progress: progress, game: game))
    }

    private static func isServed(_ concept: ProgressionConcept, _ source: ProgressionConceptSource) -> Bool {
        switch concept {
        case .level, .flame, .elans, .badges, .succes: true
        case .meesh: source.game || source.meesh
        case .defis: source.defis
        case .points, .glory, .missions: source.game
        case .league: source.league
        case .season: source.season
        case .prestige: source.prestige
        case .showcase: source.trophies
        case .atlas: source.atlas
        }
    }
}
