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

    /// Ordre CANONIQUE unique des outils du composer — barre de FABs, chips de
    /// switch et grille d'état vide le consomment tous les trois. C'est l'ordre
    /// de la barre de FABs (la surface la plus vue, à portée de pouce) :
    /// création (média, texte, dessin), habillage (son, fond), montage
    /// (timeline). Trois ordres divergents cohabitaient jusqu'ici sur le même
    /// composer, obligeant l'utilisateur à réapprendre la disposition d'une
    /// surface à l'autre.
    ///
    /// Le filtre GLOBAL (`.filters`) est exclu PAR CONSTRUCTION (plus de
    /// `filter` à maintenir) : les filtres s'appliquent désormais par média via
    /// l'éditeur unitaire. Le case reste dans l'enum pour le rendu
    /// rétro-compatible des stories déjà filtrées.
    public static let composerOrder: [StoryToolMode] = [
        .media, .text, .drawing, .audio, .texture, .timeline
    ]

    /// Outils exposés à l'utilisateur dans le chrome du composer. Alias de
    /// `composerOrder` — conservé parce que le nom dit l'intention aux sites qui
    /// filtrent (« tous SAUF celui-ci »).
    public static var selectableCases: [StoryToolMode] { composerOrder }

    /// Glyphe SF Symbols de l'outil — source UNIQUE des surfaces du composer.
    /// Quatre tables identiques le décrivaient auparavant, dont une dans un
    /// fichier qui se déclarait lui-même « source de vérité unique ».
    public var symbolName: String {
        switch self {
        case .media:    return "play.rectangle.fill"
        case .audio:    return "music.note"
        case .drawing:  return "pencil.tip"
        case .text:     return "textformat"
        case .texture:  return "paintpalette.fill"
        case .filters:  return "camera.filters"
        case .timeline: return "clock"
        }
    }
}
