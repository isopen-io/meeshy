import Foundation
import MeeshySDK

/// OÙ MÈNE LE BOUTON DU GUIDE (#9379) — chaque action que la loi nomme
/// (`GuideAction`) devient un lien profond : faire défiler jusqu'à la carte de
/// l'écran Progression, ouvrir une autre page, ou ouvrir le studio photo.
/// Le `switch` est EXHAUSTIF : une action ajoutée à la loi sans destination ne
/// compile plus. Miroir de `apps/web/src/lib/game-guide/action-target.ts`.
enum GuideTarget: Equatable {
    /// Faire défiler Progression jusqu'à l'ancre.
    case scroll(GameAnchor)
    /// Quitter vers la liste des conversations (« commencer à jouer » = faire un geste).
    case conversations
    /// Ouvrir la porte des badges.
    case badges
    /// Ouvrir le déroulé photo.
    case photo
}

/// Les ancres que posent les composants du jeu sur Progression.
enum GameAnchor: String, Equatable {
    case level = "game-level"
    case missions = "game-missions"
    case flame = "game-flame"
    case treasury = "game-treasury"
    case rank = "game-rank"
    case mint = "game-mint"
    case flamePanel = "game-flame-panel"
}

enum GameGuideTarget {
    static func target(for action: GuideAction) -> GuideTarget {
        switch action {
        case .startGame, .earnFirstPoints: .conversations
        case .seeLevel, .seeProgress, .seeNextTier, .prestigeOrStay: .scroll(.level)
        case .seeMissions, .openFirstMission, .regainLevels, .doEasyMissionOrFreeze, .doEasiestMission: .scroll(.missions)
        case .seeFlame: .scroll(.flame)
        case .seeMeeshes, .keepOrSpend: .scroll(.treasury)
        case .seeRank: .scroll(.rank)
        case .takeStartPhoto, .takePhoto: .photo
        case .mintOrClimb, .seeMintPreview: .scroll(.mint)
        case .relightBadge: .badges
        case .relightFlame: .scroll(.flamePanel)
        }
    }
}

extension GameGuideTarget {
    /// La page où mène le bouton d'un moment de la vague 2 : la ligue, la saison, la vitrine, l'Atlas — et le Prestige,
    /// dont le moment dit « voir le niveau » et ouvre la page qui l'explique (#9481).
    static func page(for action: GuideActionV2) -> GamePage {
        switch action {
        case .seeLeague: .league
        case .seeSeason: .season
        case .seeTrophies: .showcase
        case .seeAtlas: .atlas
        case .seeLevel: .prestige
        }
    }
}
