import Foundation
import MeeshySDK

/// Une porte du jeu, poussée depuis Progression, le profil ou un guide.
enum GamePage: String, Hashable, CaseIterable {
    case league
    case season
    case showcase
    case atlas
    case prestige
    case settings

    /// Le titre de la page, dit dans la barre de navigation de l'iPad et de VoiceOver.
    var title: String {
        switch self {
        case .league: GameText.leagueTitle
        case .season: GameText.seasonTitle
        case .showcase: GameText.showcaseTitle
        case .atlas: GameText.atlasTitle
        case .prestige: GameText.prestigeTitle
        case .settings: GameText.settingsTitle
        }
    }

    /// La page qu'une notification de jeu ouvre au toucher (#9490) : la Ligue pour un duo ou un résultat de
    /// ligue (sa carte de duo y est posée), la Saison pour une étape. `nil` pour tout autre type.
    nonisolated static func opened(by type: MeeshyNotificationType) -> GamePage? {
        switch type.gameDestination {
        case .league: .league
        case .season: .season
        case .missions, nil: nil
        }
    }

    var analyticsName: String {
        "Game." + rawValue.prefix(1).uppercased() + rawValue.dropFirst()
    }
}
