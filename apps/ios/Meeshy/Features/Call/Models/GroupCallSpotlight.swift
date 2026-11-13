import Foundation
import CoreGraphics
import SwiftUI

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

    static func featuresLocal(_ focus: GroupCallStageFocus) -> Bool {
        guard case .spotlight(let tileId, _) = focus else { return false }
        return tileId == GroupCallStage.localTileId
    }

    static func clampedZoom(_ scale: CGFloat) -> CGFloat {
        min(max(scale, 1), maxZoom)
    }

    /// P15.11 — le zoom de l'écran reçu en duo : la même loi (1× à 4×) que la une du groupe,
    /// le pincement en cours s'appliquant à la valeur acquise. Sans écran reçu, 1× : un zoom
    /// ne survit pas au partage qui l'a fait naître.
    static func receivedScreenZoom(committed: CGFloat, pinch: CGFloat, isReceivingScreen: Bool) -> CGFloat {
        isReceivingScreen ? clampedZoom(committed * pinch) : 1
    }

    /// U2.5 — le facteur que la puce de l'écran à la une annonce : arrondi au dixième, jamais
    /// au-delà du plafond ; `nil` à 1× (la puce ne porte alors que « Écran de X »).
    static func displayedZoom(_ zoom: CGFloat) -> CGFloat? {
        let tenths = (clampedZoom(zoom) * 10).rounded() / 10
        return tenths > 1 ? tenths : nil
    }

    /// « Écran de Karim · 2× » : le titre déjà localisé, puis le facteur de zoom quand il y en a un.
    static func featuredChipText(title: String, zoom: CGFloat, locale: Locale) -> String {
        guard let factor = displayedZoom(zoom) else { return title }
        return title + " · " + CameraZoomPolicy.label(forDisplay: factor, locale: locale)
    }

    private static func automaticFocus(_ tiles: [GroupCallStageTile]) -> GroupCallStageFocus {
        guard let sharer = sharerId(in: tiles) else { return .grid }
        return .spotlight(tileId: sharer, isScreenShare: true)
    }
}

/// P14.10 — le passage grille ↔ à la une : la vignette choisie grandit depuis sa
/// case, les autres glissent vers le bandeau (une identité par personne). Sous
/// « Réduire les animations » rien ne se déplace : un fondu court, celui de la loi
/// unique `CallRemoteVideoFade`.
enum GroupCallStageMotion {
    static func movesTiles(reduceMotion: Bool) -> Bool { !reduceMotion }

    static var fadeDuration: TimeInterval { CallRemoteVideoFade.duration(reduceMotion: true) }

    /// U2.10 · #17726 — la translation qui fait sortir le bandeau des autres par SON bord de
    /// l'écran : la distance MESURÉE du bord de la scène à celui de la fenêtre (la pilule, la zone
    /// sûre), plus l'épaisseur du bandeau. `.move(edge:)` ne déplaçait que de cette épaisseur : en
    /// portrait, le bandeau s'arrêtait à la place de la pilule. La translation est physique (comme
    /// `CallRailsLayout.slideOffset`) : en droite à gauche, le bord de fin est à gauche.
    static func stripTravel(toward edge: Edge, stage: CGRect, window: CGSize, stripExtent: CGFloat, isRightToLeft: Bool) -> CGSize {
        let measured = stage.isNull || stage.isInfinite ? CGRect.zero : stage
        let toTop = max(measured.minY, 0) + stripExtent
        let toBottom = max(window.height - measured.maxY, 0) + stripExtent
        let toLeft = max(measured.minX, 0) + stripExtent
        let toRight = max(window.width - measured.maxX, 0) + stripExtent
        switch edge {
        case .top: return CGSize(width: 0, height: -toTop)
        case .bottom: return CGSize(width: 0, height: toBottom)
        case .leading: return CGSize(width: isRightToLeft ? toRight : -toLeft, height: 0)
        case .trailing: return CGSize(width: isRightToLeft ? -toLeft : toRight, height: 0)
        }
    }
}
