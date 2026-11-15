#if DEBUG
import Foundation

/// Les trois fonds de la planche sur lesquels le verre se juge : `.glass.deep`
/// (`dark`), `.onlight` (`light`) et `.glass` posé sur une photo (`media`).
public nonisolated enum MeeshyKitCatalogBackdrop: String, Sendable, Equatable, CaseIterable {
    case dark
    case light
    case media
}

/// Un état d'un composant du kit : son `id` (kebab, stable) est le nom de
/// l'image de référence, `boardView` la vue de la planche qui le dessine.
public nonisolated struct MeeshyKitCatalogState: Sendable, Equatable, Identifiable {
    public let id: String
    public let boardView: String?
    public let backdrop: MeeshyKitCatalogBackdrop
    public let isTouchable: Bool

    public init(
        id: String,
        boardView: String? = nil,
        backdrop: MeeshyKitCatalogBackdrop = .dark,
        isTouchable: Bool = false
    ) {
        self.id = id
        self.boardView = boardView
        self.backdrop = backdrop
        self.isTouchable = isTouchable
    }
}

/// Une tuile du détail : l'état vivant, ou sa jumelle figée `isPressed`.
public nonisolated struct MeeshyKitCatalogTile: Sendable, Equatable, Identifiable {
    public let state: MeeshyKitCatalogState
    public let isPressed: Bool

    public init(state: MeeshyKitCatalogState, isPressed: Bool = false) {
        self.state = state
        self.isPressed = isPressed
    }

    public var id: String { isPressed ? "\(state.id)-presse" : state.id }
}

/// Un composant du kit au catalogue. Sans état, il n'est pas livré : la liste
/// ne l'affiche pas (loi 13, ni ligne grisée ni « à venir »).
public nonisolated struct MeeshyKitCatalogEntry: Sendable, Equatable, Identifiable {
    public let key: String
    public let name: String
    public let states: [MeeshyKitCatalogState]

    public init(key: String, name: String, states: [MeeshyKitCatalogState] = []) {
        self.key = key
        self.name = name
        self.states = states
    }

    public var id: String { key }

    public var isDelivered: Bool { !states.isEmpty }

    public var accessibilityName: String { "\(key) \(name)" }

    /// Les tuiles du détail, dans l'ordre de la fiche : la tuile pressée suit
    /// la tuile vivante, et n'existe que pour un état qui se touche.
    public var tiles: [MeeshyKitCatalogTile] {
        states.flatMap { state in
            state.isTouchable
                ? [MeeshyKitCatalogTile(state: state), MeeshyKitCatalogTile(state: state, isPressed: true)]
                : [MeeshyKitCatalogTile(state: state)]
        }
    }
}
#endif
