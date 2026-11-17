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

/// Les niveaux du plein écran de la une (loi 15, #17961) : le plein écran (U2) range l'en-tête, la
/// pilule et les bannières et GARDE les caméras des autres ; le plein écran total (U2b) ne montre que
/// l'écran partagé. Miroir d'Android `GroupCallFullScreenLevel`.
enum GroupCallFullScreenLevel: Equatable, Sendable {
    case off
    case fullScreen
    case total

    var isFullScreen: Bool { self != .off }

    var hidesStrip: Bool { self == .total }
}

/// Les boutons de la capsule de la une, dans leur ordre (loi 15, U1, U2, U2b).
enum GroupCallSpotlightButton: CaseIterable, Equatable, Sendable {
    case grid
    case fullScreen
    case totalFullScreen
    case exitFullScreen
    case exitTotalFullScreen
}

/// Le déplacement de l'écran zoomé, en points, depuis son centre (#17961 point 2, web `ScreenPan`).
struct GroupCallScreenPan: Equatable, Sendable {
    let x: CGFloat
    let y: CGFloat

    static let zero = GroupCallScreenPan(x: 0, y: 0)
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

    /// #18180 (loi 15) — un partage qui COMMENCE prend la une, même après un choix manuel : tout
    /// choix tombe. Un « Grille » posé pendant un partage ne vaut que pour CE partage : sa fin rend
    /// aussi la main à la règle automatique. Une vignette épinglée, elle, reste épinglée quand le
    /// partage finit. Miroir d'Android `choiceAfterSharerChanged`.
    static func choice(
        _ choice: GroupCallSpotlightChoice?,
        afterSharerChangedFrom oldSharer: String?,
        to newSharer: String?
    ) -> GroupCallSpotlightChoice? {
        guard oldSharer != newSharer else { return choice }
        guard newSharer == nil else { return nil }
        return choice == .grid ? nil : choice
    }

    /// #18180 — le lecteur d'écran annonce le partage qui commence, sauf si une bannière le dit déjà.
    static func announcesShare(oldSharer: String?, newSharer: String?, isAnnouncedByBanner: Bool) -> Bool {
        newSharer != nil && newSharer != oldSharer && !isAnnouncedByBanner
    }

    /// U2.6 · #16972 — un écran REÇU tient la scène : en duo, le pair partage ; en groupe, l'écran
    /// d'un membre est à la une (jamais le mien : ma vignette ne partage pas). Le verre s'y assombrit.
    static func showsReceivedScreen(isGroupStage: Bool, isRemoteSharing: Bool, focus: GroupCallStageFocus) -> Bool {
        guard isGroupStage else { return isRemoteSharing }
        guard case .spotlight(_, let isScreenShare) = focus else { return false }
        return isScreenShare
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

    // MARK: - U2.2 · #17961 — deux niveaux de plein écran

    /// Le niveau, lu du plein écran du chrome (qui range en-tête, pilule et bannières aux deux
    /// niveaux) et du vœu d'aller au total — réservé à un écran partagé.
    static func fullScreenLevel(isFullScreen: Bool, wantsTotal: Bool, isScreenShare: Bool) -> GroupCallFullScreenLevel {
        guard isFullScreen else { return .off }
        return wantsTotal && isScreenShare ? .total : .fullScreen
    }

    /// « Plein écran » monte d'un niveau à chaque appui ; une caméra à la une n'a qu'un niveau.
    static func raised(_ level: GroupCallFullScreenLevel, isScreenShare: Bool) -> GroupCallFullScreenLevel {
        switch level {
        case .off: return .fullScreen
        case .fullScreen: return isScreenShare ? .total : .fullScreen
        case .total: return .total
        }
    }

    /// « Quitter » (glyphe rentrer) redescend d'un niveau.
    static func lowered(_ level: GroupCallFullScreenLevel) -> GroupCallFullScreenLevel {
        level == .total ? .fullScreen : .off
    }

    /// La capsule : « Revenir à la grille », puis le niveau suivant s'il y en a un, puis la descente d'un niveau.
    static func capsuleButtons(level: GroupCallFullScreenLevel, isScreenShare: Bool) -> [GroupCallSpotlightButton] {
        switch level {
        case .off: return [.grid, .fullScreen]
        case .fullScreen: return isScreenShare ? [.grid, .totalFullScreen, .exitFullScreen] : [.grid, .exitFullScreen]
        case .total: return [.grid, .exitTotalFullScreen]
        }
    }

    /// Le niveau où mène un bouton de la capsule ; « Revenir à la grille » sort de tout.
    static func level(after button: GroupCallSpotlightButton, from level: GroupCallFullScreenLevel, isScreenShare: Bool) -> GroupCallFullScreenLevel {
        switch button {
        case .grid: return .off
        case .fullScreen, .totalFullScreen: return raised(level, isScreenShare: isScreenShare)
        case .exitFullScreen, .exitTotalFullScreen: return lowered(level)
        }
    }

    /// En plein écran, l'en-tête et la pilule sont rangés : le chrome qui se voit, c'est la capsule.
    static func isChromeShown(isFullScreen: Bool, isControlsVisible: Bool, isCapsuleVisible: Bool) -> Bool {
        isFullScreen ? isCapsuleVisible : isControlsVisible
    }

    // MARK: - U2.7 · #17753 — l'écran zoomé se déplace, borné à son cadre

    /// Le seuil qui sépare un glissé d'un toucher (celui des glissés de l'appel).
    static let panSlop: CGFloat = 10

    /// Miroir de `screenPanClamp` (web `screen-zoom.ts`, Android) : le bord de l'image reste au bord,
    /// rien ne bouge à 1×, la borne se resserre avec le zoom.
    static func screenPanClamp(_ pan: GroupCallScreenPan, zoom: CGFloat, width: CGFloat, height: CGFloat) -> GroupCallScreenPan {
        GroupCallScreenPan(x: within(pan.x, panBound(zoom: zoom, extent: width)), y: within(pan.y, panBound(zoom: zoom, extent: height)))
    }

    /// Un glissé ajoute son écart au déplacement acquis, borné.
    static func screenPanAfterDrag(_ pan: GroupCallScreenPan, dx: CGFloat, dy: CGFloat, zoom: CGFloat, width: CGFloat, height: CGFloat) -> GroupCallScreenPan {
        screenPanClamp(GroupCallScreenPan(x: pan.x + dx, y: pan.y + dy), zoom: zoom, width: width, height: height)
    }

    /// Ce que l'écran montre : la position acquise ramenée dans la borne du zoom vivant, puis le
    /// glissé en cours — le doigt ne part jamais d'au-delà de la borne.
    static func screenPan(acquired: GroupCallScreenPan, drag: CGSize, zoom: CGFloat, in size: CGSize) -> GroupCallScreenPan {
        let held = screenPanClamp(acquired, zoom: zoom, width: size.width, height: size.height)
        return screenPanAfterDrag(held, dx: drag.width, dy: drag.height, zoom: zoom, width: size.width, height: size.height)
    }

    private static func panBound(zoom: CGFloat, extent: CGFloat) -> CGFloat {
        guard extent.isFinite, zoom.isFinite else { return 0 }
        return max(extent * (zoom - 1) / 2, 0)
    }

    private static func within(_ value: CGFloat, _ bound: CGFloat) -> CGFloat {
        min(max(value, -bound), bound) + 0
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
