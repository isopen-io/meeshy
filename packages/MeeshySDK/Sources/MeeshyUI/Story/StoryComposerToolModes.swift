import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - Tool Modes

public nonisolated enum StoryToolMode: String, CaseIterable, Sendable {
    case media
    case audio
    case drawing
    case text
    case filters
    case timeline
    case texture

    // Legacy alias
    static let photo: StoryToolMode = .media

    /// Outils exposés à l'utilisateur dans le chrome du composer (FABs, chips de
    /// switch, tuiles empty-state). Le filtre GLOBAL (`.filters`) est retiré de
    /// l'UI : les filtres s'appliquent désormais par média via l'éditeur unitaire
    /// (image/vidéo). Le case reste dans l'enum pour le rendu rétro-compatible des
    /// stories déjà filtrées ; il n'est simplement plus sélectionnable. Source
    /// unique consommée partout où la liste des onglets se construit.
    public static var selectableCases: [StoryToolMode] {
        allCases.filter { $0 != .filters }
    }
}
