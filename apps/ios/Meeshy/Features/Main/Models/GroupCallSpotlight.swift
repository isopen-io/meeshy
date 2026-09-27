import Foundation
import CoreGraphics

/// #8395 — ce que la scène d'un appel de groupe montre : la grille, ou une
/// vignette « à la une » (grande) avec les autres en bande.
enum GroupCallStageFocus: Equatable, Sendable {
    case grid
    case spotlight(tileId: String, isScreenShare: Bool)
}

/// Le choix LOCAL de l'utilisateur — jamais partagé avec les autres membres.
enum GroupCallSpotlightChoice: Equatable, Sendable {
    /// « Grille » : revenir à la grille, même pendant un partage d'écran.
    case grid
    /// Une vignette touchée.
    case tile(String)
}

/// La règle de mise à la une, pure : le choix manuel l'emporte ; sans choix
/// (ou si la vignette choisie a quitté l'appel), un partage d'écran d'un
/// membre monte seul à la une ; sinon, la grille.
enum GroupCallSpotlight {
    static let maxZoom: CGFloat = 4

    static func focus(tiles: [GroupCallStageTile], choice: GroupCallSpotlightChoice?) -> GroupCallStageFocus {
        switch choice {
        case .grid:
            return .grid
        case .tile(let id):
            guard let tile = tiles.first(where: { $0.id == id }) else { return automaticFocus(tiles) }
            return .spotlight(tileId: tile.id, isScreenShare: tile.isScreenSharing)
        case nil:
            return automaticFocus(tiles)
        }
    }

    /// Le membre dont l'écran monte seul à la une : le premier arrivé qui
    /// partage. La vignette locale n'y prétend jamais — mon propre partage se
    /// voit par sa bannière, pas en me regardant moi-même.
    static func sharerId(in tiles: [GroupCallStageTile]) -> String? {
        tiles.first(where: { !$0.isLocal && $0.isScreenSharing })?.id
    }

    /// Un « Grille » posé pendant un partage ne vaut que pour CE partage : un
    /// nouveau partage, ou sa fin, rend la main à la règle automatique. Une
    /// vignette épinglée, elle, reste épinglée.
    static func choice(
        _ choice: GroupCallSpotlightChoice?,
        afterSharerChangedFrom oldSharer: String?,
        to newSharer: String?
    ) -> GroupCallSpotlightChoice? {
        guard oldSharer != newSharer, choice == .grid else { return choice }
        return nil
    }

    static func clampedZoom(_ scale: CGFloat) -> CGFloat {
        min(max(scale, 1), maxZoom)
    }

    private static func automaticFocus(_ tiles: [GroupCallStageTile]) -> GroupCallStageFocus {
        guard let sharer = sharerId(in: tiles) else { return .grid }
        return .spotlight(tileId: sharer, isScreenShare: true)
    }
}
